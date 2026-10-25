import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../apps/api/src/app";

const session = (app: ReturnType<typeof createApp>, proto?: string) => {
  const req = request(app).post("/api/session").send({ role: "patient" });
  return proto ? req.set("X-Forwarded-Proto", proto) : req;
};

const cookieOf = (res: { headers: Record<string, unknown> }) =>
  String((res.headers["set-cookie"] as string[] | undefined)?.[0] ?? "");

describe("running behind a TLS-terminating proxy", () => {
  it("marks the session cookie Secure when one proxy is trusted", async () => {
    const app = createApp(undefined, { trustProxy: 1 });
    const res = await session(app, "https").expect(200);
    expect(cookieOf(res)).toMatch(/;\s*Secure/i);
  });

  it("does not trust forwarded headers by default", async () => {
    // Reached directly, a client could otherwise claim https to change cookie
    // flags, or spoof its address to dodge a limit keyed on it.
    const app = createApp(undefined, {});
    const res = await session(app, "https").expect(200);
    expect(cookieOf(res)).not.toMatch(/;\s*Secure/i);
  });

  it("leaves the cookie non-Secure over plain http even with a proxy", async () => {
    const app = createApp(undefined, { trustProxy: 1 });
    const res = await session(app, "http").expect(200);
    expect(cookieOf(res)).not.toMatch(/;\s*Secure/i);
  });

  it("keeps the cookie httpOnly and SameSite=Strict either way", async () => {
    const app = createApp(undefined, { trustProxy: 1 });
    const res = await session(app, "https").expect(200);
    expect(cookieOf(res)).toMatch(/HttpOnly/i);
    expect(cookieOf(res)).toMatch(/SameSite=Strict/i);
  });
});
