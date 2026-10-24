import { useCallback, useEffect, useRef, useState } from "react";
import { healthResponse } from "@labelbridge/contracts";
import { api } from "./api";
import type { Role } from "./api/client";
import { Intake, type IntakeMode } from "./components/Intake";
import { Review } from "./components/Review";
import { VolunteerView } from "./components/VolunteerView";
import { useCaseSession } from "./state/useCaseSession";
import { useReviewerQueue } from "./state/useReviews";

const LARGE_TEXT_KEY = "labelbridge.largeText";

function readLargeText() {
  try {
    return localStorage.getItem(LARGE_TEXT_KEY) === "1";
  } catch {
    return false;
  }
}

function HealthCheck() {
  const [status, setStatus] = useState("Not connected");
  const [pending, setPending] = useState(false);
  async function connect() {
    setPending(true);
    setStatus("Connecting");
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("Request failed");
      const result = healthResponse.parse(await response.json());
      setStatus(
        `Backend connected. Data mode: ${result.dataMode}. Contract version: ${result.contractVersion}.`,
      );
    } catch {
      setStatus("Connection failed. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="health">
      <button disabled={pending} onClick={connect}>
        Check backend connection
      </button>
      <p role="status">{status}</p>
    </div>
  );
}

// Mounted only in the volunteer view, so the queue loads when it is opened.
function VolunteerPane() {
  return <VolunteerView queue={useReviewerQueue(api)} />;
}

export function App() {
  const session = useCaseSession(api);
  const [largeText, setLargeText] = useState(readLargeText);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("sample");
  const [persona, setPersona] = useState<Role>("patient");
  const [announcement, setAnnouncement] = useState("");
  const focusedCase = useRef<string | null>(null);
  const focusOnce = useCallback((caseId: string) => {
    if (focusedCase.current === caseId) return false;
    focusedCase.current = caseId;
    return true;
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("large-text", largeText);
    try {
      localStorage.setItem(LARGE_TEXT_KEY, largeText ? "1" : "0");
    } catch {
      // Storage may be unavailable; the toggle still works for this visit.
    }
  }, [largeText]);

  return (
    <>
      <header className="site-header">
        <p className="demo-flag">Demo: fictional medication data</p>
        <button
          type="button"
          aria-pressed={largeText}
          onClick={() => setLargeText((v) => !v)}
        >
          Large text
        </button>
      </header>
      <main className="stack">
        <h1>LabelBridge</h1>
        {api.kind === "mock" && (
          <p className="banner banner-info">
            This build uses built-in fictional fixtures in your browser instead
            of the server. Nothing is read by AI.
          </p>
        )}
        <HealthCheck />
        <fieldset className="persona">
          <legend>Demo view (switching is a demo feature, not a login)</legend>
          <div className="choices inline">
            {(
              [
                ["patient", "Patient"],
                ["reviewer", "Volunteer reader"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="choice">
                <input
                  type="radio"
                  name="persona"
                  value={id}
                  checked={persona === id}
                  onChange={() => {
                    setPersona(id);
                    setAnnouncement(`Showing the ${label.toLowerCase()} view.`);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        {persona === "reviewer" ? (
          <VolunteerPane />
        ) : session.result ? (
          <Review
            focusOnce={focusOnce}
            api={api}
            session={session}
            result={session.result}
            source={session.source}
            onUploadClearer={() => {
              setIntakeMode("image");
              session.startOver();
            }}
          />
        ) : (
          <>
            {session.expired && (
              <div className="banner banner-error" role="alert">
                <p>{session.expired}</p>
              </div>
            )}
            <Intake
              key={intakeMode}
              session={session}
              apiKind={api.kind}
              initialMode={intakeMode}
            />
          </>
        )}
      </main>
    </>
  );
}
