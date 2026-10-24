import {
  applyFieldChanges,
  caseResponse,
  caseSchema,
  fieldsRequest,
  intakeRequest,
  type Case,
} from "@labelbridge/contracts";
import { FIELD_ORDER } from "../lib/fields";
import { SAMPLES, findSample } from "../samples";
import {
  ApiError,
  type ApiClient,
  type CaseResult,
  type ErrorCode,
} from "./client";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  STATE_CONFLICT: 409,
  EXPIRED: 410,
  IMAGE_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 415,
  NEEDS_CLARIFICATION: 422,
  INVALID_OUTPUT: 422,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  NOT_IMPLEMENTED: 404,
  INTERNAL_ERROR: 500,
};

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  REVISION_CONFLICT:
    "This label was changed since you loaded it. The latest version has been loaded.",
  EXPIRED: "This demo case expired after 60 minutes and was removed.",
  NOT_FOUND: "This demo case no longer exists.",
  PROVIDER_UNAVAILABLE: "The reading service is temporarily unavailable.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
};

const RETRYABLE = new Set<ErrorCode>([
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

function mockError(code: ErrorCode, message = MESSAGES[code] ?? code) {
  return new ApiError(
    code,
    message,
    RETRYABLE.has(code),
    STATUS[code],
    `mock-${crypto.randomUUID()}`,
  );
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Nothing extracted: fixture mode cannot read arbitrary images or text. */
function unextractedFields(): Case["fields"] {
  return FIELD_ORDER.map((key) => ({
    key,
    rawText: null,
    value: null,
    evidence: "",
    crop: null,
    provenance: "ai" as const,
    reviewState: "unresolved" as const,
  }));
}

export interface MockClient extends ApiClient {
  /** Make the next request fail with this code (tests and demo rehearsal). */
  failNext(code: ErrorCode): void;
  /** Store access for tests; simulates an edit from elsewhere. */
  store: Map<string, Case>;
}

export function createMockClient({
  latencyMs = 350,
  now = () => new Date(),
}: { latencyMs?: number; now?: () => Date } = {}): MockClient {
  const store = new Map<string, Case>();
  let pendingFailure: ErrorCode | null = null;

  async function respond(
    signal: AbortSignal | undefined,
    produce: () => Case,
  ): Promise<CaseResult> {
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (pendingFailure) {
      const code = pendingFailure;
      pendingFailure = null;
      throw mockError(code);
    }
    const parsed = caseResponse.parse({
      contractVersion: "1",
      requestId: `mock-${crypto.randomUUID()}`,
      dataMode: "fixture",
      data: produce(),
    });
    return {
      case: structuredClone(parsed.data),
      dataMode: parsed.dataMode,
      requestId: parsed.requestId,
    };
  }

  function current(id: string) {
    const found = store.get(id);
    if (!found) throw mockError("NOT_FOUND");
    if (now() >= new Date(found.expiresAt)) {
      store.delete(id);
      throw mockError("EXPIRED");
    }
    return found;
  }

  return {
    kind: "mock",
    store,
    failNext(code) {
      pendingFailure = code;
    },
    createCase(source, signal) {
      return respond(signal, () => {
        let base: Pick<Case, "fields" | "questions" | "status">;
        if (source.kind === "sample") {
          const sample = findSample(source.sampleId);
          if (!sample) throw mockError("BAD_REQUEST", "Unknown sample label.");
          base = {
            ...sample.fixture,
            fields: sample.fixture.fields.map((f) => ({
              ...f,
              crop:
                f.rawText === null && !f.evidence ? null : sample.crops[f.key],
            })),
          };
        } else {
          if (source.kind === "text")
            intakeRequest.parse({
              text: source.text,
              fictionalDataAcknowledged: true,
            });
          const match =
            source.kind === "text" &&
            SAMPLES.find((s) => normalize(s.text) === normalize(source.text));
          base = match
            ? match.fixture
            : {
                fields: unextractedFields(),
                questions: [],
                status: "needs_help",
              };
        }
        const created = now();
        const next = caseSchema.parse({
          ...structuredClone(base),
          id: `mock-case-${crypto.randomUUID()}`,
          revision: 0,
          createdAt: created.toISOString(),
          expiresAt: new Date(created.getTime() + 60 * 60 * 1000).toISOString(),
          fictionalData: true,
          sharing: { supporter: false, fieldKeys: [] },
          tasks: [],
        });
        store.set(next.id, next);
        return next;
      });
    },
    getCase(id, signal) {
      return respond(signal, () => current(id));
    },
    updateFields(id, body, signal) {
      return respond(signal, () => {
        const parsed = fieldsRequest.safeParse(body);
        if (!parsed.success)
          throw mockError("BAD_REQUEST", "Invalid field change.");
        try {
          const { case: next } = applyFieldChanges(current(id), parsed.data);
          store.set(id, next);
          return next;
        } catch (error) {
          if (error instanceof ApiError) throw error;
          const message = (error as Error).message;
          throw mockError(
            message === "REVISION_CONFLICT"
              ? "REVISION_CONFLICT"
              : "BAD_REQUEST",
          );
        }
      });
    },
  };
}
