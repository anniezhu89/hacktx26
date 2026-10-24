import type { Case } from "@labelbridge/contracts";

// Supported demo products: real generic drug names paired with fictional
// labels. Each passage is copied verbatim from the cited MedlinePlus page
// (checked against the live page text on 2026-10-24). Passages are general
// reference only; dose and frequency sentences are deliberately excluded so
// they can never compete with the patient's own label directions.
export type SupportedProduct = {
  id: string;
  // Accepted spellings, compared after trimming, lowercasing and collapsing
  // whitespace. Anything else is unsupported; there is no nearest match.
  medicationNames: string[];
  strengths: string[];
  dosageForms: string[];
  references: { passage: string; url: string }[];
  retrievedAt: string;
};

export const referenceHosts = new Set(["medlineplus.gov"]);

const followLabel =
  "Follow the directions on your prescription label carefully, and ask your doctor or pharmacist to explain any part you do not understand.";

export const supportedProducts: SupportedProduct[] = [
  {
    id: "lisinopril-10mg-tablet",
    medicationNames: ["lisinopril"],
    strengths: ["10 mg", "10mg"],
    dosageForms: ["tablet", "tablets"],
    retrievedAt: "2026-10-24",
    references: [
      "Lisinopril is used alone or in combination with other medications to treat high blood pressure in adults and children 6 years of age and older.",
      "Lisinopril is in a class of medications called angiotensin-converting enzyme (ACE) inhibitors.",
      followLabel,
      "Do not stop taking lisinopril without talking to your doctor.",
    ].map((passage) => ({
      passage,
      url: "https://medlineplus.gov/druginfo/meds/a692051.html",
    })),
  },
  {
    id: "metformin-500mg-tablet",
    medicationNames: ["metformin", "metformin hydrochloride", "metformin hcl"],
    strengths: ["500 mg", "500mg"],
    dosageForms: ["tablet", "tablets"],
    retrievedAt: "2026-10-24",
    references: [
      "Metformin is used alone or with other medications, including insulin, to treat type 2 diabetes (condition in which the body does not use insulin normally and, therefore, cannot control the amount of sugar in the blood).",
      "Metformin is in a class of drugs called biguanides.",
      followLabel,
      "Do not stop taking metformin without talking to your doctor.",
    ].map((passage) => ({
      passage,
      url: "https://medlineplus.gov/druginfo/meds/a696005.html",
    })),
  },
  {
    id: "atorvastatin-20mg-tablet",
    medicationNames: ["atorvastatin", "atorvastatin calcium"],
    strengths: ["20 mg", "20mg"],
    dosageForms: ["tablet", "tablets"],
    retrievedAt: "2026-10-24",
    references: [
      "Atorvastatin is in a class of medications called HMG-CoA reductase inhibitors (statins).",
      "It works by slowing how much cholesterol your body makes.",
      "Take atorvastatin exactly as directed.",
      "Do not stop taking atorvastatin without talking to your doctor.",
    ].map((passage) => ({
      passage,
      url: "https://medlineplus.gov/druginfo/meds/a600045.html",
    })),
  },
];

for (const product of supportedProducts)
  for (const { url } of product.references) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !referenceHosts.has(parsed.hostname))
      throw new Error(`Reference host not allowlisted for ${product.id}`);
  }

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function findSupportedProduct(fields: Case["fields"]) {
  const get = (key: string) =>
    normalize(fields.find((f) => f.key === key)?.value);
  return supportedProducts.find(
    (p) =>
      p.medicationNames.includes(get("medicationName")) &&
      p.strengths.includes(get("strength")) &&
      p.dosageForms.includes(get("dosageForm")),
  );
}
