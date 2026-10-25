/**
 * Generic medication names the savings search is allowed to run for.
 *
 * This exists because a search engine does not fail on a medication that does
 * not exist. In a 2026-10-24 spike, "LEVOTHIX 0.5 mg tablet price" — an
 * invented name — returned five results about levothyroxine, with real prices
 * ($4.00, $23.79, $155.61). Without an allowlist the demo would show one
 * medication's prices against a different medication's label.
 *
 * It is deliberately a short seed list, not a drug database. An unlisted name
 * produces an explicit "not identified" state, which is the safe answer: the
 * cost of refusing a real medication is an unhelpful screen, and the cost of
 * accepting a wrong one is a price for the wrong drug.
 *
 * `aliases` are brand names and spellings that resolve to the same generic.
 * They are matched, but the generic is what gets searched and reported.
 */
export type GenericDrug = { generic: string; aliases: string[] };

export const genericDrugs: GenericDrug[] = [
  {
    generic: "levothyroxine",
    aliases: [
      "levothyroxine sodium",
      "synthroid",
      "unithroid",
      "levoxyl",
      "euthyrox",
    ],
  },
  { generic: "metformin", aliases: ["metformin hydrochloride", "glucophage"] },
  { generic: "lisinopril", aliases: ["zestril", "prinivil"] },
  { generic: "amlodipine", aliases: ["amlodipine besylate", "norvasc"] },
  { generic: "atorvastatin", aliases: ["atorvastatin calcium", "lipitor"] },
  { generic: "simvastatin", aliases: ["zocor"] },
  {
    generic: "metoprolol",
    aliases: [
      "metoprolol succinate",
      "metoprolol tartrate",
      "lopressor",
      "toprol",
    ],
  },
  { generic: "losartan", aliases: ["losartan potassium", "cozaar"] },
  { generic: "omeprazole", aliases: ["prilosec"] },
  { generic: "pantoprazole", aliases: ["protonix"] },
  { generic: "gabapentin", aliases: ["neurontin"] },
  { generic: "sertraline", aliases: ["zoloft"] },
  { generic: "escitalopram", aliases: ["lexapro"] },
  { generic: "fluoxetine", aliases: ["prozac"] },
  { generic: "albuterol", aliases: ["salbutamol", "ventolin", "proair"] },
  { generic: "montelukast", aliases: ["singulair"] },
  { generic: "hydrochlorothiazide", aliases: ["microzide"] },
  { generic: "furosemide", aliases: ["lasix"] },
  { generic: "prednisone", aliases: ["deltasone"] },
  { generic: "amoxicillin", aliases: ["amoxil"] },
  { generic: "azithromycin", aliases: ["zithromax", "z-pak"] },
  { generic: "ibuprofen", aliases: ["advil", "motrin"] },
  { generic: "acetaminophen", aliases: ["paracetamol", "tylenol"] },
  { generic: "meclizine", aliases: ["antivert"] },
  { generic: "cetirizine", aliases: ["zyrtec"] },
  { generic: "loratadine", aliases: ["claritin"] },
  { generic: "insulin glargine", aliases: ["lantus", "basaglar", "semglee"] },
  { generic: "rosuvastatin", aliases: ["crestor"] },
  { generic: "warfarin", aliases: ["coumadin", "jantoven"] },
  { generic: "apixaban", aliases: ["eliquis"] },
];

const normalise = (value: string) =>
  value
    .toLowerCase()
    // Strength, form and packaging often share the line with the name.
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Resolves a label's medication name to an allowlisted generic, or null.
 *
 * Matching is on whole words only, so "meclizine" never matches inside an
 * unrelated word, and a label that merely mentions a listed drug in passing
 * is not treated as being that drug.
 */
export function identifyGeneric(medicationName: string | null): string | null {
  if (!medicationName) return null;
  const words = new Set(normalise(medicationName).split(" ").filter(Boolean));
  if (words.size === 0) return null;
  const contains = (phrase: string) =>
    phrase.split(" ").every((word) => words.has(word));
  for (const drug of genericDrugs)
    if (contains(drug.generic) || drug.aliases.some(contains))
      return drug.generic;
  return null;
}
