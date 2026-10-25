import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  caseSchema,
  savingsOption,
} from "../../../packages/contracts/src/index";
import {
  clockTimes,
  displayablePrice,
  explanationProblems,
  inventedClockTimes,
  priceView,
  productMatch,
} from "../../../apps/web/src/lib/understand";

const fixture = (name: string) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));

const confirmedClear = () => {
  const c = caseSchema.parse(fixture("clear"));
  for (const f of c.fields) f.reviewState = "user_confirmed";
  return c.fields;
};

const option = (overrides: Record<string, unknown> = {}) =>
  savingsOption.parse({ ...fixture("savings"), ...overrides });

describe("clock-time guard", () => {
  it("finds times in common formats", () => {
    expect(clockTimes("at 8 AM and 8:00 p.m., or noon")).toEqual([
      "8am",
      "8:00pm",
      "noon",
    ]);
  });

  it("flags schedules the label never stated", () => {
    const original = "Take one tablet twice daily as needed.";
    expect(
      inventedClockTimes(original, "Take one tablet at 8 AM and 8 PM."),
    ).toEqual(["8am", "8pm"]);
    expect(inventedClockTimes(original, original)).toEqual([]);
    expect(
      inventedClockTimes("Take at 9 PM.", "Take one tablet at 9 p.m."),
    ).toEqual([]);
  });
});

describe("explanation meaning guard", () => {
  const original = "Take one tablet twice daily as needed.";
  it("accepts verbatim text", () => {
    expect(explanationProblems(original, original)).toEqual([]);
  });
  it("rejects dropping as-needed or a warning", () => {
    expect(
      explanationProblems(original, "Take one tablet twice daily."),
    ).toEqual(["leaves out as needed"]);
    expect(
      explanationProblems(
        "Do not crush. Take one tablet daily.",
        "Take one tablet daily.",
      ),
    ).toEqual(["leaves out a warning (do not)"]);
  });
  it("rejects added intervals, times of day and meals", () => {
    for (const added of [
      "Take one tablet every 12 hours as needed.",
      "Take one tablet in the morning and evening as needed.",
      "Take one tablet with breakfast as needed.",
      "Take one tablet at 8 AM as needed.",
    ])
      expect(explanationProblems(original, added).length).toBeGreaterThan(0);
  });
});

describe("savings product matching", () => {
  const product = {
    medicationName: "Levothyroxine Sodium",
    strength: "0.05 mg",
    dosageForm: "tablet",
    quantity: "30",
    location: null,
  };

  it("is comparable only when every attribute is confirmed and equal", () => {
    expect(
      productMatch(option({ matchedProduct: product }), confirmedClear())
        .comparable,
    ).toBe(true);
    const unconfirmed = caseSchema.parse(fixture("clear")).fields;
    const m = productMatch(option({ matchedProduct: product }), unconfirmed);
    expect(m.comparable).toBe(false);
    expect(m.attributes.every((a) => a.state === "unknown")).toBe(true);
  });

  it("treats mg vs mcg, form and quantity differences as mismatches", () => {
    for (const change of [
      { strength: "0.5 mcg" },
      { dosageForm: "capsule" },
      { quantity: "90" },
    ]) {
      const m = productMatch(
        option({ matchedProduct: { ...product, ...change } }),
        confirmedClear(),
      );
      expect(m.mismatch).toBe(true);
      expect(m.comparable).toBe(false);
    }
  });

  it("keeps unknown source attributes unknown, not matching", () => {
    const m = productMatch(option(), confirmedClear());
    expect(m.comparable).toBe(false);
    expect(m.mismatch).toBe(false);
  });
});

describe("savings price view", () => {
  const priced = (matchedProduct: Record<string, string | null>) =>
    option({
      amount: 12,
      currency: "USD",
      priceBasis: "source_listed",
      sourceEvidence: "$12.00 for 30 tablets",
      optionType: "price",
      matchedProduct: { location: null, ...matchedProduct },
    });
  const same = {
    medicationName: "Levothyroxine Sodium",
    strength: "0.05 mg",
    dosageForm: "tablet",
    quantity: "30",
  };
  it("never exposes a price for a different product", () => {
    for (const change of [
      { strength: "0.5 mcg" },
      { dosageForm: "capsule" },
      { quantity: "60" },
    ]) {
      const view = priceView(priced({ ...same, ...change }), confirmedClear());
      expect(view.kind).toBe("other-product");
      expect(view).not.toHaveProperty("price");
    }
  });
  it("shows an evidenced price for the same product, flagged when unchecked", () => {
    expect(priceView(priced(same), confirmedClear())).toMatchObject({
      kind: "price",
      comparable: true,
    });
    expect(
      priceView(priced({ ...same, quantity: null }), confirmedClear()),
    ).toMatchObject({ kind: "price", comparable: false });
  });
});

describe("price display", () => {
  it("shows no amount for the fixture resource", () => {
    expect(displayablePrice(option())).toBeNull();
  });

  it("formats an evidenced amount", () => {
    expect(
      displayablePrice(
        option({
          amount: 12.5,
          currency: "USD",
          priceBasis: "source_listed",
          sourceEvidence: "Listed at $12.50 for 30 tablets.",
          optionType: "price",
        }),
      ),
    ).toMatch(/12\.50/);
  });
});

describe("explanation and savings in the mock", () => {
  // Imported lazily so the pure-helper tests above stay independent.
  const setup = async () => {
    const { createMockClient } = await import("../../helpers/mockClient");
    const { findSample } = await import("../../helpers/labels");
    const client = createMockClient({
      latencyMs: 0,
      now: () => new Date("2026-10-24T20:00:00.000Z"),
    });
    const s = findSample("clear")!;
    const { case: c } = await client.createCase({
      kind: "sample",
      sampleId: s.id,
      text: s.text,
    });
    const confirm = () =>
      client.updateFields(c.id, {
        expectedRevision: 0,
        changes: c.fields
          .filter((f) => f.key !== "quantity")
          .map((f) => ({
            key: f.key,
            value: f.value,
            reviewState: "user_confirmed" as const,
          })),
      });
    return { client, c, confirm };
  };

  it("blocks explanations until critical fields are confirmed, then echoes directions verbatim", async () => {
    const { client, c, confirm } = await setup();
    await expect(
      client.requestExplanation(c.id, { expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: "NEEDS_CLARIFICATION", status: 422 });
    await confirm();
    await expect(
      client.requestExplanation(c.id, { expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    const { data, dataMode } = await client.requestExplanation(c.id, {
      expectedRevision: 1,
    });
    expect(dataMode).toBe("fixture");
    expect(data).toMatchObject({
      originalDirections: "Take one tablet twice daily as needed.",
      simplifiedText: "Take one tablet twice daily as needed.",
      fieldRevision: 1,
    });
    // Same question the backend raises for frequency plus "as needed".
    expect(data.unresolvedQuestions).toEqual([
      expect.stringContaining("both a frequency and 'as needed'"),
    ]);
    expect(
      inventedClockTimes(data.originalDirections, data.simplifiedText),
    ).toEqual([]);
  });

  it("returns sourced savings without unsupported prices, and empty results", async () => {
    const { client, c, confirm } = await setup();
    await expect(
      client.searchSavings(c.id, { expectedRevision: 0, location: "Austin" }),
    ).rejects.toMatchObject({ code: "NEEDS_CLARIFICATION" });
    await confirm();
    const { data } = await client.searchSavings(c.id, {
      expectedRevision: 1,
      location: "Austin",
    });
    expect(data.options).toHaveLength(1);
    expect(data.options[0]).toMatchObject({
      amount: null,
      priceBasis: "unknown",
    });
    expect(displayablePrice(data.options[0])).toBeNull();
    client.nextSavings([]);
    const empty = await client.searchSavings(c.id, {
      expectedRevision: 1,
      location: "Austin",
    });
    expect(empty.data.options).toEqual([]);
    await expect(
      client.searchSavings(c.id, { expectedRevision: 1, location: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
