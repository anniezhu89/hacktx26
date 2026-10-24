import { useEffect, useRef } from "react";
import { eligibleForExplanation } from "@labelbridge/contracts";
import type { CaseResult, DataMode } from "../api/client";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  REVIEW_STATE_TEXT,
  reviewProgress,
} from "../lib/fields";
import type { CaseSession, DisplaySource } from "../state/useCaseSession";
import { ErrorBanner } from "./ErrorBanner";
import { FieldCard } from "./FieldCard";

export const DATA_MODE_TEXT: Record<DataMode, string> = {
  fixture: "Fixture data: built-in fictional examples, not a live reading",
  cached: "Cached data: saved from an earlier request",
  live: "Live data",
};

function SourcePanel({ source }: { source: DisplaySource }) {
  if (source.kind === "text")
    return (
      <>
        <h3>Text you entered</h3>
        <pre className="label-text">{source.text}</pre>
      </>
    );
  const [src, alt] =
    source.kind === "sample"
      ? [source.sample.imageUrl, source.sample.imageAlt]
      : [source.previewUrl, `Your uploaded label photo ${source.fileName}`];
  return (
    <>
      <h3>Your label</h3>
      <img src={src} alt={alt} className="label-image" />
    </>
  );
}

export function Review({
  session,
  result,
  source,
  onUploadClearer,
}: {
  session: CaseSession;
  result: CaseResult;
  source: DisplaySource | null;
  onUploadClearer: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const c = result.case;
  useEffect(() => heading.current?.focus(), [c.id]);

  const fields = FIELD_ORDER.map((k) => c.fields.find((f) => f.key === k)!);
  const progress = reviewProgress(fields);
  const eligible = eligibleForExplanation(fields);
  const busy = session.pending !== null;
  const imageSrc =
    source?.kind === "sample"
      ? source.sample.imageUrl
      : source?.kind === "image"
        ? source.previewUrl
        : null;
  const expires = new Date(c.expiresAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <section aria-labelledby="review-heading" className="stack">
      <h2 id="review-heading" tabIndex={-1} ref={heading}>
        Check what was read
      </h2>
      <p className="badge">{DATA_MODE_TEXT[result.dataMode]}</p>
      <p>
        Compare each field with the label. Checking a field means you agree it
        matches what is printed. It is not a medical or pharmacist check.
      </p>

      <div aria-live="polite" className="stack-sm">
        <p className="progress">
          <strong>
            {progress.confirmed} of {progress.total}
          </strong>{" "}
          required fields checked.
        </p>
        {session.notice && (
          <p className="banner banner-info">{session.notice}</p>
        )}
        {session.pending === "update" && <p className="hint">Saving…</p>}
        {session.pending === "reload" && (
          <p className="hint">Loading the latest version…</p>
        )}
      </div>

      <div className={`banner ${eligible ? "banner-ok" : "banner-blocked"}`}>
        {eligible ? (
          <p>
            <strong>Ready for an explanation.</strong> All required fields are
            confirmed. (The explanation step is not built yet.)
          </p>
        ) : (
          <>
            <p>
              <strong>Explanation blocked.</strong> Medication name, strength,
              dosage form, and directions must all be filled in and confirmed by
              you first. Nothing will be guessed.
            </p>
            <p>Still needed:</p>
            <ul>
              {progress.outstanding.map((f) => (
                <li key={f.key}>
                  <a href={`#field-${f.key}-input`}>{FIELD_LABELS[f.key]}</a> —{" "}
                  {f.value === null
                    ? "unknown"
                    : REVIEW_STATE_TEXT[f.reviewState].toLowerCase()}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {session.error && <ErrorBanner error={session.error} retrying={busy} />}

      {c.questions.length > 0 && (
        <section aria-labelledby="questions-heading" className="stack-sm">
          <h3 id="questions-heading">Questions to ask a pharmacist</h3>
          <ul>
            {c.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="review-layout">
        {source && (
          <aside className="source-panel" aria-label="Submitted label">
            <SourcePanel source={source} />
          </aside>
        )}
        <ul className="field-list" aria-label="Medication fields">
          {fields.map((f) => (
            <FieldCard
              key={f.key}
              field={f}
              imageSrc={imageSrc}
              disabled={busy}
              onChange={(change, description) =>
                void session.updateFields([change], description)
              }
            />
          ))}
        </ul>
      </div>

      <div className="actions">
        <button type="button" onClick={onUploadClearer} disabled={busy}>
          Upload a clearer image
        </button>
        <button type="button" onClick={session.startOver} disabled={busy}>
          Start over with another label
        </button>
      </div>
      <p className="meta">
        Version {c.revision}. This demo case is deleted at {expires}.
      </p>
    </section>
  );
}
