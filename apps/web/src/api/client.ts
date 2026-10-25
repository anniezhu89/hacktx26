import {
  apiError,
  caseResponse,
  expectedRevision,
  explanationResponse,
  fieldsRequest,
  intakeRequest,
  pharmaciesResponse,
  pharmacySearchRequest,
  savingsRequest,
  savingsResponse,
  reviewClaimRequest,
  reviewCreateRequest,
  reviewResponse,
  reviewResponseRequest,
  reviewerViewResponse,
  reviewsResponse,
  sessionResponse,
  planRequest,
  planResponse,
  sharedCasesResponse,
  sharingRequest,
  taskActionResponse,
  taskRequest,
  type Case,
  type ReviewRequest,
  type ReviewerView,
  type SharedCase,
  type Task,
} from "@labelbridge/contracts";

export type DataMode = "live" | "cached" | "fixture";
export type FieldsRequest = ReturnType<typeof fieldsRequest.parse>;
export type ReviewCreate = ReturnType<typeof reviewCreateRequest.parse>;
export type ReviewRespond = ReturnType<typeof reviewResponseRequest.parse>;
export type ErrorCode = ReturnType<typeof apiError.parse>["error"]["code"];
export type Role = "patient" | "supporter" | "reviewer";
export type TaskActor = "patient" | "supporter";
export type SharingRequest = ReturnType<typeof sharingRequest.parse>;
export type PlanRequest = ReturnType<typeof planRequest.parse>;
export type PlanData = ReturnType<typeof planResponse.parse>["data"];
export type TaskRequest = ReturnType<typeof taskRequest.parse>;
export type TaskActionData = ReturnType<
  typeof taskActionResponse.parse
>["data"];
export type { SharedCase, Task };
export type ExplanationData = ReturnType<
  typeof explanationResponse.parse
>["data"];
export type SavingsData = ReturnType<typeof savingsResponse.parse>["data"];
export type SavingsRequest = ReturnType<typeof savingsRequest.parse>;
export type PharmacyData = ReturnType<typeof pharmaciesResponse.parse>["data"];
export type PharmacySearch = ReturnType<typeof pharmacySearchRequest.parse>;
export type { ReviewRequest, ReviewerView };

export type IntakeSource =
  | { kind: "sample"; sampleId: string; text: string }
  | { kind: "image"; file: File }
  | { kind: "text"; text: string };

export interface CaseResult {
  case: Case;
  dataMode: DataMode;
  requestId: string;
}

export interface Result<T> {
  data: T;
  dataMode: DataMode;
  requestId: string;
}

export interface ApiClient {
  /** "mock" means responses come from in-browser fixtures, not the backend. */
  readonly kind: "http" | "mock";
  createCase(source: IntakeSource, signal?: AbortSignal): Promise<CaseResult>;
  getCase(id: string, signal?: AbortSignal): Promise<CaseResult>;
  updateFields(
    id: string,
    body: FieldsRequest,
    signal?: AbortSignal,
  ): Promise<CaseResult>;
  // Patient: human reading help
  createReview(
    caseId: string,
    body: ReviewCreate,
    signal?: AbortSignal,
  ): Promise<Result<ReviewRequest>>;
  listCaseReviews(
    caseId: string,
    signal?: AbortSignal,
  ): Promise<Result<ReviewRequest[]>>;
  // Volunteer reviewer
  listReviewQueue(signal?: AbortSignal): Promise<Result<ReviewRequest[]>>;
  claimReview(id: string, signal?: AbortSignal): Promise<Result<ReviewerView>>;
  getReviewerView(
    id: string,
    signal?: AbortSignal,
  ): Promise<Result<ReviewerView>>;
  respondToReview(
    id: string,
    body: ReviewRespond,
    signal?: AbortSignal,
  ): Promise<Result<ReviewRequest>>;
  /** Image source the reviewer may load for this view, or null. */
  reviewImageSrc(view: ReviewerView): string | null;
  // Patient: understand and save
  requestExplanation(
    caseId: string,
    body: { expectedRevision: number },
    signal?: AbortSignal,
  ): Promise<Result<ExplanationData>>;
  searchSavings(
    caseId: string,
    body: SavingsRequest,
    signal?: AbortSignal,
  ): Promise<Result<SavingsData>>;
  findPharmacies(
    caseId: string,
    body: PharmacySearch,
    signal?: AbortSignal,
  ): Promise<Result<PharmacyData>>;
  // Shared support
  updateSharing(
    caseId: string,
    body: SharingRequest,
    signal?: AbortSignal,
  ): Promise<CaseResult>;
  requestPlan(
    caseId: string,
    body: PlanRequest,
    signal?: AbortSignal,
  ): Promise<Result<PlanData>>;
  taskAction(
    caseId: string,
    taskId: string,
    body: TaskRequest,
    as: TaskActor,
    signal?: AbortSignal,
  ): Promise<Result<TaskActionData>>;
  listShared(signal?: AbortSignal): Promise<Result<SharedCase[]>>;
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    "PROVIDER_UNAVAILABLE",
    "We could not reach the LabelBridge server. Check your connection and try again.",
    true,
    0,
  );
}

type Fetch = typeof fetch;

type Envelope = { safeParse(body: unknown): { success: boolean } };

export async function parseEnvelope<S extends Envelope>(
  response: Response,
  schema: S,
): Promise<Extract<ReturnType<S["safeParse"]>, { success: true }>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const parsed = apiError.safeParse(body);
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiError(
        e.code,
        e.message,
        e.retryable,
        response.status,
        e.requestId,
      );
    }
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unexpected error.",
      response.status >= 500,
      response.status,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      "INVALID_OUTPUT",
      "The server response did not match the expected format, so it was not shown.",
      true,
      response.status,
    );
  return parsed as Extract<ReturnType<S["safeParse"]>, { success: true }>;
}

async function parseCase(response: Response): Promise<CaseResult> {
  const { data } = await parseEnvelope(response, caseResponse);
  return {
    case: data.data,
    dataMode: data.dataMode,
    requestId: data.requestId,
  };
}

const unwrap = <T>(e: { data: T; dataMode: DataMode; requestId: string }) => ({
  data: e.data,
  dataMode: e.dataMode,
  requestId: e.requestId,
});

export function createHttpClient(fetchImpl: Fetch = fetch): ApiClient {
  const json = (method: string, body: unknown, signal?: AbortSignal) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin" as const,
    signal,
  });
  const get = (signal?: AbortSignal) => ({
    credentials: "same-origin" as const,
    signal,
  });
  const send = async (url: string, init: RequestInit) => {
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      throw toApiError(error);
    }
  };
  // The backend requires a synthetic demo session cookie (POST /api/session).
  // Its role is a demo persona, not authentication; switching keeps the same
  // demo workspace so patient and volunteer views share fictional cases.
  let session: Promise<Role> | null = null;
  const startSession = (role: Role) => {
    session = send("/api/session", json("POST", { role }))
      .then((res) => parseEnvelope(res, sessionResponse))
      .then(() => role)
      .catch((error) => {
        session = null;
        throw error;
      });
    return session;
  };
  // One shared cookie carries the role, so a role check and the request it
  // guards run one at a time: an overlapping call for another persona must
  // not switch the cookie between them.
  let queue: Promise<unknown> = Promise.resolve();
  // A 401 means the server forgot the session (e.g. it restarted): start a
  // new one and retry once. The case itself may then be gone (404).
  const withSession = <T>(role: Role, call: () => Promise<T>) => {
    const run = async () => {
      const current = await (session ?? startSession(role));
      if (current !== role) await startSession(role);
      try {
        return await call();
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED")
          throw error;
        await startSession(role);
        return call();
      }
    };
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };
  const patient = <T>(call: () => Promise<T>) => withSession("patient", call);
  const reviewer = <T>(call: () => Promise<T>) => withSession("reviewer", call);
  const path = (...parts: string[]) =>
    `/api/${parts.map(encodeURIComponent).join("/")}`;

  return {
    kind: "http",
    createCase(source, signal) {
      if (source.kind === "image")
        return patient(async () => {
          const form = new FormData();
          form.append("image", source.file);
          form.append("fictionalDataAcknowledged", "true");
          return parseCase(
            await send("/api/cases", {
              method: "POST",
              body: form,
              credentials: "same-origin",
              signal,
            }),
          );
        });
      const body = intakeRequest.parse({
        text: source.text,
        fictionalDataAcknowledged: true,
      });
      return patient(async () =>
        parseCase(await send("/api/cases", json("POST", body, signal))),
      );
    },
    getCase(id, signal) {
      return patient(async () =>
        parseCase(await send(path("cases", id), get(signal))),
      );
    },
    updateFields(id, body, signal) {
      const parsed = fieldsRequest.parse(body);
      return patient(async () =>
        parseCase(
          await send(
            path("cases", id, "fields"),
            json("PATCH", parsed, signal),
          ),
        ),
      );
    },
    createReview(caseId, body, signal) {
      const parsed = reviewCreateRequest.parse(body);
      return patient(async () => {
        const res = await send(
          path("cases", caseId, "reviews"),
          json("POST", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, reviewResponse)).data);
      });
    },
    listCaseReviews(caseId, signal) {
      return patient(async () => {
        const res = await send(path("cases", caseId, "reviews"), get(signal));
        return unwrap((await parseEnvelope(res, reviewsResponse)).data);
      });
    },
    listReviewQueue(signal) {
      return reviewer(async () => {
        const res = await send("/api/reviews", get(signal));
        return unwrap((await parseEnvelope(res, reviewsResponse)).data);
      });
    },
    claimReview(id, signal) {
      const body = reviewClaimRequest.parse({ expectedState: "pending" });
      return reviewer(async () => {
        const res = await send(
          path("reviews", id, "claim"),
          json("POST", body, signal),
        );
        return unwrap((await parseEnvelope(res, reviewerViewResponse)).data);
      });
    },
    getReviewerView(id, signal) {
      return reviewer(async () => {
        const res = await send(path("reviews", id), get(signal));
        return unwrap((await parseEnvelope(res, reviewerViewResponse)).data);
      });
    },
    respondToReview(id, body, signal) {
      const parsed = reviewResponseRequest.parse(body);
      return reviewer(async () => {
        const res = await send(
          path("reviews", id, "response"),
          json("POST", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, reviewResponse)).data);
      });
    },
    // The contract restricts imageUrl to the authorized review image route.
    reviewImageSrc: (view) => view.imageUrl,
    requestExplanation(caseId, body, signal) {
      const parsed = expectedRevision.parse(body);
      return patient(async () => {
        const res = await send(
          path("cases", caseId, "explanation"),
          json("POST", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, explanationResponse)).data);
      });
    },
    updateSharing(caseId, body, signal) {
      const parsed = sharingRequest.parse(body);
      return patient(async () =>
        parseCase(
          await send(
            path("cases", caseId, "sharing"),
            json("PATCH", parsed, signal),
          ),
        ),
      );
    },
    requestPlan(caseId, body, signal) {
      const parsed = planRequest.parse(body);
      return patient(async () => {
        const res = await send(
          path("cases", caseId, "plan"),
          json("POST", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, planResponse)).data);
      });
    },
    taskAction(caseId, taskId, body, as, signal) {
      const parsed = taskRequest.parse(body);
      return withSession(as, async () => {
        const res = await send(
          path("cases", caseId, "tasks", taskId),
          json("PATCH", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, taskActionResponse)).data);
      });
    },
    listShared(signal) {
      return withSession("supporter", async () => {
        const res = await send("/api/shared", get(signal));
        return unwrap((await parseEnvelope(res, sharedCasesResponse)).data);
      });
    },
    findPharmacies(caseId, body, signal) {
      const parsed = pharmacySearchRequest.parse(body);
      return patient(async () => {
        const res = await send(
          path("cases", caseId, "pharmacies"),
          json("POST", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, pharmaciesResponse)).data);
      });
    },
    searchSavings(caseId, body, signal) {
      const parsed = savingsRequest.parse(body);
      return patient(async () => {
        const res = await send(
          path("cases", caseId, "savings-search"),
          json("POST", parsed, signal),
        );
        return unwrap((await parseEnvelope(res, savingsResponse)).data);
      });
    },
  };
}
