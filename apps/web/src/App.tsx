import { useEffect, useState } from "react";
import { healthResponse } from "@labelbridge/contracts";
import { api } from "./api";
import { Intake, type IntakeMode } from "./components/Intake";
import { Review } from "./components/Review";
import { useCaseSession } from "./state/useCaseSession";

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

export function App() {
  const session = useCaseSession(api);
  const [largeText, setLargeText] = useState(readLargeText);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("sample");

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
            Case data comes from built-in fictional fixtures in your browser.
            The server does not handle cases yet, and nothing is read by AI.
          </p>
        )}
        <HealthCheck />
        {session.expired && (
          <div className="banner banner-error" role="alert">
            <p>{session.expired}</p>
          </div>
        )}
        {session.result ? (
          <Review
            session={session}
            result={session.result}
            source={session.source}
            onUploadClearer={() => {
              setIntakeMode("image");
              session.startOver();
            }}
          />
        ) : (
          <Intake
            key={intakeMode}
            session={session}
            apiKind={api.kind}
            initialMode={intakeMode}
          />
        )}
      </main>
    </>
  );
}
