import { describe, it, expect } from "vitest";
import {
  eligibleForExplanation,
  reviewerView,
} from "../../../packages/contracts/src/index";
import { createHttpClient } from "../../../apps/web/src/api/client";
import { createMockClient } from "../../helpers/mockClient";
import { findSample } from "../../helpers/labels";

const mock = () =>
  createMockClient({
    latencyMs: 0,
    now: () => new Date("2026-10-24T20:00:00.000Z"),
  });

async function unreadableCase(client = mock()) {
  const s = findSample("unreadable")!;
  const { case: c } = await client.createCase({
    kind: "sample",
    sampleId: s.id,
    text: s.text,
  });
  return { client, c };
}

const field = (c: { fields: { key: string }[] }, key: string) =>
  c.fields.find((f) => f.key === key)!;

describe("reading help in the mock", () => {
  it("runs request → claim → reading → patient applies, without auto-confirming", async () => {
    const { client, c } = await unreadableCase();
    const { data: created } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength"],
      consent: true,
    });
    expect(created).toMatchObject({ status: "pending", caseRevision: 0 });
    expect((await client.listReviewQueue()).data.map((r) => r.id)).toEqual([
      created.id,
    ]);

    const { data: view } = await client.claimReview(created.id);
    expect(reviewerView.safeParse(view).success).toBe(true);
    expect(view.excerpts).toEqual([
      {
        key: "strength",
        textExcerpt: null,
        crop: findSample("unreadable")!.crops.strength,
      },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/"value"|"rawText"/);
    expect(view.imageUrl).toBe(`/api/reviews/${created.id}/image`);
    expect(client.reviewImageSrc(view)).toBe("/samples/unreadable-label.svg");

    await client.respondToReview(created.id, {
      expectedRevision: 0,
      outcome: "submitted",
      proposals: [
        {
          key: "strength",
          visibleText: "0.05 mg",
          evidence: "Read from the image.",
        },
      ],
    });
    const { data: mine } = await client.listCaseReviews(c.id);
    expect(mine[0]).toMatchObject({
      status: "submitted",
      proposals: [{ visibleText: "0.05 mg" }],
    });

    const { case: applied } = await client.updateFields(c.id, {
      expectedRevision: 0,
      changes: [
        {
          key: "strength",
          value: "0.05 mg",
          reviewState: "unreviewed",
          fromReviewId: created.id,
        },
      ],
    });
    expect(field(applied, "strength")).toMatchObject({
      value: "0.05 mg",
      provenance: "volunteer",
      reviewState: "unreviewed",
    });
    expect(eligibleForExplanation(applied.fields)).toBe(false);
  });

  it("rejects a second claim and values that differ from the volunteer reading", async () => {
    const { client, c } = await unreadableCase();
    const { data: r } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength"],
      consent: true,
    });
    await client.claimReview(r.id);
    await expect(client.claimReview(r.id)).rejects.toMatchObject({
      code: "STATE_CONFLICT",
      status: 409,
    });
    await client.respondToReview(r.id, {
      expectedRevision: 0,
      outcome: "submitted",
      proposals: [{ key: "strength", visibleText: "0.05 mg", evidence: "x" }],
    });
    await expect(
      client.updateFields(c.id, {
        expectedRevision: 0,
        changes: [
          {
            key: "strength",
            value: "5 mg",
            reviewState: "unreviewed",
            fromReviewId: r.id,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "STATE_CONFLICT" });
  });

  it("refuses a stale reading and lets the patient send a new request", async () => {
    const { client, c } = await unreadableCase();
    const { data: r } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength"],
      consent: true,
    });
    await expect(
      client.createReview(c.id, {
        expectedRevision: 0,
        selectedFields: ["quantity"],
        consent: true,
      }),
    ).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    await client.claimReview(r.id);
    await client.updateFields(c.id, {
      expectedRevision: 0,
      changes: [
        { key: "quantity", value: "30", reviewState: "user_confirmed" },
      ],
    });
    await expect(
      client.respondToReview(r.id, {
        expectedRevision: 0,
        outcome: "submitted",
        proposals: [{ key: "strength", visibleText: "0.05 mg", evidence: "x" }],
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const { data: again } = await client.createReview(c.id, {
      expectedRevision: 1,
      selectedFields: ["strength"],
      consent: true,
    });
    const statuses = (await client.listCaseReviews(c.id)).data.map((x) => [
      x.id,
      x.status,
    ]);
    expect(statuses).toEqual([
      [r.id, "closed"],
      [again.id, "pending"],
    ]);
  });

  it("validates outcomes and consent", async () => {
    const { client, c } = await unreadableCase();
    await expect(
      client.createReview(c.id, {
        expectedRevision: 0,
        selectedFields: ["strength"],
        consent: false as true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { data: r } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength"],
      consent: true,
    });
    await client.claimReview(r.id);
    await expect(
      client.respondToReview(r.id, {
        expectedRevision: 0,
        outcome: "submitted",
        proposals: [{ key: "quantity", visibleText: "30", evidence: "x" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      client.respondToReview(r.id, {
        expectedRevision: 0,
        outcome: "needs_new_image",
        proposals: [{ key: "strength", visibleText: null, evidence: "x" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { data: done } = await client.respondToReview(r.id, {
      expectedRevision: 0,
      outcome: "needs_new_image",
      proposals: [],
    });
    expect(done.status).toBe("needs_new_image");
    expect((await client.listReviewQueue()).data).toEqual([]);
  });

  it("gives text-intake reviewers the patient's own text and no image", async () => {
    const client = mock();
    const { case: c } = await client.createCase({
      kind: "text",
      text: findSample("unreadable")!.text,
    });
    const { data: r } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength", "dosageForm"],
      consent: true,
    });
    const { data: view } = await client.claimReview(r.id);
    expect(view.imageUrl).toBeNull();
    expect(view.excerpts).toEqual([
      { key: "strength", textExcerpt: null, crop: null },
      { key: "dosageForm", textExcerpt: "[smudged] tablet", crop: null },
    ]);
  });

  it("never gives the volunteer the extracted value as typed text", async () => {
    const client = mock();
    const { case: c } = await client.createCase({
      kind: "text",
      text: findSample("clear")!.text,
    });
    const { data: r } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength"],
      consent: true,
    });
    const { data: view } = await client.claimReview(r.id);
    // The typed line, not the extracted "0.05 mg".
    expect(view.excerpts[0].textExcerpt).toBe("0.05 mg tablet");
  });

  it("rejects confirming a field in the same change that applies a reading", async () => {
    const { client, c } = await unreadableCase();
    const { data: r } = await client.createReview(c.id, {
      expectedRevision: 0,
      selectedFields: ["strength"],
      consent: true,
    });
    await client.claimReview(r.id);
    await client.respondToReview(r.id, {
      expectedRevision: 0,
      outcome: "submitted",
      proposals: [{ key: "strength", visibleText: "0.05 mg", evidence: "x" }],
    });
    await expect(
      client.updateFields(c.id, {
        expectedRevision: 0,
        changes: [
          {
            key: "strength",
            value: "0.05 mg",
            reviewState: "user_confirmed",
            fromReviewId: r.id,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("HTTP client personas", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const envelope = (data: unknown) =>
    json({ contractVersion: "1", requestId: "r", dataMode: "fixture", data });

  it("switches the demo role only when the persona changes", async () => {
    const calls: string[] = [];
    const fixtureView = {
      review: {
        id: "rv",
        caseId: "c",
        caseRevision: 0,
        selectedFields: ["strength"],
        consentAt: "2026-10-24T12:00:00.000Z",
        status: "claimed",
        proposals: [],
      },
      excerpts: [{ key: "strength", textExcerpt: null, crop: null }],
      imageUrl: "/api/reviews/rv/image",
    };
    const client = createHttpClient((async (
      url: string,
      init?: RequestInit,
    ) => {
      calls.push(`${init?.method ?? "GET"} ${url} ${init?.body ?? ""}`.trim());
      if (url === "/api/session")
        return envelope({ role: JSON.parse(String(init!.body)).role });
      if (url === "/api/cases/c/reviews") return envelope([]);
      if (url === "/api/reviews") return envelope([]);
      if (url === "/api/reviews/rv/claim") return envelope(fixtureView);
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "x",
            retryable: false,
            requestId: "n",
          },
        },
        404,
      );
    }) as unknown as typeof fetch);

    await client.listCaseReviews("c");
    await client.listCaseReviews("c");
    await client.listReviewQueue();
    const { data: view } = await client.claimReview("rv");
    expect(client.reviewImageSrc(view)).toBe("/api/reviews/rv/image");
    expect(calls).toEqual([
      'POST /api/session {"role":"patient"}',
      "GET /api/cases/c/reviews",
      "GET /api/cases/c/reviews",
      'POST /api/session {"role":"reviewer"}',
      "GET /api/reviews",
      'POST /api/reviews/rv/claim {"expectedState":"pending"}',
    ]);
  });

  it("reports unimplemented server routes as NOT_IMPLEMENTED", async () => {
    const client = createHttpClient((async (url: string, init?: RequestInit) =>
      url === "/api/session"
        ? envelope({ role: JSON.parse(String(init!.body)).role })
        : json(
            {
              error: {
                code: "NOT_IMPLEMENTED",
                message: "Pending",
                retryable: false,
                requestId: "p",
              },
            },
            404,
          )) as unknown as typeof fetch);
    await expect(client.listReviewQueue()).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
  });
});

describe("HTTP client role serialization", () => {
  it("never lets an overlapping call switch the role between check and request", async () => {
    const calls: string[] = [];
    let role = "";
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const respond = (data: unknown) =>
      new Response(
        JSON.stringify({
          contractVersion: "1",
          requestId: "r",
          dataMode: "fixture",
          data,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const client = createHttpClient((async (
      url: string,
      init?: RequestInit,
    ) => {
      if (url === "/api/session") {
        role = JSON.parse(String(init!.body)).role;
        calls.push(`session:${role}`);
        return respond({ role });
      }
      calls.push(`${url} as ${role}`);
      if (url === "/api/cases/c/reviews") await gate; // slow patient request
      return respond([]);
    }) as unknown as typeof fetch);

    const patientCall = client.listCaseReviews("c");
    const reviewerCall = client.listReviewQueue();
    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all([patientCall, reviewerCall]);
    expect(calls).toEqual([
      "session:patient",
      "/api/cases/c/reviews as patient",
      "session:reviewer",
      "/api/reviews as reviewer",
    ]);
  });
});
