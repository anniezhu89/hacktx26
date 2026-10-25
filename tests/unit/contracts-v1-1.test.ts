import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyFieldChanges,
  caseSchema,
  fieldsRequest,
  reviewerView,
  reviewerViewResponse,
} from "../../packages/contracts/src/index";
const fixture = (name: string) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));

describe("contract v1.1 reviewer view", () => {
  it("accepts the fixture and its envelope", () => {
    expect(
      reviewerViewResponse.safeParse({
        contractVersion: "1",
        requestId: "r",
        dataMode: "fixture",
        data: fixture("reviewer-view"),
      }).success,
    ).toBe(true);
  });

  it("rejects AI suggestions in excerpts", () => {
    const view = fixture("reviewer-view");
    view.excerpts[0].value = "0.05 mg";
    expect(reviewerView.safeParse(view).success).toBe(false);
    const raw = fixture("reviewer-view");
    raw.excerpts[0].rawText = "0.05 mg";
    expect(reviewerView.safeParse(raw).success).toBe(false);
  });

  it("requires excerpts for exactly the selected fields", () => {
    const extra = fixture("reviewer-view");
    extra.excerpts.push({
      key: "quantity",
      textExcerpt: "Qty: 30",
      crop: null,
    });
    expect(reviewerView.safeParse(extra).success).toBe(false);
    const missing = fixture("reviewer-view");
    missing.excerpts = [];
    expect(reviewerView.safeParse(missing).success).toBe(false);
  });

  it("only allows the authorized image route", () => {
    for (const imageUrl of [
      "https://example.com/x.png",
      "/uploads/x.png",
      "/api/reviews/a/../image",
    ]) {
      const view = { ...fixture("reviewer-view"), imageUrl };
      expect(reviewerView.safeParse(view).success).toBe(false);
    }
  });
});

describe("contract v1.1 volunteer provenance", () => {
  it("marks applied volunteer proposals and keeps patient edits as user", () => {
    const current = caseSchema.parse(fixture("unreadable"));
    const { case: next } = applyFieldChanges(current, {
      expectedRevision: 0,
      changes: [
        {
          key: "strength",
          value: "0.05 mg",
          reviewState: "unreviewed",
          fromReviewId: "synthetic-review",
        },
        { key: "quantity", value: "30", reviewState: "user_confirmed" },
      ],
    });
    const field = (k: string) => next.fields.find((f) => f.key === k);
    expect(field("strength")).toMatchObject({
      value: "0.05 mg",
      provenance: "volunteer",
      reviewState: "unreviewed",
    });
    expect(field("quantity")?.provenance).toBe("user");
  });

  it("rejects an empty review id", () => {
    expect(
      fieldsRequest.safeParse({
        expectedRevision: 0,
        changes: [
          {
            key: "strength",
            value: "1",
            reviewState: "unreviewed",
            fromReviewId: "",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
