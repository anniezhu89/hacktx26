import { describe, it, expect } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { createApp } from "../../apps/api/src/app";
import {
  apiError,
  healthResponse,
  caseSchema,
  eligibleForExplanation,
  assertRevision,
  intakeRequest,
  labelField,
  savingsOption,
} from "../../packages/contracts/src/index";
const fixture = (name: string) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));
describe("shared boundaries", () => {
  it("requires acknowledgement and nonempty intake", () => {
    expect(
      intakeRequest.safeParse({ text: " ", fictionalDataAcknowledged: true })
        .success,
    ).toBe(false);
    expect(
      intakeRequest.safeParse({
        text: "synthetic",
        fictionalDataAcknowledged: false,
      }).success,
    ).toBe(false);
  });
  it("preserves decimal units and exact directions without implying review", () => {
    const c = caseSchema.parse(fixture("clear"));
    expect(c.fields.find((f) => f.key === "strength")?.value).toBe("0.05 mg");
    expect(c.fields.find((f) => f.key === "exactDirections")?.value).toBe(
      "Take one tablet twice daily as needed.",
    );
    expect(eligibleForExplanation(c.fields)).toBe(false);
    for (const f of c.fields) f.reviewState = "user_confirmed";
    expect(eligibleForExplanation(c.fields)).toBe(true);
  });
  it("blocks missing strength even if someone marks it confirmed", () => {
    const c = caseSchema.parse(fixture("unreadable"));
    for (const f of c.fields) f.reviewState = "user_confirmed";
    expect(eligibleForExplanation(c.fields)).toBe(false);
  });
  it("rejects stale revisions", () => {
    expect(() => assertRevision(2, 1)).toThrow("REVISION_CONFLICT");
    expect(() => assertRevision(2, 2)).not.toThrow();
  });
  it("rejects crops outside image and unsupported price amounts", () => {
    const f = fixture("clear").fields[0];
    expect(
      labelField.safeParse({
        ...f,
        crop: { x: 0.9, y: 0, width: 0.2, height: 1 },
      }).success,
    ).toBe(false);
    expect(
      savingsOption.safeParse({ ...fixture("savings"), amount: 10 }).success,
    ).toBe(false);
  });
});
describe("API foundation", () => {
  it("returns validated fixture health with no credentials", async () => {
    const res = await request(createApp()).get("/api/health").expect(200);
    expect(healthResponse.parse(res.body).dataMode).toBe("fixture");
    expect(JSON.stringify(res.body)).not.toMatch(/token|secret|apiKey/i);
  });
  it("returns a safe contract error for unknown and unauthorized routes", async () => {
    const unknown = await request(createApp())
      .post("/api/not-a-route")
      .send({ text: "fictional" })
      .expect(404);
    expect(apiError.parse(unknown.body).error.code).toBe("NOT_FOUND");
    const anonymous = await request(createApp())
      .post("/api/cases/synthetic-clear/plan")
      .send({ text: "fictional" })
      .expect(401);
    expect(apiError.parse(anonymous.body).error.code).toBe("UNAUTHORIZED");
    for (const res of [unknown, anonymous])
      expect(JSON.stringify(res.body)).not.toContain("fictional");
  });
});

it("field revision changes invalidate derived data while retaining accepted commitments", async () => {
  const { applyFieldChanges } =
    await import("../../packages/contracts/src/index");
  const current = caseSchema.parse(fixture("clear"));
  current.tasks = [
    {
      id: "accepted",
      category: "transport",
      description: "Arrange a ride",
      owner: "supporter",
      status: "accepted",
      acceptedAt: "2026-10-24T12:00:00.000Z",
    },
  ];
  const result = applyFieldChanges(current, {
    expectedRevision: 0,
    changes: [{ key: "strength", value: "0.5 mcg", reviewState: "unreviewed" }],
  });
  expect(result.case.revision).toBe(1);
  expect(result.case.fields.find((f) => f.key === "strength")?.value).toBe(
    "0.5 mcg",
  );
  expect(result.case.tasks).toEqual(current.tasks);
  expect(result.invalidate).toEqual(["explanation", "savings", "plan"]);
  expect(current.revision).toBe(0);
  expect(() =>
    applyFieldChanges(result.case, {
      expectedRevision: 0,
      changes: [{ key: "strength", value: "1 mg", reviewState: "unreviewed" }],
    }),
  ).toThrow("REVISION_CONFLICT");
});
