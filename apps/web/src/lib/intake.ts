import type { ApiError } from "../api/client";

export type IntakeMode = "image" | "text";

// Matches intakeRequest.text in @labelbridge/contracts (max 20,000).
export const MAX_TEXT = 20000;

/** Everything the patient has entered on the first step, kept across steps. */
export interface IntakeDraft {
  mode: IntakeMode;
  file: File | null;
  /** Problem found when the file was chosen, or null. */
  fileError: string | null;
  text: string;
  acknowledged: boolean;
}

export const emptyDraft = (mode: IntakeMode = "image"): IntakeDraft => ({
  mode,
  file: null,
  fileError: null,
  text: "",
  acknowledged: false,
});

export type IntakeProblem = {
  target: "photo" | "text" | "ack";
  message: string;
};

/**
 * What must be fixed before submitting. The server validates again; this only
 * saves a round trip and points the patient at the control to fix.
 */
export function intakeProblems(draft: IntakeDraft): IntakeProblem[] {
  const problems: IntakeProblem[] = [];
  if (draft.mode === "image" && !draft.file)
    problems.push({
      target: "photo",
      message: draft.fileError ?? "Choose a PNG or JPEG photo of the label.",
    });
  if (draft.mode === "text") {
    if (!draft.text.trim())
      problems.push({
        target: "text",
        message: "Type or paste the words from the label.",
      });
    else if (draft.text.length > MAX_TEXT)
      problems.push({
        target: "text",
        message: `Label text can be at most ${MAX_TEXT.toLocaleString()} characters.`,
      });
  }
  if (!draft.acknowledged)
    problems.push({
      target: "ack",
      message: "Confirm that this is fictional demo information.",
    });
  return problems;
}

/** True when leaving would throw away something the patient typed or chose. */
export function draftHasContent(draft: IntakeDraft) {
  return draft.text.trim().length > 0 || draft.file !== null;
}

/**
 * Photo problems the server found after upload, worded for the photo control.
 * Its own message says which check failed (damaged data, dimensions, format).
 * Other failures, such as a reading service being down, return null so they
 * keep the general error banner and its retry.
 */
export function uploadErrorMessage(error: Pick<ApiError, "code" | "message">) {
  if (error.code === "IMAGE_TOO_LARGE")
    return "The server did not accept this photo because it is larger than 5 MB. Choose a smaller PNG or JPEG.";
  if (error.code === "UNSUPPORTED_IMAGE")
    return `The server could not use this photo: ${error.message} Choose a different PNG or JPEG file.`;
  return null;
}
