import { useEffect, useId, useState } from "react";
import { NO_CROP, editPhoto, isProblem, type Crop } from "../lib/photo";

const SIDES: [keyof Crop, string][] = [
  ["top", "Trim top"],
  ["bottom", "Trim bottom"],
  ["left", "Trim left"],
  ["right", "Trim right"],
];

/**
 * Rotate and crop a photo with native buttons and range inputs. The preview
 * is approximate until "Apply" re-encodes the image as a new JPEG.
 */
export function PhotoEditor({
  file,
  onApply,
  disabled = false,
  title = "Adjust the photo",
  applyLabel = "Apply changes",
}: {
  file: File;
  onApply: (file: File) => void;
  disabled?: boolean;
  title?: string;
  applyLabel?: string;
}) {
  const id = useId();
  const [url, setUrl] = useState<string | null>(null);
  const [turns, setTurns] = useState(0);
  const [crop, setCrop] = useState<Crop>(NO_CROP);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    setTurns(0);
    setCrop(NO_CROP);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const changed = turns % 4 !== 0 || SIDES.some(([k]) => crop[k] > 0);

  async function apply() {
    setBusy(true);
    setMessage(null);
    const result = await editPhoto(file, turns, crop);
    setBusy(false);
    if (isProblem(result)) return setMessage(result.message);
    setMessage("Changes applied. The photo now matches the preview.");
    onApply(result.file);
  }

  return (
    <fieldset className="photo-editor" aria-describedby={`${id}-status`}>
      <legend>{title}</legend>
      <div className="photo-editor-stage">
        {url && (
          <img
            src={url}
            alt="Preview of your photo with the current rotation and trim"
            style={{
              transform: `rotate(${turns * 90}deg)`,
              clipPath: `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`,
            }}
          />
        )}
      </div>
      <div className="crop-controls">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => setTurns((t) => t - 1)}
        >
          <span aria-hidden="true">↶ </span>Rotate left
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => setTurns((t) => t + 1)}
        >
          <span aria-hidden="true">↷ </span>Rotate right
        </button>
      </div>
      <div className="crop-sliders">
        {SIDES.map(([side, label]) => (
          <label key={side}>
            {label} <span className="hint">({crop[side]}%)</span>
            <input
              type="range"
              min={0}
              max={45}
              step={1}
              value={crop[side]}
              disabled={disabled || busy}
              onChange={(e) =>
                setCrop((c) => ({ ...c, [side]: Number(e.target.value) }))
              }
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled || busy || !changed}
          onClick={() => void apply()}
        >
          {busy ? "Applying…" : applyLabel}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={disabled || busy || !changed}
          onClick={() => {
            setTurns(0);
            setCrop(NO_CROP);
          }}
        >
          Reset
        </button>
      </div>
      <p id={`${id}-status`} className="hint" aria-live="polite">
        {message}
      </p>
    </fieldset>
  );
}
