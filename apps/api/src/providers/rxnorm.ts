import type { MedicineCandidate } from "@labelbridge/contracts";
import { ProviderError } from "./shared";

type Fetch = typeof fetch;
type Check = MedicineCandidate["match"]["checks"][number];
export type MedicineQuery = {
  medicationName: string;
  strength: string;
  dosageForm: string;
};

const base = "https://rxnav.nlm.nih.gov/REST";
const timeoutMs = 12_000;
const maxCandidates = 6;

// Salt and ester words a label often leaves out of the ingredient name.
const SALTS = new Set(
  "hydrochloride hcl sodium potassium calcium magnesium maleate besylate mesylate succinate tartrate citrate fumarate sulfate phosphate acetate bromide chloride monohydrate dihydrate anhydrous hyclate".split(
    " ",
  ),
);
const UNIT_FACTOR: Record<string, number> = {
  mcg: 0.001,
  ug: 0.001,
  mg: 1,
  g: 1000,
};
const FORM_WORDS =
  "tablet capsule solution suspension syrup elixir cream ointment gel lotion patch inhaler spray powder suppository lozenge injection drops film".split(
    " ",
  );
const FORM_MODIFIERS = [
  "chewable",
  "disintegrating",
  "effervescent",
  "sublingual",
  "buccal",
  "film coated",
  "topical",
  "ophthalmic",
  "otic",
  "nasal",
];
const LABEL_RELEASE =
  /\b(?:ER|XR|XL|SR|CR|LA)\b|extended|sustained|controlled|\b(?:12|24)\s*hr?\b/i;
const LABEL_DELAYED = /\bDR\b|delayed|enteric/i;

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Parses "levothyroxine sodium 0.05 MG Oral Tablet [Euthyrox]". */
export function parseConceptName(name: string) {
  const brand = name.match(/\[([^\]]+)\]\s*$/)?.[1] ?? null;
  const body = name.replace(/\s*\[[^\]]+\]\s*$/, "");
  const parts = body.split(" / ");
  const strengthRe =
    /^(.*?)\s+(\d+(?:\.\d+)?\s+(?:MG|MCG|G|UNT|MEQ|ML|%|ACTUAT)(?:\/(?:ML|ACTUAT|HR|G))?)(.*)$/i;
  const ingredients: string[] = [];
  const strengths: string[] = [];
  let doseForm: string | null = null;
  for (const [i, part] of parts.entries()) {
    const m = part.match(strengthRe);
    if (!m) return null;
    ingredients.push(m[1].trim().toLowerCase());
    strengths.push(m[2].trim());
    if (i === parts.length - 1) doseForm = m[3].trim() || null;
  }
  const form = doseForm ?? "";
  const releaseType: MedicineCandidate["releaseType"] =
    /extended release|\b\d+ HR\b/i.test(form)
      ? "extended"
      : /delayed release/i.test(form)
        ? "delayed"
        : "not_stated";
  return { brand, ingredients, strengths, doseForm, releaseType };
}

function parseAmount(text: string) {
  const m = text
    .toLowerCase()
    .replace("µg", "mcg")
    .match(
      /(\d+(?:\.\d+)?)\s*(mcg|ug|mg|g|unt|units?|meq|ml|%)(?:\s*\/\s*(\d+(?:\.\d+)?)?\s*(ml|g|actuat|actuation|hr))?/,
    );
  if (!m) return null;
  const unit = m[2].startsWith("unit") || m[2] === "unt" ? "unit" : m[2];
  return {
    amount: Number(m[1]),
    unit,
    per: m[4] ? `${m[3] ?? "1"} ${m[4].replace("actuation", "actuat")}` : null,
  };
}

function compareStrength(label: string, candidate: string[]): Check {
  const mine = parseAmount(label);
  if (!mine)
    return {
      attribute: "strength",
      status: "unknown",
      note: "The label strength could not be compared.",
    };
  if (candidate.length !== 1)
    return {
      attribute: "strength",
      status: "mismatch",
      note: `This product lists ${candidate.length} strengths (${candidate.join(" / ")}); your label shows one.`,
    };
  const theirs = parseAmount(candidate[0]);
  if (!theirs)
    return {
      attribute: "strength",
      status: "unknown",
      note: "The reference strength could not be compared.",
    };
  if ((mine.per ?? "") !== (theirs.per ?? ""))
    return {
      attribute: "strength",
      status: "mismatch",
      note: `Strength is measured differently: label "${label}", reference "${candidate[0]}".`,
    };
  if (mine.unit === theirs.unit && mine.amount === theirs.amount)
    return {
      attribute: "strength",
      status: "match",
      note: `Both show ${candidate[0].toLowerCase()} per unit.`,
    };
  const a = UNIT_FACTOR[mine.unit],
    b = UNIT_FACTOR[theirs.unit];
  if (a && b && Math.abs(mine.amount * a - theirs.amount * b) < 1e-9)
    return {
      attribute: "strength",
      status: "equivalent",
      note: `"${label}" equals ${candidate[0].toLowerCase()} (same amount, different unit).`,
    };
  return {
    attribute: "strength",
    status: "mismatch",
    note: `Label shows "${label}"; this product is ${candidate[0].toLowerCase()}.`,
  };
}

export function matchCandidate(
  query: MedicineQuery,
  concept: { rxcui: string; name: string; tty: string },
): MedicineCandidate | null {
  const parsed = parseConceptName(concept.name);
  if (!parsed || (concept.tty !== "SCD" && concept.tty !== "SBD")) return null;
  const labelWords = new Set(words(query.medicationName));
  const labelAll = `${query.medicationName} ${query.strength} ${query.dosageForm}`;
  const brandNamed =
    !!parsed.brand && words(parsed.brand).every((w) => labelWords.has(w));
  const checks: Check[] = [];

  const ingredientStates = parsed.ingredients.map((ing) => {
    const w = words(ing);
    if (w.every((x) => labelWords.has(x))) return "match";
    if (labelWords.has(w[0]) && w.slice(1).every((x) => SALTS.has(x)))
      return "equivalent";
    return "mismatch";
  });
  const missing = parsed.ingredients.filter(
    (_, i) => ingredientStates[i] === "mismatch",
  );
  if (brandNamed)
    checks.push({
      attribute: "ingredients",
      status: "equivalent",
      note: `Your label names the brand ${parsed.brand}, which contains ${parsed.ingredients.join(" and ")}.`,
    });
  else if (missing.length)
    checks.push({
      attribute: "ingredients",
      status: "mismatch",
      note:
        parsed.ingredients.length > 1
          ? `This combination product also contains ${missing.join(" and ")}, which your label does not name.`
          : `Your label does not name ${missing.join(", ")}.`,
    });
  else
    checks.push({
      attribute: "ingredients",
      status: ingredientStates.every((s) => s === "match")
        ? "match"
        : "equivalent",
      note: ingredientStates.every((s) => s === "match")
        ? `Ingredient: ${parsed.ingredients.join(" and ")}.`
        : `Ingredient ${parsed.ingredients.join(" and ")}; your label leaves out the salt name.`,
    });

  checks.push(compareStrength(query.strength, parsed.strengths));

  const form = (parsed.doseForm ?? "").toLowerCase();
  const labelForm = query.dosageForm.toLowerCase();
  const formWord = FORM_WORDS.find((f) => labelForm.includes(f));
  const modifierGap = FORM_MODIFIERS.filter(
    (m) => labelForm.includes(m) !== form.includes(m),
  );
  checks.push(
    !formWord
      ? {
          attribute: "form",
          status: "unknown",
          note: `The label form "${query.dosageForm}" could not be compared.`,
        }
      : form.includes(formWord) && !modifierGap.length
        ? {
            attribute: "form",
            status: "match",
            note: `Both are ${parsed.doseForm?.toLowerCase()}.`,
          }
        : {
            attribute: "form",
            status: "mismatch",
            note: `Label says "${query.dosageForm}"; this product is ${parsed.doseForm?.toLowerCase() ?? "a different form"}.`,
          },
  );

  const labelRelease = LABEL_DELAYED.test(labelAll)
    ? "delayed"
    : LABEL_RELEASE.test(labelAll)
      ? "extended"
      : "not_stated";
  checks.push(
    labelRelease === parsed.releaseType
      ? {
          attribute: "release",
          status: "match",
          note:
            labelRelease === "not_stated"
              ? "Neither says extended- or delayed-release."
              : `Both are ${labelRelease}-release.`,
        }
      : {
          attribute: "release",
          status: "mismatch",
          note:
            labelRelease === "not_stated"
              ? `This product is ${parsed.releaseType}-release; your label does not say so.`
              : `Your label suggests ${labelRelease}-release; this product is not.`,
        },
  );

  if (parsed.brand)
    checks.push(
      brandNamed
        ? {
            attribute: "brand",
            status: "match",
            note: `Brand ${parsed.brand}.`,
          }
        : {
            attribute: "brand",
            status: "not_on_label",
            note: `This is the ${parsed.brand} brand product; your label does not name that brand.`,
          },
    );

  const status = (a: Check["attribute"]) =>
    checks.find((c) => c.attribute === a)?.status;
  const ok = (s?: Check["status"]) => s === "match" || s === "equivalent";
  const level = checks.some((c) => c.status === "mismatch")
    ? "conflict"
    : ok(status("ingredients")) &&
        ok(status("strength")) &&
        status("form") === "match" &&
        status("release") === "match"
      ? "formulation"
      : "partial";
  return {
    rxcui: concept.rxcui,
    name: concept.name,
    termType: concept.tty,
    brand: parsed.brand,
    ingredients: parsed.ingredients,
    strengths: parsed.strengths,
    doseForm: parsed.doseForm,
    releaseType: parsed.releaseType,
    match: { level, checks },
  } as MedicineCandidate;
}

async function getJson(url: string, fetchImpl: Fetch) {
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ProviderError(
      `rxnorm request failed (${error instanceof Error ? error.name : "unknown"})`,
      true,
    );
  }
  if (!response.ok)
    throw new ProviderError(
      `rxnorm ${response.status}`,
      response.status === 429 || response.status >= 500,
    );
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderError("rxnorm returned invalid JSON", false);
  }
}

/**
 * Looks up clinical (SCD) and branded (SBD) products for the confirmed label
 * name and checks each against the label. Nothing is chosen here: the patient
 * confirms one candidate explicitly. Only name, strength and form are sent.
 */
export async function findCandidates(
  query: MedicineQuery,
  fetchImpl: Fetch = fetch,
) {
  const body = (await getJson(
    `${base}/drugs.json?name=${encodeURIComponent(query.medicationName.trim())}`,
    fetchImpl,
  )) as {
    drugGroup?: {
      conceptGroup?: {
        tty?: string;
        conceptProperties?: { rxcui: string; name: string; tty: string }[];
      }[];
    };
  };
  const concepts = (body.drugGroup?.conceptGroup ?? []).flatMap(
    (g) => g.conceptProperties ?? [],
  );
  const matched = concepts
    .map((c) => matchCandidate(query, c))
    .filter((c): c is MedicineCandidate => c !== null);
  const relevant = matched.filter((c) => {
    const check = (a: Check["attribute"]) =>
      c.match.checks.find((k) => k.attribute === a)?.status;
    // A generic label is compared with generic products; brands only when named.
    if (c.brand && check("brand") !== "match") return false;
    if (check("ingredients") !== "mismatch") return true;
    // Combinations that include the label's ingredient are kept as conflicts,
    // so the patient sees the extra ingredient instead of a silent swap.
    return c.ingredients.length > 1 && check("form") === "match";
  });
  const rank = { formulation: 0, partial: 1, conflict: 2 } as const;
  const misses = (c: MedicineCandidate) =>
    c.match.checks.filter((k) => k.status === "mismatch").length;
  const candidates = relevant
    .sort(
      (a, b) =>
        rank[a.match.level] - rank[b.match.level] ||
        misses(a) - misses(b) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, maxCandidates);
  const exact = candidates.filter((c) => c.match.level === "formulation");
  const status: "single" | "multiple" | "none" =
    candidates.length === 0
      ? "none"
      : exact.length === 1 && candidates.length === 1
        ? "single"
        : "multiple";
  return { status, candidates };
}
