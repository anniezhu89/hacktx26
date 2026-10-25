import type { Request, Response, Router } from "express";
import type { AccountRecord, AccountStore } from "../accounts";
import type { CircleStore } from "../circle";
import { ApiError } from "../errors";
import type { ValidatedImage } from "../image";
import type { ReviewStore } from "../reviews";
import {
  requireSession,
  type DemoSession,
  type SessionStore,
} from "../session";
import type { CaseRecord, CaseStore } from "../store";

type Parser<T> = { parse: (value: unknown) => T };

/** What the v1.6 route modules share with the main app. */
export type RouteContext = {
  api: Router;
  forgetCommunityAccount?: (id: string) => void;
  now: () => number;
  cases: CaseStore;
  sessions: SessionStore;
  accounts: AccountStore;
  circle: CircleStore;
  reviews: ReviewStore;
  send: <T>(
    res: Response,
    schema: Parser<T>,
    data: unknown,
    status?: number,
  ) => void;
  /** The signed-in patient's own case (or the guest's), else 403/404/410. */
  ownedCase: (res: Response, id: string) => CaseRecord;
  readImageUpload: (req: Request) => Promise<ValidatedImage>;
  /** Removes a case together with its reviews, grants and medicine cache. */
  deleteCase: (caseId: string) => void;
};

export function requireAccount(
  ctx: RouteContext,
  res: Response,
): { session: DemoSession; account: AccountRecord } {
  const session = requireSession(res);
  const account = ctx.accounts.get(session.accountId);
  if (!account)
    throw new ApiError("UNAUTHORIZED", "Sign in to a demo account first.");
  account.lastActiveAt = ctx.now();
  return { session, account };
}
