import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { healthResponse } from "@labelbridge/contracts";
import "./style.css";
function App() {
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
    <main>
      <p>Demo: fictional medication data</p>
      <h1>LabelBridge</h1>
      <p>
        Foundation preview. Medication intake and support workflows are under
        construction.
      </p>
      <button disabled={pending} onClick={connect}>
        Check backend connection
      </button>
      <p role="status">{status}</p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
