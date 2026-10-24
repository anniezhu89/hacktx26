# Implementer handoff

Repository: C:/Users/wongc/Downloads/hacktx26
Frontend branch/worktree: agent/frontend at C:/Users/wongc/Downloads/hacktx26/.worktrees/frontend
Backend branch/worktree: agent/backend at C:/Users/wongc/Downloads/hacktx26/.worktrees/backend
Integrator remains in the root checkout. Shared contract: packages/contracts/src/index.ts. Fixture files are shared validation inputs, not live provider output.

Frontend: begin F1 within apps/web, using shared fixtures and schemas. Request mock-handler dependencies through integrator. Start with intake/review, loading/errors, evidence and explicit unresolved states. Do not call providers from browser.

Backend: begin B1 within apps/api: opaque demo session cookies, authorized case store, actual text intake, field revision updates and invalidation. All routes beyond health currently return a safe NOT_IMPLEMENTED envelope. Implement multipart image schema/route handling with the planned signature/size/dimension validation before image support. Coordinate any contract adjustment before consuming it.

Only fixture-mode health is wired end to end. The eligibility/revision helpers are tested but are not yet an operational case workflow. Proposed session setup route contract is provided as an extension point; coordinate its path and sharing/image request contracts before implementation.

Each agent runs npm ci in its worktree. Portable Node is available from the root checkout, not copied into worktrees. Separate development ports: frontend WEB_PORT=5173/API_TARGET=http://127.0.0.1:3001; backend PORT=3002 for independent development. When jointly testing backend 3002, set frontend API_TARGET accordingly. Do not run simultaneous verification suites on default smoke ports; set SMOKE_PORT and SMOKE_WEB_PORT to distinct ports per process.

Follow AGENTS.md and the plan's required handoff format. Request dependency/contract updates from integrator. Do not modify another writer's files, the lockfile or shared tests. No agents have been launched automatically.

## Executed foundation checks

Author suite: format/lint/types, six fixtures, eight unit/API tests, production build. Chromium foundation smoke: two tests cover production serving and the development proxy (including a 360px keyboard check). Initial committed-SHA verification exposed Windows CRLF conversion and was marked FAILED; the corrective LF rule must pass clean verification before these branches are created. Consult `.verification/<final-SHA>.json` for the actual committed-SHA status. No live provider calls, hosted CI execution or deployment is claimed.
