import { randomUUID } from "node:crypto";
import {
  accountResponse,
  attachRequest,
  caseSchema,
  deleteAccountRequest,
  deletionResponse,
  eligibleForExplanation,
  preferencesRequest,
  recoveryRequest,
  savedLabelsResponse,
  signinRequest,
  signupRequest,
  type SavedLabel,
} from "@labelbridge/contracts";
import { savedLabelLifetimeMs } from "../accounts";
import { ApiError, parseBody } from "../errors";
import { rateLimit } from "../limits";
import { requireSession, setSessionCookie } from "../session";
import type { CaseRecord } from "../store";
import { requireAccount, type RouteContext } from "./context";

const CRITICAL = [
  "medicationName",
  "strength",
  "dosageForm",
  "exactDirections",
];

export function savedLabelOf(record: CaseRecord): SavedLabel {
  const c = record.case;
  const confirmed = c.fields.filter(
    (f) =>
      CRITICAL.includes(f.key) &&
      f.reviewState === "user_confirmed" &&
      !!f.value?.trim(),
  );
  const name = confirmed.find((f) => f.key === "medicationName")?.value ?? null;
  return {
    caseId: c.id,
    title: name,
    status: eligibleForExplanation(c.fields) ? "ready" : c.status,
    confirmedRequired: confirmed.length,
    savedAt: new Date(record.savedAt!).toISOString(),
    expiresAt: c.expiresAt,
  };
}

export function registerAccountRoutes(ctx: RouteContext) {
  const { api, accounts, sessions, cases, send, now } = ctx;
  // Credential guessing is throttled per client; scrypt also slows each try.
  const authLimit = rateLimit(
    "auth",
    { limit: 20, windowMs: 10 * 60_000 },
    now,
  );

  const respondAccount = (
    res: Parameters<RouteContext["send"]>[0],
    accountId?: string,
  ) => {
    const record = accounts.get(accountId);
    send(res, accountResponse, {
      account: record ? accounts.toPublic(record) : null,
    });
  };

  api.get("/account", (_req, res) => {
    const session = res.locals.session as { accountId?: string } | undefined;
    respondAccount(res, session?.accountId);
  });

  const signIn = (
    req: Parameters<typeof setSessionCookie>[0],
    res: Parameters<typeof setSessionCookie>[1],
    accountId: string,
    workspaceId: string,
  ) => {
    const existing = res.locals.session;
    // A guest session keeps its cases reachable for an explicit attach.
    const session = sessions.rotate(
      existing ?? sessions.upsert(undefined, "patient"),
    );
    if (!session.accountId) session.guestWorkspaceId = session.workspaceId;
    session.accountId = accountId;
    session.workspaceId = workspaceId;
    session.role = "patient";
    res.locals.session = session;
    setSessionCookie(req, res, session);
  };

  api.post("/account/signup", authLimit, async (req, res) => {
    const input = parseBody(signupRequest, req.body);
    const record = await accounts.create(input);
    signIn(req, res, record.id, record.workspaceId);
    send(res, accountResponse, { account: accounts.toPublic(record) }, 201);
  });

  api.post("/account/signin", authLimit, async (req, res) => {
    const { email, password } = parseBody(signinRequest, req.body);
    const record = await accounts.verify(email, password);
    // One message for unknown email and wrong password.
    if (!record)
      throw new ApiError(
        "UNAUTHORIZED",
        "That email and password do not match a demo account.",
      );
    signIn(req, res, record.id, record.workspaceId);
    send(res, accountResponse, { account: accounts.toPublic(record) });
  });

  api.post("/account/signout", (req, res) => {
    const session = res.locals.session;
    if (session?.accountId) {
      sessions.rotate(session);
      session.accountId = undefined;
      session.guestWorkspaceId = undefined;
      session.workspaceId = randomUUID();
      session.role = "patient";
      setSessionCookie(req, res, session);
    }
    send(res, accountResponse, { account: null });
  });

  // No email provider is configured, so recovery cannot be offered honestly.
  api.post("/account/recovery", authLimit, (req) => {
    parseBody(recoveryRequest, req.body);
    throw new ApiError(
      "PROVIDER_UNAVAILABLE",
      "Password recovery is unavailable: this demo server cannot send email. Create a new demo account instead.",
    );
  });

  api.patch("/account", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const input = parseBody(preferencesRequest, req.body);
    // Preferences shape navigation only; they never grant access.
    if (input.name) account.name = input.name;
    if (input.uses) account.uses = input.uses;
    if (input.textSize) account.textSize = input.textSize;
    if (input.location !== undefined) {
      if (input.location === null) delete account.location;
      else account.location = input.location;
    }
    send(res, accountResponse, { account: accounts.toPublic(account) });
  });

  api.delete("/account", authLimit, async (req, res) => {
    const { account } = requireAccount(ctx, res);
    const { password } = parseBody(deleteAccountRequest, req.body);
    if (!(await accounts.verify(account.email, password)))
      throw new ApiError(
        "FORBIDDEN",
        "Password does not match; nothing was deleted.",
      );
    for (const record of cases.inWorkspace(account.workspaceId))
      ctx.deleteCase(record.case.id);
    ctx.circle.forgetAccount(account.id);
    ctx.forgetCommunityAccount?.(account.id);
    accounts.remove(account.id);
    sessions.detachAccount(account.id);
    const session = requireSession(res);
    sessions.rotate(session);
    setSessionCookie(req, res, session);
    send(res, deletionResponse, { deleted: true });
  });

  const listSaved = (workspaceId: string) =>
    cases
      .inWorkspace(workspaceId)
      .filter((r) => r.savedAt !== undefined)
      .sort((a, b) => b.savedAt! - a.savedAt!)
      .map(savedLabelOf);

  api.get("/account/labels", (_req, res) => {
    const { account } = requireAccount(ctx, res);
    send(res, savedLabelsResponse, listSaved(account.workspaceId));
  });

  /**
   * Explicitly saves a label to the account. A guest case qualifies only if
   * this very session created it before signing in (server-verified).
   */
  api.post("/account/labels", (req, res) => {
    const { session, account } = requireAccount(ctx, res);
    const { caseId } = parseBody(attachRequest, req.body);
    const lookup = cases.lookup(caseId);
    if (lookup.status === "expired")
      throw new ApiError("EXPIRED", "This label expired before it was saved.");
    if (lookup.status === "missing")
      throw new ApiError("NOT_FOUND", "Case not found.");
    const record = lookup.record;
    const fromGuest =
      !!session.guestWorkspaceId &&
      record.workspaceId === session.guestWorkspaceId;
    if (record.workspaceId !== account.workspaceId && !fromGuest)
      throw new ApiError(
        "FORBIDDEN",
        "Only a label you created in this browser can be saved.",
      );
    for (const review of ctx.reviews.forCase(caseId))
      if (
        review.review.status === "pending" ||
        review.review.status === "claimed"
      )
        throw new ApiError(
          "STATE_CONFLICT",
          "Cancel the open reading-help request before saving this label.",
        );
    record.workspaceId = account.workspaceId;
    record.savedAt = now();
    cases.replaceCase(
      record,
      caseSchema.parse({
        ...record.case,
        expiresAt: new Date(now() + savedLabelLifetimeMs).toISOString(),
      }),
    );
    send(res, savedLabelsResponse, listSaved(account.workspaceId));
  });
}
