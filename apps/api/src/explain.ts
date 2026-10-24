import {
  eligibleForExplanation,
  explanation,
  type Case,
} from "@labelbridge/contracts";
import { ApiError, type Infer } from "./errors";
import { findSupportedProduct } from "./products";

const complexDirections =
  /\b(?:taper|then|decrease|increase|alternate|alternating|day\s*\d|week\s*\d|until|sliding scale)\b/i;
const asNeeded = /\b(?:as needed|as directed|prn)\b/i;
const scheduled =
  /\b(?:once|twice|three times|four times|every|daily|nightly|hourly|a day|per day)\b/i;

// Fixture mode produces no paraphrase: the patient's directions are returned
// verbatim and never converted into clock times or routine schedules.
export function buildExplanation(current: Case): Infer<typeof explanation> {
  if (!eligibleForExplanation(current.fields)) {
    const pending = current.fields
      .filter(
        (f) =>
          f.key !== "quantity" &&
          (f.reviewState !== "user_confirmed" || !f.value?.trim()),
      )
      .map((f) => f.key);
    throw new ApiError(
      "NEEDS_CLARIFICATION",
      `Confirm these fields before an explanation is available: ${pending.join(", ")}.`,
    );
  }
  const directions =
    current.fields.find((f) => f.key === "exactDirections")?.value ?? "";
  const questions: string[] = [];
  const complex = complexDirections.test(directions);
  if (complex)
    questions.push(
      "These directions change over time or depend on conditions. Ask your pharmacist to walk through each step.",
    );
  if (asNeeded.test(directions) && scheduled.test(directions))
    questions.push(
      "The directions include both a frequency and 'as needed' (or 'as directed'). Ask your pharmacist when a dose should and should not be taken.",
    );
  const product = findSupportedProduct(current.fields);
  if (!product)
    questions.push(
      "This exact medication, strength and form is not in the demo reference set. Ask your pharmacist for the written drug information that comes with it.",
    );
  return explanation.parse({
    originalDirections: directions,
    simplifiedText: complex ? "" : directions,
    fieldRevision: current.revision,
    references: product?.references ?? [],
    unresolvedQuestions: questions,
    eligibleForExplanation: !complex,
  });
}
