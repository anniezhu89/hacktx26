import express, { type Response } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  applyFieldChanges,
  caseResponse,
  caseSchema,
  deletionResponse,
  demoSessionRequest,
  expectedRevision,
  explanationResponse,
  fieldsRequest,
  healthResponse,
  intakeRequest,
  sessionResponse,
  type Case,
} from "@labelbridge/contracts";
import { ApiError, errorHandler, parseBody, sendError } from "./errors";
import { buildExplanation } from "./explain";
import {
  extractFromText,
  hasUnresolvedCritical,
  unresolvedImageExtraction,
  type Extraction,
} from "./extract";
import { maxImageBytes, validateImage, type ValidatedImage } from "./image";
import { rateLimit, type RateLimit } from "./limits";
import {
  SessionStore,
  loadSession,
  requireSession,
  setSessionCookie,
} from "./session";
import { CaseStore, caseLifetimeMs, type CaseRecord } from "./store";

export type LogEntry = {
  requestId: string;
  method: string;
  route: string;
  status: number;
  latencyMs: number;
  providerMode: "fixture";
};

export type AppOptions = {
  now?: () => number;
  log?: (entry: LogEntry) => void;
  cases?: CaseStore;
  sessions?: SessionStore;
  limits?: { api?: RateLimit; intake?: RateLimit };
};

type Parser<T> = { parse: (value: unknown) => T };

function send<T>(
  res: Response,
  schema: Parser<T>,
  data: unknown,
  status = 200,
) {
  res.status(status).json(
    schema.parse({
      contractVersion: "1",
      requestId: res.locals.requestId,
      dataMode: "fixture",
      data,
    }),
  );
}

const pendingRoutes: [string, string][] = [
  ["post", "/api/cases/:id/savings-search"],
  ["post", "/api/cases/:id/reviews"],
  ["get", "/api/reviews"],
  ["post", "/api/reviews/:id/claim"],
  ["post", "/api/reviews/:id/response"],
  ["post", "/api/cases/:id/plan"],
  ["patch", "/api/cases/:id/tasks/:taskId"],
];

export function createApp(
  webRoot = path.resolve("apps/web/dist"),
  options: AppOptions = {},
) {
  const now = options.now ?? Date.now;
  const log =
    options.log ?? ((entry: LogEntry) => console.log(JSON.stringify(entry)));
  const cases = options.cases ?? new CaseStore(now);
  const sessions = options.sessions ?? new SessionStore(now);
  const app = express();
  app.disable("x-powered-by");

  app.use("/api", (req, res, next) => {
    const started = performance.now();
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Logs carry routing metadata only: never bodies, label text or cookies.
    res.on("finish", () =>
      log({
        requestId: res.locals.requestId,
        method: req.method,
        route: req.route ? `/api${req.route.path}` : "unmatched",
        status: res.statusCode,
        latencyMs: Math.round(performance.now() - started),
        providerMode: "fixture",
      }),
    );
    next();
  });
  app.use("/api", loadSession(sessions));
  app.use(
    "/api",
    rateLimit(
      "api",
      options.limits?.api ?? { limit: 300, windowMs: 60_000 },
      now,
    ),
  );
  app.use("/api", express.json({ limit: "64kb" }));

  const api = express.Router();

  api.get("/health", (_req, res) =>
    res.json(
      healthResponse.parse({
        contractVersion: "1",
        requestId: res.locals.requestId,
        dataMode: "fixture",
        data: {
          status: "ok",
          providers: {
            extraction: "fixture",
            explanation: "fixture",
            search: "fixture",
          },
        },
      }),
    ),
  );

  api.post("/session", (req, res) => {
    const { role } = parseBody(demoSessionRequest, req.body);
    const session = sessions.upsert(res.locals.session, role);
    setSessionCookie(req, res, session);
    send(res, sessionResponse, { role: session.role });
  });

  function ownedCase(res: Response, id: string): CaseRecord {
    const session = requireSession(res);
    const lookup = cases.lookup(id);
    if (lookup.status === "missing")
      throw new ApiError("NOT_FOUND", "Case not found.");
    if (lookup.status === "expired")
      throw new ApiError(
        "EXPIRED",
        "This demo case expired and was deleted. Start a new sample.",
      );
    if (lookup.record.workspaceId !== session.workspaceId)
      throw new ApiError("FORBIDDEN", "This case belongs to another session.");
    if (session.role !== "patient")
      throw new ApiError(
        "FORBIDDEN",
        "Only the patient persona can access this case.",
      );
    return lookup.record;
  }

  function newCase(extraction: Extraction): Case {
    const created = now();
    return caseSchema.parse({
      id: randomUUID(),
      revision: 0,
      createdAt: new Date(created).toISOString(),
      expiresAt: new Date(created + caseLifetimeMs).toISOString(),
      fictionalData: true,
      status: hasUnresolvedCritical(extraction.fields)
        ? "needs_help"
        : "reviewing",
      fields: extraction.fields,
      sharing: { supporter: false, fieldKeys: [] },
      questions: extraction.questions,
      tasks: [],
    });
  }

  const multipartBody = express.raw({
    type: "multipart/form-data",
    limit: maxImageBytes + 256 * 1024,
  });

  async function readImageUpload(
    req: express.Request,
  ): Promise<ValidatedImage> {
    let form: FormData;
    try {
      form = await new globalThis.Request("http://upload.local/", {
        method: "POST",
        headers: { "content-type": String(req.headers["content-type"]) },
        body: req.body,
      }).formData();
    } catch {
      throw new ApiError("BAD_REQUEST", "Malformed multipart upload.");
    }
    const keys = [...form.keys()];
    const images = form.getAll("image");
    if (
      keys.some((k) => k !== "image" && k !== "fictionalDataAcknowledged") ||
      images.length !== 1 ||
      !(images[0] instanceof File) ||
      form.get("fictionalDataAcknowledged") !== "true"
    )
      throw new ApiError(
        "BAD_REQUEST",
        "Upload one image field and acknowledge that the data is fictional.",
      );
    return validateImage(Buffer.from(await images[0].arrayBuffer()));
  }

  api.post(
    "/cases",
    rateLimit(
      "intake",
      options.limits?.intake ?? { limit: 30, windowMs: 10 * 60_000 },
      now,
    ),
    (req, res, next) => {
      requireSession(res, "patient");
      if (!req.is("multipart/form-data")) return next();
      res.locals.multipart = true;
      multipartBody(req, res, next);
    },
    async (req, res) => {
      const session = requireSession(res, "patient");
      let image: ValidatedImage | null = null;
      let extraction: Extraction;
      if (res.locals.multipart) {
        image = await readImageUpload(req);
        extraction = unresolvedImageExtraction();
      } else if (req.is("application/json")) {
        const { text } = parseBody(intakeRequest, req.body);
        extraction = extractFromText(text);
      } else
        throw new ApiError(
          "BAD_REQUEST",
          "Send JSON text intake or a multipart image upload.",
        );
      const record = cases.create({
        case: newCase(extraction),
        workspaceId: session.workspaceId,
        image,
      });
      send(res, caseResponse, record.case, 201);
    },
  );

  api.get("/cases/:id", (req, res) =>
    send(res, caseResponse, ownedCase(res, req.params.id).case),
  );

  api.patch("/cases/:id/fields", (req, res) => {
    const record = ownedCase(res, req.params.id);
    const input = parseBody(fieldsRequest, req.body);
    let next: Case;
    try {
      next = applyFieldChanges(record.case, input).case;
    } catch (error) {
      if (error instanceof Error && error.message === "REVISION_CONFLICT")
        throw new ApiError(
          "REVISION_CONFLICT",
          "The case changed since it was loaded. Reload and review again.",
        );
      throw new ApiError("BAD_REQUEST", "Field changes are invalid.");
    }
    if (next.status !== "ready" && hasUnresolvedCritical(next.fields))
      next = { ...next, status: "needs_help" };
    cases.replaceCase(record, next);
    send(res, caseResponse, next);
  });

  api.post("/cases/:id/explanation", (req, res) => {
    const record = ownedCase(res, req.params.id);
    const input = parseBody(expectedRevision, req.body);
    if (input.expectedRevision !== record.case.revision)
      throw new ApiError(
        "REVISION_CONFLICT",
        "The case changed since it was loaded. Reload and review again.",
      );
    send(res, explanationResponse, buildExplanation(record.case));
  });

  api.delete("/cases/:id", (req, res) => {
    ownedCase(res, req.params.id);
    cases.delete(req.params.id);
    send(res, deletionResponse, { deleted: true });
  });

  for (const [method, route] of pendingRoutes)
    api[method as "get" | "post" | "patch"](
      route.replace(/^\/api/, ""),
      (_req, res) =>
        sendError(
          res,
          new ApiError(
            "NOT_IMPLEMENTED",
            "This endpoint is not implemented yet.",
          ),
        ),
    );

  api.use((_req, res) =>
    sendError(res, new ApiError("NOT_FOUND", "Unknown API route.")),
  );
  app.use("/api", api);
  app.use("/api", errorHandler);

  app.use(express.static(webRoot));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(webRoot, "index.html")),
  );
  return app;
}
