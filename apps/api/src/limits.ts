import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./errors";
import type { DemoSession } from "./session";

export type RateLimit = { limit: number; windowMs: number };

// Fixed-window throttle keyed by demo session, falling back to client address.
export function rateLimit(
  name: string,
  { limit, windowMs }: RateLimit,
  now: () => number,
) {
  const windows = new Map<string, { start: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const session = res.locals.session as DemoSession | undefined;
    const key = `${name}:${session?.workspaceId ?? req.ip}`;
    const time = now();
    let window = windows.get(key);
    if (!window || time - window.start >= windowMs) {
      if (windows.size > 10000) windows.clear();
      window = { start: time, count: 0 };
      windows.set(key, window);
    }
    window.count++;
    if (window.count > limit) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((window.start + windowMs - time) / 1000)),
      );
      return next(
        new ApiError("RATE_LIMITED", "Too many requests; slow down."),
      );
    }
    next();
  };
}
