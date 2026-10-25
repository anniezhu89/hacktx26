import {
  acceptInviteRequest,
  applyPlanTasks,
  applySharing,
  applyTaskAction,
  caseResponse,
  circleResponse,
  fieldsRevisionOf,
  grantRequest,
  invitationCreatedResponse,
  inviteRequest,
  planRequest,
  planResponse,
  sharedCasesResponse,
  sharedLabelsResponse,
  sharedView,
  sharingRequest,
  taskActionResponse,
  taskRequest,
  type Case,
  type SharedLabel,
} from "@labelbridge/contracts";
import type { Response } from "express";
import { scopeAllowsReading, scopeAllowsTasks } from "../circle";
import { ApiError, parseBody } from "../errors";
import { suggestPlan } from "../plan";
import { requireSession } from "../session";
import type { CaseRecord } from "../store";
import { requireAccount, type RouteContext } from "./context";

/** Maps the contract helpers' thrown codes onto API errors. */
export function helperError(error: unknown): never {
  const code = error instanceof Error ? error.message : "";
  if (code === "REVISION_CONFLICT")
    throw new ApiError(
      "REVISION_CONFLICT",
      "This label changed since it was loaded. Reload and try again.",
    );
  if (code === "STATE_CONFLICT")
    throw new ApiError(
      "STATE_CONFLICT",
      "Someone else changed this task first.",
    );
  if (code === "FORBIDDEN")
    throw new ApiError("FORBIDDEN", "You cannot make this change to the task.");
  if (code === "NOT_FOUND") throw new ApiError("NOT_FOUND", "Task not found.");
  throw new ApiError("BAD_REQUEST", "This change is not valid.");
}

const asShared = (c: Case, fieldKeys: Case["sharing"]["fieldKeys"]) =>
  sharedView({ ...c, sharing: { supporter: true, fieldKeys } })!;

export function registerCircleRoutes(ctx: RouteContext) {
  const { api, cases, circle, accounts, send, now } = ctx;
  const iso = () => new Date(now()).toISOString();

  const liveCase = (caseId: string) => {
    const lookup = cases.lookup(caseId);
    return lookup.status === "found" ? lookup.record : null;
  };

  // --- Guest demo personas (one synthetic workspace) -----------------------

  api.patch("/cases/:id/sharing", (req, res) => {
    const record = ctx.ownedCase(res, req.params.id);
    const input = parseBody(sharingRequest, req.body);
    let next: Case;
    try {
      next = applySharing(record.case, input);
    } catch (e) {
      helperError(e);
    }
    cases.replaceCase(record, next);
    send(res, caseResponse, next);
  });

  // The guest supporter persona sees shared cases from its own workspace.
  api.get("/shared", (_req, res) => {
    const session = requireSession(res, "supporter");
    send(
      res,
      sharedCasesResponse,
      cases
        .inWorkspace(session.workspaceId)
        .map((r) => sharedView(r.case))
        .filter((v) => v !== null),
    );
  });

  api.post("/cases/:id/plan", (req, res) => {
    const record = ctx.ownedCase(res, req.params.id);
    const input = parseBody(planRequest, req.body);
    if (input.expectedRevision !== record.case.revision)
      throw new ApiError(
        "REVISION_CONFLICT",
        "This label changed since it was loaded. Reload and try again.",
      );
    const { tasks, tradeoffs } = suggestPlan(record.case, input);
    let next: Case;
    try {
      next = applyPlanTasks(record.case, tasks);
    } catch (e) {
      helperError(e);
    }
    cases.replaceCase(record, next);
    send(res, planResponse, {
      tasks: next.tasks,
      tradeoffs,
      fieldRevision: fieldsRevisionOf(next),
    });
  });

  const runTask = (
    record: CaseRecord,
    res: Response,
    taskId: string,
    body: unknown,
    actor: { id: string; role: "patient" | "supporter" },
  ) => {
    const input = parseBody(taskRequest, body);
    const existing = record.case.tasks.find((t) => t.id === taskId);
    // With several supporter accounts, "mine" must also mean the same person.
    if (
      existing &&
      actor.role === "supporter" &&
      existing.ownerRole === "supporter" &&
      existing.owner !== actor.id &&
      (input.action === "complete" || input.action === "release")
    )
      throw new ApiError("FORBIDDEN", "Another supporter accepted this task.");
    let result: ReturnType<typeof applyTaskAction>;
    try {
      result = applyTaskAction(record.case, taskId, input, actor, iso());
    } catch (e) {
      helperError(e);
    }
    cases.replaceCase(record, result.case);
    send(res, taskActionResponse, {
      task: result.task,
      caseRevision: result.case.revision,
    });
  };

  api.patch("/cases/:id/tasks/:taskId", (req, res) => {
    const session = requireSession(res);
    if (session.role === "supporter" && !session.accountId) {
      // Guest supporter persona: same workspace, and only while shared.
      const record = liveCase(req.params.id);
      if (!record || record.workspaceId !== session.workspaceId)
        throw new ApiError("NOT_FOUND", "Case not found.");
      if (!record.case.sharing.supporter)
        throw new ApiError(
          "FORBIDDEN",
          "The patient is not sharing this label.",
        );
      return runTask(record, res, req.params.taskId, req.body, {
        id: session.actorId,
        role: "supporter",
      });
    }
    const record = ctx.ownedCase(res, req.params.id);
    runTask(record, res, req.params.taskId, req.body, {
      id: session.accountId ?? session.actorId,
      role: "patient",
    });
  });

  // --- Accounts: invitations, grants and the supporter workspace ----------

  const circleView = (accountId: string) => ({
    invitations: circle
      .invitationsFor(accountId)
      .map((i) => circle.toInvitation(i)),
    connections: circle
      .connectionsOf(accountId)
      .map((c) =>
        circle.toConnection(
          c,
          accountId,
          (id) => accounts.get(id)?.name ?? "Former member",
        ),
      ),
  });

  api.get("/circle", (_req, res) => {
    const { account } = requireAccount(ctx, res);
    send(res, circleResponse, circleView(account.id));
  });

  api.post("/circle/invitations", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const input = parseBody(inviteRequest, req.body);
    const { record, code } = circle.invite(
      account.id,
      input.inviteeName,
      input.scope,
    );
    // No email is sent: the inviter passes the code on themselves.
    send(
      res,
      invitationCreatedResponse,
      { invitation: circle.toInvitation(record), code },
      201,
    );
  });

  api.delete("/circle/invitations/:id", (req, res) => {
    const { account } = requireAccount(ctx, res);
    circle.revokeInvitation(account.id, req.params.id);
    send(res, circleResponse, circleView(account.id));
  });

  api.post("/circle/accept", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const { code, decision } = parseBody(acceptInviteRequest, req.body);
    circle.respond(account.id, code, decision);
    send(res, circleResponse, circleView(account.id));
  });

  api.put("/circle/connections/:id/grants/:caseId", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const input = parseBody(grantRequest, req.body);
    const record = liveCase(req.params.caseId);
    // Only the owner's own saved labels can be shared.
    if (
      !record ||
      record.workspaceId !== account.workspaceId ||
      record.savedAt === undefined
    )
      throw new ApiError(
        "NOT_FOUND",
        "Save this label to your account before sharing it.",
      );
    const connection = circle.ownedConnection(account.id, req.params.id);
    if (
      !scopeAllowsReading(connection.scope) &&
      (input.fieldKeys.length || input.image)
    )
      throw new ApiError(
        "BAD_REQUEST",
        "This person helps with tasks only; label details cannot be shared.",
      );
    circle.setGrant(account.id, req.params.id, req.params.caseId, input);
    send(res, circleResponse, circleView(account.id));
  });

  api.delete("/circle/connections/:id/grants/:caseId", (req, res) => {
    const { account } = requireAccount(ctx, res);
    circle.removeGrant(account.id, req.params.id, req.params.caseId);
    send(res, circleResponse, circleView(account.id));
  });

  api.delete("/circle/connections/:id", (req, res) => {
    const { account } = requireAccount(ctx, res);
    circle.removeConnection(account.id, req.params.id);
    send(res, circleResponse, circleView(account.id));
  });

  /** The supporter's grant on a live case, re-checked on every request. */
  const grantedCase = (supporterAccountId: string, caseId: string) => {
    const found = circle.grantFor(supporterAccountId, caseId);
    const record = found && liveCase(caseId);
    if (!found || !record)
      throw new ApiError("NOT_FOUND", "This label is not shared with you.");
    return { ...found, record };
  };

  api.get("/circle/shared", (_req, res) => {
    const { account } = requireAccount(ctx, res);
    const labels: SharedLabel[] = [];
    for (const c of circle.connectionsOf(account.id)) {
      if (c.supporterAccountId !== account.id) continue;
      for (const [caseId, g] of c.grants) {
        const record = liveCase(caseId);
        if (!record) continue;
        const reading = scopeAllowsReading(c.scope);
        const view = asShared(record.case, reading ? g.fieldKeys : []);
        const tasksAllowed = scopeAllowsTasks(c.scope);
        labels.push({
          connectionId: c.id,
          ownerName: accounts.get(c.ownerAccountId)?.name ?? "Former member",
          caseId,
          revision: record.case.revision,
          fields: view.fields,
          imageUrl:
            reading && g.image && record.image
              ? `/api/circle/shared/${encodeURIComponent(caseId)}/image`
              : null,
          tasksAllowed,
          tasks: tasksAllowed ? view.tasks : [],
        });
      }
    }
    send(res, sharedLabelsResponse, labels);
  });

  api.get("/circle/shared/:caseId/image", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const { connection, grant, record } = grantedCase(
      account.id,
      req.params.caseId,
    );
    if (!grant.image || !scopeAllowsReading(connection.scope) || !record.image)
      throw new ApiError(
        "FORBIDDEN",
        "The original image is not shared with you.",
      );
    res.setHeader("Content-Type", record.image.mime);
    res.setHeader("Content-Disposition", "inline");
    res.send(record.image.bytes);
  });

  api.patch("/circle/shared/:caseId/tasks/:taskId", (req, res) => {
    const { account } = requireAccount(ctx, res);
    const { connection, record } = grantedCase(account.id, req.params.caseId);
    if (!scopeAllowsTasks(connection.scope))
      throw new ApiError(
        "FORBIDDEN",
        "This connection does not include practical tasks.",
      );
    runTask(record, res, req.params.taskId, req.body, {
      id: account.id,
      role: "supporter",
    });
  });
}
