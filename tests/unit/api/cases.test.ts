import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp, type LogEntry } from "../../../apps/api/src/app";
import {
  apiError,
  caseResponse,
  deletionResponse,
  explanationResponse,
  sessionResponse,
} from "../../../packages/contracts/src/index";
import { syntheticJpeg, syntheticPng } from "./images";

const clearText = [
  "Medication: Levothyroxine Sodium",
  "Strength: 0.05 mg",
  "Form: tablet",
  "Quantity: 30",
  "Directions: Take one tablet twice daily as needed.",
].join("\n");
const criticalKeys = [
  "medicationName",
  "strength",
  "dosageForm",
  "exactDirections",
];

let clock: number;
let logs: LogEntry[];
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  clock = Date.parse("2026-10-24T12:00:00.000Z");
  logs = [];
  app = createApp(undefined, {
    now: () => clock,
    log: (entry) => logs.push(entry),
    limits: { intake: { limit: 5, windowMs: 60_000 } },
  });
});

async function persona(
  role: "patient" | "supporter" | "reviewer",
  agent = request.agent(app),
) {
  const res = await agent.post("/api/session").send({ role }).expect(200);
  expect(sessionResponse.parse(res.body).data.role).toBe(role);
  return agent;
}

async function createCase(
  agent: ReturnType<typeof request.agent>,
  text = clearText,
) {
  const res = await agent
    .post("/api/cases")
    .send({ text, fictionalDataAcknowledged: true })
    .expect(201);
  return caseResponse.parse(res.body).data;
}

const errorCode = (body: unknown) => apiError.parse(body).error.code;

describe("demo sessions and case access", () => {
  it("issues an HttpOnly SameSite cookie scoped to the API", async () => {
    const res = await request(app)
      .post("/api/session")
      .send({ role: "patient" })
      .expect(200);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/lb_demo_session=[\w-]{40,}/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api/);
    expect(
      errorCode(
        (
          await request(app)
            .post("/api/session")
            .send({ role: "admin" })
            .expect(400)
        ).body,
      ),
    ).toBe("BAD_REQUEST");
  });

  it("requires a patient session to create cases", async () => {
    const anonymous = await request(app)
      .post("/api/cases")
      .send({ text: clearText, fictionalDataAcknowledged: true })
      .expect(401);
    expect(errorCode(anonymous.body)).toBe("UNAUTHORIZED");
    const reviewer = await persona("reviewer");
    await reviewer
      .post("/api/cases")
      .send({ text: clearText, fictionalDataAcknowledged: true })
      .expect(403);
  });

  it("creates a contract-valid fixture-mode case from text", async () => {
    const patient = await persona("patient");
    const res = await patient
      .post("/api/cases")
      .send({ text: clearText, fictionalDataAcknowledged: true })
      .expect(201);
    const body = caseResponse.parse(res.body);
    expect(body.dataMode).toBe("fixture");
    expect(body.data).toMatchObject({
      revision: 0,
      status: "reviewing",
      fictionalData: true,
      createdAt: "2026-10-24T12:00:00.000Z",
      expiresAt: "2026-10-24T13:00:00.000Z",
      tasks: [],
    });
    expect(body.data.fields.find((f) => f.key === "strength")?.value).toBe(
      "0.05 mg",
    );
  });

  it("rejects missing acknowledgement without echoing label text", async () => {
    const patient = await persona("patient");
    for (const body of [
      { text: clearText },
      { text: clearText, fictionalDataAcknowledged: false },
      { text: "   ", fictionalDataAcknowledged: true },
      { text: clearText, fictionalDataAcknowledged: true, extra: 1 },
    ]) {
      const res = await patient.post("/api/cases").send(body).expect(400);
      expect(errorCode(res.body)).toBe("BAD_REQUEST");
      expect(JSON.stringify(res.body)).not.toContain("Fictional Demo");
    }
    const malformed = await patient
      .post("/api/cases")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(errorCode(malformed.body)).toBe("BAD_REQUEST");
  });

  it("isolates cases between sessions and personas", async () => {
    const patient = await persona("patient");
    const created = await createCase(patient);
    await request(app).get(`/api/cases/${created.id}`).expect(401);
    const other = await persona("patient");
    expect(
      errorCode((await other.get(`/api/cases/${created.id}`).expect(403)).body),
    ).toBe("FORBIDDEN");
    await other.delete(`/api/cases/${created.id}`).expect(403);
    await other
      .patch(`/api/cases/${created.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: [
          { key: "strength", value: "5 mg", reviewState: "user_confirmed" },
        ],
      })
      .expect(403);
    await patient.get("/api/cases/not-a-case").expect(404);
    await persona("reviewer", patient);
    await patient.get(`/api/cases/${created.id}`).expect(403);
    await persona("supporter", patient);
    await patient.get(`/api/cases/${created.id}`).expect(403);
    await persona("patient", patient);
    const res = await patient.get(`/api/cases/${created.id}`).expect(200);
    expect(
      caseResponse.parse(res.body).data.fields.find((f) => f.key === "strength")
        ?.value,
    ).toBe("0.05 mg");
  });
});

describe("field review, revisions and explanation gate", () => {
  it("applies confirmations with revision checks and rejects stale writes", async () => {
    const patient = await persona("patient");
    const created = await createCase(patient);
    const confirm = {
      expectedRevision: 0,
      changes: [
        { key: "strength", value: "0.05 mg", reviewState: "user_confirmed" },
      ],
    };
    const res = await patient
      .patch(`/api/cases/${created.id}/fields`)
      .send(confirm)
      .expect(200);
    const updated = caseResponse.parse(res.body).data;
    expect(updated.revision).toBe(1);
    expect(updated.fields.find((f) => f.key === "strength")).toMatchObject({
      provenance: "user",
      reviewState: "user_confirmed",
    });
    const stale = await patient
      .patch(`/api/cases/${created.id}/fields`)
      .send(confirm)
      .expect(409);
    expect(errorCode(stale.body)).toBe("REVISION_CONFLICT");
    await patient
      .patch(`/api/cases/${created.id}/fields`)
      .send({
        expectedRevision: 1,
        changes: [
          { key: "strength", value: "1 mg", reviewState: "unreviewed" },
          { key: "strength", value: "2 mg", reviewState: "unreviewed" },
        ],
      })
      .expect(400);
  });

  it("blocks explanations until every critical field is confirmed, even via direct API calls", async () => {
    const patient = await persona("patient");
    const created = await createCase(patient);
    const blocked = await patient
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 0 })
      .expect(422);
    expect(errorCode(blocked.body)).toBe("NEEDS_CLARIFICATION");
    expect(JSON.stringify(blocked.body)).not.toContain("twice daily");

    const unreadable = await createCase(
      patient,
      clearText.replace("Strength: 0.05 mg", "Strength: [unreadable]"),
    );
    expect(unreadable.status).toBe("needs_help");
    const res = await patient
      .patch(`/api/cases/${unreadable.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: criticalKeys.map((key) => ({
          key,
          value: unreadable.fields.find((f) => f.key === key)?.value ?? null,
          reviewState: "user_confirmed",
        })),
      })
      .expect(200);
    expect(caseResponse.parse(res.body).data.status).toBe("needs_help");
    const stillBlocked = await patient
      .post(`/api/cases/${unreadable.id}/explanation`)
      .send({ expectedRevision: 1 })
      .expect(422);
    expect(errorCode(stillBlocked.body)).toBe("NEEDS_CLARIFICATION");
  });

  it("returns original directions verbatim with questions and no invented schedule", async () => {
    const patient = await persona("patient");
    const created = await createCase(patient);
    await patient
      .patch(`/api/cases/${created.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: criticalKeys.map((key) => ({
          key,
          value: created.fields.find((f) => f.key === key)?.value ?? null,
          reviewState: "user_confirmed",
        })),
      })
      .expect(200);
    await patient
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 0 })
      .expect(409);
    const res = await patient
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 1 })
      .expect(200);
    const body = explanationResponse.parse(res.body);
    expect(body.dataMode).toBe("fixture");
    expect(body.data).toMatchObject({
      originalDirections: "Take one tablet twice daily as needed.",
      simplifiedText: "Take one tablet twice daily as needed.",
      fieldRevision: 1,
      eligibleForExplanation: true,
      references: [],
    });
    expect(body.data.unresolvedQuestions.join(" ")).toMatch(/as needed/);
    expect(JSON.stringify(body.data)).not.toMatch(
      /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i,
    );

    const corrected = await patient
      .patch(`/api/cases/${created.id}/fields`)
      .send({
        expectedRevision: 1,
        changes: [
          { key: "strength", value: "0.5 mcg", reviewState: "unreviewed" },
        ],
      })
      .expect(200);
    expect(caseResponse.parse(corrected.body).data.status).toBe("reviewing");
    await patient
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 1 })
      .expect(409);
    await patient
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 2 })
      .expect(422);
  });

  it("routes taper-style directions to pharmacist questions instead of a simplified dose", async () => {
    const patient = await persona("patient");
    const created = await createCase(
      patient,
      clearText.replace(
        "Directions: Take one tablet twice daily as needed.",
        "Directions: Take two tablets daily for 3 days, then one tablet daily.",
      ),
    );
    await patient
      .patch(`/api/cases/${created.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: criticalKeys.map((key) => ({
          key,
          value: created.fields.find((f) => f.key === key)?.value ?? null,
          reviewState: "user_confirmed",
        })),
      })
      .expect(200);
    const res = await patient
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 1 })
      .expect(200);
    const data = explanationResponse.parse(res.body).data;
    expect(data.eligibleForExplanation).toBe(false);
    expect(data.simplifiedText).toBe("");
    expect(data.originalDirections).toBe(
      "Take two tablets daily for 3 days, then one tablet daily.",
    );
    expect(data.unresolvedQuestions.length).toBeGreaterThan(0);
  });
});

describe("image intake", () => {
  const upload = (
    agent: ReturnType<typeof request.agent>,
    bytes: Buffer,
    name = "label.png",
    ack = "true",
  ) =>
    agent
      .post("/api/cases")
      .field("fictionalDataAcknowledged", ack)
      .attach("image", bytes, { filename: name, contentType: "image/png" });

  it("stores valid PNG/JPEG uploads and leaves every field unresolved in fixture mode", async () => {
    const patient = await persona("patient");
    for (const bytes of [syntheticPng(640, 480), syntheticJpeg(800, 600)]) {
      const res = await upload(patient, bytes).expect(201);
      const body = caseResponse.parse(res.body);
      expect(body.dataMode).toBe("fixture");
      expect(body.data.status).toBe("needs_help");
      for (const f of body.data.fields)
        expect(f).toMatchObject({
          value: null,
          rawText: null,
          reviewState: "unresolved",
        });
      expect(body.data.fields[0].evidence).toMatch(/fixture mode/);
    }
  });

  it("rejects by content, not by filename or declared type", async () => {
    const patient = await persona("patient");
    const svg = await upload(
      patient,
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      "label.png",
    ).expect(415);
    expect(errorCode(svg.body)).toBe("UNSUPPORTED_IMAGE");
    await upload(patient, Buffer.from("<html></html>"), "label.jpg").expect(
      415,
    );
    await upload(patient, syntheticPng(30000, 30000)).expect(415);
    const big = await upload(
      patient,
      Buffer.concat([syntheticPng(64, 64), Buffer.alloc(5 * 1024 * 1024)]),
    ).expect(413);
    expect(errorCode(big.body)).toBe("IMAGE_TOO_LARGE");
    await upload(patient, syntheticPng(640, 480), "label.png", "false").expect(
      400,
    );
  });
});

describe("expiry, deletion, limits and logging", () => {
  it("expires cases after 60 minutes and deletes on request", async () => {
    const patient = await persona("patient");
    const first = await createCase(patient);
    const second = await createCase(patient);
    const deleted = await patient.delete(`/api/cases/${second.id}`).expect(200);
    expect(deletionResponse.parse(deleted.body).data.deleted).toBe(true);
    await patient.get(`/api/cases/${second.id}`).expect(404);
    clock += 60 * 60 * 1000;
    const expired = await patient.get(`/api/cases/${first.id}`).expect(410);
    expect(errorCode(expired.body)).toBe("EXPIRED");
    await patient
      .patch(`/api/cases/${first.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: [
          { key: "strength", value: "1 mg", reviewState: "unreviewed" },
        ],
      })
      .expect(410);
  });

  it("throttles case creation with a retryable error", async () => {
    const patient = await persona("patient");
    for (let i = 0; i < 5; i++) await createCase(patient);
    const limited = await patient
      .post("/api/cases")
      .send({ text: clearText, fictionalDataAcknowledged: true })
      .expect(429);
    expect(apiError.parse(limited.body).error).toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
    });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("logs routing metadata only, never label text, case IDs or cookies", async () => {
    const patient = await persona("patient");
    const created = await createCase(patient);
    await patient.get(`/api/cases/${created.id}`).expect(200);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toMatch(
      /Fictional|0\.5 mg|twice daily|lb_demo_session/,
    );
    expect(serialized).not.toContain(created.id);
    expect(logs.map((l) => l.route)).toContain("/api/cases/:id");
    for (const entry of logs)
      expect(Object.keys(entry).sort()).toEqual([
        "latencyMs",
        "method",
        "providerMode",
        "requestId",
        "route",
        "status",
      ]);
  });

  it("distinguishes unknown routes from contract routes that need a session", async () => {
    expect(
      errorCode((await request(app).get("/api/nope").expect(404)).body),
    ).toBe("NOT_FOUND");
    expect(
      errorCode((await request(app).get("/api/reviews").expect(401)).body),
    ).toBe("UNAUTHORIZED");
  });
});
