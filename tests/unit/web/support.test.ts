import { describe, it, expect } from "vitest";
import { fieldsRevisionOf } from "../../../packages/contracts/src/index";
import { createHttpClient } from "../../../apps/web/src/api/client";
import { createMockClient } from "../../helpers/mockClient";
import { findSample } from "../../helpers/labels";

async function confirmedCase() {
  const client = createMockClient({
    latencyMs: 0,
    now: () => new Date("2026-10-24T20:00:00.000Z"),
  });
  const s = findSample("clear")!;
  const { case: created } = await client.createCase({
    kind: "sample",
    sampleId: s.id,
    text: s.text,
  });
  const { case: c } = await client.updateFields(created.id, {
    expectedRevision: 0,
    changes: created.fields.map((f) => ({
      key: f.key,
      value: f.value,
      reviewState: "user_confirmed" as const,
    })),
  });
  return { client, c };
}

const plan = (
  revision: number,
  transport = "Can drive",
  availability = "",
) => ({
  expectedRevision: revision,
  supporterConstraints: [
    { supporterId: "supporter", availability, transport, budget: 20 },
  ],
  selectedOptionIds: ["synthetic-resource"],
});

describe("shared support in the mock", () => {
  it("shares only chosen fields, and withdrawing removes access", async () => {
    const { client, c } = await confirmedCase();
    expect((await client.listShared()).data).toEqual([]);
    const { case: shared } = await client.updateSharing(c.id, {
      expectedRevision: c.revision,
      supporter: true,
      fieldKeys: ["medicationName"],
    });
    const [view] = (await client.listShared()).data;
    expect(view.fields).toEqual([
      {
        key: "medicationName",
        value: "Levothyroxine Sodium",
        reviewState: "user_confirmed",
      },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/0\.5 mg|twice daily|evidence/);
    await client.updateSharing(c.id, {
      expectedRevision: shared.revision,
      supporter: false,
      fieldKeys: [],
    });
    expect((await client.listShared()).data).toEqual([]);
  });

  it("suggests practical tasks, enforces explicit single claims, keeps commitments on re-plan", async () => {
    const { client, c } = await confirmedCase();
    const { data: p } = await client.requestPlan(
      c.id,
      plan(c.revision, "Can drive", "weekday evenings"),
    );
    expect(
      p.tasks.every((t) => t.status === "proposed" && t.owner === null),
    ).toBe(true);
    expect(p.tasks.map((t) => t.category)).toContain("transport");
    expect(
      p.tasks.some((t) => t.description.includes("Medicare cost help")),
    ).toBe(true);
    expect(p.tradeoffs.join(" ")).toMatch(/weekday evenings/);
    expect(JSON.stringify(p)).not.toMatch(/\b\d{1,2}\s*(am|pm)\b|dose/i);

    let { case: cur } = await client.getCase(c.id);
    const ride = p.tasks.find((t) => t.category === "transport")!;
    await client.updateSharing(c.id, {
      expectedRevision: cur.revision,
      supporter: true,
      fieldKeys: [],
    });
    ({ case: cur } = await client.getCase(c.id));
    const { data: claimed } = await client.taskAction(
      c.id,
      ride.id,
      { expectedRevision: cur.revision, action: "claim" },
      "supporter",
    );
    expect(claimed.task).toMatchObject({
      status: "accepted",
      ownerRole: "supporter",
    });
    await expect(
      client.taskAction(
        c.id,
        ride.id,
        { expectedRevision: claimed.caseRevision, action: "claim" },
        "patient",
      ),
    ).rejects.toMatchObject({ code: "STATE_CONFLICT", status: 409 });
    await expect(
      client.taskAction(
        c.id,
        ride.id,
        { expectedRevision: claimed.caseRevision, action: "release" },
        "patient",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    // Availability changes: new suggestions, the accepted ride stays.
    const { data: again } = await client.requestPlan(
      c.id,
      plan(claimed.caseRevision, "Cannot help with travel"),
    );
    const kept = again.tasks.find((t) => t.id === ride.id);
    expect(kept).toMatchObject({ status: "accepted", ownerRole: "supporter" });
    expect(again.tasks.filter((t) => t.category === "transport")).toHaveLength(
      1,
    );
    expect(again.tradeoffs.join(" ")).toMatch(/cannot help with travel/i);
  });

  it("withdrawn sharing blocks supporter task actions", async () => {
    const { client, c } = await confirmedCase();
    const { data: p } = await client.requestPlan(c.id, plan(c.revision));
    const { case: cur } = await client.getCase(c.id);
    await expect(
      client.taskAction(
        c.id,
        p.tasks[0].id,
        { expectedRevision: cur.revision, action: "claim" },
        "supporter",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("task changes keep explanations valid; field edits drop suggestions only", async () => {
    const { client, c } = await confirmedCase();
    const { data: p } = await client.requestPlan(c.id, plan(c.revision));
    let { case: cur } = await client.getCase(c.id);
    const { data: claimed } = await client.taskAction(
      c.id,
      p.tasks[0].id,
      { expectedRevision: cur.revision, action: "claim" },
      "patient",
    );
    ({ case: cur } = await client.getCase(c.id));
    expect(cur.revision).toBe(claimed.caseRevision);
    const { data: ex } = await client.requestExplanation(c.id, {
      expectedRevision: cur.revision,
    });
    expect(ex.fieldRevision).toBe(fieldsRevisionOf(cur));
    expect(fieldsRevisionOf(cur)).toBe(1);

    const { case: edited } = await client.updateFields(c.id, {
      expectedRevision: cur.revision,
      changes: [{ key: "quantity", value: "60", reviewState: "unreviewed" }],
    });
    expect(edited.tasks.map((t) => [t.id, t.status])).toEqual([
      [p.tasks[0].id, "accepted"],
    ]);
  });
});

describe("HTTP client shared support", () => {
  it("uses the supporter session for supporter task actions and the shared list", async () => {
    const calls: string[] = [];
    const ok = (data: unknown) =>
      new Response(
        JSON.stringify({
          contractVersion: "1",
          requestId: "r",
          dataMode: "fixture",
          data,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    const client = createHttpClient((async (
      url: string,
      init?: RequestInit,
    ) => {
      calls.push(`${init?.method ?? "GET"} ${url} ${init?.body ?? ""}`.trim());
      if (url === "/api/session")
        return ok({ role: JSON.parse(String(init!.body)).role });
      if (url === "/api/shared") return ok([]);
      return ok({
        task: {
          id: "t",
          category: "transport",
          description: "Ride",
          owner: "s",
          ownerRole: "supporter",
          status: "accepted",
          acceptedAt: "2026-10-24T12:00:00.000Z",
        },
        caseRevision: 3,
      });
    }) as unknown as typeof fetch);
    await client.listShared();
    await client.taskAction(
      "c",
      "t",
      { expectedRevision: 2, action: "claim" },
      "supporter",
    );
    expect(calls).toEqual([
      'POST /api/session {"role":"supporter"}',
      "GET /api/shared",
      'PATCH /api/cases/c/tasks/t {"expectedRevision":2,"action":"claim"}',
    ]);
  });
});
