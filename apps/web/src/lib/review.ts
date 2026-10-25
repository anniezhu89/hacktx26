import type { FieldsRequest } from "../api/client";
import type { LabelField } from "./fields";

type Change = FieldsRequest["changes"][number];

/**
 * What a field card shows. "edited" means the patient has typed a change that
 * is not saved yet: any earlier confirmation no longer applies to it.
 */
export type DisplayState =
  "confirmed" | "needs_checking" | "edited" | "unknown" | "help";

export function displayState(field: LabelField, draft: string): DisplayState {
  if (draft !== (field.value ?? "")) return "edited";
  if (field.reviewState === "needs_help") return "help";
  if (field.value === null || field.reviewState === "unresolved")
    return "unknown";
  if (field.reviewState === "user_confirmed") return "confirmed";
  return "needs_checking";
}

export const DISPLAY_STATE: Record<
  DisplayState,
  { icon: string; text: string }
> = {
  confirmed: { icon: "✓", text: "Confirmed" },
  needs_checking: { icon: "○", text: "Needs checking" },
  edited: { icon: "✎", text: "Edited, not saved" },
  unknown: { icon: "?", text: "Unknown" },
  help: { icon: "!", text: "Help requested" },
};

/**
 * Change to save for a typed value. Confirming needs a non-blank value; saving
 * without confirming always clears an earlier confirmation, so an edited field
 * is never left marked as matching the label.
 */
export function editChange(
  key: LabelField["key"],
  draft: string,
  confirm: boolean,
): Change {
  const value = draft.trim();
  if (confirm && !value)
    throw new Error("A blank value cannot be confirmed; mark it unknown.");
  return {
    key,
    value: value || null,
    reviewState: confirm
      ? "user_confirmed"
      : value
        ? "unreviewed"
        : "unresolved",
  };
}

export const unknownChange = (key: LabelField["key"]): Change => ({
  key,
  value: null,
  reviewState: "unresolved",
});

export const helpChange = (field: LabelField): Change => ({
  key: field.key,
  value: field.value,
  reviewState: "needs_help",
});
