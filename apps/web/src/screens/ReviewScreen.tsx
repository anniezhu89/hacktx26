import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { FieldKey } from "../domain/types";
import { FIELD_META, fieldMeta, getField, provenanceLabel, reviewLabel } from "../domain/rules";
import { useCase } from "../state/CaseContext";
import { LabelFace } from "../components/LabelFace";
import { QuestionPanel } from "../components/QuestionPanel";
import { Alert, Page, Pill, reviewTone } from "../components/ui";

export function ReviewScreen() {
  const {
    medCase,
    updateField,
    setReviewState,
    confirmReadable,
    setMeaningUnclear,
    requestReading,
    applyProposed,
    dismissProposed,
    attachImage,
    setPersona,
    pending,
  } = useCase();
  const [activeKey, setActiveKey] = useState<FieldKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"sage" | "rose" | "amber">("sage");
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<FieldKey[]>([]);
  const [consent, setConsent] = useState(false);
  const helpTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!medCase) return;
    const initial = medCase.fields
      .filter((field) => field.reviewState === "unresolved" || field.reviewState === "needs_help")
      .map((field) => field.key);
    setSelected(initial);
  }, [medCase?.id]);

  useEffect(() => {
    if (helpOpen) helpTitle.current?.focus();
  }, [helpOpen]);

  if (!medCase) return null;

  const review = medCase.review;
  const proposalKeys = review?.proposals.filter((item) => item.value.trim()).map((item) => item.key) ?? [];

  function report(error: string | null, success: string, failure: "rose" | "amber" = "rose") {
    setMessage(error ?? success);
    setMessageTone(error ? failure : "sage");
  }

  return (
    <Page
      kicker="Review"
      title="Check every critical field against the label."
      lede="A match means the transcription matches what you see. It is not a clinical approval. Leave a field blank when you cannot read it."
    >
      <p className="lb-muted">{medCase.situation}</p>
      {message ? (
        <Alert tone={messageTone} title={messageTone === "rose" ? "Needs attention" : "Updated"}>
          <p>{message}</p>
        </Alert>
      ) : null}
      {review?.status === "needs_new_image" ? (
        <Alert tone="amber" title="A reviewer asked for a clearer image">
          <p>The previous reading was not applied. Upload another photo or keep the fields you can already read.</p>
        </Alert>
      ) : null}
      {review?.status === "submitted" ? (
        <section className="lb-card lb-stack" aria-labelledby="proposal-title">
          <h2 id="proposal-title" className="lb-h2">
            A reviewer proposed a reading
          </h2>
          <p>This is a separate step. It does not confirm the fields and it is not a medication check.</p>
          {review.conflict ? <p>{review.conflict}</p> : null}
          <ul className="lb-stack">
            {review.selectedFields.map((key) => {
              const proposal = review.proposals.find((item) => item.key === key);
              const current = getField(medCase, key);
              return (
                <li key={key} className="lb-task">
                  <strong>{fieldMeta(key).label}</strong>
                  <p>Current: {current.value ?? "Blank"}</p>
                  <p>Proposed: {proposal?.value?.trim() || "Left blank"}</p>
                  {proposal?.value.trim() ? (
                    <button
                      type="button"
                      className="lb-btn lb-btn-secondary"
                      onClick={() =>
                        report(
                          applyProposed([key]),
                          "That reading is in the field. It still needs you to mark whether it matches the label.",
                        )
                      }
                    >
                      Use this reading
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="lb-actions">
            {proposalKeys.length > 1 ? (
              <button
                type="button"
                className="lb-btn lb-btn-primary"
                onClick={() =>
                  report(
                    applyProposed(proposalKeys),
                    "Proposed readings are in the fields. They still need you to mark what matches the label.",
                  )
                }
              >
                Use all proposed readings
              </button>
            ) : null}
            <button type="button" className="lb-btn lb-btn-quiet" onClick={dismissProposed}>
              Dismiss the proposal
            </button>
          </div>
        </section>
      ) : null}

      <div className="lb-split">
        <LabelFace
          lines={medCase.lines}
          imageUrl={medCase.imageUrl}
          imageAlt={medCase.imageAlt}
          activeKey={activeKey}
          onPick={(key) => {
            setActiveKey(key);
            document.getElementById(`field-${key}`)?.focus();
          }}
        />
        <div className="lb-stack">
          <div className="lb-cluster">
            <button
              type="button"
              className="lb-btn lb-btn-secondary"
              onClick={() =>
                report(confirmReadable(), "Readable critical fields were marked as matches. Unreadable fields were left unresolved.")
              }
            >
              Mark readable critical fields as matches
            </button>
          </div>
          {FIELD_META.map((meta) => {
            const field = getField(medCase, meta.key);
            return (
              <section key={meta.key} className="lb-card lb-stack" aria-labelledby={`label-${meta.key}`}>
                <div className="lb-cluster">
                  <h2 id={`label-${meta.key}`} className="lb-h2">
                    {meta.label}
                  </h2>
                  {meta.critical ? <Pill tone="ink">Critical</Pill> : <Pill tone="plain">Needed for prices</Pill>}
                  <Pill tone={reviewTone(field.reviewState)}>{reviewLabel(field.reviewState)}</Pill>
                  <Pill tone="plain">{provenanceLabel(field.provenance)}</Pill>
                </div>
                <label className="lb-field" htmlFor={`field-${meta.key}`}>
                  <span className="lb-sr">{meta.label} value</span>
                  <input
                    id={`field-${meta.key}`}
                    className="lb-input"
                    value={field.value ?? ""}
                    spellCheck={false}
                    autoComplete="off"
                    aria-required={meta.critical}
                    aria-describedby={`${meta.key}-hint ${meta.key}-evidence`}
                    onFocus={() => setActiveKey(meta.key)}
                    onChange={(event) => updateField(meta.key, event.target.value)}
                  />
                </label>
                <p id={`${meta.key}-hint`} className="lb-help">
                  {meta.hint}
                </p>
                <p id={`${meta.key}-evidence`} className="lb-help">
                  {field.evidenceExcerpt ? `On the label: “${field.evidenceExcerpt}”` : "No evidence excerpt is attached."}
                </p>
                {meta.key === "directions" ? (
                  <label className="lb-check">
                    <input
                      type="checkbox"
                      checked={medCase.meaningUnclear}
                      onChange={(event) => setMeaningUnclear(event.target.checked)}
                    />
                    <span>
                      The words are readable, but I am not sure what they mean. A dosing explanation stays off until this
                      is cleared.
                    </span>
                  </label>
                ) : null}
                <div className="lb-actions">
                  <button
                    type="button"
                    className="lb-btn lb-btn-primary"
                    disabled={!field.value}
                    onClick={() =>
                      report(
                        setReviewState(meta.key, "user_confirmed"),
                        `${meta.label} marked as matching the label. That is a reading check, not a clinical approval.`,
                      )
                    }
                  >
                    Matches the label
                  </button>
                  <button
                    type="button"
                    className="lb-btn lb-btn-secondary"
                    onClick={() => report(setReviewState(meta.key, "unresolved"), `${meta.label} marked as could not be read.`, "amber")}
                  >
                    Could not be read
                  </button>
                  <button
                    type="button"
                    className="lb-btn lb-btn-secondary"
                    onClick={() => report(setReviewState(meta.key, "needs_help"), `${meta.label} is waiting on a person.`, "amber")}
                  >
                    Ask a person to read this
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="lb-actions">
        <button
          type="button"
          className="lb-btn lb-btn-primary"
          aria-expanded={helpOpen}
          aria-controls="reading-help"
          onClick={() => setHelpOpen((open) => !open)}
        >
          Request a human reading
        </button>
        <a className="lb-btn lb-btn-secondary" href="#questions">
          Prepare pharmacist questions
        </a>
        <Link className="lb-btn lb-btn-secondary" to="/understand">
          Continue to plain language
        </Link>
      </div>

      <section className="lb-card lb-stack">
        <h2 className="lb-h2">Upload a clearer image</h2>
        <p className="lb-muted">
          JPEG or PNG, up to 5 MB. Confirmed fields go back to needing review. This demo still will not read the file.
        </p>
        <label className="lb-btn lb-btn-secondary">
          Choose a clearer JPEG or PNG
          <input
            className="lb-sr"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              report(attachImage(file), "New image attached. Confirmed fields need to be checked again.");
              event.target.value = "";
            }}
          />
        </label>
      </section>

      {helpOpen ? (
        <section id="reading-help" className="lb-card lb-stack" aria-labelledby="help-title">
          <h2 id="help-title" className="lb-h2" tabIndex={-1} ref={helpTitle}>
            Ask a reviewer to read selected fields
          </h2>
          <p className="lb-muted">
            The reviewer sees the label, not the fixture guesses. Their reply comes back as a proposal you still have to
            accept.
          </p>
          <fieldset className="lb-radios">
            <legend>Fields to share</legend>
            {FIELD_META.map((meta) => (
              <label key={meta.key} className="lb-radio">
                <input
                  type="checkbox"
                  checked={selected.includes(meta.key)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked ? [...current, meta.key] : current.filter((key) => key !== meta.key),
                    );
                  }}
                />
                <span>
                  {meta.label}
                  {meta.critical ? " · critical" : ""}
                </span>
              </label>
            ))}
          </fieldset>
          <label className="lb-check">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>I consent to a demo reviewer seeing this fictional label. No real patient identity is attached.</span>
          </label>
          <div className="lb-actions">
            <button
              type="button"
              className="lb-btn lb-btn-primary"
              onClick={() => {
                report(
                  requestReading(selected, consent),
                  "The reading request is open. Switch to the reviewer view to transcribe it.",
                )
              }}
            >
              Send reading request
            </button>
            <button type="button" className="lb-btn lb-btn-secondary" onClick={() => setPersona("reviewer")}>
              Open reviewer view
            </button>
          </div>
        </section>
      ) : null}

      {review && review.status !== "closed" && review.status !== "submitted" ? (
        <p className="lb-muted">
          Reading request {review.status.replaceAll("_", " ")} for revision {review.caseRevision}.
          {pending.review ? " Working…" : ""}
        </p>
      ) : null}

      <QuestionPanel />
    </Page>
  );
}
