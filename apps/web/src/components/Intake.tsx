import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import type { ApiClient } from "../api/client";
import { isProblem, preparePhoto } from "../lib/photo";
import {
  MAX_TEXT,
  intakeProblems,
  uploadErrorMessage,
  type IntakeDraft,
  type IntakeMode,
  type IntakeProblem,
} from "../lib/intake";
import { SAMPLES, findSample } from "../samples";
import type { CaseSession } from "../state/useCaseSession";
import { ErrorBanner } from "./ErrorBanner";
import { LabelPreview, type PreviewContent } from "./LabelPreview";
import { PhotoEditor } from "./PhotoEditor";
import { Progress } from "./Progress";

const MODES: { id: IntakeMode; title: string; detail: string; icon: string }[] =
  [
    {
      id: "sample",
      title: "Try a sample",
      detail: "Explore with a fictional label",
      icon: "▤",
    },
    {
      id: "image",
      title: "Upload a photo",
      detail: "PNG or JPEG · Up to 5 MB",
      icon: "↑",
    },
    {
      id: "text",
      title: "Type or paste text",
      detail: "Copy the words from your label",
      icon: "≡",
    },
  ];

/** Object URL for a chosen file, revoked when the file changes or unmounts. */
function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function Intake({
  draft,
  onDraft,
  session,
  apiKind,
  headingRef,
}: {
  draft: IntakeDraft;
  onDraft: (update: (d: IntakeDraft) => IntakeDraft) => void;
  session: CaseSession;
  apiKind: ApiClient["kind"];
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [problems, setProblems] = useState<IntakeProblem[]>([]);
  const [checkingFile, setCheckingFile] = useState(false);
  // Incremented on each failed submit so the summary is focused after render.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [converted, setConverted] = useState(false);
  const pending = session.pending === "create";
  const fileUrl = useObjectUrl(draft.file);
  const serverPhotoError =
    draft.mode === "image" && session.error
      ? uploadErrorMessage(session.error.error)
      : null;
  const sample = findSample(draft.sampleId) ?? SAMPLES[0];
  const set = (patch: Partial<IntakeDraft>) =>
    onDraft((d) => ({ ...d, ...patch }));
  const problemFor = (target: IntakeProblem["target"]) =>
    problems.find((p) => p.target === target);

  useEffect(() => {
    if (summaryFocus) summary.current?.focus();
  }, [summaryFocus]);

  async function chooseFile(next: File | null) {
    if (!next) return;
    // A server rejection of the previous photo no longer applies.
    if (serverPhotoError) session.dismissError();
    set({ file: null, fileError: null });
    setConverted(false);
    setCheckingFile(true);
    // Validates signature and decoded size; converts HEIC/HEIF if this
    // browser can decode it. Real bytes only, never a renamed file.
    const prepared = await preparePhoto(next);
    setCheckingFile(false);
    if (isProblem(prepared)) set({ file: null, fileError: prepared.message });
    else {
      set({ file: prepared.file });
      setConverted(prepared.converted);
    }
    setProblems((list) => list.filter((p) => p.target !== "photo"));
  }

  function removeFile() {
    if (serverPhotoError) session.dismissError();
    set({ file: null, fileError: null });
    setConverted(false);
    for (const input of [fileInput.current, cameraInput.current])
      if (input) input.value = "";
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || checkingFile) return;
    const found = intakeProblems(draft);
    setProblems(found);
    if (found.length) {
      setSummaryFocus((n) => n + 1);
      return;
    }
    // Navigation follows the server's result, not this click: the review
    // step opens only once a case comes back.
    if (draft.mode === "sample")
      void session.create(
        { kind: "sample", sampleId: sample.id, text: sample.text },
        sample,
      );
    else if (draft.mode === "image" && draft.file)
      void session.create({ kind: "image", file: draft.file });
    else if (draft.mode === "text")
      void session.create({ kind: "text", text: draft.text });
  }

  const preview: PreviewContent =
    draft.mode === "sample"
      ? { kind: "image", src: sample.imageUrl, alt: sample.imageAlt }
      : draft.mode === "image"
        ? fileUrl && draft.file
          ? {
              kind: "image",
              src: fileUrl,
              alt: `Preview of your photo ${draft.file.name}`,
            }
          : { kind: "empty", message: "No photo chosen yet." }
        : draft.text.trim()
          ? { kind: "text", text: draft.text }
          : { kind: "empty", message: "Your label text will appear here." };

  const textProblem = problemFor("text");
  const photoProblem = problemFor("photo");
  const photoError =
    draft.fileError ?? serverPhotoError ?? photoProblem?.message ?? null;

  return (
    <>
      <section className="hero shell">
        <h1 id="intake-heading" tabIndex={-1} ref={headingRef}>
          A little clarity. A little more confidence.
        </h1>
        <p>
          Read a fictional medication label, check the details, and find
          support, one step at a time.
        </p>
        <Progress step={1} />
      </section>

      <form noValidate onSubmit={submit} className="intake shell card">
        <fieldset className="methods">
          <legend>
            <span className="card-title">
              How would you like to add your label?
            </span>
            <span className="card-subtitle">
              Choose an option to get started.
            </span>
          </legend>
          <div className="method-grid">
            {MODES.map((m) => (
              <label
                key={m.id}
                className={`method-card ${draft.mode === m.id ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="intake-mode"
                  value={m.id}
                  checked={draft.mode === m.id}
                  onChange={() => {
                    set({ mode: m.id });
                    setProblems([]);
                  }}
                />
                <span className="method-icon" aria-hidden="true">
                  {m.icon}
                </span>
                <span className="method-text">
                  <b>{m.title}</b>
                  <small>{m.detail}</small>
                </span>
                <span className="method-check" aria-hidden="true">
                  ✓
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="intake-content">
          <div className="intake-main">
            {draft.mode === "sample" && (
              <>
                <fieldset className="samples">
                  <legend>Choose a sample</legend>
                  <div className="sample-options">
                    {SAMPLES.map((s) => (
                      <label
                        key={s.id}
                        className={`sample-option ${s.id === sample.id ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="sample"
                          value={s.id}
                          checked={s.id === sample.id}
                          onChange={() => set({ sampleId: s.id })}
                          aria-describedby={`sample-${s.id}-hint`}
                        />
                        <span>
                          <b>{s.title}</b>
                          <small id={`sample-${s.id}-hint`}>
                            {s.description}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <LabelPreview content={preview} />
              </>
            )}

            {draft.mode === "image" && (
              <div
                className={`upload-panel ${photoError ? "error" : ""}`}
                aria-busy={checkingFile}
              >
                <input
                  ref={fileInput}
                  id="label-photo"
                  type="file"
                  accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
                  className="visually-hidden-file"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
                />
                {/* Opens the rear camera on phones that support capture. */}
                <input
                  ref={cameraInput}
                  id="label-camera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="visually-hidden-file"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
                />
                <span className="upload-icon" aria-hidden="true">
                  ↑
                </span>
                <div aria-live="polite" className="upload-state">
                  {checkingFile ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      <h3>Checking and preparing your photo…</h3>
                    </>
                  ) : draft.file ? (
                    <>
                      <h3>{draft.file.name}</h3>
                      <p>
                        {converted
                          ? "Converted from HEIC/HEIF to JPEG on this device. Check the preview below."
                          : "Photo is ready. Check the preview below."}
                      </p>
                    </>
                  ) : (
                    <>
                      <h3>Add a fictional label photo</h3>
                      <p id="photo-hint">
                        Use good light, avoid glare, and keep the whole label in
                        view. PNG or JPEG up to 5 MB; HEIC/HEIF is converted
                        when this browser can.
                        {apiKind === "mock" &&
                          " This build cannot read photos automatically: you will type each field yourself."}
                      </p>
                    </>
                  )}
                </div>
                {photoError && (
                  <p id="photo-error" className="field-error" role="alert">
                    <span aria-hidden="true">⚠ </span>
                    {photoError}
                  </p>
                )}
                <div className="upload-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={checkingFile || pending}
                    aria-describedby={photoError ? "photo-error" : "photo-hint"}
                    onClick={() => cameraInput.current?.click()}
                  >
                    {draft.file ? "Retake photo" : "Take a photo"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={checkingFile || pending}
                    aria-describedby={photoError ? "photo-error" : "photo-hint"}
                    onClick={() => fileInput.current?.click()}
                  >
                    {draft.file
                      ? "Choose a different photo"
                      : "Choose from photos"}
                  </button>
                  {draft.file && (
                    <button
                      type="button"
                      className="link-button"
                      disabled={pending}
                      onClick={removeFile}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                {draft.file && <LabelPreview content={preview} />}
                {draft.file && (
                  <PhotoEditor
                    file={draft.file}
                    disabled={pending}
                    onApply={(edited) => set({ file: edited })}
                  />
                )}
              </div>
            )}

            {draft.mode === "text" && (
              <div className="text-entry">
                <label htmlFor="label-text" className="field-label">
                  Fictional label text
                </label>
                <textarea
                  id="label-text"
                  rows={6}
                  maxLength={MAX_TEXT}
                  value={draft.text}
                  aria-invalid={!!textProblem}
                  aria-describedby={`text-hint text-count${textProblem ? " text-error" : ""}`}
                  onChange={(e) => {
                    set({ text: e.target.value });
                    if (textProblem)
                      setProblems((list) =>
                        list.filter((p) => p.target !== "text"),
                      );
                  }}
                />
                <p id="text-hint" className="hint">
                  Copy the words exactly as printed, including decimals and
                  units such as mg or mcg.
                </p>
                <p id="text-count" className="count">
                  {draft.text.length.toLocaleString()} /{" "}
                  {MAX_TEXT.toLocaleString()} characters
                </p>
                {textProblem && (
                  <p id="text-error" className="field-error">
                    <span aria-hidden="true">⚠ </span>
                    {textProblem.message}
                  </p>
                )}
                <LabelPreview content={preview} title="Text preview" />
              </div>
            )}
          </div>

          <aside className="control-panel" aria-labelledby="control-heading">
            <h2 id="control-heading">You stay in control.</h2>
            <p>
              Review every detail before continuing. Anything unreadable stays
              unknown.
            </p>
            <label className="confirm">
              <input
                type="checkbox"
                checked={draft.acknowledged}
                aria-invalid={!!problemFor("ack")}
                aria-describedby={problemFor("ack") ? "ack-error" : undefined}
                onChange={(e) => {
                  set({ acknowledged: e.target.checked });
                  if (e.target.checked)
                    setProblems((list) =>
                      list.filter((p) => p.target !== "ack"),
                    );
                }}
              />
              <span>I confirm this is fictional demo information.</span>
            </label>
            {problemFor("ack") && (
              <p id="ack-error" className="field-error">
                <span aria-hidden="true">⚠ </span>
                {problemFor("ack")!.message}
              </p>
            )}

            {problems.length > 0 && (
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
                  {problems.map((p) => (
                    <li key={p.target}>{p.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {session.error && !serverPhotoError && (
              <ErrorBanner error={session.error} retrying={pending} />
            )}

            <button
              type="submit"
              className="primary"
              disabled={pending || checkingFile}
              aria-describedby="submit-hint"
            >
              {pending ? "Checking label details…" : "Check label details"}
              <span aria-hidden="true">→</span>
            </button>
            <p id="submit-hint" className="hint" aria-live="polite">
              {pending
                ? "Reading the label. This can take a few seconds."
                : "Nothing is read or saved until you continue."}
            </p>
          </aside>
        </div>
      </form>

      <section
        className="benefits shell"
        id="how"
        aria-labelledby="how-heading"
      >
        <h2 id="how-heading" className="sr-only">
          How it works
        </h2>
        <article>
          <span className="benefit-icon sage" aria-hidden="true">
            ◫
          </span>
          <div>
            <h3>Easy-to-read text</h3>
            <p>See label information in a clear, organized way.</p>
          </div>
        </article>
        <article>
          <span className="benefit-icon lavender" aria-hidden="true">
            ⌕
          </span>
          <div>
            <h3>Check every detail</h3>
            <p>Review what is readable and what is unknown.</p>
          </div>
        </article>
        <article>
          <span className="benefit-icon peach" aria-hidden="true">
            ○
          </span>
          <div>
            <h3>Choose what you share</h3>
            <p>Nothing is shared unless you choose to share it.</p>
          </div>
        </article>
      </section>
    </>
  );
}
