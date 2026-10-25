# LabelBridge

Synthetic healthcare accessibility prototype foundation. Read [the build specification](docs/LabelBridge_Agent_Build_Plan.md) and [verification status](docs/verification.md). Only the fixture-mode health connection is implemented. No clinical workflow or provider call is operational.

Requires Node **24.22.1**, npm **11.19.1**. One npm lockfile. Install Node through your version manager, then from the repository root:

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to http://127.0.0.1:3001. Production:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. Express serves the frontend build and `/api/health`. Bind address is loopback. `PORT`, `WEB_PORT`, and `API_TARGET` customize local ports/proxy. Environment files are placeholders for future adapters; the foundation does not load them or call providers.

```sh
npm run check
npm run smoke
# Stage intended files explicitly, then:
npm run commit:verified -- "Describe your increment"
# Verify an existing committed SHA:
npm run verify:sha -- HEAD
```

`check`: format, lint, types, six fixture validations, unit/API tests, production build. `smoke`: real Chromium frontend/API checks over production serving and development proxy. Build before smoke. Chromium must be installed once per machine. No retries hide failures. Clean verification runs `npm ci`, `check`, `smoke` in a new detached worktree; ignored credentials are not copied. Reports are `.verification/<SHA>.json`; verification trees remain for evidence and diagnosis. Independent review is still required.

On this machine a checksum-verified portable Node is under ignored `.tools/node-v24.22.1-win-x64`. In PowerShell, enable it for your session:

```powershell
$env:PATH="C:\Users\wongc\Downloads\hacktx26\.tools\node-v24.22.1-win-x64;$env:PATH"
```

Use `npm.cmd` if PowerShell execution policy blocks `npm.ps1`. Agents use separate worktrees described in docs/handoff.md. Do not start both agents in this directory. Dependency requests go to the integrator. CI is configured for GitHub; execution and branch protection are not assumed.

## Community Resource Board (optional)

Community is additive and disabled by default. Keep `COMMUNITY_BOARD_ENABLED=0` to hide its navigation and disable its routes; medication, account, sharing and volunteer functions do not require community credentials.

For a synthetic Austin demo, add these lines to your untracked root `.env`, then restart the API:

```dotenv
COMMUNITY_BOARD_ENABLED=1
COMMUNITY_DATA_MODE=fixture
```

For live retrieval, set `COMMUNITY_DATA_MODE=live`, `SERPAPI_API_KEY`, `META_API_KEY`, `META_MODEL=muse-spark-1.3`, and `OPENCAGE_API_KEY`. The community Muse adapter uses `https://api.meta.ai/v1/chat/completions` with strict JSON-schema output; it is independent of medication prompts/providers. Never use a `VITE_` prefix for secrets. Missing credentials yield explicit unavailable/partial community states and never silently substitute fictional events. Without OpenCage, live venues stay in “Distance not verified”; live radius verification is unavailable. ZIP searches require geocoding to a city.

```powershell
npm ci
npm run dev
# Or production locally:
npm run build
npm start
# Verification (synthetic; no live credits):
npm run check
npm run smoke
```

Production is http://localhost:3001; development is http://localhost:5173. Use Node from `.nvmrc` / `.node-version`. Search location accepts a city/state or five-digit ZIP, never a home address. The initial demo is Austin, TX; fixtures also accept 78701. Select up to three interests explicitly. Searches never consult medication or insurance data. Search controls do not change the profile; “Save as default” explicitly saves coarse location and board preferences to the existing demo account.

No database migration or manual seed command is needed: this checkout uses in-memory stores. Community fixtures are `fixtures/community/retrieval.json`, with clearly fictional events whose dates are generated relative to the fixture clock. Saves and defaults are per account, retained for at most seven days in memory and lost on restart. Saving is private; sharing copies only the public source URL. Registration stays on the source website.

Optional limits (positive integers; maxima shown): `COMMUNITY_MAX_QUERIES=3`, `COMMUNITY_MAX_DETAILS=5`, `COMMUNITY_CONCURRENCY=2` (max 4), `COMMUNITY_CACHE_MINUTES=60` (max 1440), `COMMUNITY_COOLDOWN_SECONDS=60` (max 3600), `COMMUNITY_TIMEOUT_MS=45000` (max 60000). Query/detail budgets count logical requests; transient timeout/429/5xx requests may retry once. Public retrieval is cached by area, sorted categories, kind, date window and language, never patient identity. Identical concurrent searches coalesce. OpenCage requests are serialized with 1.1-second spacing, cached for 24 hours and coalesced. At most 24 candidates are normalized per refresh. Source pages are not fetched or rendered as HTML; discovery evidence is not organizer confirmation. Full source provenance and original retrieval timestamps remain visible.

Provider documentation: [SerpApi events](https://serpapi.com/google-events-api), [event details](https://serpapi.com/google-event-details-api), [Meta structured output](https://dev.meta.ai/docs/cookbook/structured-output), [Meta chat completions](https://dev.meta.ai/docs/protocols/chat-completions), [OpenCage API](https://opencagedata.com/api), [Temporal timezone handling](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).
