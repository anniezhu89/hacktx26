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
 * rawText null + an unreadable marker as evidence (e.g. "[unreadable]", the
 * fixture and backend convention) → unreadable; rawText null otherwise →
 * missing (its evidence is an explanatory note, not label text);
 * rawText present but no value or still unresolved → unclear.
 */
export type FieldCondition = "readable" | "unreadable" | "unclear" | "missing";

// Mirrors the backend's unreadable-marker pattern in apps/api/src/extract.ts.
const UNREADABLE_MARKER =
  /^\[?\s*(?:unreadable|illegible|smudged|unclear|torn|\?+)\s*\]?$/i;

export function fieldCondition(field: LabelField): FieldCondition {
  if (field.rawText === null)
    return UNREADABLE_MARKER.test(field.evidence.trim())
      ? "unreadable"
      : "missing";
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
    title: "Not read",
    detail:
      "Nothing was read for this field. Type what your label says, or leave it unknown.",
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

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length &&
  sig.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** Format named by the file's leading bytes; names and MIME types are ignored. */
export function sniffImageFormat(bytes: Uint8Array) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
    return "webp";
  if (startsWith(bytes, ascii("GIF8"))) return "gif";
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (/^avi[fs]$/.test(brand)) return "avif";
    if (/^(?:hei[cxms]|hev[cxms]|mif1|msf1)$/.test(brand)) return "heic";
  }
  if (startsWith(bytes, ascii("BM"))) return "bmp";
  if (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  )
    return "tiff";
  if (startsWith(bytes, ascii("%PDF"))) return "pdf";
  // SVG, HTML and XML are text: skip a byte-order mark and leading spaces.
  const text = String.fromCharCode(...bytes).replace(
    /^\uFEFF|^\xEF\xBB\xBF/,
    "",
  );
  if (/^\s*</.test(text)) return "markup";
  return "unknown";
}

const OTHER_FORMAT: Record<string, string> = {
  webp: "a WebP image",
  gif: "a GIF image",
  heic: "an HEIC photo (the iPhone camera format)",
  avif: "an AVIF image",
  bmp: "a BMP image",
  tiff: "a TIFF image",
  pdf: "a PDF document",
  markup: "a text-based file such as SVG or HTML",
};

const extensionOf = (name: string) => name.match(/\.([a-z0-9]+)$/i)?.[1];

/**
 * Returns a patient-facing error message, or null if the file is usable.
 * The decision rests on the file's contents; the server checks them again,
 * together with the image dimensions, after upload.
 */
export async function validateImageFile(file: FileLike) {
  if (file.size === 0)
    return "That file is empty (0 bytes). Choose a PNG or JPEG image.";
  if (file.size > MAX_IMAGE_BYTES)
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB; try a smaller photo or a screenshot.`;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const format = sniffImageFormat(head);
  if (format === "png" || format === "jpeg") return null;
  const ext = extensionOf(file.name);
  const named = ext ? `, even though its name ends in .${ext}` : "";
  if (format !== "unknown")
    return `This file is ${OTHER_FORMAT[format]}, not a PNG or JPEG${named}. Save or export it as PNG or JPEG, then choose that copy.`;
  return `This file's contents are not PNG or JPEG image data${named}, so it cannot be used. If it opens as a picture on your device, save or export it as PNG or JPEG and choose that copy.`;
}
