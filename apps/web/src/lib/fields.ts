import type { Case } from "@labelbridge/contracts";

export type LabelField = Case["fields"][number];
export type FieldKey = LabelField["key"];
export type ReviewState = LabelField["reviewState"];

export const FIELD_ORDER: FieldKey[] = [
  "medicationName",
  "strength",
  "dosageForm",
  "quantity",
  "exactDirections",
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  medicationName: "Medication name",
  strength: "Strength",
  dosageForm: "Dosage form",
  quantity: "Quantity",
  exactDirections: "Exact directions",
};

// Must match eligibleForExplanation in @labelbridge/contracts.
export const CRITICAL_KEYS: FieldKey[] = [
  "medicationName",
  "strength",
  "dosageForm",
  "exactDirections",
];

export const isCritical = (key: FieldKey) => CRITICAL_KEYS.includes(key);

export const REVIEW_STATE_TEXT: Record<ReviewState, string> = {
  unreviewed: "Not checked yet",
  user_confirmed: "You confirmed it matches the label",
  needs_help: "Marked as needing help",
  unresolved: "Unresolved",
};

export const PROVENANCE_TEXT: Record<LabelField["provenance"], string> = {
  ai: "Automatic reading",
  user: "You",
  volunteer: "Volunteer transcription",
};

/**
 * How the label text itself was read, separate from what the patient later
 * typed. "unreadable": text exists but could not be read. "unclear": text was
 * read but its meaning is unclear. "missing": nothing was extracted.
 *
 * The contract has no explicit issue marker yet, so this is derived:
 * rawText null + evidence → unreadable; rawText null + no evidence → missing;
 * rawText present but no value or still unresolved → unclear.
 */
export type FieldCondition = "readable" | "unreadable" | "unclear" | "missing";

export function fieldCondition(field: LabelField): FieldCondition {
  if (field.rawText === null)
    return field.evidence.trim() ? "unreadable" : "missing";
  if (field.value === null || field.reviewState === "unresolved")
    return "unclear";
  return "readable";
}

export const CONDITION_TEXT: Record<
  Exclude<FieldCondition, "readable">,
  { title: string; detail: string }
> = {
  unreadable: {
    title: "Unreadable on the label",
    detail:
      "The text in this spot could not be read. Type it only if you can read it yourself, or leave it unknown and ask for help.",
  },
  unclear: {
    title: "Readable, but the meaning is unclear",
    detail:
      "The words were read, but what they mean is not clear. Keep the exact wording; a question for the pharmacist is a good next step.",
  },
  missing: {
    title: "Not found",
    detail:
      "Nothing was extracted for this field. Type what your label says, or leave it unknown.",
  },
};

export function canConfirm(draft: string) {
  return draft.trim().length > 0;
}

export function reviewProgress(fields: LabelField[]) {
  const critical = fields.filter((f) => isCritical(f.key));
  const confirmed = critical.filter(
    (f) => f.reviewState === "user_confirmed" && !!f.value?.trim(),
  );
  return {
    confirmed: confirmed.length,
    total: critical.length,
    outstanding: critical.filter((f) => !confirmed.includes(f)),
  };
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type FileLike = Pick<File, "name" | "size" | "type" | "slice">;

function hasImageSignature(bytes: Uint8Array) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const jpeg = [0xff, 0xd8, 0xff];
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  return starts(png) || starts(jpeg);
}

/** Returns a patient-facing error message, or null if the file is usable. */
export async function validateImageFile(file: FileLike) {
  if (file.size === 0) return "That file is empty. Choose a PNG or JPEG photo.";
  if (file.size > MAX_IMAGE_BYTES)
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB; try a smaller photo or a screenshot.`;
  if (!["image/png", "image/jpeg"].includes(file.type))
    return "Only PNG or JPEG photos are accepted. Other file types, including SVG and PDF, cannot be used.";
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!hasImageSignature(head))
    return "This file does not look like a real PNG or JPEG image. Try taking a new photo.";
  return null;
}
