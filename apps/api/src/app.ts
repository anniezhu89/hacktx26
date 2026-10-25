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
  pharmaciesResponse,
  pharmacySearchRequest,
  savingsRequest,
  savingsResponse,
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
import { extractFromImage, type GeminiConfig } from "./providers/gemini";
import {
  PharmacyCache,
  findPharmacies,
  type SerpApiConfig,
} from "./providers/serpapi";
import {
  SavingsCache,
  findSavings,
  identifyFor,
  notIdentified,
} from "./providers/savings";
import {
  SessionStore,
  loadSession,
  requireSession,
  setSessionCookie,
} from "./session";
import { CaseStore, caseLifetimeMs, type CaseRecord } from "./store";
import { AccountStore } from "./accounts";
import { CircleStore } from "./circle";
import { ReviewStore } from "./reviews";
import { registerAccountRoutes } from "./routes/accounts";
import { registerCircleRoutes } from "./routes/circle";
import type { RouteContext } from "./routes/context";
import {
  registerMedicineRoutes,
  type MedicineOptions,
} from "./routes/medicine";
import { registerReviewRoutes } from "./routes/reviews";

export type DataMode = "live" | "cached" | "fixture";

export type LogEntry = {
  requestId: string;
  method: string;
  route: string;
  status: number;
  latencyMs: number;
  providerMode: DataMode;
  /** Adapter-generated reason only; never label or image content. */
  providerError?: string;
};

export type AppOptions = {
  now?: () => number;
  log?: (entry: LogEntry) => void;
  cases?: CaseStore;
  sessions?: SessionStore;
  limits?: {
    api?: RateLimit;
    intake?: RateLimit;
    pharmacies?: RateLimit;
    savings?: RateLimit;
  };
  /** Null keeps image intake in explicit fixture mode. */
  extraction?: GeminiConfig | null;
  /** Null keeps the pharmacy lookup in explicit fixture mode. */
  search?: SerpApiConfig | null;
  fetchImpl?: typeof fetch;
  /** v1.6 stores (tests inject them to control time and state). */
  accounts?: AccountStore;
  /** Null (the default) turns reference lookups off: no NLM or model calls. */
  medicine?: MedicineOptions | null;
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
      // Set by whichever handler actually produced the data; anything that did
      // not reach a live provider stays "fixture" so fallbacks are never
      // disguised as live results.
      dataMode: (res.locals.dataMode as DataMode | undefined) ?? "fixture",
      data,
    }),
  );
}

export function createApp(
  webRoot = path.resolve("apps/web/dist"),
  options: AppOptions = {},
) {
  const now = options.now ?? Date.now;
  const log =
    options.log ?? ((entry: LogEntry) => console.log(JSON.stringify(entry)));
  const cases = options.cases ?? new CaseStore(now);
  const sessions = options.sessions ?? new SessionStore(now);
  const accounts = options.accounts ?? new AccountStore(now);
  const circle = new CircleStore(now);
  const reviews = new ReviewStore(now);
  // Fixture mode unless a caller explicitly opts in, so tests can never reach a
  // live provider through ambient environment variables.
  const extraction = options.extraction ?? null;
  const search = options.search ?? null;
  const pharmacyCache = new PharmacyCache(now);
  const savingsCache = new SavingsCache(now);
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
        providerMode:
          (res.locals.dataMode as DataMode | undefined) ?? "fixture",
        ...(res.locals.providerError
          ? { providerError: String(res.locals.providerError) }
          : {}),
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
        // Reports whether a provider is configured, never the credential.
        dataMode: extraction || search ? "live" : "fixture",
        data: {
          status: "ok",
          providers: {
            extraction: extraction ? "live" : "fixture",
            explanation: "fixture",
            // Configured, not proven: it says a search adapter has a key,
            // not that any particular lookup will succeed.
            search: search ? "live" : "fixture",
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
    // Personas matter only for the anonymous demo. An account reaches its own
    // workspace whatever view it last used; others get access via grants.
    if (session.role !== "patient" && !session.accountId)
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
      let result: Extraction;
      if (res.locals.multipart) {
        image = await readImageUpload(req);
        const live = extraction
          ? await extractFromImage(extraction, image, {
              fetchImpl: options.fetchImpl,
              // Provider-side reason only: these messages are built by the
              // adapter and never contain image or label content.
              onError: (message) => {
                res.locals.providerError = message;
              },
            })
          : null;
        // A failed or unconfigured provider falls back to an explicit
        // unresolved state, and the response stays labelled "fixture".
        result =
          live ??
          unresolvedImageExtraction(
            extraction ? "attempted" : "not_configured",
          );
        if (live) res.locals.dataMode = "live";
      } else if (req.is("application/json")) {
        const { text } = parseBody(intakeRequest, req.body);
        result = extractFromText(text);
      } else
        throw new ApiError(
          "BAD_REQUEST",
          "Send JSON text intake or a multipart image upload.",
        );
      const record = cases.create({
        case: newCase(result),
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

  api.post(
    "/cases/:id/savings-search",
    rateLimit(
      "savings",
      options.limits?.savings ?? { limit: 12, windowMs: 10 * 60_000 },
      now,
    ),
    async (req, res) => {
      const record = ownedCase(res, String(req.params.id));
      const input = parseBody(savingsRequest, req.body);
      if (input.expectedRevision !== record.case.revision)
        throw new ApiError(
          "REVISION_CONFLICT",
          "The case changed since it was loaded. Reload and review again.",
        );
      // Only a confirmed name is searched. An unreviewed AI reading could be
      // wrong, and a search for the wrong medication returns real, plausible
      // programmes for a medication the patient is not taking.
      const name = record.case.fields.find(
        (f) => f.key === "medicationName" && f.reviewState === "user_confirmed",
      )?.value;
      const generic = identifyFor(name ?? null);
      // Not identified is an answer, not an error: no search is spent.
      if (!generic) return send(res, savingsResponse, notIdentified(now));
      if (!search)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          "Savings search is not configured, so no programs can be listed.",
        );
      const cached = savingsCache.get(generic);
      if (cached) {
        res.locals.dataMode = "cached";
        return send(res, savingsResponse, cached);
      }
      const lookup = await findSavings(search, generic, {
        fetchImpl: options.fetchImpl,
        now,
        onError: (message) => {
          res.locals.providerError = message;
        },
      });
      if (!lookup)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          "The savings search provider is unavailable. Try again shortly.",
        );
      savingsCache.set(generic, lookup);
      res.locals.dataMode = "live";
      send(res, savingsResponse, lookup);
    },
  );

  api.post(
    "/cases/:id/pharmacies",
    // The plan caps searches per case; the key is the demo workspace, which is
    // what holds the cases, so a burst of reruns cannot drain search credit.
    rateLimit(
      "pharmacies",
      options.limits?.pharmacies ?? { limit: 12, windowMs: 10 * 60_000 },
      now,
    ),
    async (req, res) => {
      // Ownership is still checked: the lookup is reached through a case, and
      // only its own patient session may spend a search on it.
      // String(): with a middleware in front, Express widens the param type.
      ownedCase(res, String(req.params.id));
      const input = parseBody(pharmacySearchRequest, req.body);
      if (!search)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          "Pharmacy search is not configured, so no pharmacies can be listed.",
        );
      // A cached lookup is labelled "cached", never "live": the response must
      // say when it is up to 15 minutes old.
      const cached = pharmacyCache.get(input.location);
      if (cached) {
        res.locals.dataMode = "cached";
        return send(res, pharmaciesResponse, cached);
      }
      const lookup = await findPharmacies(search, input.location, {
        fetchImpl: options.fetchImpl,
        now,
        // Adapter-generated reason only; never label or location content.
        onError: (message) => {
          res.locals.providerError = message;
        },
      });
      // No stale or invented list on failure: an explicit unavailable state.
      if (!lookup)
        throw new ApiError(
          "PROVIDER_UNAVAILABLE",
          "The pharmacy search provider is unavailable. Try again shortly.",
        );
      pharmacyCache.set(input.location, lookup);
      res.locals.dataMode = "live";
      send(res, pharmaciesResponse, lookup);
    },
  );

  // Deleting a case also deletes its reading requests, shares and lookups.
  let forgetMedicine: (caseId: string) => void = () => undefined;
  const deleteCase = (caseId: string) => {
    cases.delete(caseId);
    reviews.forgetCase(caseId);
    circle.forgetCase(caseId);
    forgetMedicine(caseId);
  };

  api.delete("/cases/:id", (req, res) => {
    ownedCase(res, req.params.id);
    deleteCase(req.params.id);
    send(res, deletionResponse, { deleted: true });
  });

  const ctx: RouteContext = {
    api,
    now,
    cases,
    sessions,
    accounts,
    circle,
    reviews,
    send,
    ownedCase,
    readImageUpload,
    deleteCase,
  };
  registerAccountRoutes(ctx);
  registerCircleRoutes(ctx);
  registerReviewRoutes(ctx);
  forgetMedicine = registerMedicineRoutes(
    ctx,
    options.medicine ?? null,
  ).forgetCase;

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
