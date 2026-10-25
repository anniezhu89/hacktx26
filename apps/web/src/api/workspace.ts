import {
  accountResponse,
  circleResponse,
  deletionResponse,
  invitationCreatedResponse,
  medicineCandidatesResponse,
  medicineIdentityResponse,
  medicineInfoResponse,
  reviewResponse,
  savedLabelsResponse,
  sharedLabelsResponse,
  taskActionResponse,
  type Account,
  type Grant,
  type Invitation,
} from "@labelbridge/contracts";
import {
  parseEnvelope,
  toApiError,
  type DataMode,
  type TaskRequest,
} from "./client";

type Fetch = typeof fetch;
export type Uses = Account["uses"];
export type TextSize = Account["textSize"];
export type Language = "en" | "es";
export type ExplanationMode = "overview" | "terms" | "source";

/**
 * Typed client for the v1.6 routes: demo accounts, support circle, volunteer
 * extras and the medicine translator. Same envelope checks as the case client.
 */
export function createWorkspaceClient(fetchImpl: Fetch = fetch) {
  const send = async (url: string, init: RequestInit = {}) => {
    try {
      return await fetchImpl(url, { credentials: "same-origin", ...init });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      throw toApiError(error);
    }
  };
  const json = (
    method: string,
    body?: unknown,
    signal?: AbortSignal,
  ): RequestInit => ({
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  type Wire<T> = { data: T; dataMode: DataMode; requestId: string };
  type EnvelopeSchema<T> = {
    safeParse(
      body: unknown,
    ): { success: true; data: Wire<T> } | { success: false };
  };
  const call = async <T>(
    schema: EnvelopeSchema<T>,
    url: string,
    init?: RequestInit,
  ) => {
    const parsed = (await parseEnvelope(
      await send(url, init),
      schema,
    )) as unknown as { data: Wire<T> };
    return parsed.data;
  };
  const path = (...parts: string[]) =>
    `/api/${parts.map(encodeURIComponent).join("/")}`;
  const imageForm = (file: Blob, name: string) => {
    const form = new FormData();
    form.append("image", file, name);
    form.append("fictionalDataAcknowledged", "true");
    return form;
  };

  return {
    me: (signal?: AbortSignal) =>
      call(accountResponse, "/api/account", { signal }),
    signup: (body: {
      name: string;
      email: string;
      password: string;
      uses: Uses;
      textSize?: TextSize;
    }) =>
      call(
        accountResponse,
        "/api/account/signup",
        json("POST", { ...body, fictionalDataAcknowledged: true }),
      ),
    signin: (body: { email: string; password: string }) =>
      call(accountResponse, "/api/account/signin", json("POST", body)),
    signout: () => call(accountResponse, "/api/account/signout", json("POST")),
    recover: (email: string) =>
      call(accountResponse, "/api/account/recovery", json("POST", { email })),
    updatePreferences: (body: {
      name?: string;
      uses?: Uses;
      textSize?: TextSize;
    }) => call(accountResponse, "/api/account", json("PATCH", body)),
    deleteAccount: (password: string) =>
      call(
        deletionResponse,
        "/api/account",
        json("DELETE", { password, confirm: "DELETE" }),
      ),
    savedLabels: (signal?: AbortSignal) =>
      call(savedLabelsResponse, "/api/account/labels", { signal }),
    saveLabel: (caseId: string) =>
      call(
        savedLabelsResponse,
        "/api/account/labels",
        json("POST", { caseId }),
      ),
    deleteLabel: (caseId: string) =>
      call(deletionResponse, path("cases", caseId), json("DELETE")),

    circle: (signal?: AbortSignal) =>
      call(circleResponse, "/api/circle", { signal }),
    invite: (inviteeName: string, scope: Invitation["scope"]) =>
      call(
        invitationCreatedResponse,
        "/api/circle/invitations",
        json("POST", { inviteeName, scope }),
      ),
    revokeInvitation: (id: string) =>
      call(circleResponse, path("circle", "invitations", id), json("DELETE")),
    respondToInvite: (code: string, decision: "accept" | "decline") =>
      call(
        circleResponse,
        "/api/circle/accept",
        json("POST", { code, decision }),
      ),
    setGrant: (
      connectionId: string,
      caseId: string,
      grant: Omit<Grant, "caseId">,
    ) =>
      call(
        circleResponse,
        path("circle", "connections", connectionId, "grants", caseId),
        json("PUT", grant),
      ),
    removeGrant: (connectionId: string, caseId: string) =>
      call(
        circleResponse,
        path("circle", "connections", connectionId, "grants", caseId),
        json("DELETE"),
      ),
    removeConnection: (connectionId: string) =>
      call(
        circleResponse,
        path("circle", "connections", connectionId),
        json("DELETE"),
      ),
    sharedWithMe: (signal?: AbortSignal) =>
      call(sharedLabelsResponse, "/api/circle/shared", { signal }),
    sharedTask: (caseId: string, taskId: string, body: TaskRequest) =>
      call(
        taskActionResponse,
        path("circle", "shared", caseId, "tasks", taskId),
        json("PATCH", body),
      ),

    uploadReviewImage: (reviewId: string, image: Blob) =>
      call(reviewResponse, path("reviews", reviewId, "image"), {
        method: "PUT",
        body: imageForm(image, "section.jpg"),
      }),
    cancelReview: (reviewId: string) =>
      call(reviewResponse, path("reviews", reviewId, "cancel"), json("POST")),
    releaseReview: (reviewId: string) =>
      call(reviewResponse, path("reviews", reviewId, "release"), json("POST")),

    medicineCandidates: (
      caseId: string,
      expectedRevision: number,
      signal?: AbortSignal,
    ) =>
      call(
        medicineCandidatesResponse,
        path("cases", caseId, "medicine", "candidates"),
        json("POST", { expectedRevision, consent: true }, signal),
      ),
    confirmMedicine: (
      caseId: string,
      body: { expectedRevision: number; rxcui: string; identityKey: string },
    ) =>
      call(
        medicineIdentityResponse,
        path("cases", caseId, "medicine", "confirm"),
        json("POST", { ...body, compared: true }),
      ),
    medicineInfo: (
      caseId: string,
      body: {
        expectedRevision: number;
        language: Language;
        mode: ExplanationMode;
      },
      signal?: AbortSignal,
    ) =>
      call(
        medicineInfoResponse,
        path("cases", caseId, "medicine", "info"),
        json("POST", body, signal),
      ),
  };
}

export type WorkspaceClient = ReturnType<typeof createWorkspaceClient>;
export const workspace = createWorkspaceClient();
