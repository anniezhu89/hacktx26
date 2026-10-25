import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../../apps/api/src/app";
import { AccountStore } from "../../../apps/api/src/accounts";
import { ApiError, createHttpClient } from "../../../apps/web/src/api/client";
import { createWorkspaceClient } from "../../../apps/web/src/api/workspace";
import {
  cropBox,
  dimensionProblem,
  rotatedSize,
} from "../../../apps/web/src/lib/photo";
import { pickVoice } from "../../../apps/web/src/state/useSpeech";
import { sharedView } from "../../../packages/contracts/src/index";

describe("photo rules", () => {
  it("applies the server's decoded-dimension limits", () => {
    expect(dimensionProblem(640, 480)).toBeNull();
    expect(dimensionProblem(20, 480)).toMatchObject({ kind: "dimensions" });
    expect(dimensionProblem(9000, 100)).toMatchObject({ kind: "dimensions" });
    expect(dimensionProblem(7000, 7000)).toMatchObject({ kind: "dimensions" }); // 49 MP
  });

  it("computes crop and rotation sizes deterministically", () => {
    expect(
      cropBox(1000, 500, { top: 10, right: 0, bottom: 10, left: 25 }),
    ).toEqual({ x: 250, y: 50, width: 750, height: 400 });
    // Trims are capped so a crop can never remove the whole image.
    expect(
      cropBox(100, 100, { top: 90, right: 90, bottom: 90, left: 90 }).width,
    ).toBe(10);
    expect(rotatedSize(800, 600, 1)).toEqual({ width: 600, height: 800 });
    expect(rotatedSize(800, 600, 2)).toEqual({ width: 800, height: 600 });
  });
});

describe("speech", () => {
  it("uses only on-device voices in the chosen language", () => {
    const voices = [
      { lang: "es-ES", localService: false },
      { lang: "en-US", localService: true },
      { lang: "es-MX", localService: true },
    ];
    expect(pickVoice(voices, "es")).toEqual({
      lang: "es-MX",
      localService: true,
    });
    expect(
      pickVoice([{ lang: "es-ES", localService: false }], "es"),
    ).toBeNull();
  });
});

describe("workspace client against the real API", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const app = createApp(undefined, {
      log: () => {},
      accounts: new AccountStore(Date.now),
    });
    server = await new Promise<Server>((r) => {
      const s = app.listen(0, "127.0.0.1", () => r(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  // One browser: the HttpOnly cookie is shared by both clients.
  const browser = () => {
    let cookie = "";
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const res = await fetch(base + url, { ...init, headers });
      const set = res.headers.getSetCookie();
      if (set.length) cookie = set[0].split(";")[0];
      return res;
    }) as typeof fetch;
    return {
      cases: createHttpClient(fetchImpl),
      workspace: createWorkspaceClient(fetchImpl),
    };
  };

  it("saves a guest label to a new account only when asked", async () => {
    const b = browser();
    const { case: c } = await b.cases.createCase({
      kind: "text",
      text: "Medication: Lisinopril\nStrength: 10 mg\nForm: tablet\nQuantity: 30\nDirections: Take one tablet daily.",
    });
    const { data } = await b.workspace.signup({
      name: "June",
      email: "june.client@example.test",
      password: "correct horse battery",
      uses: { supporter: false, volunteer: false },
    });
    expect(data.account?.name).toBe("June");
    expect((await b.workspace.savedLabels()).data).toEqual([]);
    const saved = (await b.workspace.saveLabel(c.id)).data;
    expect(saved.map((l) => l.caseId)).toEqual([c.id]);
    expect(saved[0].title).toBeNull(); // not confirmed, so not used as a title
    const recovery = await b.workspace
      .recover("june.client@example.test")
      .catch((e) => e);
    expect(recovery).toBeInstanceOf(ApiError);
    expect(recovery).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("invites, accepts and shows the supporter exactly what the preview shows", async () => {
    const owner = browser();
    await owner.workspace.signup({
      name: "June",
      email: "june.owner@example.test",
      password: "correct horse battery",
      uses: { supporter: false, volunteer: false },
    });
    const { case: created } = await owner.cases.createCase({
      kind: "text",
      text: "Medication: Lisinopril\nStrength: 10 mg\nForm: tablet\nQuantity: 30\nDirections: Take one tablet daily.",
    });
    const { case: c } = await owner.cases.updateFields(created.id, {
      expectedRevision: created.revision,
      changes: [
        {
          key: "medicationName",
          value: "Lisinopril",
          reviewState: "user_confirmed",
        },
      ],
    });
    await owner.workspace.saveLabel(c.id);
    const { data: invite } = await owner.workspace.invite(
      "Alex",
      "reading_and_tasks",
    );
    const helper = browser();
    await helper.workspace.signup({
      name: "Alex",
      email: "alex.helper@example.test",
      password: "correct horse battery",
      uses: { supporter: true, volunteer: false },
    });
    await helper.workspace.respondToInvite(invite.code, "accept");
    const connection = (await owner.workspace.circle()).data.connections[0];
    await owner.workspace.setGrant(connection.id, c.id, {
      fieldKeys: ["medicationName", "strength"],
      image: false,
    });
    const [shared] = (await helper.workspace.sharedWithMe()).data;
    const latest = (await owner.cases.getCase(c.id)).case;
    const preview = sharedView({
      ...latest,
      sharing: { supporter: true, fieldKeys: ["medicationName", "strength"] },
    })!;
    expect(shared.fields).toEqual(preview.fields);
    // Strength was never confirmed, so neither side shows its value.
    expect(shared.fields.find((f) => f.key === "strength")!.value).toBeNull();
  });
});
