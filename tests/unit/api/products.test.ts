import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../../apps/api/src/app";
import { extractFromText } from "../../../apps/api/src/extract";
import {
  findSupportedProduct,
  referenceHosts,
  supportedProducts,
} from "../../../apps/api/src/products";
import { sampleLabels } from "../../../apps/api/src/samples";
import {
  caseResponse,
  explanationResponse,
} from "../../../packages/contracts/src/index";

const fieldsOf = (text: string) => extractFromText(text).fields;
const valueOf = (text: string, key: string) =>
  fieldsOf(text).find((f) => f.key === key)?.value;

describe("supported product catalog", () => {
  it("cites only allowlisted HTTPS sources and excludes dosing sentences", () => {
    for (const product of supportedProducts) {
      expect(product.references.length).toBeGreaterThan(0);
      for (const { url, passage } of product.references) {
        const parsed = new URL(url);
        expect(parsed.protocol).toBe("https:");
        expect(referenceHosts.has(parsed.hostname)).toBe(true);
        expect(passage).not.toMatch(
          /\b(?:once|twice|three times) a day\b|\busually taken\b|\d+\s?mg\b/i,
        );
      }
    }
  });

  it("matches exact product attributes only", () => {
    expect(
      findSupportedProduct(fieldsOf(sampleLabels.lisinoprilClear))?.id,
    ).toBe("lisinopril-10mg-tablet");
    expect(
      findSupportedProduct(fieldsOf(sampleLabels.metforminClear))?.id,
    ).toBe("metformin-500mg-tablet");
    for (const text of [
      sampleLabels.lisinoprilUnitMismatch,
      sampleLabels.metforminExtendedRelease,
      sampleLabels.atorvastatinUnreadable,
      sampleLabels.fictionalTaper,
      sampleLabels.lisinoprilClear.replace("10 mg", "20 mg"),
      sampleLabels.lisinoprilClear.replace("Lisinopril", "Zestril"),
      sampleLabels.lisinoprilClear.replace("tablet\n", "solution\n"),
    ])
      expect(findSupportedProduct(fieldsOf(text)), text).toBeUndefined();
  });

  it("sample labels exercise their intended extraction paths", () => {
    expect(valueOf(sampleLabels.lisinoprilUnitMismatch, "strength")).toBe(
      "10 mcg",
    );
    expect(valueOf(sampleLabels.atorvastatinUnreadable, "strength")).toBeNull();
    expect(
      valueOf(sampleLabels.metforminExtendedRelease, "dosageForm"),
    ).toBeNull();
    expect(valueOf(sampleLabels.metforminClear, "exactDirections")).toBe(
      "Take one tablet by mouth twice daily with meals.",
    );
  });
});

describe("explanations with references", () => {
  async function confirmedExplanation(text: string) {
    const agent = request.agent(createApp(undefined, { log: () => {} }));
    await agent.post("/api/session").send({ role: "patient" }).expect(200);
    const created = caseResponse.parse(
      (
        await agent
          .post("/api/cases")
          .send({ text, fictionalDataAcknowledged: true })
          .expect(201)
      ).body,
    ).data;
    await agent
      .patch(`/api/cases/${created.id}/fields`)
      .send({
        expectedRevision: 0,
        changes: [
          "medicationName",
          "strength",
          "dosageForm",
          "exactDirections",
        ].map((key) => ({
          key,
          value: created.fields.find((f) => f.key === key)?.value ?? null,
          reviewState: "user_confirmed",
        })),
      })
      .expect(200);
    const res = await agent
      .post(`/api/cases/${created.id}/explanation`)
      .send({ expectedRevision: 1 })
      .expect(200);
    return explanationResponse.parse(res.body).data;
  }

  it("attaches exact-product passages while keeping label directions separate", async () => {
    const data = await confirmedExplanation(sampleLabels.lisinoprilClear);
    expect(data.originalDirections).toBe(
      "Take one tablet by mouth once daily.",
    );
    expect(data.simplifiedText).toBe(data.originalDirections);
    expect(data.references.map((r) => r.url)).toEqual(
      Array(4).fill("https://medlineplus.gov/druginfo/meds/a692051.html"),
    );
    expect(data.unresolvedQuestions).toEqual([]);
  });

  it("gives no references and a pharmacist question for a mismatched unit", async () => {
    const data = await confirmedExplanation(
      sampleLabels.lisinoprilUnitMismatch,
    );
    expect(data.references).toEqual([]);
    expect(data.unresolvedQuestions.join(" ")).toMatch(
      /not in the demo reference set/,
    );
  });
});
