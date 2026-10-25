import { caseSchema, type Case } from "@labelbridge/contracts";
import ambiguousFixture from "../../fixtures/ambiguous.json";
import clearFixture from "../../fixtures/clear.json";
import unreadableFixture from "../../fixtures/unreadable.json";
import type { FieldKey } from "../../apps/web/src/lib/fields";

type Crop = NonNullable<Case["fields"][number]["crop"]>;

export interface SampleLabel {
  id: "clear" | "unreadable" | "unclear";
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  /** Text version sent to the text-intake route. */
  text: string;
  /** Where each field appears on the sample image (normalized 0–1). */
  crops: Record<FieldKey, Crop>;
  /** Shared synthetic fixture this sample corresponds to. */
  fixture: Case;
}

const crops: Record<FieldKey, Crop> = {
  medicationName: { x: 0.04, y: 0.29, width: 0.82, height: 0.14 },
  strength: { x: 0.04, y: 0.44, width: 0.21, height: 0.14 },
  dosageForm: { x: 0.25, y: 0.44, width: 0.2, height: 0.14 },
  quantity: { x: 0.04, y: 0.59, width: 0.45, height: 0.14 },
  exactDirections: { x: 0.04, y: 0.75, width: 0.82, height: 0.15 },
};

const header = "FICTIONAL DEMO PHARMACY - NOT A REAL PRESCRIPTION";

const clear = caseSchema.parse(clearFixture);
const unclear = caseSchema.parse(ambiguousFixture);

export const SAMPLES: SampleLabel[] = [
  {
    id: "clear",
    title: "Clear label",
    description: "Every field is readable.",
    imageUrl: "/samples/clear-label.svg",
    imageAlt:
      "Fictional label: Levothyroxine Sodium, 0.05 mg tablet, quantity 30, take one tablet twice daily as needed.",
    text: `${header}\nLevothyroxine Sodium\n0.05 mg tablet\nQty: 30\nTake one tablet twice daily as needed.`,
    crops,
    fixture: clear,
  },
  {
    id: "unreadable",
    title: "Smudged strength",
    description: "The strength is smudged and cannot be read.",
    imageUrl: "/samples/unreadable-label.svg",
    imageAlt:
      "Fictional label: Levothyroxine Sodium, strength smudged and unreadable, tablet, quantity 30, take one tablet twice daily as needed.",
    text: `${header}\nLevothyroxine Sodium\n[smudged] tablet\nQty: 30\nTake one tablet twice daily as needed.`,
    crops,
    fixture: caseSchema.parse(unreadableFixture),
  },
  {
    id: "unclear",
    title: "Unclear directions",
    description: "Everything is readable, but the directions are vague.",
    imageUrl: "/samples/unclear-label.svg",
    imageAlt:
      "Fictional label: Levothyroxine Sodium, 0.05 mg tablet, quantity 30, use as directed.",
    text: `${header}\nLevothyroxine Sodium\n0.05 mg tablet\nQty: 30\nUse as directed.`,
    crops,
    fixture: unclear,
  },
];

export const findSample = (id: string) => SAMPLES.find((s) => s.id === id);
