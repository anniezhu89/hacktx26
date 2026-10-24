import {
  applyFieldChanges,
  caseResponse,
  caseSchema,
  fieldsRequest,
  intakeRequest,
  reviewCreateRequest,
  reviewResponse,
  reviewResponseRequest,
  reviewerViewResponse,
  reviewsResponse,
  eligibleForExplanation,
  expectedRevision,
  explanation,
  explanationResponse,
  savingsOption,
  savingsRequest,
  savingsResponse,
  type Case,
  type ReviewRequest,
} from "@labelbridge/contracts";
import { FIELD_ORDER } from "../lib/fields";
import explanationFixture from "../../../../fixtures/explanation.json";
import savingsFixture from "../../../../fixtures/savings.json";
import { SAMPLES, findSample } from "../samples";
import {
  ApiError,
  type ApiClient,
  type CaseResult,
  type ErrorCode,
  type Result,
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
    evidence: "Not read: the in-browser fixture mock cannot read this input.",
    crop: null,
    provenance: "ai" as const,
    reviewState: "unresolved" as const,
  }));
}

const OPEN = new Set<ReviewRequest["status"]>(["pending", "claimed"]);

export interface MockClient extends ApiClient {
  /** Make the next request fail with this code (tests and demo rehearsal). */
  failNext(code: ErrorCode): void;
  /** Store access for tests; simulates an edit from elsewhere. */
  store: Map<string, Case>;
  reviews: Map<string, ReviewRequest>;
  /** Next savings search returns these options (tests); default is the fixture. */
  nextSavings(options: unknown[]): void;
}

type Schema<T> = {
  parse(v: unknown): {
    data: T;
    dataMode: Result<T>["dataMode"];
    requestId: string;
  };
};

export function createMockClient({
  latencyMs = 350,
  now = () => new Date(),
}: { latencyMs?: number; now?: () => Date } = {}): MockClient {
  const store = new Map<string, Case>();
  const reviews = new Map<string, ReviewRequest>();
  // What the patient submitted, kept to build reviewer excerpts.
  const intake = new Map<
    string,
    { imageSrc: string | null; text: string | null }
  >();
  let pendingFailure: ErrorCode | null = null;
  let pendingSavings: unknown[] | null = null;

  function requireCurrentRevision(id: string, body: unknown) {
    const c = current(id);
    const parsed = expectedRevision.safeParse(body);
    if (!parsed.success) throw mockError("BAD_REQUEST", "Invalid request.");
    if (parsed.data.expectedRevision !== c.revision)
      throw mockError("REVISION_CONFLICT");
    if (!eligibleForExplanation(c.fields))
      throw mockError(
        "NEEDS_CLARIFICATION",
        "Confirm the medication name, strength, dosage form and directions first.",
      );
    return c;
  }

  async function respond<T>(
    signal: AbortSignal | undefined,
    schema: Schema<T>,
    produce: () => T,
  ): Promise<Result<T>> {
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (pendingFailure) {
      const code = pendingFailure;
      pendingFailure = null;
      throw mockError(code);
    }
    const parsed = schema.parse({
      contractVersion: "1",
      requestId: `mock-${crypto.randomUUID()}`,
      dataMode: "fixture",
      data: produce(),
    });
    return {
      data: structuredClone(parsed.data),
      dataMode: parsed.dataMode,
      requestId: parsed.requestId,
    };
  }

  const respondCase = async (
    signal: AbortSignal | undefined,
    produce: () => Case,
  ): Promise<CaseResult> => {
    const r = await respond(signal, caseResponse, produce);
    return { case: r.data, dataMode: r.dataMode, requestId: r.requestId };
  };

  function current(id: string) {
    const found = store.get(id);
    if (!found) throw mockError("NOT_FOUND");
    if (now() >= new Date(found.expiresAt)) {
      store.delete(id);
      const src = intake.get(id)?.imageSrc;
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
      intake.delete(id);
      for (const [rid, r] of reviews) if (r.caseId === id) reviews.delete(rid);
      throw mockError("EXPIRED");
    }
    return found;
  }

  function review(id: string) {
    const found = reviews.get(id);
    if (!found)
      throw mockError("NOT_FOUND", "This reading request no longer exists.");
    current(found.caseId);
    return found;
  }

  function checkVolunteerChanges(id: string, body: unknown) {
    const parsed = fieldsRequest.safeParse(body);
    if (!parsed.success)
      throw mockError("BAD_REQUEST", "Invalid field change.");
    for (const change of parsed.data.changes) {
      if (!change.fromReviewId) continue;
      // A volunteer reading is a proposal: applying it never confirms it.
      if (change.reviewState === "user_confirmed")
        throw mockError(
          "BAD_REQUEST",
          "A volunteer reading must be confirmed separately by the patient.",
        );
      const r = reviews.get(change.fromReviewId);
      const proposal = r?.proposals.find((p) => p.key === change.key);
      if (
        !r ||
        r.caseId !== id ||
        r.status !== "submitted" ||
        !proposal ||
        proposal.visibleText === null ||
        proposal.visibleText !== change.value
      )
        throw mockError(
          "STATE_CONFLICT",
          "That volunteer reading does not match this label.",
        );
    }
    return parsed.data;
  }

  return {
    kind: "mock",
    store,
    reviews,
    failNext(code) {
      pendingFailure = code;
    },
    createCase(source, signal) {
      return respondCase(signal, () => {
        let base: Pick<Case, "fields" | "questions" | "status">;
        let imageSrc: string | null = null;
        if (source.kind === "sample") {
          const sample = findSample(source.sampleId);
          if (!sample) throw mockError("BAD_REQUEST", "Unknown sample label.");
          imageSrc = sample.imageUrl;
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
          else if (typeof URL.createObjectURL === "function")
            imageSrc = URL.createObjectURL(source.file);
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
        intake.set(next.id, {
          imageSrc,
          text: source.kind === "text" ? source.text : null,
        });
        return next;
      });
    },
    getCase(id, signal) {
      return respondCase(signal, () => current(id));
    },
    updateFields(id, body, signal) {
      return respondCase(signal, () => {
        const parsed = checkVolunteerChanges(id, body);
        try {
          const { case: next } = applyFieldChanges(current(id), parsed);
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

    createReview(caseId, body, signal) {
      return respond(signal, reviewResponse, () => {
        const parsed = reviewCreateRequest.safeParse(body);
        if (!parsed.success)
          throw mockError(
            "BAD_REQUEST",
            "Choose at least one field and give consent.",
          );
        const c = current(caseId);
        if (c.revision !== parsed.data.expectedRevision)
          throw mockError("REVISION_CONFLICT");
        for (const r of reviews.values()) {
          if (r.caseId !== caseId || !OPEN.has(r.status)) continue;
          // Mock policy: a request for an older revision is superseded.
          if (r.caseRevision < c.revision) r.status = "closed";
          else
            throw mockError(
              "STATE_CONFLICT",
              "A reading request for this label is already open.",
            );
        }
        const created: ReviewRequest = {
          id: `mock-review-${crypto.randomUUID()}`,
          caseId,
          caseRevision: c.revision,
          selectedFields: [...new Set(parsed.data.selectedFields)],
          consentAt: now().toISOString(),
          status: "pending",
          proposals: [],
        };
        reviews.set(created.id, created);
        return created;
      });
    },
    listCaseReviews(caseId, signal) {
      return respond(signal, reviewsResponse, () => {
        current(caseId);
        return [...reviews.values()].filter((r) => r.caseId === caseId);
      });
    },
    listReviewQueue(signal) {
      return respond(signal, reviewsResponse, () =>
        [...reviews.values()]
          .filter((r) => OPEN.has(r.status) && store.has(r.caseId))
          .filter((r) => now() < new Date(store.get(r.caseId)!.expiresAt))
          .sort((a, b) => a.consentAt.localeCompare(b.consentAt)),
      );
    },
    claimReview(id, signal) {
      return respond(signal, reviewerViewResponse, () => {
        const r = review(id);
        if (r.status !== "pending")
          throw mockError(
            "STATE_CONFLICT",
            "Another volunteer already claimed this request.",
          );
        r.status = "claimed";
        return viewOf(r);
      });
    },
    getReviewerView(id, signal) {
      return respond(signal, reviewerViewResponse, () => {
        const r = review(id);
        if (r.status !== "claimed")
          throw mockError("FORBIDDEN", "This request is no longer open.");
        return viewOf(r);
      });
    },
    respondToReview(id, body, signal) {
      return respond(signal, reviewResponse, () => {
        const parsed = reviewResponseRequest.safeParse(body);
        if (!parsed.success)
          throw mockError("BAD_REQUEST", "That reading could not be sent.");
        const r = review(id);
        if (r.status !== "claimed")
          throw mockError("STATE_CONFLICT", "This request is no longer open.");
        const c = current(r.caseId);
        if (
          parsed.data.expectedRevision !== r.caseRevision ||
          c.revision !== r.caseRevision
        )
          throw mockError(
            "REVISION_CONFLICT",
            "The patient changed this label after asking for help, so this reading cannot be sent.",
          );
        const { outcome, proposals } = parsed.data;
        const keys = proposals.map((p) => p.key);
        if (
          new Set(keys).size !== keys.length ||
          keys.some((k) => !r.selectedFields.includes(k)) ||
          (outcome === "needs_new_image" ? keys.length > 0 : keys.length === 0)
        )
          throw mockError(
            "BAD_REQUEST",
            "Readings must cover only the requested fields.",
          );
        r.status = outcome;
        r.proposals = proposals;
        return r;
      });
    },
    nextSavings(options) {
      pendingSavings = options;
    },
    requestExplanation(caseId, body, signal) {
      return respond(signal, explanationResponse, () => {
        const c = requireCurrentRevision(caseId, body);
        const directions = c.fields.find(
          (f) => f.key === "exactDirections",
        )!.value!;
        const fixture = explanation.parse(explanationFixture);
        // Fixture mode never paraphrases: directions are returned verbatim.
        return {
          ...(fixture.originalDirections === directions
            ? fixture
            : {
                originalDirections: directions,
                simplifiedText: directions,
                references: [],
                unresolvedQuestions: [],
                eligibleForExplanation: true,
              }),
          fieldRevision: c.revision,
        };
      });
    },
    searchSavings(caseId, body, signal) {
      return respond(signal, savingsResponse, () => {
        const parsed = savingsRequest.safeParse(body);
        if (!parsed.success)
          throw mockError("BAD_REQUEST", "Enter a city or ZIP code.");
        requireCurrentRevision(caseId, {
          expectedRevision: parsed.data.expectedRevision,
        });
        const options = (pendingSavings ?? [savingsFixture]).map((o) =>
          savingsOption.parse(o),
        );
        pendingSavings = null;
        return { options };
      });
    },
    reviewImageSrc(view) {
      return view.imageUrl
        ? (intake.get(view.review.caseId)?.imageSrc ?? null)
        : null;
    },
  };

  function typedLines(text: string | null, rawText: string | null) {
    if (!text || !rawText) return null;
    // First matching line only, so other parts of the label are not shared.
    const line = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.includes(rawText));
    return line ?? null;
  }

  function viewOf(r: ReviewRequest) {
    const c = store.get(r.caseId)!;
    const source = intake.get(r.caseId);
    return {
      review: r,
      // Label evidence only: never values, rawText or extraction evidence.
      // For text intake, the excerpt is the line(s) the patient actually
      // typed that contain the field, never the extracted substring.
      excerpts: r.selectedFields.map((key) => {
        const f = c.fields.find((x) => x.key === key)!;
        return {
          key,
          textExcerpt: typedLines(source?.text ?? null, f.rawText),
          crop: source?.imageSrc ? f.crop : null,
        };
      }),
      imageUrl: source?.imageSrc ? `/api/reviews/${r.id}/image` : null,
    };
  }
}
