import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SAMPLES, buildSampleCase, buildTextCase, buildUploadCase } from "../domain/samples";
import { delay, validateImage } from "../domain/rules";
import { useCase } from "../state/CaseContext";
import { LabelFace } from "../components/LabelFace";
import { Alert, Page } from "../components/ui";

type Draft =
  | { kind: "sample"; id: string }
  | { kind: "text"; text: string }
  | { kind: "upload"; name: string; url: string };

export function IntakeScreen() {
  const navigate = useNavigate();
  const { startCase } = useCase();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function rememberUrl(url: string) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = url;
  }

  function chooseFile(file: File | undefined) {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setError(problem);
      setDraft((current) => (current?.kind === "upload" ? null : current));
      return;
    }
    const url = URL.createObjectURL(file);
    rememberUrl(url);
    setError(null);
    setDraft({ kind: "upload", name: file.name, url });
  }

  async function start() {
    if (!draft) {
      setError("Choose a sample label, a photo, or typed directions first.");
      return;
    }
    if (draft.kind === "text" && draft.text.trim().length < 3) {
      setError("Type the directions you want to review.");
      return;
    }
    if (!ack) {
      setError("Confirm that this demo uses fictional medication data.");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setBusy(true);
    await delay(600);
    if (!mounted.current) return;
    const medCase =
      draft.kind === "sample"
        ? buildSampleCase(draft.id)
        : draft.kind === "text"
          ? buildTextCase(draft.text)
          : buildUploadCase(draft.url, draft.name);
    if (draft.kind === "upload") previewUrl.current = null;
    startCase(medCase);
    navigate("/review");
  }

  const sample = draft?.kind === "sample" ? SAMPLES.find((item) => item.id === draft.id) : null;

  return (
    <Page
      kicker="Start"
      title="Read the label before you do anything else."
      lede="Check a fictional medication label, confirm the words, see a plain-language reading of those directions, look up savings resources, and share practical tasks. This demo does not decide whether a dose is safe."
    >
      {error ? (
        <Alert tone="rose" title="Cannot start yet">
          <p>{error}</p>
        </Alert>
      ) : null}

      <section className="lb-stack" aria-labelledby="samples-title">
        <h2 id="samples-title" className="lb-h2">
          Choose a sample label
        </h2>
        <div className="lb-samples">
          {SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="lb-choice"
              aria-pressed={draft?.kind === "sample" && draft.id === item.id}
              onClick={() => {
                setDraft({ kind: "sample", id: item.id });
                setError(null);
              }}
            >
              <span className="lb-kicker">{item.title}</span>
              <strong>{item.drug}</strong>
              <span className="lb-muted">{item.situation}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="lb-or">or bring your own fictional label</p>

      <div className="lb-split-even">
        <section className="lb-card lb-stack">
          <h2 className="lb-h2">Upload a JPEG or PNG</h2>
          <p className="lb-muted">Up to 5 MB. The preview is shown, and the fields start blank because this demo does not read the file.</p>
          <label className="lb-btn lb-btn-secondary">
            Choose a JPEG or PNG
            <input
              ref={fileRef}
              className="lb-sr"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </label>
          <p className="lb-help">{draft?.kind === "upload" ? draft.name : "Optional. JPEG or PNG, up to 5 MB."}</p>
        </section>
        <section className="lb-card lb-stack">
          <h2 className="lb-h2">Type the directions</h2>
          <p className="lb-muted">Use this when there is no image. The demo will not invent a drug name from the sentence.</p>
          <label className="lb-field" htmlFor="typed-directions">
            <span className="lb-sr">Typed directions</span>
            <textarea
              id="typed-directions"
              className="lb-input"
              maxLength={2000}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Take 1 tablet by mouth once daily."
            />
          </label>
          <button
            type="button"
            className="lb-btn lb-btn-secondary"
            onClick={() => {
              if (text.trim().length < 3) {
                setError("Type the directions you want to review.");
                return;
              }
              setDraft({ kind: "text", text });
              setError(null);
            }}
          >
            Use typed directions
          </button>
        </section>
      </div>

      {draft ? (
        <section className="lb-card lb-stack" aria-labelledby="preview-title">
          <h2 id="preview-title" className="lb-h2">
            Preview before you start
          </h2>
          <p className="lb-muted">
            {draft.kind === "sample"
              ? sample?.situation
              : draft.kind === "text"
                ? "You will review the typed words. Other fields stay blank."
                : `${draft.name} will be shown for review. Fields stay blank until you type what you can see.`}
          </p>
          {draft.kind === "sample" && sample ? (
            <LabelFace lines={sample.lines} imageUrl={null} imageAlt="" compact />
          ) : null}
          {draft.kind === "text" ? (
            <LabelFace lines={[{ text: draft.text, key: "directions" }]} imageUrl={null} imageAlt="" />
          ) : null}
          {draft.kind === "upload" ? (
            <LabelFace lines={[]} imageUrl={draft.url} imageAlt={`Preview of ${draft.name}`} />
          ) : null}
          <label className="lb-check">
            <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
            <span>I understand this demo uses fictional medication data and is not medical advice.</span>
          </label>
          <button type="button" className="lb-btn lb-btn-primary" onClick={() => void start()} disabled={busy} aria-busy={busy}>
            {busy ? "Starting…" : "Start this case"}
          </button>
        </section>
      ) : null}
    </Page>
  );
}
