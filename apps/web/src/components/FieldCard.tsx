import { useEffect, useState } from "react";
import type { FieldsRequest } from "../api/client";
import {
  CONDITION_TEXT,
  FIELD_LABELS,
  PROVENANCE_TEXT,
  canConfirm,
  fieldCondition,
  isCritical,
  type LabelField,
} from "../lib/fields";
import {
  DISPLAY_STATE,
  displayState,
  editChange,
  helpChange,
  unknownChange,
} from "../lib/review";
import { ImageExcerpt } from "./ImageExcerpt";

type Change = FieldsRequest["changes"][number];

export function FieldCard({
  field,
  imageSrc,
  disabled,
  onChange,
  onDirtyChange,
}: {
  field: LabelField;
  imageSrc: string | null;
  disabled: boolean;
  onChange: (change: Change, description: string) => void;
  onDirtyChange: (key: LabelField["key"], dirty: boolean) => void;
}) {
  const label = FIELD_LABELS[field.key];
  const [draft, setDraft] = useState(field.value ?? "");
  const [seen, setSeen] = useState(field.value);
  // A saved (or reloaded) value replaces the draft.
  if (seen !== field.value) {
    setSeen(field.value);
    setDraft(field.value ?? "");
  }
  const dirty = draft !== (field.value ?? "");
  useEffect(
    () => onDirtyChange(field.key, dirty),
    [field.key, dirty, onDirtyChange],
  );

  const state = displayState(field, draft);
  const condition = fieldCondition(field);
  const critical = isCritical(field.key);
  const id = `field-${field.key}`;
  const confirmed = state === "confirmed";
  const Input = field.key === "exactDirections" ? "textarea" : "input";
  const who = <span className="sr-only"> {label}</span>;
  const status = DISPLAY_STATE[state];

  return (
    <li className={`review-card field-card is-${state}`}>
      <header className="field-head">
        <h3 id={`${id}-heading`}>
          {label}
          {critical ? (
            <span className="tag">Required</span>
          ) : (
            <span className="tag tag-optional">Optional</span>
          )}
        </h3>
        <p className="status-pill">
          <span aria-hidden="true">{status.icon}</span> {status.text}
        </p>
      </header>

      {/* Describes the automatic reading; once the patient has set the value
          themselves (typed it, or marked it unknown), it no longer applies. */}
      {condition !== "readable" && field.provenance !== "user" && (
        <p className={`condition condition-${condition}`}>
          <strong>{CONDITION_TEXT[condition].title}.</strong>{" "}
          {CONDITION_TEXT[condition].detail}
        </p>
      )}

      <div className="source">
        <p className="source-label">Original source text</p>
        {imageSrc && field.crop && (
          <ImageExcerpt
            src={imageSrc}
            crop={field.crop}
            label={`Enlarged label excerpt for ${label}${condition === "missing" ? "" : `: ${field.evidence}`}`}
          />
        )}
        {condition === "missing" || !field.evidence ? (
          // Evidence here is a note from the reader, not label text.
          <p className="hint">
            {field.evidence || "No label excerpt is available."}
          </p>
        ) : (
          <blockquote>{field.evidence}</blockquote>
        )}
      </div>

      <label htmlFor={`${id}-input`} className="field-label">
        Value on the label{who}
      </label>
      <Input
        id={`${id}-input`}
        value={draft}
        disabled={disabled}
        placeholder="No readable value"
        aria-describedby={`${id}-hint ${id}-meta`}
        onChange={(e) => setDraft(e.target.value)}
        {...(Input === "textarea" ? { rows: 3 } : { type: "text" })}
      />
      <p id={`${id}-hint`} className="hint">
        {field.key === "exactDirections"
          ? "Keep the exact wording. Do not add times or doses that are not printed."
          : "Copy exactly what is printed, including decimals and units."}{" "}
        {dirty && field.reviewState === "user_confirmed"
          ? "Your edit replaces the confirmed value, so it needs confirming again."
          : !canConfirm(draft)
            ? "A blank value cannot be confirmed; it stays unknown."
            : ""}
      </p>
      <p id={`${id}-meta`} className="meta">
        Filled in by: {PROVENANCE_TEXT[field.provenance]}
      </p>

      <div className="field-actions">
        <button
          type="button"
          className="confirm-button"
          disabled={disabled || !canConfirm(draft) || (confirmed && !dirty)}
          onClick={() =>
            onChange(
              editChange(field.key, draft, true),
              `${label} confirmed as matching the label.`,
            )
          }
        >
          <span aria-hidden="true">✓ </span>
          {dirty
            ? "Save and confirm"
            : confirmed
              ? "Confirmed"
              : "Confirm it matches"}
          {who}
        </button>
        {dirty ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  editChange(field.key, draft, false),
                  `${label} edit saved. It still needs your confirmation.`,
                )
              }
            >
              Save without confirming{who}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setDraft(field.value ?? "")}
            >
              Undo edit{who}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={disabled || state === "unknown"}
              onClick={() =>
                onChange(unknownChange(field.key), `${label} marked unknown.`)
              }
            >
              <span aria-hidden="true">? </span>Mark as unknown{who}
            </button>
            <button
              type="button"
              disabled={disabled || state === "help"}
              onClick={() =>
                onChange(helpChange(field), `${label} marked as needing help.`)
              }
            >
              Get help{who}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
