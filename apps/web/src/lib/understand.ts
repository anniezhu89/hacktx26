import type { Case, savingsOption } from "@labelbridge/contracts";

export type SavingsOption = ReturnType<typeof savingsOption.parse>;
type Fields = Case["fields"];

// Clock times such as "8 AM", "8:00", "20:30" or "noon". Explanations must
// never add a time the label does not state.
const CLOCK_TIME =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2}|noon|midnight)\b/gi;

export function clockTimes(text: string) {
  return [...text.matchAll(CLOCK_TIME)].map((m) =>
    m[0].toLowerCase().replace(/\s+|\./g, ""),
  );
}

/** Times in the simplified text that are not in the original directions. */
export function inventedClockTimes(original: string, simplified: string) {
  const allowed = new Set(clockTimes(original));
  return clockTimes(simplified).filter((t) => !allowed.has(t));
}

const norm = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const confirmedValue = (fields: Fields, key: Fields[number]["key"]) => {
  const f = fields.find((x) => x.key === key);
  return f?.reviewState === "user_confirmed" && f.value?.trim()
    ? f.value
    : null;
};

export type MatchState = "match" | "mismatch" | "unknown";

const PRODUCT_KEYS = [
  "medicationName",
  "strength",
  "dosageForm",
  "quantity",
] as const;

/**
 * Compare a source's product attributes with the patient's confirmed fields.
 * Unknown on either side stays unknown; only exact (normalized) text matches.
 * "0.5 mg" vs "0.5 mcg" or "tablet" vs "capsule" is a mismatch.
 */
export function productMatch(option: SavingsOption, fields: Fields) {
  const attributes = PRODUCT_KEYS.map((key) => {
    const mine = confirmedValue(fields, key);
    const theirs = option.matchedProduct[key];
    const state: MatchState =
      mine === null || theirs === null
        ? "unknown"
        : norm(mine) === norm(theirs)
          ? "match"
          : "mismatch";
    return { key, mine, theirs, state };
  });
  return {
    attributes,
    // A price is comparable only when every attribute, including quantity,
    // is confirmed and matches.
    comparable: attributes.every((a) => a.state === "match"),
    mismatch: attributes.some((a) => a.state === "mismatch"),
  };
}

/** A price may be shown only with evidence, currency and a known basis. */
export function displayablePrice(option: SavingsOption) {
  if (
    option.amount === null ||
    option.currency === null ||
    option.priceBasis === "unknown" ||
    !option.sourceEvidence
  )
    return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: option.currency,
  }).format(option.amount);
}
