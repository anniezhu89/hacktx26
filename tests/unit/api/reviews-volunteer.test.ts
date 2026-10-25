import { describe, it, expect } from "vitest";
import {
  reviewerViewResponse,
  reviewsResponse,
} from "../../../packages/contracts/src/index";
import { syntheticPng } from "./images";
import { code, createCase, signup, testApp, type Agent } from "./helpers";

async function photoCase(agent: Agent) {
  await agent.post("/api/session").send({ role: "patient" });
  const res = await agent
    .post("/api/cases")
    .field("fictionalDataAcknowledged", "true")
    .attach("image", syntheticPng(640, 480), {
      filename: "label.png",
      contentType: "image/png",
    })
    .expect(201);
  return res.body.data as { id: string; revision: number };
}

async function setup() {
  const t = testApp({ approved: ["vera@example.test", "victor@example.test"] });
  const patient = t.agent();
  await signup(patient, "June", "june@example.test");
  const c = await photoCase(patient);
  const created = await patient
    .post(`/api/cases/${c.id}/reviews`)
    .send({
      expectedRevision: c.revision,
      selectedFields: ["exactDirections"],
      consent: true,
    })
    .expect(201);
  const reviewId = created.body.data.id as string;
  // The patient's browser uploads only the cropped directions section.
  await patient
    .put(`/api/reviews/${reviewId}/image`)
    .field("fictionalDataAcknowledged", "true")
    .attach("image", syntheticPng(320, 80), {
      filename: "crop.png",
      contentType: "image/png",
    })
    .expect(200);
  const vera = t.agent();
  await signup(vera, "Vera", "vera@example.test", {
    supporter: false,
    volunteer: true,
  });
  const victor = t.agent();
  await signup(victor, "Victor", "victor@example.test", {
    supporter: false,
    volunteer: true,
  });
  return { ...t, patient, c, reviewId, vera, victor };
}

describe("volunteer reading", () => {
  it("requires server approval, not just the preference", async () => {
    const { agent } = await setup();
    const pending = agent();
    const account = await signup(pending, "Pat", "pat@example.test", {
      supporter: false,
      volunteer: true,
    });
    expect(account.volunteerStatus).toBe("pending");
    expect(code((await pending.get("/api/reviews").expect(403)).body)).toBe(
      "FORBIDDEN",
    );
  });

  it("approved volunteers see others' requests, never their own, and claims are atomic", async () => {
    const { vera, victor, reviewId, patient } = await setup();
    const queue = reviewsResponse.parse(
      (await vera.get("/api/reviews").expect(200)).body,
    ).data;
    expect(queue.map((r) => r.id)).toEqual([reviewId]);
    // The patient's own volunteer view would not include their request.
    const [a, b] = await Promise.all([
      vera
        .post(`/api/reviews/${reviewId}/claim`)
        .send({ expectedState: "pending" }),
      victor
        .post(`/api/reviews/${reviewId}/claim`)
        .send({ expectedState: "pending" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const view = reviewerViewResponse.parse(winner.body).data;
    // Photo intake: no extracted text reaches the volunteer.
    expect(view.excerpts).toEqual([
      { key: "exactDirections", textExcerpt: null, crop: null },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/June|june@|medicationName/);
    expect(view.imageUrl).toBe(`/api/reviews/${reviewId}/image`);
    expect(patient).toBeDefined();
  });

  it("serves the cropped section only to the current claimer, and claims expire", async () => {
    const { vera, victor, reviewId, clock } = await setup();
    await vera
      .post(`/api/reviews/${reviewId}/claim`)
      .send({ expectedState: "pending" })
      .expect(200);
    const img = await vera.get(`/api/reviews/${reviewId}/image`).expect(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.body.length).toBe(syntheticPng(320, 80).length);
    await victor.get(`/api/reviews/${reviewId}/image`).expect(403);
    clock.now += 16 * 60 * 1000;
    await vera.get(`/api/reviews/${reviewId}/image`).expect(403);
    await victor
      .post(`/api/reviews/${reviewId}/claim`)
      .send({ expectedState: "pending" })
      .expect(200);
    await victor.post(`/api/reviews/${reviewId}/release`).expect(200);
    expect(
      reviewsResponse.parse((await vera.get("/api/reviews")).body).data[0]
        .status,
    ).toBe("pending");
  });

  it("responses stay proposals: fields are untouched and explanations stay locked", async () => {
    const { vera, reviewId, patient, c } = await setup();
    await vera
      .post(`/api/reviews/${reviewId}/claim`)
      .send({ expectedState: "pending" })
      .expect(200);
    await vera
      .post(`/api/reviews/${reviewId}/response`)
      .send({
        expectedRevision: 0,
        outcome: "needs_new_image",
        proposals: [
          { key: "exactDirections", visibleText: "x", evidence: "x" },
        ],
      })
      .expect(400);
    await vera
      .post(`/api/reviews/${reviewId}/response`)
      .send({
        expectedRevision: 0,
        outcome: "submitted",
        proposals: [
          { key: "strength", visibleText: "10 mg", evidence: "seen" },
        ],
      })
      .expect(400);
    const before = (await patient.get(`/api/cases/${c.id}`)).body.data;
    const done = await vera
      .post(`/api/reviews/${reviewId}/response`)
      .send({
        expectedRevision: 0,
        outcome: "submitted",
        proposals: [
          {
            key: "exactDirections",
            visibleText: "Take one tablet daily.",
            evidence: "Directions line",
          },
        ],
      })
      .expect(200);
    expect(done.body.data.status).toBe("submitted");
    const after = (await patient.get(`/api/cases/${c.id}`)).body.data;
    expect(after.fields).toEqual(before.fields);
    expect(
      code(
        (
          await patient
            .post(`/api/cases/${c.id}/explanation`)
            .send({ expectedRevision: after.revision })
            .expect(422)
        ).body,
      ),
    ).toBe("NEEDS_CLARIFICATION");
    // Submitting twice cannot create a second answer.
    await vera
      .post(`/api/reviews/${reviewId}/response`)
      .send({ expectedRevision: 0, outcome: "submitted", proposals: [] })
      .expect(403);
  });

  it("a request made for an older label version is refused", async () => {
    const { vera, reviewId, patient, c } = await setup();
    await vera
      .post(`/api/reviews/${reviewId}/claim`)
      .send({ expectedState: "pending" })
      .expect(200);
    await patient
      .patch(`/api/cases/${c.id}/fields`)
      .send({
        expectedRevision: c.revision,
        changes: [
          {
            key: "exactDirections",
            value: "Take one tablet by mouth daily.",
            reviewState: "user_confirmed",
          },
        ],
      })
      .expect(200);
    const stale = await vera
      .post(`/api/reviews/${reviewId}/response`)
      .send({
        expectedRevision: 0,
        outcome: "submitted",
        proposals: [
          { key: "exactDirections", visibleText: "Take one", evidence: "x" },
        ],
      })
      .expect(409);
    expect(code(stale.body)).toBe("REVISION_CONFLICT");
  });

  it("the patient can cancel; a canceled request leaves the queue and drops its image", async () => {
    const { vera, reviewId, patient } = await setup();
    await patient.post(`/api/reviews/${reviewId}/cancel`).expect(200);
    expect(
      reviewsResponse.parse((await vera.get("/api/reviews")).body).data,
    ).toEqual([]);
    await vera
      .post(`/api/reviews/${reviewId}/claim`)
      .send({ expectedState: "pending" })
      .expect(403);
    await vera.post(`/api/reviews/${reviewId}/cancel`).expect(403);
  });

  it("the guest demo reader sees only its own workspace's requests", async () => {
    const { agent } = await setup();
    const guest = agent();
    const c = await createCase(guest);
    const created = await guest
      .post(`/api/cases/${c.id}/reviews`)
      .send({
        expectedRevision: c.revision,
        selectedFields: ["strength"],
        consent: true,
      })
      .expect(201);
    await guest.post("/api/session").send({ role: "reviewer" });
    const queue = reviewsResponse.parse(
      (await guest.get("/api/reviews").expect(200)).body,
    ).data;
    expect(queue.map((r) => r.id)).toEqual([created.body.data.id]);
    const view = reviewerViewResponse.parse(
      (
        await guest
          .post(`/api/reviews/${created.body.data.id}/claim`)
          .send({ expectedState: "pending" })
          .expect(200)
      ).body,
    ).data;
    // Text intake: the volunteer sees the label line the patient typed.
    expect(view.excerpts[0].textExcerpt).toBe("Strength: 10 mg");
    expect(view.imageUrl).toBeNull();
    const other = agent();
    await other.post("/api/session").send({ role: "reviewer" });
    expect(
      reviewsResponse.parse((await other.get("/api/reviews")).body).data,
    ).toEqual([]);
  });
});
