import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiClient } from "../api/client";
import { MAX_IMAGE_BYTES, validateImageFile } from "../lib/fields";
import { SAMPLES } from "../samples";
import type { CaseSession } from "../state/useCaseSession";
import { ErrorBanner } from "./ErrorBanner";

export type IntakeMode = "sample" | "image" | "text";

const MODES: { id: IntakeMode; label: string }[] = [
  { id: "sample", label: "Choose a sample label" },
  { id: "image", label: "Upload a label photo" },
  { id: "text", label: "Type or paste label text" },
];

const MAX_TEXT = 20000;

export function Intake({
  session,
  apiKind,
  initialMode,
}: {
  session: CaseSession;
  apiKind: ApiClient["kind"];
  initialMode: IntakeMode;
}) {
  const [mode, setMode] = useState<IntakeMode>(initialMode);
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const pending = session.pending === "create";

  useEffect(() => {
    if (initialMode === "image") heading.current?.focus();
  }, [initialMode]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function chooseFile(next: File | null) {
    setFile(null);
    setPreview(null);
    setFileError(null);
    if (!next) return;
    const problem = await validateImageFile(next);
    if (problem) return setFileError(problem);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found: string[] = [];
    if (mode === "image" && !file)
      found.push(fileError ?? "Choose a PNG or JPEG photo of the label.");
    if (mode === "text" && !text.trim())
      found.push("Type or paste the text from the label.");
    if (!ack)
      found.push(
        "Confirm that this label is fictional demo data before continuing.",
      );
    setErrors(found);
    if (found.length) {
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    const sample = SAMPLES.find((s) => s.id === sampleId)!;
    if (mode === "sample")
      void session.create(
        { kind: "sample", sampleId, text: sample.text },
        sample,
      );
    else if (mode === "image")
      void session.create({ kind: "image", file: file! });
    else void session.create({ kind: "text", text });
  }

  const selectedSample = SAMPLES.find((s) => s.id === sampleId)!;

  return (
    <section aria-labelledby="intake-heading" className="stack">
      <h2 id="intake-heading" tabIndex={-1} ref={heading}>
        Start with a fictional label
      </h2>
      <p>
        Use a sample label, a photo, or typed text. Use made-up information only
        — never a real person&apos;s prescription.
      </p>
      <form noValidate onSubmit={submit} className="stack">
        <fieldset>
          <legend>How do you want to add the label?</legend>
          <div className="choices">
            {MODES.map((m) => (
              <label key={m.id} className="choice">
                <input
                  type="radio"
                  name="intake-mode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => {
                    setMode(m.id);
                    setErrors([]);
                  }}
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "sample" && (
          <fieldset>
            <legend>Sample labels</legend>
            <div className="sample-grid">
              {SAMPLES.map((s) => (
                <label key={s.id} className="sample-card">
                  <input
                    type="radio"
                    name="sample"
                    value={s.id}
                    checked={sampleId === s.id}
                    onChange={() => setSampleId(s.id)}
                  />
                  <span>
                    <strong>{s.title}</strong>
                    <span className="hint">{s.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {mode === "image" && (
          <div className="stack-sm">
            <label htmlFor="label-photo" className="field-label">
              Label photo (PNG or JPEG, up to {MAX_IMAGE_BYTES / 1024 / 1024}{" "}
              MB)
            </label>
            <input
              id="label-photo"
              type="file"
              accept="image/png,image/jpeg"
              aria-describedby={
                fileError ? "photo-hint photo-error" : "photo-hint"
              }
              aria-invalid={!!fileError}
              onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
            />
            <p id="photo-hint" className="hint">
              Take the photo straight on, in good light.
              {apiKind === "mock" &&
                " Fixture mode cannot read photos automatically: you will type each field yourself."}
            </p>
            {fileError && (
              <p id="photo-error" className="field-error" role="alert">
                {fileError}
              </p>
            )}
          </div>
        )}

        {mode === "text" && (
          <div className="stack-sm">
            <label htmlFor="label-text" className="field-label">
              Label text
            </label>
            <textarea
              id="label-text"
              rows={6}
              maxLength={MAX_TEXT}
              value={text}
              aria-describedby="text-hint"
              onChange={(e) => setText(e.target.value)}
            />
            <p id="text-hint" className="hint">
              Copy the words exactly as printed, including numbers and units
              such as mg or mcg. {text.length.toLocaleString()} of{" "}
              {MAX_TEXT.toLocaleString()} characters.
            </p>
          </div>
        )}

        <section aria-labelledby="preview-heading" className="preview">
          <h3 id="preview-heading">Preview</h3>
          {mode === "sample" && (
            <img
              src={selectedSample.imageUrl}
              alt={selectedSample.imageAlt}
              className="label-image"
            />
          )}
          {mode === "image" &&
            (preview && file ? (
              <img
                src={preview}
                alt={`Preview of uploaded photo ${file.name}`}
                className="label-image"
              />
            ) : (
              <p className="hint">No photo chosen yet.</p>
            ))}
          {mode === "text" &&
            (text.trim() ? (
              <pre className="label-text">{text}</pre>
            ) : (
              <p className="hint">No text entered yet.</p>
            ))}
        </section>

        <label className="choice ack">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => {
              setAck(e.target.checked);
              if (e.target.checked)
                setErrors((list) =>
                  list.filter((m) => !m.includes("fictional")),
                );
            }}
          />
          I confirm this label is fictional demo data, not a real person&apos;s
          prescription.
        </label>

        {errors.length > 0 && (
          <div
            className="banner banner-error"
            role="alert"
            tabIndex={-1}
            ref={summary}
          >
            <p>
              <strong>Please fix the following:</strong>
            </p>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {session.error && (
          <ErrorBanner error={session.error} retrying={pending} />
        )}

        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Reading label…" : "Read this label"}
        </button>
      </form>
    </section>
  );
}
