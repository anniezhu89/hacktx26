import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Connection, Grant, Invitation } from "@labelbridge/contracts";
import { ApiError } from "./errors";

export const invitationLifetimeMs = 72 * 60 * 60 * 1000;

type InvitationRecord = Omit<Invitation, "createdAt" | "expiresAt"> & {
  ownerAccountId: string;
  codeHash: string;
  createdAt: number;
  expiresAt: number;
};

type ConnectionRecord = {
  id: string;
  ownerAccountId: string;
  supporterAccountId: string;
  scope: Invitation["scope"];
  connectedAt: number;
  /** caseId → what the supporter may see. Nothing is granted on connection. */
  grants: Map<string, Omit<Grant, "caseId">>;
};

const digest = (code: string) =>
  createHash("sha256").update(code).digest("hex");

export const scopeAllowsReading = (scope: Invitation["scope"]) =>
  scope !== "tasks";
export const scopeAllowsTasks = (scope: Invitation["scope"]) =>
  scope !== "reading";

/**
 * Invitations, connections and per-label grants between demo accounts. Codes
 * are single use, expire, and are stored only as hashes.
 */
export class CircleStore {
  private invitations = new Map<string, InvitationRecord>();
  private connections = new Map<string, ConnectionRecord>();

  constructor(private now: () => number) {}

  invite(
    ownerAccountId: string,
    inviteeName: string,
    scope: Invitation["scope"],
  ) {
    const code = randomBytes(18).toString("base64url");
    const record: InvitationRecord = {
      id: randomUUID(),
      ownerAccountId,
      inviteeName,
      scope,
      status: "pending",
      codeHash: digest(code),
      createdAt: this.now(),
      expiresAt: this.now() + invitationLifetimeMs,
    };
    this.invitations.set(record.id, record);
    return { record, code };
  }

  private refresh(record: InvitationRecord) {
    if (record.status === "pending" && record.expiresAt <= this.now())
      record.status = "expired";
    return record;
  }

  invitationsFor(ownerAccountId: string) {
    return [...this.invitations.values()]
      .filter((i) => i.ownerAccountId === ownerAccountId)
      .map((i) => this.refresh(i));
  }

  revokeInvitation(ownerAccountId: string, id: string) {
    const record = this.invitations.get(id);
    if (!record || record.ownerAccountId !== ownerAccountId)
      throw new ApiError("NOT_FOUND", "Invitation not found.");
    if (this.refresh(record).status !== "pending")
      throw new ApiError(
        "STATE_CONFLICT",
        "This invitation is no longer pending.",
      );
    record.status = "revoked";
  }

  /** Single use: the first accept or decline settles the invitation. */
  respond(accountId: string, code: string, decision: "accept" | "decline") {
    const record = [...this.invitations.values()].find(
      (i) => i.codeHash === digest(code),
    );
    if (!record)
      throw new ApiError("NOT_FOUND", "This invitation code is not valid.");
    this.refresh(record);
    if (record.status === "expired")
      throw new ApiError(
        "EXPIRED",
        "This invitation expired. Ask for a new one; nothing was shared.",
      );
    if (record.status !== "pending")
      throw new ApiError("STATE_CONFLICT", "This invitation was already used.");
    if (record.ownerAccountId === accountId)
      throw new ApiError(
        "BAD_REQUEST",
        "You cannot accept your own invitation.",
      );
    if (decision === "decline") {
      record.status = "declined";
      return null;
    }
    const existing = [...this.connections.values()].find(
      (c) =>
        c.ownerAccountId === record.ownerAccountId &&
        c.supporterAccountId === accountId,
    );
    if (existing)
      throw new ApiError("STATE_CONFLICT", "You are already connected.");
    record.status = "accepted";
    const connection: ConnectionRecord = {
      id: randomUUID(),
      ownerAccountId: record.ownerAccountId,
      supporterAccountId: accountId,
      scope: record.scope,
      connectedAt: this.now(),
      grants: new Map(),
    };
    this.connections.set(connection.id, connection);
    return connection;
  }

  connection(id: string) {
    return this.connections.get(id);
  }

  /** Connections where the account is the owner or the supporter. */
  connectionsOf(accountId: string) {
    return [...this.connections.values()].filter(
      (c) =>
        c.ownerAccountId === accountId || c.supporterAccountId === accountId,
    );
  }

  ownedConnection(ownerAccountId: string, id: string) {
    const c = this.connections.get(id);
    if (!c || c.ownerAccountId !== ownerAccountId)
      throw new ApiError("NOT_FOUND", "Connection not found.");
    return c;
  }

  setGrant(
    ownerAccountId: string,
    id: string,
    caseId: string,
    grant: Omit<Grant, "caseId">,
  ) {
    this.ownedConnection(ownerAccountId, id).grants.set(caseId, grant);
  }

  removeGrant(ownerAccountId: string, id: string, caseId: string) {
    this.ownedConnection(ownerAccountId, id).grants.delete(caseId);
  }

  /** Either side may end a connection; all of its grants go with it. */
  removeConnection(accountId: string, id: string) {
    const c = this.connections.get(id);
    if (
      !c ||
      (c.ownerAccountId !== accountId && c.supporterAccountId !== accountId)
    )
      throw new ApiError("NOT_FOUND", "Connection not found.");
    this.connections.delete(id);
  }

  /** Drops every grant on a case (case deleted or expired). */
  forgetCase(caseId: string) {
    for (const c of this.connections.values()) c.grants.delete(caseId);
  }

  forgetAccount(accountId: string) {
    for (const [id, c] of this.connections)
      if (c.ownerAccountId === accountId || c.supporterAccountId === accountId)
        this.connections.delete(id);
    for (const [id, i] of this.invitations)
      if (i.ownerAccountId === accountId) this.invitations.delete(id);
  }

  /** The supporter's grant on a case, with the connection it comes from. */
  grantFor(supporterAccountId: string, caseId: string) {
    for (const c of this.connections.values())
      if (c.supporterAccountId === supporterAccountId) {
        const g = c.grants.get(caseId);
        if (g) return { connection: c, grant: g };
      }
    return null;
  }

  toInvitation(record: InvitationRecord): Invitation {
    return {
      id: record.id,
      inviteeName: record.inviteeName,
      scope: record.scope,
      status: record.status,
      createdAt: new Date(record.createdAt).toISOString(),
      expiresAt: new Date(record.expiresAt).toISOString(),
    };
  }

  toConnection(
    record: ConnectionRecord,
    viewerAccountId: string,
    nameOf: (accountId: string) => string,
  ): Connection {
    const mine = record.ownerAccountId === viewerAccountId;
    return {
      id: record.id,
      personName: nameOf(
        mine ? record.supporterAccountId : record.ownerAccountId,
      ),
      direction: mine ? "supports_me" : "i_support",
      scope: record.scope,
      connectedAt: new Date(record.connectedAt).toISOString(),
      // A supporter sees the people they help, not the grant settings.
      grants: mine
        ? [...record.grants].map(([caseId, g]) => ({ caseId, ...g }))
        : [],
    };
  }
}
