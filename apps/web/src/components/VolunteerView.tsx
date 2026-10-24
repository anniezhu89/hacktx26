import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReviewerView } from "../api/client";
import { DATA_MODE_TEXT } from "../lib/dataMode";
import { FIELD_LABELS, type FieldKey } from "../lib/fields";
import type { ReviewerQueue } from "../state/useReviews";
import { isUnavailable } from "../state/useReviews";
import { ErrorBanner } from "./ErrorBanner";
import { ImageExcerpt } from "./ImageExcerpt";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

type Entry = { text: string; unreadable: boolean };

function ReadingForm({
  view,
  imageSrc,
  queue,
}: {
  view: ReviewerView;
  imageSrc: string | null;
  queue: ReviewerQueue;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const sending = queue.pending === "respond";
  useEffect(() => heading.current?.focus(), [view.review.id]);

  const entry = (key: FieldKey): Entry =>
    entries[key] ?? { text: "", unreadable: false };
  const update = (key: FieldKey, patch: Partial<Entry>) =>
    setEntries((e) => ({
      ...e,
      [key]: { ...(e[key] ?? { text: "", unreadable: false }), ...patch },
    }));

  function source(key: FieldKey) {
    const ex = view.excerpts.find((e) => e.key === key)!;
    if (ex.crop && imageSrc) return "the enlarged label image";
    if (imageSrc) return "the label image";
    if (ex.textExcerpt) return "the text the patient typed";
    return "nothing (no excerpt was available)";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const missing = view.review.selectedFields.filter(
      (k) => !entry(k).unreadable && !entry(k).text.trim(),
    );
    const found = missing.map(
      (k) =>
        `${FIELD_LABELS[k]}: type what you can see, or tick "I can't read this part".`,
    );
    setErrors(found);
    if (found.length) return;
    void queue.respond({
      outcome: "submitted",
      proposals: view.review.selectedFields.map((key) => {
        const e = entry(key);
        return {
          key,
          visibleText: e.unreadable ? null : e.text.trim(),
          evidence: [
            e.unreadable
              ? "The volunteer could not read this part."
              : `Read from ${source(key)}.`,
            note.trim() && `Note: ${note.trim()}`,
          ]
            .filter(Boolean)
            .join(" "),
        };
      }),
    });
  }

  return (
    <form noValidate onSubmit={submit} className="stack">
      <h3 id="reading-heading" tabIndex={-1} ref={heading}>
        Read the label
      </h3>
      <p>
        Parts requested:{" "}
        {view.review.selectedFields.map((k) => FIELD_LABELS[k]).join(", ")}.
        Requested at {time(view.review.consentAt)}.
      </p>
      {view.excerpts.map((ex) => {
        const label = FIELD_LABELS[ex.key];
        const e = entry(ex.key);
        const id = `read-${ex.key}`;
        return (
          <fieldset key={ex.key} className="stack-sm">
            <legend>{label}</legend>
            {imageSrc &&
              (ex.crop ? (
                <ImageExcerpt
                  src={imageSrc}
                  crop={ex.crop}
                  label={`Label excerpt for ${label}`}
                />
              ) : (
                <img
                  src={imageSrc}
                  alt={`The fictional label image (no excerpt marked for ${label})`}
                  className="label-image"
                />
              ))}
            {ex.textExcerpt && (
              <>
                <p className="evidence-label">Text the patient typed</p>
                <blockquote className="excerpt-text">
                  {ex.textExcerpt}
                </blockquote>
              </>
            )}
            {!ex.textExcerpt && !imageSrc && (
              <p className="hint">
                Nothing is available to read for this part. You can ask for a
                clearer image.
              </p>
            )}
            <label htmlFor={id} className="field-label">
              What you can read for {label.toLowerCase()}
            </label>
            <input
              id={id}
              type="text"
              value={e.text}
              disabled={e.unreadable || sending}
              aria-describedby={`${id}-hint`}
              onChange={(v) => update(ex.key, { text: v.target.value })}
            />
            <p id={`${id}-hint`} className="hint">
              Copy exactly what you see, including decimals and units. Do not
              guess or fill in missing parts.
            </p>
            <label className="choice">
              <input
                type="checkbox"
                checked={e.unreadable}
                disabled={sending}
                onChange={(v) =>
                  update(ex.key, { unreadable: v.target.checked })
                }
              />
              I can&apos;t read this part
            </label>
          </fieldset>
        );
      })}
      <div className="stack-sm">
        <label htmlFor="read-note" className="field-label">
          Note for the patient (optional)
        </label>
        <textarea
          id="read-note"
          rows={2}
          value={note}
          disabled={sending}
          onChange={(v) => setNote(v.target.value)}
        />
      </div>
      {errors.length > 0 && (
        <div className="banner banner-error" role="alert">
          <ul>
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={sending}>
          {sending ? "Sending…" : "Send reading to the patient"}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() =>
            void queue.respond({ outcome: "needs_new_image", proposals: [] })
          }
        >
          Ask for a clearer image
        </button>
        <button type="button" disabled={sending} onClick={queue.close}>
          Back to the list
        </button>
      </div>
    </form>
  );
}

export function VolunteerView({ queue }: { queue: ReviewerQueue }) {
  // Only a failed queue load means the server lacks these routes; a missing
  // request during a claim is an ordinary error.
  const unavailable =
    queue.error?.op === "load" && isUnavailable(queue.error.error);
  const busy = queue.pending !== null;

  // Focus is not moved on mount: choosing the view radio must not move focus.
  return (
    <section aria-labelledby="volunteer-heading" className="stack">
      <h2 id="volunteer-heading">Volunteer reading requests</h2>
      <div className="banner banner-blocked">
        <p>
          <strong>Type only what you can see.</strong> If you cannot read a
          part, say so — do not guess. You are copying text from a fictional
          label, not checking a medicine.
        </p>
      </div>
      {queue.dataMode && (
        <p className="badge">{DATA_MODE_TEXT[queue.dataMode]}</p>
      )}
      <div aria-live="polite">
        {queue.notice && <p className="banner banner-ok">{queue.notice}</p>}
      </div>
      {unavailable ? (
        <p className="banner banner-info">
          Volunteer reading is not available on this server yet.
        </p>
      ) : (
        <>
          {queue.error && <ErrorBanner error={queue.error} retrying={busy} />}
          {queue.active ? (
            <ReadingForm
              key={queue.active.review.id}
              view={queue.active}
              imageSrc={queue.imageSrc}
              queue={queue}
            />
          ) : (
            <section aria-labelledby="queue-heading" className="stack-sm">
              <h3 id="queue-heading">Waiting requests</h3>
              <div aria-live="polite">
                {queue.loading && queue.queue === null && (
                  <p className="hint">Loading requests…</p>
                )}
                {queue.queue?.length === 0 && (
                  <p>No requests are waiting right now.</p>
                )}
              </div>
              {queue.queue && queue.queue.length > 0 && (
                <ul className="review-list" aria-label="Reading requests">
                  {queue.queue.map((r) => {
                    const parts = r.selectedFields
                      .map((k) => FIELD_LABELS[k])
                      .join(", ");
                    return (
                      <li
                        key={r.id}
                        className={`review-card status-${r.status}`}
                      >
                        <h4>Read: {parts}</h4>
                        <p className="meta">Asked at {time(r.consentAt)}</p>
                        {r.status === "pending" ? (
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() => void queue.claim(r.id)}
                          >
                            Claim and start reading
                            <span className="sr-only"> {parts}</span>
                          </button>
                        ) : (
                          <>
                            <p className="state-text">Already claimed.</p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void queue.open(r.id)}
                            >
                              Continue reading (if you claimed it)
                              <span className="sr-only"> {parts}</span>
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                disabled={queue.loading}
                onClick={() => void queue.refresh()}
              >
                {queue.loading ? "Checking…" : "Check for new requests"}
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
