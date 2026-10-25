import request from "supertest";
import { createApp, type AppOptions } from "../../../apps/api/src/app";
import { AccountStore } from "../../../apps/api/src/accounts";
import { caseResponse } from "../../../packages/contracts/src/index";

export const LISINOPRIL = [
  "Medication: Lisinopril",
  "Strength: 10 mg",
  "Form: tablet",
  "Quantity: 30",
  "Directions: Take one tablet by mouth once daily.",
].join("\n");

export type Agent = ReturnType<typeof request.agent>;

/** An app with a controllable clock and an explicit volunteer allowlist. */
export function testApp(options: AppOptions & { approved?: string[] } = {}) {
  const clock = { now: Date.parse("2026-10-25T12:00:00.000Z") };
  const now = () => clock.now;
  const accounts = new AccountStore(now, new Set(options.approved ?? []));
  const app = createApp(undefined, {
    now,
    log: () => {},
    accounts,
    limits: {
      api: { limit: 10_000, windowMs: 60_000 },
      intake: { limit: 1000, windowMs: 60_000 },
    },
    ...options,
  });
  return { app, clock, agent: () => request.agent(app) };
}

export async function signup(
  agent: Agent,
  name: string,
  email: string,
  uses = { supporter: false, volunteer: false },
) {
  const res = await agent
    .post("/api/account/signup")
    .send({
      name,
      email,
      password: "correct horse battery",
      uses,
      fictionalDataAcknowledged: true,
    })
    .expect(201);
  return res.body.data.account as { id: string; volunteerStatus: string };
}

export async function createCase(agent: Agent, text = LISINOPRIL) {
  await agent.post("/api/session").send({ role: "patient" });
  const res = await agent
    .post("/api/cases")
    .send({ text, fictionalDataAcknowledged: true })
    .expect(201);
  return caseResponse.parse(res.body).data;
}

/** Confirms the four required fields exactly as extracted. */
export async function confirmAll(
  agent: Agent,
  caseId: string,
  revision: number,
  fields: { key: string; value: string | null }[],
) {
  const res = await agent
    .patch(`/api/cases/${caseId}/fields`)
    .send({
      expectedRevision: revision,
      changes: fields
        .filter((f) => f.key !== "quantity")
        .map((f) => ({
          key: f.key,
          value: f.value,
          reviewState: "user_confirmed",
        })),
    })
    .expect(200);
  return caseResponse.parse(res.body).data;
}

export const code = (body: { error?: { code?: string } }) => body.error?.code;
