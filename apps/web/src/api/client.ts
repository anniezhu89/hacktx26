import {
  apiError,
  caseResponse,
  fieldsRequest,
  intakeRequest,
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

async function parseCase(response: Response): Promise<CaseResult> {
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
  const parsed = caseResponse.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      "INVALID_OUTPUT",
      "The server response did not match the expected format, so it was not shown.",
      true,
      response.status,
    );
  return {
    case: parsed.data.data,
    dataMode: parsed.data.dataMode,
    requestId: parsed.data.requestId,
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
  return {
    kind: "http",
    async createCase(source, signal) {
      if (source.kind === "image") {
        // Multipart field names are pending in the shared contract.
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
      }
      const body = intakeRequest.parse({
        text: source.text,
        fictionalDataAcknowledged: true,
      });
      return parseCase(await send("/api/cases", json("POST", body, signal)));
    },
    async getCase(id, signal) {
      return parseCase(
        await send(`/api/cases/${encodeURIComponent(id)}`, {
          credentials: "same-origin",
          signal,
        }),
      );
    },
    async updateFields(id, body, signal) {
      return parseCase(
        await send(
          `/api/cases/${encodeURIComponent(id)}/fields`,
          json("PATCH", fieldsRequest.parse(body), signal),
        ),
      );
    },
  };
}
