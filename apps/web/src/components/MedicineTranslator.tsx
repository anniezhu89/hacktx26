import { useEffect, useRef, useState } from "react";
import {
  eligibleForExplanation,
  type Case,
  type MedicineCandidate,
  type MedicineInfo,
} from "@labelbridge/contracts";
import { toApiError, type ApiError } from "../api/client";
import type {
  ExplanationMode,
  Language,
  WorkspaceClient,
} from "../api/workspace";
import { useSpeech } from "../state/useSpeech";

type Section = MedicineInfo["sections"][number];
type Candidates = Awaited<
  ReturnType<WorkspaceClient["medicineCandidates"]>
>["data"];

const SECTION_TITLE: Record<Section["key"], { en: string; es: string }> = {
  uses: { en: "Uses", es: "Usos" },
  side_effects: {
    en: "Common side effects",
    es: "Efectos secundarios comunes",
  },
  serious_warnings: { en: "Serious warnings", es: "Advertencias graves" },
  interactions: { en: "Interactions", es: "Interacciones" },
};
const MODES: { id: ExplanationMode; title: string; detail: string }[] = [
  { id: "overview", title: "Quick overview", detail: "Short and easy to scan" },
  {
    id: "terms",
    title: "Explain the terms",
    detail: "Plain-language definitions",
  },
  { id: "source", title: "Full source", detail: "Read the labeling passages" },
];
const STATUS_TEXT: Record<Section["summaryStatus"], string> = {
  ok: "",
  not_requested: "",
  no_source: "The labeling has no passage for this section.",
  disabled:
    "AI summaries are turned off on this server until reuse of the labeling text is confirmed. Showing the original text.",
  unavailable:
    "The AI summary is unavailable right now. Showing the original text.",
  rejected:
    "The AI summary did not pass our checks against its sources, so it is not shown. Showing the original text.",
};
const CHECK_ICON = {
  match: "✓",
  equivalent: "≈",
  mismatch: "✕",
  not_on_label: "–",
  unknown: "?",
} as const;
const CHECK_LABEL: Record<string, string> = {
  ingredients: "Ingredients",
  strength: "Strength per unit",
  form: "Dosage form",
  release: "Release type",
  brand: "Brand",
};

function SourceExplorer({
  section,
  info,
  language,
  onClose,
}: {
  section: Section | null;
  info: MedicineInfo;
  language: Language;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const [view, setView] = useState<"both" | "original" | "explanation">("both");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (section && !el.open) {
      opener.current = document.activeElement;
      el.showModal();
    } else if (!section && el.open) el.close();
  }, [section]);
  const source = section
    ? info.sources.find((s) => s.id === section.passages[0]?.sourceId)
    : undefined;
  const cited = new Set(
    section?.summary?.points.flatMap((p) => p.passageIds) ?? [],
  );
  const passages = section
    ? section.passages.filter((p) => !section.summary || cited.has(p.id))
    : [];
  const translationOf = (id: string) =>
    section?.translations?.find((t) => t.passageId === id)?.text;
  const explanationKind = section?.summary
    ? "AI summary"
    : section?.translations
      ? "AI translation"
      : null;
  return (
    <dialog
      ref={ref}
      className="source-panel"
      aria-labelledby="source-title"
      onClose={() => {
        onClose();
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
    >
      {section && (
        <>
          <header>
            <div>
              <span className="eyebrow">Source explorer</span>
              <h2 id="source-title">{SECTION_TITLE[section.key][language]}</h2>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close source explorer"
            >
              ×
            </button>
          </header>
          <div
            className="segmented source-toggle"
            role="group"
            aria-label="What to show"
          >
            {(["both", "original", "explanation"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? "active" : ""}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                disabled={v !== "original" && !explanationKind}
              >
                {v === "both"
                  ? "Side by side"
                  : v === "original"
                    ? "Original"
                    : (explanationKind ?? "Explanation")}
              </button>
            ))}
          </div>
          {!passages.length && (
            <p>No passage was retrieved for this section.</p>
          )}
          <div
            className={`passage-grid ${view !== "both" || !explanationKind ? "single" : ""}`}
          >
            {view !== "explanation" && (
              <section>
                <span className="content-label publisher">
                  Original labeling text (English)
                </span>
                {passages.map((p) => (
                  <blockquote key={p.id} id={`passage-${p.id}`}>
                    <p className="meta">{p.sectionTitle}</p>
                    <p>{p.text}</p>
                  </blockquote>
                ))}
              </section>
            )}
            {view !== "original" && explanationKind && (
              <section>
                <span className="content-label ai">
                  {explanationKind}
                  {language === "es" ? " (español)" : ""}
                </span>
                {section.summary
                  ? section.summary.points.map((pt) => (
                      <p key={pt.text}>
                        {pt.text}{" "}
                        <span className="meta">
                          (sources:{" "}
                          {pt.passageIds
                            .map(
                              (id) =>
                                passages.findIndex((p) => p.id === id) + 1,
                            )
                            .join(", ")}
                          )
                        </span>
                      </p>
                    ))
                  : passages.map((p) => (
                      <p key={p.id}>
                        {translationOf(p.id) ?? (
                          <span className="hint">
                            Not translated: shown in English only.
                          </span>
                        )}
                      </p>
                    ))}
              </section>
            )}
          </div>
          {source && (
            <div className="source-meta">
              <b>{source.publisher}</b>
              <a href={source.url} target="_blank" rel="noreferrer noopener">
                Open the supporting source
              </a>
              <span>{source.title}</span>
              <span>
                Document {source.documentId} · version{" "}
                {source.version ?? "not stated"} · updated{" "}
                {source.updatedAt ?? "not stated"}
              </span>
              <span>
                Retrieved {new Date(source.retrievedAt).toLocaleString()}
              </span>
              <small>
                DailyMed labeling is supplied by the manufacturer. Being listed
                on DailyMed does not by itself mean the product is FDA-approved.
              </small>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}

function CandidateCard({
  c,
  checked,
  onPick,
}: {
  c: MedicineCandidate;
  checked: boolean;
  onPick: () => void;
}) {
  const conflict = c.match.level === "conflict";
  return (
    <label className={`match-choice ${conflict ? "conflict" : ""}`}>
      <input
        type="radio"
        name="reference-match"
        checked={checked}
        disabled={conflict}
        onChange={onPick}
        aria-describedby={`match-${c.rxcui}`}
      />
      <span>
        <b>{c.name}</b>
        <small>
          {c.match.level === "formulation"
            ? "Matches the ingredients, strength, form and release type you confirmed"
            : conflict
              ? "Does not match your label: cannot be used"
              : "Partial match: check each line"}
        </small>
        <ul id={`match-${c.rxcui}`} className="check-list">
          {c.match.checks.map((k) => (
            <li key={k.attribute} className={`check-${k.status}`}>
              <span aria-hidden="true">{CHECK_ICON[k.status]} </span>
              <b>{CHECK_LABEL[k.attribute]}:</b> {k.note}
            </li>
          ))}
        </ul>
      </span>
    </label>
  );
}

export function MedicineTranslator({
  client,
  caseData,
}: {
  client: WorkspaceClient;
  caseData: Case;
}) {
  const eligible = eligibleForExplanation(caseData.fields);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<"lookup" | "choices" | "info">("lookup");
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [compared, setCompared] = useState(false);
  const [identity, setIdentity] = useState<MedicineCandidate | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [mode, setMode] = useState<ExplanationMode>("overview");
  const [info, setInfo] = useState<MedicineInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [explorer, setExplorer] = useState<Section | null>(null);
  const cache = useRef(new Map<string, MedicineInfo>());
  const latest = useRef(0);

  const run = async <T,>(work: () => Promise<T>) => {
    const token = ++latest.current;
    setPending(true);
    setError(null);
    try {
      const out = await work();
      return token === latest.current ? out : null;
    } catch (e) {
      if (token === latest.current) setError(toApiError(e));
      return null;
    } finally {
      if (token === latest.current) setPending(false);
    }
  };

  // Fetch once per identity, language and mode; never on every render.
  useEffect(() => {
    if (step !== "info" || !candidates) return;
    const key = `${candidates.identityKey}|${caseData.revision}|${language}|${mode}`;
    const hit = cache.current.get(key);
    if (hit) return setInfo(hit);
    setInfo(null);
    void run(() =>
      client.medicineInfo(caseData.id, {
        expectedRevision: caseData.revision,
        language,
        mode,
      }),
    ).then((r) => {
      if (!r) return;
      cache.current.set(key, r.data);
      setInfo(r.data);
    });
  }, [
    step,
    language,
    mode,
    candidates,
    caseData.id,
    caseData.revision,
    client,
  ]);

  const hasSpanish =
    language === "es" &&
    !!info?.sections.some(
      (s) => s.summary?.language === "es" || s.translations,
    );
  const speech = useSpeech(hasSpanish ? "es" : "en");
  const name =
    caseData.fields.find((f) => f.key === "medicationName")?.value ?? "";
  const formulation = ["strength", "dosageForm"]
    .map((k) => caseData.fields.find((f) => f.key === k)?.value)
    .filter(Boolean)
    .join(" · ");

  if (!eligible)
    return (
      <section className="medicine-info" aria-labelledby="translator-heading">
        <span className="eyebrow">
          Medicine translator · General reference information
        </span>
        <h3 id="translator-heading">Understand your medicine</h3>
        <p className="banner banner-blocked">
          <span aria-hidden="true">🔒 </span>Available after you confirm the
          medication name, strength, dosage form and directions. Nothing is
          looked up or guessed before then.
        </p>
      </section>
    );

  const textOf = (s: Section) => {
    if (s.summary) return s.summary.points.map((p) => p.text).join(" ");
    if (s.translations) return s.translations.map((t) => t.text).join(" ");
    return s.passages
      .slice(0, 3)
      .map((p) => p.text)
      .join(" ");
  };
  const warnings = info?.sections.find((s) => s.key === "serious_warnings");
  const sourceScope = info?.sources.find((s) => s.kind === "dailymed")?.scope;

  return (
    <section className="medicine-info" aria-labelledby="translator-heading">
      <span className="eyebrow">
        Medicine translator · General reference information
      </span>
      <h3 id="translator-heading">
        {step === "info"
          ? "Understand your medicine"
          : "Confirm the reference medicine"}
      </h3>
      <div className="medicine-identity">
        <div>
          <b>{name}</b>
          <span>{formulation}</span>
        </div>
        <span className="pill">Label fields confirmed by you</span>
      </div>
      <div aria-live="polite">
        {pending && (
          <p className="hint">
            {step === "lookup"
              ? "Looking for a supported reference…"
              : "Loading sourced information…"}
          </p>
        )}
        {error && (
          <div className="banner banner-error" role="alert">
            <p>
              <strong>
                {error.code === "STATE_CONFLICT"
                  ? "Your label changed."
                  : "Something went wrong."}
              </strong>{" "}
              {error.message}
            </p>
          </div>
        )}
      </div>

      {step === "lookup" && (
        <>
          {!candidates && (
            <div className="match-card">
              <label className="confirm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Send the confirmed name, strength and form to the U.S.
                  National Library of Medicine (RxNorm, DailyMed and
                  MedlinePlus) to find reference information. Your directions,
                  quantity and photo are not sent.
                </span>
              </label>
              <button
                type="button"
                className="primary fit"
                disabled={!consent || pending}
                onClick={() =>
                  void run(() =>
                    client.medicineCandidates(caseData.id, caseData.revision),
                  ).then((r) => r && setCandidates(r.data))
                }
              >
                Find the reference medicine
              </button>
            </div>
          )}
          {candidates?.status === "none" && (
            <div className="reference-state">
              <h4>No reliable reference match</h4>
              <p>
                We will not guess. Reference information is unavailable for this
                name, including fictional medicines. Your confirmed label
                details are unchanged.
              </p>
            </div>
          )}
          {candidates?.status === "unavailable" && (
            <div className="reference-state">
              <h4>Reference source unavailable</h4>
              <p>
                The lookup could not be completed. Try again later; do not rely
                on this area for urgent decisions.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => setCandidates(null)}
              >
                Try again
              </button>
            </div>
          )}
          {candidates && candidates.candidates.length > 0 && (
            <fieldset className="match-card">
              <legend>
                {candidates.status === "single"
                  ? "One possible reference medicine"
                  : "Possible reference medicines"}
              </legend>
              <div className="source-badges">
                <span className="rxnorm">RxNorm identity</span>
              </div>
              <p>
                We never choose a product for you. Compare each line with your
                label. A match on ingredient, strength and form does not mean it
                is the same manufacturer.
              </p>
              {candidates.candidates.map((c) => (
                <CandidateCard
                  key={c.rxcui}
                  c={c}
                  checked={picked === c.rxcui}
                  onPick={() => setPicked(c.rxcui)}
                />
              ))}
              <div className="banner banner-blocked">
                <p>
                  <strong>Strength is not the dose you take.</strong> Your label
                  directions decide how much is taken. This match does not
                  recommend a dose.
                </p>
              </div>
              <label className="confirm">
                <input
                  type="checkbox"
                  checked={compared}
                  onChange={(e) => setCompared(e.target.checked)}
                  disabled={!picked}
                />
                <span>
                  I compared this reference medicine with my confirmed label.
                </span>
              </label>
              <button
                type="button"
                className="primary fit"
                disabled={!picked || !compared || pending}
                onClick={() =>
                  void run(() =>
                    client.confirmMedicine(caseData.id, {
                      expectedRevision: caseData.revision,
                      rxcui: picked!,
                      identityKey: candidates.identityKey,
                    }),
                  ).then((r) => {
                    if (!r) return;
                    setIdentity(r.data.identity);
                    setStep("choices");
                  })
                }
              >
                Confirm reference match
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setCandidates({
                    ...candidates,
                    status: "none",
                    candidates: [],
                  });
                  setPicked(null);
                }}
              >
                None of these match my label
              </button>
            </fieldset>
          )}
        </>
      )}

      {step === "choices" && identity && (
        <div className="translator-setup">
          <button
            type="button"
            className="back"
            onClick={() => setStep("lookup")}
          >
            <span aria-hidden="true">← </span>Back to medicine match
          </button>
          <h4>Choose how to explore</h4>
          <fieldset>
            <legend>Language</legend>
            <div className="segmented">
              {(["en", "es"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={language === l ? "active" : ""}
                  aria-pressed={language === l}
                  onClick={() => setLanguage(l)}
                >
                  {l === "en" ? "English" : "Español"}
                </button>
              ))}
            </div>
            <p>
              {language === "es"
                ? "Publisher-provided Spanish (MedlinePlus) is linked first. Any AI translation is labeled, with the English original beside it."
                : "Original English labeling text."}
            </p>
          </fieldset>
          <fieldset>
            <legend>Explanation style</legend>
            <div className="view-choices">
              {MODES.map((m) => (
                <label key={m.id} className={mode === m.id ? "selected" : ""}>
                  <input
                    type="radio"
                    name="explanation-mode"
                    checked={mode === m.id}
                    onChange={() => setMode(m.id)}
                  />
                  <b>{m.title}</b>
                  <small>{m.detail}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className="primary fit"
            onClick={() => setStep("info")}
          >
            Understand this medicine
          </button>
        </div>
      )}

      {step === "info" && (
        <div className="translator-information">
          <div className="translator-toolbar">
            <button
              type="button"
              className="back"
              onClick={() => setStep("choices")}
            >
              <span aria-hidden="true">← </span>Change choices
            </button>
            <label>
              Language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
            <label>
              View
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ExplanationMode)}
              >
                {MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {info && (
            <>
              {/* Serious warnings stay visible in every view. */}
              <div className="banner banner-error persistent-warning">
                <p>
                  <strong>Serious warnings from the labeling.</strong>{" "}
                  {warnings?.passages.length
                    ? warnings.passages[0].text
                    : "The labeling retrieved has no serious-warnings passage. That does not mean there are no risks."}
                </p>
                {warnings?.passages.length ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setExplorer(warnings)}
                  >
                    Show all warning passages
                  </button>
                ) : null}
              </div>
              <div className="audio-bar">
                <b>Listen{hasSpanish ? " in Spanish" : " in English"}</b>
                <button
                  type="button"
                  onClick={() =>
                    speech.play(
                      info.sections
                        .map(
                          (s) =>
                            `${SECTION_TITLE[s.key][hasSpanish ? "es" : "en"]}. ${textOf(s)}`,
                        )
                        .join(" "),
                    )
                  }
                  disabled={
                    speech.state === "unavailable" || speech.state === "playing"
                  }
                >
                  <span aria-hidden="true">▶ </span>
                  {speech.state === "paused" ? "Resume" : "Listen"}
                </button>
                <button
                  type="button"
                  onClick={speech.pause}
                  disabled={speech.state !== "playing"}
                >
                  <span aria-hidden="true">Ⅱ </span>Pause
                </button>
                <button
                  type="button"
                  onClick={speech.stop}
                  disabled={
                    speech.state !== "playing" && speech.state !== "paused"
                  }
                >
                  <span aria-hidden="true">■ </span>Stop
                </button>
                <span className="pill lavender" aria-live="polite">
                  {speech.state === "unavailable"
                    ? "Audio unavailable: no on-device voice for this language"
                    : speech.state}
                </span>
              </div>
              <p className="applies-note">
                <b>Applies to:</b>{" "}
                {sourceScope === "product"
                  ? "one manufacturer's product labeling for this ingredient, strength and form. Your pharmacy's product may be from a different manufacturer."
                  : "ingredient-level information."}
              </p>
              <div className="info-card-grid">
                {info.sections.map((s) => (
                  <article
                    key={s.key}
                    className={`info-card ${s.key === "serious_warnings" ? "warning-card" : ""}`}
                  >
                    <div>
                      <span className="scope">
                        {s.summary
                          ? "AI summary of the labeling"
                          : s.translations
                            ? "AI translation"
                            : "Original labeling text"}
                      </span>
                      <h4>{SECTION_TITLE[s.key][language]}</h4>
                    </div>
                    {s.summary ? (
                      <ul>
                        {s.summary.points.map((p) => (
                          <li key={p.text}>{p.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <>
                        {STATUS_TEXT[s.summaryStatus] && (
                          <p className="hint">{STATUS_TEXT[s.summaryStatus]}</p>
                        )}
                        {s.translationStatus === "rejected" && (
                          <p className="hint">
                            Some passages did not pass translation checks and
                            are shown in English only.
                          </p>
                        )}
                        {s.translationStatus === "disabled" && (
                          <p className="hint">
                            AI translation is off on this server; passages are
                            shown in English.
                          </p>
                        )}
                        {(mode === "source"
                          ? s.passages
                          : s.passages.slice(0, 2)
                        ).map((p) => (
                          <p key={p.id}>
                            {s.translations?.find((t) => t.passageId === p.id)
                              ?.text ?? p.text}
                          </p>
                        ))}
                      </>
                    )}
                    {s.passages.length > 0 && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setExplorer(s)}
                      >
                        Show my source
                      </button>
                    )}
                  </article>
                ))}
              </div>
              <div className="interaction-check">
                <h4>General interactions are not a personalized check</h4>
                <p>{info.interactions.personalized.reason}</p>
                <span className="pill gray">
                  Personalized checker unavailable
                </span>
                <p>
                  <b>No “safe to take together” result is shown.</b>
                </p>
              </div>
              {info.educationLinks.length > 0 && (
                <div className="source-meta">
                  <b>
                    {language === "es"
                      ? "Información para pacientes de MedlinePlus (en español, escrita por el editor)"
                      : "Patient information from MedlinePlus.gov"}
                  </b>
                  {info.educationLinks.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      lang={l.language}
                    >
                      {l.title} (opens MedlinePlus.gov)
                    </a>
                  ))}
                </div>
              )}
              <ul className="notes">
                {info.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <SourceExplorer
                section={explorer}
                info={info}
                language={language}
                onClose={() => setExplorer(null)}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
