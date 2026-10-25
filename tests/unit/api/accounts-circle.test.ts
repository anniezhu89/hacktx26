import { describe, it, expect } from "vitest";
import {
  accountResponse,
  circleResponse,
  savedLabelsResponse,
  sharedLabelsResponse,
} from "../../../packages/contracts/src/index";
import { syntheticPng } from "./images";
import {
  code,
  confirmAll,
  createCase,
  signup,
  testApp,
  type Agent,
} from "./helpers";

const saved = async (agent: Agent, caseId: string) =>
  savedLabelsResponse.parse(
    (await agent.post("/api/account/labels").send({ caseId }).expect(200)).body,
  ).data;

describe("demo accounts", () => {
  it("signs up, rotates the session cookie and never returns the password", async () => {
    const { agent } = testApp();
    const a = agent();
    const guest = await a.post("/api/session").send({ role: "patient" });
    const before = String(guest.headers["set-cookie"]);
    const res = await a
      .post("/api/account/signup")
      .send({
        name: "June",
        email: "June@Example.test",
        password: "correct horse battery",
        uses: { supporter: true, volunteer: false },
        fictionalDataAcknowledged: true,
      })
      .expect(201);
    const account = accountResponse.parse(res.body).data.account!;
    expect(account).toMatchObject({
      email: "june@example.test",
      uses: { supporter: true, volunteer: false },
      volunteerStatus: "not_requested",
    });
    expect(account.retention).toMatch(/memory.*7 days/);
    expect(String(res.headers["set-cookie"])).not.toBe(before);
    expect(JSON.stringify(res.body)).not.toMatch(
      /correct horse|passwordHash|salt/,
    );
  });

  it("rejects duplicates, short passwords and wrong credentials with one message", async () => {
    const { agent } = testApp();
    await signup(agent(), "June", "june@example.test");
    const again = await agent()
      .post("/api/account/signup")
      .send({
        name: "J",
        email: "june@example.test",
        password: "correct horse battery",
        uses: { supporter: false, volunteer: false },
        fictionalDataAcknowledged: true,
      });
    expect(code(again.body)).toBe("STATE_CONFLICT");
    const short = await agent()
      .post("/api/account/signup")
      .send({
        name: "J",
        email: "j@example.test",
        password: "short",
        uses: { supporter: false, volunteer: false },
        fictionalDataAcknowledged: true,
      });
    expect(short.status).toBe(400);
    const wrong = await agent()
      .post("/api/account/signin")
      .send({ email: "june@example.test", password: "wrong password" })
      .expect(401);
    const unknown = await agent()
      .post("/api/account/signin")
      .send({ email: "nobody@example.test", password: "wrong password" })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    await agent()
      .post("/api/account/signin")
      .send({ email: "JUNE@example.test", password: "correct horse battery" })
      .expect(200);
  });

  it("reports recovery as unavailable instead of pretending an email was sent", async () => {
    const { agent } = testApp();
    const res = await agent()
      .post("/api/account/recovery")
      .send({ email: "june@example.test" })
      .expect(503);
    expect(res.body.error).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(res.body.error.message).toMatch(/cannot send email/);
  });

  it("attaches a guest case only to the session that created it, with a stated lifetime", async () => {
    const { agent, clock } = testApp();
    const a = agent();
    const c = await createCase(a);
    await signup(a, "June", "june@example.test");
    // Signed in, the guest case is no longer reachable until saved.
    await a.get(`/api/cases/${c.id}`).expect(403);
    const other = agent();
    await signup(other, "Alex", "alex@example.test");
    expect(
      code(
        (
          await other
            .post("/api/account/labels")
            .send({ caseId: c.id })
            .expect(403)
        ).body,
      ),
    ).toBe("FORBIDDEN");
    const [label] = await saved(a, c.id);
    expect(label.caseId).toBe(c.id);
    expect(Date.parse(label.expiresAt) - clock.now).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
    await a.get(`/api/cases/${c.id}`).expect(200);
  });

  it("preferences change navigation only, never access", async () => {
    const { agent } = testApp();
    const a = agent();
    await signup(a, "June", "june@example.test");
    const res = await a
      .patch("/api/account")
      .send({ uses: { supporter: true, volunteer: true } })
      .expect(200);
    expect(res.body.data.account.volunteerStatus).toBe("pending");
    const queue = await a.get("/api/reviews").expect(403);
    expect(queue.body.error.message).toMatch(/pending approval/);
    expect(
      sharedLabelsResponse.parse(
        (await a.get("/api/circle/shared").expect(200)).body,
      ).data,
    ).toEqual([]);
  });

  it("deleting needs the password and removes saved labels and the sign-in", async () => {
    const { agent } = testApp();
    const a = agent();
    await signup(a, "June", "june@example.test");
    const c = await createCase(a);
    await saved(a, c.id);
    await a
      .delete("/api/account")
      .send({ password: "nope", confirm: "DELETE" })
      .expect(403);
    await a.get(`/api/cases/${c.id}`).expect(200);
    await a
      .delete("/api/account")
      .send({ password: "correct horse battery", confirm: "DELETE" })
      .expect(200);
    expect(
      accountResponse.parse((await a.get("/api/account")).body).data.account,
    ).toBeNull();
    await a.post("/api/session").send({ role: "patient" });
    await a.get(`/api/cases/${c.id}`).expect(404);
    await agent()
      .post("/api/account/signin")
      .send({ email: "june@example.test", password: "correct horse battery" })
      .expect(401);
  });
});

async function connected(scope = "reading_and_tasks") {
  const t = testApp();
  const owner = t.agent();
  await signup(owner, "June", "june@example.test");
  const supporter = t.agent();
  await signup(supporter, "Alex", "alex@example.test", {
    supporter: true,
    volunteer: false,
  });
  const invite = await owner
    .post("/api/circle/invitations")
    .send({ inviteeName: "Alex", scope })
    .expect(201);
  const invitationCode = invite.body.data.code as string;
  await supporter
    .post("/api/circle/accept")
    .send({ code: invitationCode, decision: "accept" })
    .expect(200);
  const circle = circleResponse.parse(
    (await owner.get("/api/circle")).body,
  ).data;
  return {
    ...t,
    owner,
    supporter,
    invitationCode,
    connectionId: circle.connections[0].id,
  };
}

describe("support circle", () => {
  it("invitations are single use and expire; nothing is shared on connection", async () => {
    const { owner, supporter, invitationCode, agent, clock } =
      await connected();
    const third = agent();
    await signup(third, "Riley", "riley@example.test");
    expect(
      code(
        (
          await third
            .post("/api/circle/accept")
            .send({ code: invitationCode, decision: "accept" })
            .expect(409)
        ).body,
      ),
    ).toBe("STATE_CONFLICT");
    expect(
      sharedLabelsResponse.parse(
        (await supporter.get("/api/circle/shared")).body,
      ).data,
    ).toEqual([]);
    const later = await owner
      .post("/api/circle/invitations")
      .send({ inviteeName: "Riley", scope: "reading" })
      .expect(201);
    clock.now += 73 * 60 * 60 * 1000;
    // Sessions idle out after 2 hours; sign in again like a returning person.
    await third
      .post("/api/account/signin")
      .send({ email: "riley@example.test", password: "correct horse battery" })
      .expect(200);
    await owner
      .post("/api/account/signin")
      .send({ email: "june@example.test", password: "correct horse battery" })
      .expect(200);
    expect(
      code(
        (
          await third
            .post("/api/circle/accept")
            .send({ code: later.body.data.code, decision: "accept" })
            .expect(410)
        ).body,
      ),
    ).toBe("EXPIRED");
    expect(
      circleResponse
        .parse((await owner.get("/api/circle")).body)
        .data.invitations.map((i) => i.status),
    ).toContain("expired");
  });

  it("shares only granted, confirmed fields and keeps the image a separate grant", async () => {
    const { owner, supporter, connectionId } = await connected();
    await owner.post("/api/session").send({ role: "patient" });
    const created = await owner
      .post("/api/cases")
      .field("fictionalDataAcknowledged", "true")
      .attach("image", syntheticPng(640, 480), {
        filename: "label.png",
        contentType: "image/png",
      })
      .expect(201);
    const c = created.body.data;
    await saved(owner, c.id);
    const typed = await createCase(owner);
    const confirmed = await confirmAll(
      owner,
      typed.id,
      typed.revision,
      typed.fields,
    );
    await saved(owner, typed.id);
    await owner
      .put(`/api/circle/connections/${connectionId}/grants/${typed.id}`)
      .send({ fieldKeys: ["medicationName"], image: false })
      .expect(200);
    const [shared] = sharedLabelsResponse.parse(
      (await supporter.get("/api/circle/shared")).body,
    ).data;
    expect(shared.fields).toEqual([
      {
        key: "medicationName",
        value: "Lisinopril",
        reviewState: "user_confirmed",
      },
    ]);
    const body = JSON.stringify(shared);
    expect(body).not.toMatch(/10 mg|once daily|evidence|rawText/);
    expect(shared.imageUrl).toBeNull();
    expect(confirmed.fields.length).toBe(5);
    // Image: separate grant on the photo case.
    await owner
      .put(`/api/circle/connections/${connectionId}/grants/${c.id}`)
      .send({ fieldKeys: [], image: false })
      .expect(200);
    await supporter.get(`/api/circle/shared/${c.id}/image`).expect(403);
    await owner
      .put(`/api/circle/connections/${connectionId}/grants/${c.id}`)
      .send({ fieldKeys: [], image: true })
      .expect(200);
    const img = await supporter
      .get(`/api/circle/shared/${c.id}/image`)
      .expect(200);
    expect(img.headers["content-type"]).toBe("image/png");
    // Revocation takes effect on the next request.
    await owner
      .delete(`/api/circle/connections/${connectionId}/grants/${c.id}`)
      .expect(200);
    await supporter.get(`/api/circle/shared/${c.id}/image`).expect(404);
    await owner.delete(`/api/circle/connections/${connectionId}`).expect(200);
    expect(
      sharedLabelsResponse.parse(
        (await supporter.get("/api/circle/shared")).body,
      ).data,
    ).toEqual([]);
  });

  it("supporters cannot read or change the owner's case directly", async () => {
    const { owner, supporter, connectionId } = await connected();
    const c = await createCase(owner);
    await saved(owner, c.id);
    await owner
      .put(`/api/circle/connections/${connectionId}/grants/${c.id}`)
      .send({ fieldKeys: ["exactDirections"], image: false })
      .expect(200);
    await supporter.post("/api/session").send({ role: "patient" });
    await supporter.get(`/api/cases/${c.id}`).expect(403);
    await supporter
      .patch(`/api/cases/${c.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: [
          { key: "strength", value: "20 mg", reviewState: "user_confirmed" },
        ],
      })
      .expect(403);
  });

  it("task transitions follow actor permissions and resist concurrent acceptance", async () => {
    const { owner, supporter, connectionId, agent } = await connected();
    const c = await createCase(owner);
    await saved(owner, c.id);
    await owner
      .put(`/api/circle/connections/${connectionId}/grants/${c.id}`)
      .send({ fieldKeys: [], image: false })
      .expect(200);
    // A second supporter on the same label.
    const riley = agent();
    await signup(riley, "Riley", "riley@example.test");
    const invite = await owner
      .post("/api/circle/invitations")
      .send({ inviteeName: "Riley", scope: "tasks" })
      .expect(201);
    await riley
      .post("/api/circle/accept")
      .send({ code: invite.body.data.code, decision: "accept" })
      .expect(200);
    const rileyConn = circleResponse
      .parse((await owner.get("/api/circle")).body)
      .data.connections.find((k) => k.personName === "Riley")!;
    await owner
      .put(`/api/circle/connections/${rileyConn.id}/grants/${c.id}`)
      .send({ fieldKeys: [], image: false })
      .expect(200);
    // A tasks-only connection cannot be given label details.
    await owner
      .put(`/api/circle/connections/${rileyConn.id}/grants/${c.id}`)
      .send({ fieldKeys: ["strength"], image: false })
      .expect(400);

    const planRev = (await owner.get(`/api/cases/${c.id}`)).body.data.revision;
    const plan = await owner
      .post(`/api/cases/${c.id}/plan`)
      .send({
        expectedRevision: planRev,
        supporterConstraints: [
          {
            supporterId: "alex",
            availability: "",
            transport: "Can drive",
            budget: null,
          },
        ],
        selectedOptionIds: [],
      })
      .expect(200);
    expect(plan.body.data.tasks.length).toBeGreaterThanOrEqual(3);
    const [first, second] = plan.body.data.tasks;
    const rev = (await owner.get(`/api/cases/${c.id}`)).body.data.revision;
    const [a, b] = await Promise.all([
      supporter
        .patch(`/api/circle/shared/${c.id}/tasks/${first.id}`)
        .send({ expectedRevision: rev, action: "claim" }),
      riley
        .patch(`/api/circle/shared/${c.id}/tasks/${first.id}`)
        .send({ expectedRevision: rev, action: "claim" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? supporter : riley;
    const loser = a.status === 200 ? riley : supporter;
    let current = (await owner.get(`/api/cases/${c.id}`)).body.data.revision;
    expect(
      code(
        (
          await loser
            .patch(`/api/circle/shared/${c.id}/tasks/${first.id}`)
            .send({ expectedRevision: current, action: "complete" })
            .expect(403)
        ).body,
      ),
    ).toBe("FORBIDDEN");
    await winner
      .patch(`/api/circle/shared/${c.id}/tasks/${first.id}`)
      .send({ expectedRevision: current, action: "complete" })
      .expect(200);
    current = (await owner.get(`/api/cases/${c.id}`)).body.data.revision;
    // Supporters decline; only the patient cancels.
    await loser
      .patch(`/api/circle/shared/${c.id}/tasks/${second.id}`)
      .send({ expectedRevision: current, action: "cancel" })
      .expect(403);
    const declined = await loser
      .patch(`/api/circle/shared/${c.id}/tasks/${second.id}`)
      .send({ expectedRevision: current, action: "decline" })
      .expect(200);
    expect(declined.body.data.task.status).toBe("declined");
    const third = plan.body.data.tasks[2];
    const canceled = await owner
      .patch(`/api/cases/${c.id}/tasks/${third.id}`)
      .send({
        expectedRevision: declined.body.data.caseRevision,
        action: "cancel",
      })
      .expect(200);
    expect(canceled.body.data.task.status).toBe("canceled");
    // A new plan keeps every accepted, completed, declined and canceled task.
    const replanned = await owner
      .post(`/api/cases/${c.id}/plan`)
      .send({
        expectedRevision: canceled.body.data.caseRevision,
        supporterConstraints: [],
        selectedOptionIds: [],
      })
      .expect(200);
    const kept = replanned.body.data.tasks
      .filter((t: { status: string }) => t.status !== "proposed")
      .map((t: { status: string }) => t.status)
      .sort();
    expect(kept).toEqual(["canceled", "completed", "declined"]);
  });

  it("a reading-only connection cannot act on tasks", async () => {
    const { owner, supporter, connectionId } = await connected("reading");
    const c = await createCase(owner);
    await saved(owner, c.id);
    await owner
      .put(`/api/circle/connections/${connectionId}/grants/${c.id}`)
      .send({ fieldKeys: [], image: false })
      .expect(200);
    const planRev = (await owner.get(`/api/cases/${c.id}`)).body.data.revision;
    const plan = await owner
      .post(`/api/cases/${c.id}/plan`)
      .send({
        expectedRevision: planRev,
        supporterConstraints: [],
        selectedOptionIds: [],
      })
      .expect(200);
    const [shared] = sharedLabelsResponse.parse(
      (await supporter.get("/api/circle/shared")).body,
    ).data;
    expect(shared).toMatchObject({ tasksAllowed: false, tasks: [] });
    await supporter
      .patch(`/api/circle/shared/${c.id}/tasks/${plan.body.data.tasks[0].id}`)
      .send({ expectedRevision: shared.revision, action: "claim" })
      .expect(403);
  });
});
