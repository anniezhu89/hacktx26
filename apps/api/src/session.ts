import type { NextFunction, Request, Response } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { ApiError } from "./errors";

// Synthetic-demo personas only. Anyone holding the cookie can switch role;
// this is not authentication and must never guard real patient data.
export type Role = "patient" | "supporter" | "reviewer";
export type DemoSession = {
  id: string;
  workspaceId: string;
  actorId: string;
  role: Role;
  lastSeen: number;
};

export const sessionCookie = "lb_demo_session";
const idleLimitMs = 2 * 60 * 60 * 1000;
const maxSessions = 5000;

export class SessionStore {
  private sessions = new Map<string, DemoSession>();
  constructor(private now: () => number) {}

  get(id: string | undefined) {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.now() - session.lastSeen > idleLimitMs) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastSeen = this.now();
    return session;
  }

  // Switching persona keeps the synthetic workspace so one browser can demo
  // patient, supporter and reviewer views of the same fictional case.
  upsert(existing: DemoSession | undefined, role: Role) {
    if (existing) {
      existing.role = role;
      existing.actorId = randomUUID();
      return existing;
    }
    this.sweep();
    if (this.sessions.size >= maxSessions)
      throw new ApiError("RATE_LIMITED", "Too many demo sessions; try later.");
    const session: DemoSession = {
      id: randomBytes(32).toString("base64url"),
      workspaceId: randomUUID(),
      actorId: randomUUID(),
      role,
      lastSeen: this.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  sweep() {
    for (const [id, session] of this.sessions)
      if (this.now() - session.lastSeen > idleLimitMs) this.sessions.delete(id);
  }
}

export function readCookie(req: Request, name: string) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name)
      return part.slice(index + 1).trim();
  }
  return undefined;
}

export function setSessionCookie(
  req: Request,
  res: Response,
  session: DemoSession,
) {
  res.cookie(sessionCookie, session.id, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    path: "/api",
    maxAge: idleLimitMs,
  });
}

export function loadSession(store: SessionStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.locals.session = store.get(readCookie(req, sessionCookie));
    next();
  };
}

export function requireSession(res: Response, ...roles: Role[]): DemoSession {
  const session = res.locals.session as DemoSession | undefined;
  if (!session)
    throw new ApiError("UNAUTHORIZED", "Start a synthetic demo session first.");
  if (roles.length && !roles.includes(session.role))
    throw new ApiError(
      "FORBIDDEN",
      "This demo persona cannot perform this action.",
    );
  return session;
}
