import type { RefObject } from "react";
import { eligibleForExplanation } from "@labelbridge/contracts";
import type { CaseResult } from "../api/client";
import { DATA_MODE_TEXT } from "../lib/dataMode";
import { FIELD_LABELS, FIELD_ORDER, reviewProgress } from "../lib/fields";
import type { CaseSession, DisplaySource } from "../state/useCaseSession";
import type { usePatientReviews } from "../state/useReviews";
import { ErrorBanner } from "./ErrorBanner";
import { FieldCard } from "./FieldCard";
import { LabelPreview, type PreviewContent } from "./LabelPreview";
import { Progress } from "./Progress";
import { workspace } from "../api/workspace";
import { ReadingHelp } from "./ReadingHelp";
import { ReviewSectionImage } from "./ReviewSectionImage";

export function sourcePreview(source: DisplaySource | null): PreviewContent {
  if (!source)
    return { kind: "empty", message: "The original label is not available." };
  if (source.kind === "text") return { kind: "text", text: source.text };
  return source.kind === "sample"
    ? {
        kind: "image",
        src: source.sample.imageUrl,
        alt: source.sample.imageAlt,
      }
    : {
        kind: "image",
        src: source.previewUrl,
        alt: `Your uploaded label photo ${source.fileName}`,
      };
}

export function Review({
  session,
  result,
  source,
  help,
  headingRef,
  onBack,
  onContinue,
  onUploadClearer,
  onDirtyChange,
}: {
  session: CaseSession;
  result: CaseResult;
  source: DisplaySource | null;
  help: ReturnType<typeof usePatientReviews>;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onContinue: () => void;
  onUploadClearer: () => void;
  onDirtyChange: (key: string, dirty: boolean) => void;
}) {
  const c = result.case;
  const fields = FIELD_ORDER.map((k) => c.fields.find((f) => f.key === k)!);
  const progress = reviewProgress(fields);
  // The server applies the same rule (contracts eligibleForExplanation) and
  // refuses explanations otherwise; this only reflects saved state.
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
  const remaining = progress.total - progress.confirmed;

  return (
    <>
      <section className="review-head shell">
        <button type="button" className="back" onClick={onBack} disabled={busy}>
          <span aria-hidden="true">← </span>Back to label
        </button>
        <h1 id="review-heading" tabIndex={-1} ref={headingRef}>
          Check the label details
        </h1>
        <p>
          Compare each detail with the original label. If you cannot read it,
          mark it as unknown. Confirming means it matches what is printed; it is
          not a medical or pharmacist check.
        </p>
        <Progress step={2} />
      </section>

      <div className="review-layout shell">
        <aside className="sticky-preview" aria-label="Original label">
          <LabelPreview content={sourcePreview(source)} title="Your label" />
          <div className="safety-note">
            <h2>We never fill in unreadable words.</h2>
            <p>You decide what matches the label.</p>
          </div>
          <p className="badge">
            <span aria-hidden="true">ⓘ </span>
            {DATA_MODE_TEXT[result.dataMode]}
          </p>
        </aside>

        <section className="fields" aria-labelledby="fields-heading">
          <h2 id="fields-heading" className="sr-only">
            Extracted label details
          </h2>
          <div className="review-progress" aria-live="polite">
            <div className="review-progress-row">
              <b>
                {progress.confirmed} of {progress.total} required details
                checked
              </b>
              <span>
                {Math.round((progress.confirmed / progress.total) * 100)}%
              </span>
            </div>
            <progress
              value={progress.confirmed}
              max={progress.total}
              aria-label="Required details checked"
            />
            {session.notice && <p className="saved-note">{session.notice}</p>}
            {session.pending === "update" && <p className="hint">Saving…</p>}
            {session.pending === "reload" && (
              <p className="hint">Loading the latest version…</p>
            )}
          </div>

          {session.error && (
            <ErrorBanner error={session.error} retrying={busy} />
          )}

          {!eligible && (
            <div className="banner banner-blocked">
              <p>
                <strong>
                  <span aria-hidden="true">🔒 </span>Explanations are locked.
                </strong>{" "}
                Medication name, strength, dosage form, and exact directions
                must each be filled in and confirmed by you. Nothing will be
                guessed.
              </p>
              <p>Still needed:</p>
              <ul>
                {progress.outstanding.map((f) => (
                  <li key={f.key}>
                    <a href={`#field-${f.key}-input`}>{FIELD_LABELS[f.key]}</a>:{" "}
                    {f.value === null ? "unknown" : "not confirmed yet"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="field-list" aria-label="Medication fields">
            {fields.map((f) => (
              <FieldCard
                key={f.key}
                field={f}
                imageSrc={imageSrc}
                disabled={busy}
                onDirtyChange={onDirtyChange}
                onChange={(change, description) =>
                  void session.updateFields([change], description)
                }
              />
            ))}
          </ul>

          {c.questions.length > 0 && (
            <section aria-labelledby="questions-heading" className="panel">
              <h2 id="questions-heading">Questions to ask a pharmacist</h2>
              <ul>
                {c.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          )}

          <ReadingHelp
            caseData={c}
            session={session}
            help={help}
            onUploadClearer={onUploadClearer}
          />
          <ReviewSectionImage
            client={workspace}
            reviews={help.reviews}
            photoUrl={source?.kind === "image" ? source.previewUrl : null}
          />

          <section
            className={`support-card ${eligible ? "" : "locked"}`}
            aria-labelledby="continue-heading"
          >
            <h2 id="continue-heading">
              {eligible
                ? "Your optional support is ready"
                : "Finish checking to unlock explanations"}
            </h2>
            <p>
              {eligible
                ? "Choose explanations, savings resources, nearby pharmacies, or shared support."
                : `${remaining} required ${remaining === 1 ? "detail still needs" : "details still need"} confirming. You can still search for nearby pharmacies; explanations and savings stay locked until then.`}
            </p>
            <button
              type="button"
              className="primary"
              onClick={onContinue}
              disabled={busy}
            >
              Explore support <span aria-hidden="true">→</span>
            </button>
          </section>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={onUploadClearer}
              disabled={busy}
            >
              Upload a clearer image
            </button>
          </div>
          <p className="meta">
            Version {c.revision}. This demo case is deleted at {expires}.
          </p>
        </section>
      </div>
    </>
  );
}
