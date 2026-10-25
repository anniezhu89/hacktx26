import { useState } from "react";
import type { FieldKey } from "../domain/types";
import { fieldMeta, formatWhen, shortId } from "../domain/rules";
import { useCase } from "../state/CaseContext";
import { LabelFace } from "../components/LabelFace";
import { Alert, Page } from "../components/ui";

export function QueueScreen() {
  const { medCase, pending, claimReading, submitReading, requestNewImage, reloadReading, setPersona } = useCase();
  const [drafts, setDrafts] = useState<Partial<Record<FieldKey, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"sage" | "rose" | "amber">("sage");
  const review = medCase?.review ?? null;
  const active = review && review.status !== "closed";

  function show(error: string | null, success: string) {
    setMessage(error ?? success);
    setTone(error ? "rose" : "sage");
  }

  return (
    <Page
      kicker="Reviewer desk"
      title="Read only what you can see."
      lede="Fixture guesses are hidden here. Leave a field blank rather than guess. A submitted reading is a proposal, not a verification."
    >
      {message ? (
        <Alert tone={tone} title={tone === "sage" ? "Desk updated" : "Not sent"}>
          <p>{message}</p>
        </Alert>
      ) : null}
      {!medCase || !active || !review ? (
        <Alert tone="amber" title="No fictional label is waiting">
          <p>The patient requests help from the review screen. This queue is synthetic and is not a real reviewer service.</p>
        </Alert>
      ) : (
        <div className="lb-split">
          <div className="lb-stack">
            <LabelFace lines={medCase.lines} imageUrl={medCase.imageUrl} imageAlt={medCase.imageAlt || "Fictional label"} />
            <p className="lb-faint">
              Case {shortId(medCase.id)} · Requested at revision {review.caseRevision} · Current revision {medCase.revision} ·{" "}
              {formatWhen(review.consentAt)}
            </p>
          </div>
          <div className="lb-stack">
            <section className="lb-card lb-stack">
              <h2 className="lb-h2">Request {review.status.replaceAll("_", " ")}</h2>
              <p>No patient name is attached. Transcribe the selected lines only.</p>
              {review.conflict ? (
                <Alert tone="rose" title="This reading is stale">
                  <p>{review.conflict}</p>
                  <button
                    type="button"
                    className="lb-btn lb-btn-secondary"
                    onClick={() => show(reloadReading(), "The desk is now on the current revision. Read the label again.")}
                  >
                    Reload the current label
                  </button>
                </Alert>
              ) : null}
              {review.status === "pending" ? (
                <button
                  type="button"
                  className="lb-btn lb-btn-primary"
                  disabled={pending.review}
                  onClick={() => {
                    void claimReading().then((error) =>
                      show(error, "You claimed this reading. Type only what you can see."),
                    );
                  }}
                >
                  {pending.review ? "Claiming…" : "Claim this reading"}
                </button>
              ) : null}
              {review.status === "needs_new_image" ? (
                <Alert tone="amber" title="Clearer image requested">
                  <p>You asked the patient for another photo. You cannot submit a transcription for this request.</p>
                </Alert>
              ) : null}
              {review.status === "submitted" ? (
                <Alert tone="sage" title="Submitted to the patient">
                  <p>They still have to compare it with the label. You did not verify the medication.</p>
                </Alert>
              ) : null}
            </section>
            {review.selectedFields.map((key) => {
              const meta = fieldMeta(key);
              const unreadable = medCase.lines.some((line) => line.key === key && line.unreadable);
              const submitted = review.proposals.find((item) => item.key === key)?.value;
              return (
                <section key={key} className="lb-card lb-stack">
                  <h3 className="lb-h2">{meta.label}</h3>
                  {unreadable ? <p>This line is visibly unreadable on the sample.</p> : null}
                  {review.status === "submitted" ? (
                    <p>{submitted?.trim() || "You left this blank."}</p>
                  ) : (
                    <label className="lb-field" htmlFor={`proposal-${key}`}>
                      Type only the words you can see
                      <textarea
                        id={`proposal-${key}`}
                        className="lb-input"
                        value={drafts[key] ?? ""}
                        disabled={review.status !== "claimed" || pending.review}
                        onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </label>
                  )}
                </section>
              );
            })}
            {review.status === "claimed" ? (
              <div className="lb-actions">
                <button
                  type="button"
                  className="lb-btn lb-btn-primary"
                  disabled={pending.review}
                  onClick={() => {
                    const proposals = review.selectedFields.map((key) => ({ key, value: drafts[key] ?? "" }));
                    void submitReading(proposals).then((error) =>
                      show(error, "Reading submitted. The patient still has to review it."),
                    );
                  }}
                >
                  {pending.review ? "Sending…" : "Submit reading"}
                </button>
                <button
                  type="button"
                  className="lb-btn lb-btn-secondary"
                  disabled={pending.review}
                  onClick={() => {
                    void requestNewImage().then((error) =>
                      show(error, "The patient will be asked for a clearer image."),
                    );
                  }}
                >
                  Ask for a clearer image
                </button>
              </div>
            ) : null}
            <button type="button" className="lb-btn lb-btn-quiet" onClick={() => setPersona("patient")}>
              Return to the patient view
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}
