import { describe, it, expect } from "vitest";
import {
  caseResponse,
  caseSchema,
  eligibleForExplanation,
} from "../../../packages/contracts/src/index";
import { ApiError, createHttpClient } from "../../../apps/web/src/api/client";
import { createMockClient } from "../../../apps/web/src/api/mock";
import {
  fieldCondition,
  reviewProgress,
  validateImageFile,
} from "../../../apps/web/src/lib/fields";
import { SAMPLES, findSample } from "../../../apps/web/src/samples";
import {
  createLatestTracker,
  shouldAcceptCase,
} from "../../../apps/web/src/state/guards";

const sample = (id: string) => findSample(id)!;
const field = (c: { fields: { key: string }[] }, key: string) =>
  c.fields.find((f) => f.key === key)!;
const mock = (now = () => new Date("2026-10-24T20:00:00.000Z")) =>
  createMockClient({ latencyMs: 0, now });
const createSample = (client: ReturnType<typeof mock>, id: string) =>
  client.createCase({ kind: "sample", sampleId: id, text: sample(id).text });

describe("field conditions", () => {
  it("distinguishes unreadable text from unclear meaning", () => {
    expect(
      fieldCondition(field(sample("unreadable").fixture, "strength") as never),
    ).toBe("unreadable");
    expect(
      fieldCondition(
        field(sample("unclear").fixture, "exactDirections") as never,
      ),
    ).toBe("unclear");
    for (const f of sample("clear").fixture.fields)
      expect(fieldCondition(f)).toBe("readable");
  });

  it("samples are schema-valid and keep exact fixture values", () => {
    for (const s of SAMPLES)
      expect(caseSchema.safeParse(s.fixture).success).toBe(true);
    expect(field(sample("clear").fixture, "strength")).toMatchObject({
      value: "0.05 mg",
    });
    expect(field(sample("unclear").fixture, "exactDirections")).toMatchObject({
      value: "Use as directed.",
    });
  });

  it("counts only confirmed, filled critical fields", () => {
    const fields = structuredClone(sample("unreadable").fixture.fields);
    for (const f of fields) f.reviewState = "user_confirmed";
    const progress = reviewProgress(fields);
    expect(progress).toMatchObject({ confirmed: 3, total: 4 });
    expect(progress.outstanding.map((f) => f.key)).toEqual(["strength"]);
  });
});

describe("image validation", () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
  ]);
  it("accepts a PNG signature and rejects mislabeled, oversized, and SVG files", async () => {
    expect(
      await validateImageFile(new File([png], "a.png", { type: "image/png" })),
    ).toBeNull();
    expect(
      await validateImageFile(
        new File(["<svg/>"], "a.png", { type: "image/png" }),
      ),
    ).toMatch(/does not look like/);
    expect(
      await validateImageFile(
        new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }),
      ),
    ).toMatch(/Only PNG or JPEG/);
    expect(
      await validateImageFile(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
          type: "image/png",
        }),
      ),
    ).toMatch(/limit is 5 MB/);
    expect(
      await validateImageFile(new File([], "e.png", { type: "image/png" })),
    ).toMatch(/empty/);
  });
});

describe("contract-valid mock API", () => {
  it("creates fresh, fixture-labeled cases with image excerpts for samples", async () => {
    const result = await createSample(mock(), "clear");
    expect(result.dataMode).toBe("fixture");
    expect(
      caseResponse.safeParse({
        contractVersion: "1",
        requestId: result.requestId,
        dataMode: result.dataMode,
        data: result.case,
      }).success,
    ).toBe(true);
    expect(result.case.revision).toBe(0);
    expect(result.case.expiresAt).toBe("2026-10-24T21:00:00.000Z");
    expect(field(result.case, "strength")).toMatchObject({
      value: "0.05 mg",
      reviewState: "unreviewed",
      crop: sample("clear").crops.strength,
    });
  });

  it("keeps an unreadable strength unresolved and the explanation blocked", async () => {
    const client = mock();
    const { case: c } = await createSample(client, "unreadable");
    expect(field(c, "strength")).toMatchObject({
      value: null,
      rawText: null,
      reviewState: "unresolved",
    });
    const confirmAll = c.fields
      .filter((f) => f.value !== null)
      .map((f) => ({
        key: f.key,
        value: f.value,
        reviewState: "user_confirmed" as const,
      }));
    const next = await client.updateFields(c.id, {
      expectedRevision: 0,
      changes: confirmAll,
    });
    expect(eligibleForExplanation(next.case.fields)).toBe(false);
    expect(next.case.status).toBe("reviewing");
  });

  it("uses the shared fixture for matching text and extracts nothing otherwise", async () => {
    const client = mock();
    const matched = await client.createCase({
      kind: "text",
      text: sample("clear").text,
    });
    expect(field(matched.case, "exactDirections")).toMatchObject({
      value: "Take one tablet twice daily as needed.",
      crop: null,
    });
    const other = await client.createCase({
      kind: "text",
      text: "Some other fictional label",
    });
    for (const f of other.case.fields) {
      expect(f).toMatchObject({
        value: null,
        rawText: null,
        reviewState: "unresolved",
      });
      expect(fieldCondition(f)).toBe("missing");
    }
  });

  it("increments revisions and rejects stale revisions with 409", async () => {
    const client = mock();
    const { case: c } = await createSample(client, "clear");
    const next = await client.updateFields(c.id, {
      expectedRevision: 0,
      changes: [
        { key: "strength", value: "0.5 mcg", reviewState: "unreviewed" },
      ],
    });
    expect(next.case.revision).toBe(1);
    expect(field(next.case, "strength")).toMatchObject({
      value: "0.5 mcg",
      provenance: "user",
    });
    await expect(
      client.updateFields(c.id, {
        expectedRevision: 0,
        changes: [
          { key: "strength", value: "1 mg", reviewState: "unreviewed" },
        ],
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT", status: 409 });
  });

  it("expires cases after 60 minutes and reports missing cases", async () => {
    let now = new Date("2026-10-24T20:00:00.000Z");
    const client = mock(() => now);
    const { case: c } = await createSample(client, "clear");
    now = new Date("2026-10-24T21:00:00.000Z");
    await expect(client.getCase(c.id)).rejects.toMatchObject({
      code: "EXPIRED",
      status: 410,
    });
    await expect(client.getCase(c.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("simulates retryable failures once", async () => {
    const client = mock();
    client.failNext("PROVIDER_UNAVAILABLE");
    await expect(createSample(client, "clear")).rejects.toMatchObject({
      retryable: true,
      status: 503,
    });
    await expect(createSample(client, "clear")).resolves.toBeTruthy();
  });
});

describe("HTTP client", () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const sessionOk = () =>
    json(200, {
      contractVersion: "1",
      requestId: "s",
      dataMode: "fixture",
      data: { role: "patient" },
    });
  const unauthorized = () =>
    json(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "Start a session",
        retryable: false,
        requestId: "u",
      },
    });
  /** Fake server: /api/session succeeds unless overridden; logs every call. */
  function server(
    handle: (url: string, call: number) => Response,
    session: () => Response = sessionOk,
  ) {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return url === "/api/session" ? session() : handle(url, calls.length);
    }) as unknown as typeof fetch;
    return { calls, client: createHttpClient(fetchImpl) };
  }
  const data = sample("clear").fixture;
  const caseOk = () =>
    json(200, {
      contractVersion: "1",
      requestId: "r2",
      dataMode: "fixture",
      data,
    });

  it("starts one patient demo session before the first case request", async () => {
    const { calls, client } = server(caseOk);
    expect((await client.getCase(data.id)).case.id).toBe(data.id);
    await client.getCase(data.id);
    expect(calls).toEqual([
      "POST /api/session",
      `GET /api/cases/${data.id}`,
      `GET /api/cases/${data.id}`,
    ]);
  });

  it("restarts the session once after a 401, then surfaces later failures", async () => {
    let failures = 1;
    const { calls, client } = server(() =>
      failures-- > 0 ? unauthorized() : caseOk(),
    );
    await expect(client.getCase(data.id)).resolves.toBeTruthy();
    expect(calls.filter((c) => c === "POST /api/session")).toHaveLength(2);

    const always = server(unauthorized);
    await expect(always.client.getCase("x")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(always.calls).toHaveLength(4);
  });

  it("reports a failed session start and tries again on the next request", async () => {
    let sessionFails = true;
    const { calls, client } = server(caseOk, () =>
      sessionFails
        ? json(503, {
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "Down",
              retryable: true,
              requestId: "d",
            },
          })
        : sessionOk(),
    );
    await expect(client.getCase(data.id)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
    });
    sessionFails = false;
    await expect(client.getCase(data.id)).resolves.toBeTruthy();
    expect(calls).toEqual([
      "POST /api/session",
      "POST /api/session",
      `GET /api/cases/${data.id}`,
    ]);
  });

  it("surfaces contract errors and rejects malformed success bodies", async () => {
    const conflict = server(() =>
      json(409, {
        error: {
          code: "REVISION_CONFLICT",
          message: "Changed",
          retryable: false,
          requestId: "r1",
        },
      }),
    ).client;
    const error = await conflict.getCase("x").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "REVISION_CONFLICT",
      status: 409,
      requestId: "r1",
    });

    const malformed = server(() => json(200, { data: { revision: "nope" } }));
    await expect(malformed.client.getCase("x")).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });

  it("sends JSON text intake and reports network failures as retryable", async () => {
    const { calls, client } = server(caseOk);
    await client.createCase({ kind: "text", text: "Fictional text" });
    expect(calls).toEqual(["POST /api/session", "POST /api/cases"]);
    const offline = createHttpClient((async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch);
    await expect(offline.getCase("x")).rejects.toMatchObject({
      retryable: true,
      status: 0,
    });
  });
});

describe("backend evidence conventions", () => {
  const base = {
    ...sample("clear").fixture.fields[1],
    rawText: null,
    value: null,
  };
  it("treats explanatory evidence as not read and markers as unreadable", () => {
    expect(
      fieldCondition({ ...base, evidence: "Not found in the provided text." }),
    ).toBe("missing");
    expect(
      fieldCondition({
        ...base,
        evidence:
          "Not read: no live image extraction provider is configured (fixture mode).",
      }),
    ).toBe("missing");
    for (const marker of ["[unreadable]", "smudged", "[?]"])
      expect(fieldCondition({ ...base, evidence: marker })).toBe("unreadable");
  });
});

describe("stale response guards", () => {
  it("only the latest request is current", () => {
    const t = createLatestTracker();
    const a = t.begin();
    const b = t.begin();
    expect(t.isCurrent(a)).toBe(false);
    expect(t.isCurrent(b)).toBe(true);
    t.invalidate();
    expect(t.isCurrent(b)).toBe(false);
  });

  it("rejects responses for another case or an older revision", () => {
    const c = sample("clear").fixture;
    expect(shouldAcceptCase(null, c)).toBe(true);
    expect(shouldAcceptCase({ ...c, revision: 2 }, { ...c, revision: 1 })).toBe(
      false,
    );
    expect(shouldAcceptCase(c, { ...c, id: "other" })).toBe(false);
    expect(shouldAcceptCase(c, { ...c, revision: 1 })).toBe(true);
  });
});
