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
