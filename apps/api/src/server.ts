import { communityConfig } from "./community/config";
import { CommunityService } from "./community/service";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountStore, approvedVolunteersFromEnv } from "./accounts";
import { createApp } from "./app";
import { geminiConfig } from "./providers/gemini";
import { serpApiConfig } from "./providers/serpapi";
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

const communityOptions = communityConfig();
const community = communityOptions.enabled
  ? new CommunityService(communityOptions)
  : null;
const port = Number(process.env.PORT || 3001);
// Local-only unless an operator opts in: a hosting platform reaches the server
// through its own proxy, so deploy with HOST=0.0.0.0.
const host = process.env.HOST || "127.0.0.1";
const proxyHops = Number(process.env.LABELBRIDGE_TRUST_PROXY || 0);
const cases = new CaseStore(Date.now);
const sessions = new SessionStore(Date.now);
setInterval(() => {
  cases.sweep();
  sessions.sweep();
}, 60_000).unref();

const extraction = geminiConfig();
const search = serpApiConfig();
const approvedVolunteers = approvedVolunteersFromEnv();
const accounts = new AccountStore(Date.now, approvedVolunteers);
// NLM services need no key. Summaries and translations of manufacturer
// labeling stay off unless the operator confirms reuse is permitted.
const allowDerivatives =
  process.env.LABELBRIDGE_ALLOW_LABELING_DERIVATIVES === "1";
const medicine =
  process.env.LABELBRIDGE_REFERENCE_LOOKUPS === "0"
    ? null
    : { fetchImpl: fetch, ai: extraction, allowDerivatives };
setInterval(() => accounts.sweep(), 60 * 60_000).unref();
createApp(undefined, {
  cases,
  sessions,
  extraction,
  search,
  accounts,
  medicine,
  community,
  trustProxy: proxyHops > 0 ? proxyHops : undefined,
}).listen(port, host, () =>
  console.log(
    `LabelBridge server: http://${host}:${port} — image extraction: ` +
      `${extraction ? `live (${extraction.model})` : "fixture (no GEMINI_API_KEY)"}; ` +
      `pharmacy search: ${search ? "live" : "fixture (no SERPAPI_API_KEY)"}; ` +
      `reference lookups: ${medicine ? "on (NLM)" : "off"}; ` +
      `AI labeling summaries: ${medicine && allowDerivatives && extraction ? "on" : "off"}; ` +
      `approved volunteers: ${approvedVolunteers.size}; ` +
      `in-memory demo state is lost on restart`,
  ),
);
