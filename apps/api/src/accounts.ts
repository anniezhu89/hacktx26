import { randomUUID, scrypt, timingSafeEqual, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import type { Account } from "@labelbridge/contracts";
import { ApiError } from "./errors";

const hash = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Shown to every account holder; describes what this demo actually does. */
export const accountRetention =
  "Demo account: stored only in this server's memory. It is deleted after 7 days without signing in, when you delete it, or whenever the demo server restarts. Use fictional information only.";
export const accountIdleLimitMs = 7 * 24 * 60 * 60 * 1000;
export const savedLabelLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxAccounts = 1000;

export type AccountRecord = {
  id: string;
  workspaceId: string;
  location?: string;
  name: string;
  email: string;
  passwordHash: Buffer;
  salt: Buffer;
  uses: Account["uses"];
  textSize: Account["textSize"];
  createdAt: number;
  lastActiveAt: number;
};

// A fixed salt for the decoy hash that equalizes timing for unknown emails.
const decoySalt = randomBytes(16);

/**
 * In-memory demo accounts. This is not production authentication: there is
 * no email verification, no recovery channel and no durable storage.
 */
export class AccountStore {
  private accounts = new Map<string, AccountRecord>();
  private byEmail = new Map<string, string>();

  constructor(
    private now: () => number,
    /** Emails the server operator approved as volunteer readers. */
    private approvedVolunteers: ReadonlySet<string> = new Set(),
  ) {}

  async create(input: {
    name: string;
    email: string;
    password: string;
    uses: Account["uses"];
    textSize?: Account["textSize"];
  }) {
    this.sweep();
    if (this.byEmail.has(input.email))
      throw new ApiError(
        "STATE_CONFLICT",
        "An account with this email already exists. Sign in instead.",
      );
    if (this.accounts.size >= maxAccounts)
      throw new ApiError("RATE_LIMITED", "Demo account capacity reached.");
    const salt = randomBytes(16);
    const record: AccountRecord = {
      id: randomUUID(),
      workspaceId: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash: await hash(input.password, salt, 32),
      salt,
      uses: input.uses,
      textSize: input.textSize ?? "standard",
      createdAt: this.now(),
      lastActiveAt: this.now(),
    };
    this.accounts.set(record.id, record);
    this.byEmail.set(record.email, record.id);
    return record;
  }

  async verify(email: string, password: string) {
    this.sweep();
    const record = this.accounts.get(this.byEmail.get(email) ?? "");
    const candidate = await hash(password, record?.salt ?? decoySalt, 32);
    if (!record || !timingSafeEqual(candidate, record.passwordHash))
      return null;
    record.lastActiveAt = this.now();
    return record;
  }

  get(id: string | undefined) {
    if (!id) return undefined;
    const record = this.accounts.get(id);
    if (!record) return undefined;
    if (this.now() - record.lastActiveAt > accountIdleLimitMs) {
      this.remove(id);
      return undefined;
    }
    return record;
  }

  remove(id: string) {
    const record = this.accounts.get(id);
    if (!record) return undefined;
    this.accounts.delete(id);
    this.byEmail.delete(record.email);
    return record;
  }

  volunteerStatus(record: AccountRecord): Account["volunteerStatus"] {
    if (!record.uses.volunteer) return "not_requested";
    return this.approvedVolunteers.has(record.email) ? "approved" : "pending";
  }

  isApprovedVolunteer(record: AccountRecord | undefined) {
    return !!record && this.volunteerStatus(record) === "approved";
  }

  toPublic(record: AccountRecord): Account {
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      uses: record.uses,
      textSize: record.textSize,
      volunteerStatus: this.volunteerStatus(record),
      createdAt: new Date(record.createdAt).toISOString(),
      retention: accountRetention,
      ...(record.location ? { location: record.location } : {}),
    };
  }

  sweep() {
    for (const [id, record] of this.accounts)
      if (this.now() - record.lastActiveAt > accountIdleLimitMs)
        this.remove(id);
  }
}

/** Operator allowlist: LABELBRIDGE_APPROVED_VOLUNTEERS=a@example.test,b@... */
export function approvedVolunteersFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  return new Set(
    (env.LABELBRIDGE_APPROVED_VOLUNTEERS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}
