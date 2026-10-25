import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../../apps/api/src/app";
import {
  ApiError,
  createHttpClient,
  type ApiClient,
} from "../../../apps/web/src/api/client";
import {
  draftHasContent,
  emptyDraft,
  intakeProblems,
  MAX_TEXT,
} from "../../../apps/web/src/lib/intake";
import {
  displayState,
  editChange,
  helpChange,
  unknownChange,
} from "../../../apps/web/src/lib/review";
import { findSample } from "../../helpers/labels";
import { caseSchema } from "../../../packages/contracts/src/index";

const clear = findSample("clear")!;
const fieldOf = (key: string) =>
  structuredClone(clear.fixture.fields.find((f) => f.key === key)!);

describe("intake validation", () => {
  it("requires the fictional-data confirmation for every method", () => {
    const sample = { ...emptyDraft("text"), text: "Medication: fictional" };
    expect(intakeProblems(sample).map((p) => p.target)).toEqual(["ack"]);
    expect(intakeProblems({ ...sample, acknowledged: true })).toEqual([]);
  });

  it("rejects blank or over-long text and a missing photo", () => {
    const base = { ...emptyDraft("text"), acknowledged: true };
    expect(intakeProblems({ ...base, text: "   " })[0].target).toBe("text");
    expect(
      intakeProblems({ ...base, text: "x".repeat(MAX_TEXT + 1) })[0].message,
    ).toMatch(/20,000/);
    expect(intakeProblems({ ...base, text: "Strength: 0.5 mg" })).toEqual([]);
    const photo = { ...emptyDraft("image"), acknowledged: true };
    expect(intakeProblems(photo)[0].target).toBe("photo");
    // A rejected file's own reason is what the patient is shown.
    expect(
      intakeProblems({ ...photo, fileError: "That file is 6.0 MB." })[0]
        .message,
    ).toBe("That file is 6.0 MB.");
  });

  it("only counts typed text or a chosen file as unsaved input", () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
    expect(draftHasContent({ ...emptyDraft(), acknowledged: true })).toBe(
      false,
    );
    expect(draftHasContent({ ...emptyDraft("text"), text: "Qty: 30" })).toBe(
      true,
    );
  });
});

describe("field review rules", () => {
  it("editing a confirmed field shows it as no longer confirmed", () => {
    const f = {
      ...fieldOf("strength"),
      reviewState: "user_confirmed" as const,
    };
    expect(displayState(f, f.value!)).toBe("confirmed");
    expect(displayState(f, "0.05 mcg")).toBe("edited");
  });

  it("saving an edit without confirming clears the confirmation", () => {
    expect(editChange("strength", " 0.05 mcg ", false)).toEqual({
      key: "strength",
      value: "0.05 mcg",
      reviewState: "unreviewed",
    });
    expect(editChange("strength", "", false)).toEqual({
      key: "strength",
      value: null,
      reviewState: "unresolved",
    });
    expect(() => editChange("strength", "  ", true)).toThrow(/blank/);
  });

  it("keeps exact wording and never fills unknown values", () => {
    expect(
      editChange("exactDirections", "Take 1/2 tablet as needed.", true).value,
    ).toBe("Take 1/2 tablet as needed.");
    expect(unknownChange("strength")).toEqual({
      key: "strength",
      value: null,
      reviewState: "unresolved",
    });
    const f = fieldOf("dosageForm");
    expect(helpChange(f)).toEqual({
      key: "dosageForm",
      value: f.value,
      reviewState: "needs_help",
    });
    expect(
      displayState({ ...f, value: null, reviewState: "unresolved" }, ""),
    ).toBe("unknown");
  });
});

describe("HTTP client against the real API", () => {
  let server: Server;
  let client: ApiClient;

  beforeAll(async () => {
    const app = createApp(undefined, {
      log: () => {},
      extraction: null,
      search: null,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // The browser sends the HttpOnly demo cookie automatically; mimic that.
    let cookie = "";
    client = createHttpClient((async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const res = await fetch(base + url, { ...init, headers });
      const set = res.headers.getSetCookie();
      if (set.length) cookie = set[0].split(";")[0];
      return res;
    }) as typeof fetch);
  });

  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it("maps typed intake to a contract-valid case", async () => {
    const created = await client.createCase({
      kind: "text",
      text: clear.text,
    });
    expect(created.dataMode).toBe("fixture");
    expect(caseSchema.safeParse(created.case).success).toBe(true);
    expect(created.case.revision).toBe(0);
    expect(
      created.case.fields.every((f) => f.reviewState !== "user_confirmed"),
    ).toBe(true);
  });

  it("keeps explanations blocked while a required field is unknown", async () => {
    const { case: c } = await client.createCase({
      kind: "text",
      text: clear.text,
    });
    const { case: updated } = await client.updateFields(c.id, {
      expectedRevision: c.revision,
      changes: c.fields.map((f) =>
        f.key === "strength"
          ? unknownChange("strength")
          : {
              key: f.key,
              value: f.value,
              reviewState: "user_confirmed" as const,
            },
      ),
    });
    const blocked = await client
      .requestExplanation(c.id, { expectedRevision: updated.revision })
      .catch((e) => e);
    expect(blocked).toBeInstanceOf(ApiError);
    expect(blocked).toMatchObject({ code: "NEEDS_CLARIFICATION", status: 422 });
  });

  it("rejects a stale revision instead of overwriting newer edits", async () => {
    const { case: c } = await client.createCase({
      kind: "text",
      text: clear.text,
    });
    await client.updateFields(c.id, {
      expectedRevision: 0,
      changes: [editChange("quantity", "30", true)],
    });
    const stale = await client
      .updateFields(c.id, {
        expectedRevision: 0,
        changes: [editChange("quantity", "60", true)],
      })
      .catch((e) => e);
    expect(stale).toMatchObject({ code: "REVISION_CONFLICT", status: 409 });
  });

  it("support routes respond without confirming or assigning anything", async () => {
    const { case: c } = await client.createCase({
      kind: "text",
      text: clear.text,
    });
    const review = await client.createReview(c.id, {
      expectedRevision: c.revision,
      selectedFields: ["strength"],
      consent: true,
    });
    expect(review.data).toMatchObject({ status: "pending", proposals: [] });
    const plan = await client.requestPlan(c.id, {
      expectedRevision: c.revision,
      supporterConstraints: [],
      selectedOptionIds: [],
    });
    expect(plan.data.tasks.length).toBeGreaterThan(0);
    for (const t of plan.data.tasks)
      expect(t).toMatchObject({ status: "proposed", owner: null });
    const { case: after } = await client.getCase(c.id);
    // Neither request touched the label fields.
    expect(after.fields).toEqual(c.fields);
  });
});
