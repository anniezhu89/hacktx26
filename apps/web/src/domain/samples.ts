import { CONTRACT_VERSION } from "./types";
import type { LabelField, LabelLine, MedCase } from "./types";

export type Sample = {
  id: string;
  title: string;
  drug: string;
  situation: string;
  lines: LabelLine[];
  fields: LabelField[];
};

function printed(key: LabelField["key"], value: string, evidence: string, reviewState: LabelField["reviewState"] = "unreviewed"): LabelField {
  return {
    key,
    rawText: value,
    value,
    evidenceExcerpt: evidence,
    provenance: "ai",
    reviewState,
  };
}

function line(text: string, key: LabelLine["key"], unreadable = false): LabelLine {
  return unreadable ? { text, key, unreadable: true } : { text, key };
}

export const SAMPLES: Sample[] = [
  {
    id: "lisinopril",
    title: "Clear label",
    drug: "Lisinopril 10 MG tablets",
    situation: "Every critical field can be read. Use this for the full demo path.",
    lines: [
      line("LISINOPRIL", "medicationName"),
      line("10 MG", "strength"),
      line("TABLET", "dosageForm"),
      line("Take 1 tablet by mouth once daily.", "directions"),
      line("QTY 30", "quantity"),
    ],
    fields: [
      printed("medicationName", "LISINOPRIL", "LISINOPRIL"),
      printed("strength", "10 MG", "10 MG"),
      printed("dosageForm", "TABLET", "TABLET"),
      printed("quantity", "30", "QTY 30"),
      printed("directions", "Take 1 tablet by mouth once daily.", "Take 1 tablet by mouth once daily."),
    ],
  },
  {
    id: "metformin",
    title: "Unreadable strength",
    drug: "Metformin tablets",
    situation: "The strength line cannot be read, so a dosing explanation stays off.",
    lines: [
      line("METFORMIN", "medicationName"),
      line("Strength", "strength", true),
      line("TABLET", "dosageForm"),
      line("Take 1 tablet by mouth twice daily with meals.", "directions"),
      line("QTY 60", "quantity"),
    ],
    fields: [
      printed("medicationName", "METFORMIN", "METFORMIN"),
      {
        key: "strength",
        rawText: null,
        value: null,
        evidenceExcerpt: "The strength line is smudged. No digits are visible.",
        provenance: "ai",
        reviewState: "unresolved",
      },
      printed("dosageForm", "TABLET", "TABLET"),
      printed("quantity", "60", "QTY 60"),
      printed("directions", "Take 1 tablet by mouth twice daily with meals.", "Take 1 tablet by mouth twice daily with meals."),
    ],
  },
  {
    id: "albuterol",
    title: "As needed",
    drug: "Albuterol inhaler",
    situation: "Directions stay as needed. The demo must not invent clock times.",
    lines: [
      line("ALBUTEROL", "medicationName"),
      line("90 MCG/ACTUATION", "strength"),
      line("INHALER", "dosageForm"),
      line("Inhale 2 puffs by mouth every 4 to 6 hours as needed for wheezing.", "directions"),
      line("QTY 1 INHALER", "quantity"),
    ],
    fields: [
      printed("medicationName", "ALBUTEROL", "ALBUTEROL"),
      printed("strength", "90 MCG/ACTUATION", "90 MCG/ACTUATION"),
      printed("dosageForm", "INHALER", "INHALER"),
      printed("quantity", "1 inhaler", "QTY 1 INHALER"),
      printed(
        "directions",
        "Inhale 2 puffs by mouth every 4 to 6 hours as needed for wheezing.",
        "Inhale 2 puffs by mouth every 4 to 6 hours as needed for wheezing.",
      ),
    ],
  },
];

function shell(input: Pick<MedCase, "source" | "sampleId" | "title" | "situation" | "lines" | "imageUrl" | "imageAlt" | "fields">): MedCase {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    revision: 1,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    fictionalData: true,
    contractVersion: CONTRACT_VERSION,
    requestId: crypto.randomUUID(),
    dataMode: "fixture",
    meaningUnclear: false,
    questions: [],
    tasks: [],
    preferences: { availability: "weeknights", transport: "pickup", budget: "lowest" },
    planReady: false,
    sharingEnabled: false,
    explanation: null,
    savings: null,
    review: null,
    clearedNote: false,
    ...input,
  };
}

function emptyFields(): LabelField[] {
  return (["medicationName", "strength", "dosageForm", "quantity", "directions"] as const).map((key) => ({
    key,
    rawText: null,
    value: null,
    evidenceExcerpt: null,
    provenance: "user" as const,
    reviewState: "unresolved" as const,
  }));
}

export function buildSampleCase(sampleId: string) {
  const sample = SAMPLES.find((item) => item.id === sampleId);
  if (!sample) throw new Error(`Unknown sample ${sampleId}`);
  return shell({
    source: "sample",
    sampleId: sample.id,
    title: sample.title,
    situation: sample.situation,
    lines: sample.lines,
    imageUrl: null,
    imageAlt: "",
    fields: sample.fields.map((field) => ({ ...field })),
  });
}

export function buildTextCase(text: string) {
  const printedText = text.trim().slice(0, 2000);
  const fields = emptyFields().map((field) =>
    field.key === "directions"
      ? {
          ...field,
          rawText: printedText,
          value: printedText,
          evidenceExcerpt: printedText,
          reviewState: "unreviewed" as const,
        }
      : field,
  );
  return shell({
    source: "text",
    sampleId: null,
    title: "Typed directions",
    situation: "Text intake keeps the words you typed and does not guess a drug name.",
    lines: [{ text: printedText, key: "directions" }],
    imageUrl: null,
    imageAlt: "",
    fields,
  });
}

export function buildUploadCase(imageUrl: string, fileName: string) {
  return shell({
    source: "upload",
    sampleId: null,
    title: fileName,
    situation: "The image is here for review. This demo does not read uploaded files, so every field starts blank.",
    lines: [],
    imageUrl,
    imageAlt: `Uploaded file ${fileName}. This demo does not extract text from it.`,
    fields: emptyFields(),
  });
}
