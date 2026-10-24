import { useState } from "react";
import type { FieldsRequest } from "../api/client";
import {
  CONDITION_TEXT,
  FIELD_LABELS,
  PROVENANCE_TEXT,
  REVIEW_STATE_TEXT,
  canConfirm,
  fieldCondition,
  isCritical,
  type LabelField,
} from "../lib/fields";
import { ImageExcerpt } from "./ImageExcerpt";

type Change = FieldsRequest["changes"][number];

const STATE_ICON: Record<LabelField["reviewState"], string> = {
  unreviewed: "○",
  user_confirmed: "✓",
  needs_help: "?",
  unresolved: "!",
};

export function FieldCard({
  field,
  imageSrc,
  disabled,
  onChange,
}: {
  field: LabelField;
  imageSrc: string | null;
  disabled: boolean;
  onChange: (change: Change, description: string) => void;
}) {
  const label = FIELD_LABELS[field.key];
  const [draft, setDraft] = useState(field.value ?? "");
  const [seen, setSeen] = useState(field.value);
  if (seen !== field.value) {
    setSeen(field.value);
    setDraft(field.value ?? "");
  }
  const dirty = draft !== (field.value ?? "");
  const condition = fieldCondition(field);
  const critical = isCritical(field.key);
  const id = `field-${field.key}`;
  const confirmed = field.reviewState === "user_confirmed";
  const confirmable = canConfirm(draft) && (dirty || !confirmed);
  const Input = field.key === "exactDirections" ? "textarea" : "input";
  const who = <span className="sr-only"> {label}</span>;

  return (
    <li className={`field-card state-${field.reviewState}`}>
      <div className="field-head">
        <h3 id={`${id}-heading`}>
          {label}
          {critical && <span className="tag">Required check</span>}
        </h3>
        <p className="state-text">
          <span aria-hidden="true" className="state-icon">
            {STATE_ICON[field.reviewState]}
          </span>{" "}
          {REVIEW_STATE_TEXT[field.reviewState]}
        </p>
      </div>

      {condition !== "readable" && (
        <div className={`condition condition-${condition}`}>
          <p>
            <strong>{CONDITION_TEXT[condition].title}.</strong>{" "}
            {CONDITION_TEXT[condition].detail}
          </p>
        </div>
      )}

      <div className="field-body">
        <div className="evidence">
          <p className="evidence-label">On the label</p>
          {imageSrc && field.crop && (
            <ImageExcerpt
              src={imageSrc}
              crop={field.crop}
              label={`Enlarged label excerpt for ${label}${condition === "missing" ? "" : `: ${field.evidence}`}`}
            />
          )}
          {condition === "missing" || !field.evidence ? (
            // Evidence here is an explanation from the reader, not label text.
            <p className="hint">
              {field.evidence || "No label excerpt is available."}
            </p>
          ) : (
            <blockquote>{field.evidence}</blockquote>
          )}
        </div>

        <div className="value stack-sm">
          <p>
            Current value:{" "}
            {field.value === null ? (
              <strong className="unknown">Unknown (left blank)</strong>
            ) : (
              <strong>{field.value}</strong>
            )}
          </p>
          <p className="meta">
            Filled in by: {PROVENANCE_TEXT[field.provenance]}
          </p>
          <label htmlFor={`${id}-input`} className="field-label">
            Edit {label.toLowerCase()}
          </label>
          <Input
            id={`${id}-input`}
            value={draft}
            disabled={disabled}
            aria-describedby={`${id}-hint`}
            onChange={(e) => setDraft(e.target.value)}
            {...(Input === "textarea" ? { rows: 3 } : { type: "text" })}
          />
          <p id={`${id}-hint`} className="hint">
            {field.key === "exactDirections"
              ? "Keep the exact wording from the label. Do not add times or doses that are not printed."
              : "Copy exactly what is printed, including decimals and units."}{" "}
            {!canConfirm(draft) &&
              "A blank field cannot be confirmed; it stays unknown."}
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={disabled || !confirmable}
              onClick={() =>
                onChange(
                  {
                    key: field.key,
                    value: draft.trim(),
                    reviewState: "user_confirmed",
                  },
                  `${label} confirmed as matching the label.`,
                )
              }
            >
              {dirty
                ? "Save and confirm"
                : confirmed
                  ? "Confirmed"
                  : "Confirm it matches the label"}
              {who}
            </button>
            {dirty && (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      {
                        key: field.key,
                        value: draft.trim() || null,
                        reviewState: draft.trim() ? "unreviewed" : "unresolved",
                      },
                      `${label} edit saved. It still needs your confirmation.`,
                    )
                  }
                >
                  Save edit without confirming{who}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setDraft(field.value ?? "")}
                >
                  Undo edit{who}
                </button>
              </>
            )}
            {!dirty &&
              (field.value !== null || field.reviewState !== "unresolved") && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      {
                        key: field.key,
                        value: null,
                        reviewState: "unresolved",
                      },
                      `${label} marked unknown.`,
                    )
                  }
                >
                  Mark as unknown{who}
                </button>
              )}
            {!dirty && field.reviewState !== "needs_help" && (
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    {
                      key: field.key,
                      value: field.value,
                      reviewState: "needs_help",
                    },
                    `${label} marked as needing help.`,
                  )
                }
              >
                I need help with this{who}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
