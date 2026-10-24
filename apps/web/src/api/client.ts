import {
  apiError,
  caseResponse,
  fieldsRequest,
  intakeRequest,
  sessionResponse,
  type Case,
} from "@labelbridge/contracts";

export type DataMode = "live" | "cached" | "fixture";
export type FieldsRequest = ReturnType<typeof fieldsRequest.parse>;
export type ErrorCode = ReturnType<typeof apiError.parse>["error"]["code"];

export type IntakeSource =
  | { kind: "sample"; sampleId: string; text: string }
  | { kind: "image"; file: File }
  | { kind: "text"; text: string };

export interface CaseResult {
  case: Case;
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

async function parseEnvelope<S extends Envelope>(
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

export function createHttpClient(fetchImpl: Fetch = fetch): ApiClient {
  const json = (method: string, body: unknown, signal?: AbortSignal) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
  // The backend requires a synthetic demo session cookie (POST /api/session)
  // before case routes. This is persona selection, not authentication.
  let session: Promise<unknown> | null = null;
  const startSession = () => {
    session = send("/api/session", json("POST", { role: "patient" }))
      .then((res) => parseEnvelope(res, sessionResponse))
      .catch((error) => {
        session = null;
        throw error;
      });
    return session;
  };
  // A 401 means the server forgot the session (e.g. it restarted): start a
  // new one and retry once. The case itself may then be gone (404).
  const withSession = async (call: () => Promise<CaseResult>) => {
    await (session ?? startSession());
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "UNAUTHORIZED")
        throw error;
      await startSession();
      return call();
    }
  };
  return {
    kind: "http",
    createCase(source, signal) {
      if (source.kind === "image")
        return withSession(async () => {
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
      return withSession(async () =>
        parseCase(await send("/api/cases", json("POST", body, signal))),
      );
    },
    getCase(id, signal) {
      return withSession(async () =>
        parseCase(
          await send(`/api/cases/${encodeURIComponent(id)}`, {
            credentials: "same-origin",
            signal,
          }),
        ),
      );
    },
    updateFields(id, body, signal) {
      const parsed = fieldsRequest.parse(body);
      return withSession(async () =>
        parseCase(
          await send(
            `/api/cases/${encodeURIComponent(id)}/fields`,
            json("PATCH", parsed, signal),
          ),
        ),
      );
    },
  };
}
