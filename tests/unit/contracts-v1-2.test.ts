import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyFieldChanges,
  applyPlanTasks,
  applySharing,
  applyTaskAction,
  caseSchema,
  fieldsRevisionOf,
  sharedCase,
  sharedView,
  task,
  type Task,
} from "../../packages/contracts/src/index";

const fixture = (name: string) =>
  JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8"));
const now = "2026-10-24T12:30:00.000Z";
const patient = { id: "p1", role: "patient" as const };
const supporter = { id: "s1", role: "supporter" as const };
const proposal = (id: string): Task => ({
  id,
  category: "transport",
  description: "Arrange a ride",
  owner: null,
  status: "proposed",
  acceptedAt: null,
});

describe("contract v1.2 tasks", () => {
  const planned = () =>
    applyPlanTasks(caseSchema.parse(fixture("clear")), [
      proposal("ride"),
      proposal("call"),
    ]);

  it("claims explicitly and rejects a second claim", () => {
    const c = planned();
    const { case: next, task: t } = applyTaskAction(
      c,
      "ride",
      { expectedRevision: c.revision, action: "claim" },
      supporter,
      now,
    );
    expect(t).toMatchObject({
      status: "accepted",
      owner: "s1",
      ownerRole: "supporter",
      acceptedAt: now,
    });
    expect(() =>
      applyTaskAction(
        next,
        "ride",
        { expectedRevision: next.revision, action: "claim" },
        patient,
        now,
      ),
    ).toThrow("STATE_CONFLICT");
    expect(() =>
      applyTaskAction(
        next,
        "ride",
        { expectedRevision: c.revision, action: "complete" },
        supporter,
        now,
      ),
    ).toThrow("REVISION_CONFLICT");
  });

  it("only the owner completes or releases; completed cannot be released", () => {
    const c = planned();
    const { case: a } = applyTaskAction(
      c,
      "ride",
      { expectedRevision: c.revision, action: "claim" },
      supporter,
      now,
    );
    expect(() =>
      applyTaskAction(
        a,
        "ride",
        { expectedRevision: a.revision, action: "release" },
        patient,
        now,
      ),
    ).toThrow("FORBIDDEN");
    const { case: released, task: r } = applyTaskAction(
      a,
      "ride",
      { expectedRevision: a.revision, action: "release" },
      supporter,
      now,
    );
    expect(r).toMatchObject({
      status: "proposed",
      owner: null,
      acceptedAt: null,
      ownerRole: null,
    });
    const { case: b } = applyTaskAction(
      released,
      "ride",
      { expectedRevision: released.revision, action: "claim" },
      patient,
      now,
    );
    const { case: done, task: d } = applyTaskAction(
      b,
      "ride",
      { expectedRevision: b.revision, action: "complete" },
      patient,
      now,
    );
    expect(d.status).toBe("completed");
    expect(() =>
      applyTaskAction(
        done,
        "ride",
        { expectedRevision: done.revision, action: "release" },
        patient,
        now,
      ),
    ).toThrow("STATE_CONFLICT");
  });

  it("new suggestions never cancel accepted tasks", () => {
    const c = planned();
    const { case: a } = applyTaskAction(
      c,
      "ride",
      { expectedRevision: c.revision, action: "claim" },
      supporter,
      now,
    );
    const replanned = applyPlanTasks(a, [proposal("research")]);
    expect(replanned.tasks.map((t) => [t.id, t.status])).toEqual([
      ["ride", "accepted"],
      ["research", "proposed"],
    ]);
    expect(() => applyPlanTasks(a, [proposal("ride")])).toThrow("BAD_REQUEST");
  });

  it("proposed tasks cannot carry an owner role", () => {
    expect(
      task.safeParse({ ...proposal("x"), ownerRole: "patient" }).success,
    ).toBe(false);
  });
});

describe("contract v1.2 revisions and sharing", () => {
  it("task and sharing changes keep fieldsRevision; field edits move it and drop suggestions", () => {
    const c = applyPlanTasks(caseSchema.parse(fixture("clear")), [
      proposal("ride"),
    ]);
    expect(c.revision).toBe(1);
    expect(fieldsRevisionOf(c)).toBe(0);
    const shared = applySharing(c, {
      expectedRevision: 1,
      supporter: true,
      fieldKeys: ["medicationName"],
    });
    expect([shared.revision, fieldsRevisionOf(shared)]).toEqual([2, 0]);
    const edited = applyFieldChanges(shared, {
      expectedRevision: 2,
      changes: [{ key: "quantity", value: "60", reviewState: "unreviewed" }],
    }).case;
    expect([edited.revision, fieldsRevisionOf(edited)]).toEqual([3, 3]);
    expect(edited.tasks).toEqual([]);
  });

  it("the supporter sees only permitted values, never evidence, and nothing when not shared", () => {
    const c = caseSchema.parse(fixture("clear"));
    expect(sharedView(c)).toBeNull();
    const shared = applySharing(c, {
      expectedRevision: 0,
      supporter: true,
      fieldKeys: ["medicationName", "quantity"],
    });
    const view = sharedView(shared)!;
    expect(sharedCase.safeParse(view).success).toBe(true);
    expect(view.fields.map((f) => f.key)).toEqual([
      "medicationName",
      "quantity",
    ]);
    expect(JSON.stringify(view)).not.toMatch(
      /evidence|rawText|crop|Take one tablet/,
    );
    const withdrawn = applySharing(shared, {
      expectedRevision: 1,
      supporter: false,
      fieldKeys: ["quantity"],
    });
    expect(withdrawn.sharing).toEqual({ supporter: false, fieldKeys: [] });
    expect(sharedView(withdrawn)).toBeNull();
  });
});
