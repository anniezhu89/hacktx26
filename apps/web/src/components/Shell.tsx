import { useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { criticalReviewDone, medicationTitle, shortId } from "../domain/rules";
import { useCase } from "../state/CaseContext";
import type { Persona } from "../domain/types";

const STEPS = [
  { to: "/", label: "Start", id: "start" },
  { to: "/review", label: "Review", id: "review" },
  { to: "/understand", label: "Understand", id: "understand" },
  { to: "/savings", label: "Savings", id: "savings" },
  { to: "/plan", label: "Plan", id: "plan" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const { medCase, persona, setPersona, largeText, setLargeText, reset, liveMessage, dismissClearedNote } = useCase();
  const navigate = useNavigate();
  const location = useLocation();
  const medRef = useRef(medCase);
  const personaWas = useRef(persona);
  medRef.current = medCase;

  useEffect(() => {
    document.getElementById("page-title")?.focus();
  }, [location.pathname]);

  useEffect(() => {
    if (personaWas.current === persona) return;
    personaWas.current = persona;
    if (persona === "reviewer") navigate("/queue");
    else if (persona === "supporter") navigate("/plan");
    else navigate(medRef.current ? "/review" : "/");
  }, [persona, navigate]);

  const home = persona === "reviewer" ? "/queue" : persona === "supporter" ? "/plan" : "/";

  return (
    <>
      <a className="lb-skip" href="#main">
        Skip to content
      </a>
      <div className="lb-sr" aria-live="polite">
        {liveMessage}
      </div>
      <div className="lb-sticky">
        <div className="lb-banner">Demo: fictional medication data. Not medical advice, and not a pharmacy quote.</div>
        <header className="lb-topbar">
          <Link to={home} className="lb-brand">
            <span className="lb-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="32" height="32">
                <rect x="4" y="6" width="24" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M9 13h14M9 17h10M9 21h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            LabelBridge
          </Link>
          <div className="lb-tools">
            <span className="lb-pill lb-pill-ink">Fixture data</span>
            <button
              type="button"
              className={largeText ? "lb-btn lb-btn-quiet is-on" : "lb-btn lb-btn-quiet"}
              aria-pressed={largeText}
              onClick={() => setLargeText(!largeText)}
            >
              {largeText ? "Large text on" : "Large text"}
            </button>
            <label className="lb-tool-label">
              Viewing as
              <select
                className="lb-input"
                value={persona}
                onChange={(event) => setPersona(event.target.value as Persona)}
              >
                <option value="patient">Patient</option>
                <option value="supporter">Supporter</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </label>
            {medCase ? (
              <button
                type="button"
                className="lb-btn lb-btn-quiet"
                onClick={() => {
                  reset();
                  setPersona("patient");
                  navigate("/");
                }}
              >
                New case
              </button>
            ) : null}
          </div>
        </header>
        {persona === "patient" ? (
          <nav className="lb-steps" aria-label="Case steps">
            <ol>
              {STEPS.map((step, index) => {
                const locked = step.id !== "start" && !medCase;
                const note = stepNote(step.id, medCase);
                return (
                  <li key={step.id}>
                    {locked ? (
                      <span aria-disabled="true">
                        <span className="lb-step-index">{index + 1}</span>
                        {step.label}
                      </span>
                    ) : (
                      <NavLink to={step.to} end={step.to === "/"}>
                        <span className="lb-step-index">{index + 1}</span>
                        {step.label}
                        {note ? <span className="lb-step-note">{note}</span> : null}
                      </NavLink>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : (
          <nav className="lb-steps" aria-label="Demo view">
            <ol>
              <li>
                <NavLink to={home}>{persona === "reviewer" ? "Reading queue" : "Shared plan"}</NavLink>
              </li>
            </ol>
          </nav>
        )}
      </div>
      <main id="main" className="lb-main lb-stack-lg">
        {medCase && persona === "patient" ? (
          <p className="lb-faint">
            {medicationTitle(medCase)} · Revision {medCase.revision} · Case {shortId(medCase.id)} · Fixture
          </p>
        ) : null}
        {medCase?.clearedNote && persona === "patient" ? (
          <div className="lb-alert lb-alert-amber" role="status">
            <strong>Results cleared</strong>
            <p>
              A label field changed. The explanation, savings results, and unaccepted suggestions were cleared.
              Accepted tasks were kept.
            </p>
            <button type="button" className="lb-btn lb-btn-quiet" onClick={dismissClearedNote}>
              Dismiss
            </button>
          </div>
        ) : null}
        {children}
        <p className="lb-footnote">
          Synthetic demo. The case stays in this browser tab and disappears on refresh. Nothing here verifies a dose,
          a price, or an insurance benefit.
        </p>
      </main>
    </>
  );
}

function stepNote(
  id: (typeof STEPS)[number]["id"],
  medCase: ReturnType<typeof useCase>["medCase"],
) {
  if (!medCase) return "";
  if (id === "review" && criticalReviewDone(medCase)) return "Checked";
  if (id === "understand" && medCase.explanation) return "Ready";
  if (id === "savings" && medCase.savings) return "Ready";
  if (id === "plan" && medCase.tasks.some((task) => task.status !== "proposed")) return "Active";
  return "";
}
