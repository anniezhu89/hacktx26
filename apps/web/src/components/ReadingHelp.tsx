import { useState, type FormEvent } from "react";
import type { Case } from "@labelbridge/contracts";
import type { ReviewRequest } from "../api/client";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  fieldCondition,
  type FieldKey,
} from "../lib/fields";
import type { CaseSession } from "../state/useCaseSession";
import { isUnavailable, type PatientReviews } from "../state/useReviews";
import { ErrorBanner } from "./ErrorBanner";
import { DATA_MODE_TEXT } from "../lib/dataMode";

const STATUS_TEXT: Record<ReviewRequest["status"], string> = {
  pending: "Waiting for a volunteer.",
  claimed: "A volunteer is reading it now.",
  submitted: "The volunteer's reading is ready. Compare it with your label.",
  needs_new_image:
    "The volunteer could not read it and asked for a clearer image.",
  closed: "Closed.",
};

const OPEN = ["pending", "claimed"];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function suggestedFields(c: Case): FieldKey[] {
  return c.fields
    .filter(
      (f) =>
        f.reviewState !== "user_confirmed" &&
        (f.reviewState === "needs_help" || fieldCondition(f) !== "readable"),
    )
    .map((f) => f.key);
}

function RequestForm({
  caseData,
  help,
}: {
  caseData: Case;
  help: PatientReviews;
}) {
  const [selected, setSelected] = useState<FieldKey[]>(() =>
    suggestedFields(caseData),
  );
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const creating = help.pending === "create";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: string[] = [];
    if (!selected.length) found.push("Choose at least one part of the label.");
    if (!consent)
      found.push("Agree to share the chosen parts before sending the request.");
    setErrors(found);
    if (found.length) return;
    if (await help.create(selected, caseData.revision)) setConsent(false);
  }

  return (
    <form noValidate onSubmit={submit} className="stack-sm">
      <fieldset>
        <legend>Which parts should the volunteer read?</legend>
        <div className="choices">
          {FIELD_ORDER.map((key) => (
            <label key={key} className="choice">
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked ? [...s, key] : s.filter((k) => k !== key),
                  )
                }
              />
              {FIELD_LABELS[key]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="choice ack">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked)
              setErrors((l) => l.filter((m) => !m.startsWith("Agree")));
          }}
        />
        I agree to share only the chosen parts of this fictional label with a
        demo volunteer. Nothing is sent by email or text message.
      </label>
      {errors.length > 0 && (
        <div className="banner banner-error" role="alert">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <button type="submit" className="primary" disabled={creating}>
        {creating ? "Sending request…" : "Ask a volunteer to read these"}
      </button>
    </form>
  );
}

function Proposals({
  review,
  caseData,
  session,
}: {
  review: ReviewRequest;
  caseData: Case;
  session: CaseSession;
}) {
  const [kept, setKept] = useState<FieldKey[]>([]);
  const busy = session.pending !== null;
  return (
    <ul className="proposal-list">
      {review.proposals.map((p) => {
        const field = caseData.fields.find((f) => f.key === p.key)!;
        const label = FIELD_LABELS[p.key];
        // Compare values, not provenance: confirming a field records the
        // patient as provenance under the current contract helper.
        const matches = p.visibleText !== null && field.value === p.visibleText;
        const confirmed = field.reviewState === "user_confirmed";
        return (
          <li key={p.key} className="proposal">
            <h5>{label}</h5>
            <dl className="compare">
              <div>
                <dt>Your label field now</dt>
                <dd>
                  {field.value ?? <strong className="unknown">Unknown</strong>}
                </dd>
              </div>
              <div>
                <dt>Volunteer read</dt>
                <dd>
                  {p.visibleText === null ? (
                    <strong className="unknown">
                      Could not read this part
                    </strong>
                  ) : (
                    <strong>{p.visibleText}</strong>
                  )}
                </dd>
              </div>
            </dl>
            <p className="hint">Volunteer&apos;s note: {p.evidence}</p>
            {matches && confirmed ? (
              <p className="banner banner-ok">
                Your field matches the volunteer&apos;s reading, and you
                confirmed it against your label.
              </p>
            ) : matches ? (
              <p className="banner banner-info">
                Your field now matches the volunteer&apos;s reading. It still
                needs your check:{" "}
                <a href={`#field-${p.key}-input`}>
                  confirm {label.toLowerCase()}
                </a>{" "}
                matches your label.
              </p>
            ) : kept.includes(p.key) ? (
              <p className="hint">You kept your own reading.</p>
            ) : (
              p.visibleText !== null && (
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void session.updateFields(
                        [
                          {
                            key: p.key,
                            value: p.visibleText,
                            reviewState: "unreviewed",
                            fromReviewId: review.id,
                          },
                        ],
                        `${label}: volunteer reading applied. Check it against your label, then confirm.`,
                      )
                    }
                  >
                    Use this reading
                    <span className="sr-only"> for {label}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setKept((k) => [...k, p.key])}
                  >
                    Keep my reading<span className="sr-only"> for {label}</span>
                  </button>
                </div>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ReadingHelp({
  caseData,
  session,
  help,
  onUploadClearer,
}: {
  caseData: Case;
  session: CaseSession;
  help: PatientReviews;
  onUploadClearer: () => void;
}) {
  const unavailable = help.error && isUnavailable(help.error.error);
  const reviews = [...(help.reviews ?? [])].reverse();
  const hasCurrentOpen = reviews.some(
    (r) => OPEN.includes(r.status) && r.caseRevision === caseData.revision,
  );

  return (
    <section aria-labelledby="help-heading" className="panel stack-sm">
      <h3 id="help-heading">Human reading help</h3>
      <p>
        A demo volunteer can read parts of the label that are hard to read. They
        see only the parts you choose, and they never see automatic guesses.
        This is a person copying text, not a pharmacist or medical check.
      </p>
      {help.dataMode && (
        <p className="badge">{DATA_MODE_TEXT[help.dataMode]}</p>
      )}

      {unavailable ? (
        <p className="banner banner-info">
          Human reading help is not available on this server yet.
        </p>
      ) : (
        <>
          {help.error && (
            <ErrorBanner error={help.error} retrying={help.pending !== null} />
          )}
          <div aria-live="polite">
            {help.pending === "load" && help.reviews === null && (
              <p className="hint">Loading reading requests…</p>
            )}
          </div>

          {reviews.length > 0 && (
            <ul className="review-list" aria-label="Your reading requests">
              {reviews.map((r) => {
                const stale =
                  OPEN.includes(r.status) && r.caseRevision < caseData.revision;
                return (
                  <li key={r.id} className={`review-card status-${r.status}`}>
                    <h4>
                      Request for{" "}
                      {r.selectedFields.map((k) => FIELD_LABELS[k]).join(", ")}
                    </h4>
                    <p className="meta">Sent at {time(r.consentAt)}</p>
                    <p className="state-text">{STATUS_TEXT[r.status]}</p>
                    {stale && (
                      <p className="banner banner-blocked">
                        You changed the label after asking, so the volunteer may
                        not be able to answer. You can send a new request.
                      </p>
                    )}
                    {r.status === "needs_new_image" && (
                      <button type="button" onClick={onUploadClearer}>
                        Upload a clearer image
                      </button>
                    )}
                    {r.status === "submitted" && (
                      <Proposals
                        review={r}
                        caseData={caseData}
                        session={session}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {help.reviews !== null && (
            <button
              type="button"
              onClick={() => void help.refresh()}
              disabled={help.pending !== null}
            >
              {help.pending === "load" ? "Checking…" : "Check for updates"}
            </button>
          )}

          {help.reviews !== null && !hasCurrentOpen && (
            <RequestForm
              key={caseData.revision}
              caseData={caseData}
              help={help}
            />
          )}
        </>
      )}
    </section>
  );
}
