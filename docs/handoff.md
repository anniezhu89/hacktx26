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

## Contract v1.1 (additive, for F2 / B3)

`@labelbridge/contracts` 1.1.0. Wire `contractVersion` stays `"1"`: existing payloads remain valid and none of the affected routes were implemented yet. Fixtures added: `ambiguous.json`, `review-submitted.json`, `reviewer-view.json`.

Backend implementer, please implement with B3:

- `GET /api/cases/:id/reviews` (patient owner): `reviewsResponse`, so the patient can see status and proposals.
- `POST /api/reviews/:id/claim` now returns `reviewerViewResponse` (was `reviewResponse`); add `GET /api/reviews/:id` (claimer only) returning the same.
- `reviewerView.excerpts` has one entry per selected field: `textExcerpt` is verbatim patient-supplied label text or null, plus `crop`. Never include extracted values, `rawText` or other AI output. The queue (`GET /api/reviews`) shows no excerpts before a claim.
- `GET /api/reviews/:id/image` (claimer only) serves the stored image; `imageUrl` must be that exact path or null.
- `PATCH /fields` changes may carry `fromReviewId`. `applyFieldChanges` then records provenance `volunteer`; the server must first check that the review belongs to the case, is `submitted`, and proposed exactly that value for that key, else 409/400. It never auto-confirms.
- Extraction fixes requested earlier: a medication name on its own line, dosage form taken from the name line, and "Use as directed." should stay unresolved with a question (see `fixtures/ambiguous.json`).
