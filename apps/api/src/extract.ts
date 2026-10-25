import { labelField, fieldKey } from "@labelbridge/contracts";
import type { Infer } from "./errors";

type Field = Infer<typeof labelField>;
type Key = Infer<typeof fieldKey>;
export type Extraction = { fields: Field[]; questions: string[] };

const criticalKeys: Key[] = [
  "medicationName",
  "strength",
  "dosageForm",
  "exactDirections",
];
const fieldNames: Record<Key, string> = {
  medicationName: "medication name",
  strength: "strength",
  dosageForm: "dosage form",
  quantity: "quantity",
  exactDirections: "directions",
};

const labelled: [Key, RegExp][] = [
  [
    "medicationName",
    /^(?:medication|medicine|drug(?: name)?|name)\s*[:-]\s*(.*)$/i,
  ],
  ["strength", /^(?:strength|dose strength)\s*[:-]\s*(.*)$/i],
  ["dosageForm", /^(?:dosage form|form)\s*[:-]\s*(.*)$/i],
  ["quantity", /^(?:qty|quantity|dispense|disp)\.?\s*[:#-]?\s*(.*)$/i],
  ["exactDirections", /^(?:directions|sig|instructions)\s*[:-]\s*(.*)$/i],
];
const otherLabel = /^[A-Za-z][A-Za-z .#/]{0,30}:/;
const directionVerb =
  /^(?:take|apply|use|inhale|instill|insert|place|chew|dissolve|inject|spray|give|swallow|rub|mix|shake)\b/i;
// Leading-dot and comma decimals are deliberately not matched; they stay
// unresolved rather than being read as a different amount.
const strengthPattern =
  /(?<![\w.,])\d+(?:\.\d+)?\s?(?:mcg|µg|mg|g|mL|ml|L|units?|IU|mEq|%)(?:\s?\/\s?\d*(?:\.\d+)?\s?(?:mL|ml|L|g|actuation|dose|hr|h))?(?![A-Za-z])/gi;
const hasStrengthUnit = new RegExp(strengthPattern.source, "i");
const formPattern =
  /\b(?:tablets?|capsules?|caplets?|solution|suspension|syrup|elixir|cream|ointment|gel|lotion|patch(?:es)?|inhaler|drops|injection|spray|powder|suppositor(?:y|ies)|lozenges?)\b/gi;
const releaseModifier =
  /\b(?:extended|delayed|sustained|controlled|immediate)[- ]release\b|\b(?:ER|XR|XL|SR|CR|DR|LA|ODT|chewable|disintegrating)\b/i;
const unreadableMarker =
  /^\[?\s*(?:unreadable|illegible|smudged|unclear|torn|\?+)\s*\]?$/i;

type Found = { value: string | null; evidence: string };

const notFound = "Not found in the provided text.";

function field(key: Key, found: Found | undefined): Field {
  const value = found?.value?.trim() || null;
  return labelField.parse({
    key,
    rawText: value,
    value,
    evidence: found?.evidence ?? notFound,
    crop: null,
    provenance: "ai",
    reviewState: value ? "unreviewed" : "unresolved",
  });
}

// Deterministic, conservative extraction from user-supplied label text. The
// text is untrusted data: it is only pattern-matched, never interpreted as
// instructions. Values are exact substrings, and ambiguity leaves a field
// unresolved instead of choosing a candidate.
export function extractFromText(text: string): Extraction {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim());
  const found = new Map<Key, Found>();
  const conflicts = new Set<Key>();
  const used = new Set<number>();
  // At most one question per field; specific reasons override the default.
  const asks = new Map<Key, string>();

  const record = (key: Key, value: Found) => {
    const prior = found.get(key);
    if (prior && prior.value !== value.value) conflicts.add(key);
    else found.set(key, value);
  };
  const isLabelLine = (line: string) =>
    labelled.some(([, pattern]) => pattern.test(line)) || otherLabel.test(line);
  const continuation = (start: number) => {
    let end = start + 1;
    while (end < lines.length && lines[end] && !isLabelLine(lines[end])) end++;
    return end;
  };

  lines.forEach((line, index) => {
    if (used.has(index)) return;
    for (const [key, pattern] of labelled) {
      const match = pattern.exec(line);
      if (!match) continue;
      used.add(index);
      let value = match[1].trim();
      let evidence = line;
      if (key === "exactDirections") {
        const end = continuation(index);
        const block = lines.slice(index + 1, end);
        block.forEach((_, offset) => used.add(index + 1 + offset));
        value = [value, ...block].filter(Boolean).join("\n");
        evidence = lines.slice(index, end).join("\n");
      }
      if (key === "quantity" && !/^\d/.test(value)) value = "";
      if (key === "strength" && value && !hasStrengthUnit.test(value)) {
        value = "";
        if (!unreadableMarker.test(match[1].trim()))
          asks.set(
            "strength",
            "The strength is missing a unit (for example mg or mcg). What does the label show?",
          );
      }
      record(key, {
        value: !value || unreadableMarker.test(value) ? null : value,
        evidence,
      });
      return;
    }
  });

  if (!found.has("exactDirections")) {
    const blocks: Found[] = [];
    lines.forEach((line, index) => {
      if (used.has(index) || !directionVerb.test(line)) return;
      const end = continuation(index);
      for (let i = index; i < end; i++) used.add(i);
      const block = lines.slice(index, end).join("\n");
      blocks.push({ value: block, evidence: block });
    });
    if (blocks.length === 1) found.set("exactDirections", blocks[0]);
    if (blocks.length > 1) conflicts.add("exactDirections");
  }

  const descriptive = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => line && !used.has(index));

  if (!found.has("strength")) {
    const matches = descriptive.flatMap(({ line }) =>
      [...line.matchAll(strengthPattern)].map((m) => ({ line, match: m })),
    );
    const distinct = new Set(matches.map((m) => m.match[0]));
    if (distinct.size === 1) {
      const { line, match } = matches[0];
      found.set("strength", { value: match[0], evidence: line });
      if (!found.has("medicationName")) {
        const name = line.slice(0, match.index).replace(/[\s,;:-]+$/, "");
        if (name) found.set("medicationName", { value: name, evidence: line });
      }
    }
    if (distinct.size > 1) conflicts.add("strength");
  }

  if (!found.has("dosageForm")) {
    const matches = descriptive.flatMap(({ line }) =>
      [...line.matchAll(formPattern)].map((m) => ({ line, form: m[0] })),
    );
    const distinct = new Set(matches.map((m) => m.form.toLowerCase()));
    if (distinct.size === 1)
      found.set("dosageForm", {
        value: matches[0].form,
        evidence: matches[0].line,
      });
    if (distinct.size > 1) conflicts.add("dosageForm");
  }

  const form = found.get("dosageForm");
  if (
    form?.value &&
    !releaseModifier.test(form.value) &&
    descriptive.some(({ line }) => releaseModifier.test(line))
  ) {
    found.set("dosageForm", { value: null, evidence: form.evidence });
    asks.set(
      "dosageForm",
      "The label mentions a release type (for example extended-release). What is the exact dosage form?",
    );
  }

  for (const key of conflicts) {
    found.delete(key);
    asks.set(
      key,
      `More than one ${fieldNames[key]} appears in the text. Which one applies to this prescription?`,
    );
  }

  const fields = fieldKey.options.map((key) => field(key, found.get(key)));
  const questions = fields
    .filter((f) => f.reviewState === "unresolved")
    .flatMap(
      (f) =>
        asks.get(f.key) ??
        (criticalKeys.includes(f.key)
          ? [
              `The ${fieldNames[f.key]} could not be read from the text. Please check the label or ask for reading help.`,
            ]
          : []),
    );
  return { fields, questions };
}

export function hasUnresolvedCritical(fields: Field[]) {
  return fields.some(
    (f) =>
      criticalKeys.includes(f.key) &&
      (f.reviewState === "unresolved" || !f.value?.trim()),
  );
}

/**
 * The explicit "nothing was read" state for an image. `attempted` means a
 * provider is configured but did not return a usable result; the distinction is
 * kept so the UI never implies extraction ran when it did not.
 */
export function unresolvedImageExtraction(
  reason: "not_configured" | "attempted" = "not_configured",
): Extraction {
  const evidence =
    reason === "attempted"
      ? "Not read: the image extraction provider was unavailable."
      : "Not read: no live image extraction provider is configured (fixture mode).";
  const fields = fieldKey.options.map((key) =>
    labelField.parse({
      key,
      rawText: null,
      value: null,
      evidence,
      crop: null,
      provenance: "ai",
      reviewState: "unresolved",
    }),
  );
  return {
    fields,
    questions: [
      "This image was stored but not read automatically. Enter the label text, or request human reading help.",
    ],
  };
}
