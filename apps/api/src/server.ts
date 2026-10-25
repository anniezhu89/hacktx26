import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { geminiConfig } from "./providers/gemini";
import { SessionStore } from "./session";
import { CaseStore } from "./store";

// Repository root, from both src/server.ts (tsx dev) and dist/server.js.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
try {
  // Node's own loader; no dependency. Absent .env simply leaves fixture mode on.
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // No .env file: providers stay unconfigured and the demo runs on fixtures.
}

const port = Number(process.env.PORT || 3001);
const cases = new CaseStore(Date.now);
const sessions = new SessionStore(Date.now);
setInterval(() => {
  cases.sweep();
  sessions.sweep();
}, 60_000).unref();

const extraction = geminiConfig();
createApp(undefined, { cases, sessions, extraction }).listen(
  port,
  "127.0.0.1",
  () =>
    console.log(
      `LabelBridge server: http://127.0.0.1:${port} — image extraction: ` +
        `${extraction ? `live (${extraction.model})` : "fixture (no GEMINI_API_KEY)"}; ` +
        `in-memory demo state is lost on restart`,
    ),
);
