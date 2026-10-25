import { useEffect, useId, useState } from "react";

export type PreviewContent =
  | { kind: "image"; src: string; alt: string }
  | { kind: "text"; text: string }
  | { kind: "empty"; message: string };

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5];

/**
 * Label preview with zoom. Zooming enlarges the content inside a scrollable
 * region (keyboard-focusable), so nothing is clipped at any size.
 */
export function LabelPreview({
  content,
  title = "Label preview",
}: {
  content: PreviewContent;
  title?: string;
}) {
  const [step, setStep] = useState(0);
  const regionId = useId();
  const zoom = ZOOM_STEPS[step];
  const percent = `${Math.round(zoom * 100)}%`;
  const key = content.kind === "image" ? content.src : content.kind;
  // A new label starts at normal size.
  useEffect(() => setStep(0), [key]);
  const zoomable = content.kind !== "empty";

  return (
    <div className="preview-wrap">
      <div className="preview-tools">
        <h3 className="preview-title" id={`${regionId}-title`}>
          {title}
        </h3>
        {zoomable && (
          <div
            className="zoom"
            role="group"
            aria-label={`Zoom ${title.toLowerCase()}`}
          >
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              aria-controls={regionId}
            >
              <span aria-hidden="true">−</span>
              <span className="sr-only">Zoom out</span>
            </button>
            <span aria-live="polite" className="zoom-level">
              <span className="sr-only">Zoom </span>
              {percent}
            </span>
            <button
              type="button"
              onClick={() =>
                setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1))
              }
              disabled={step === ZOOM_STEPS.length - 1}
              aria-controls={regionId}
            >
              <span aria-hidden="true">+</span>
              <span className="sr-only">Zoom in</span>
            </button>
            {step > 0 && (
              <button
                type="button"
                className="zoom-reset"
                onClick={() => setStep(0)}
                aria-controls={regionId}
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
      <div
        id={regionId}
        className="label-stage"
        role="region"
        aria-labelledby={`${regionId}-title`}
        // Focusable so keyboard users can scroll a zoomed label.
        tabIndex={zoomable && step > 0 ? 0 : -1}
      >
        {content.kind === "image" && (
          <img
            src={content.src}
            alt={content.alt}
            className="label-image"
            // Compact at 100%, like a label card; zoom scales from there.
            style={{ width: `min(${zoom * 100}%, ${zoom * 26}rem)` }}
          />
        )}
        {content.kind === "text" && (
          <pre className="label-text" style={{ fontSize: `${zoom}em` }}>
            {content.text}
          </pre>
        )}
        {content.kind === "empty" && (
          <p className="hint preview-empty">{content.message}</p>
        )}
      </div>
    </div>
  );
}
