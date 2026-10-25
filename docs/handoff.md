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

## Contract v1.2 (additive, for F4 / B5)

`@labelbridge/contracts` 1.2.0. Wire `contractVersion` stays `"1"`. Fixture added: `shared-case.json`. The shared helpers `applySharing`, `applyPlanTasks`, `applyTaskAction`, `sharedView` and `fieldsRevisionOf` encode the rules; please use them, as with `applyFieldChanges`.

Backend implementer, please implement with B5:

- `PATCH /api/cases/:id/sharing` (patient): `sharingRequest` → `caseResponse` via `applySharing`. Turning sharing off clears field keys; later supporter requests must lose access immediately.
- `GET /api/shared` (supporter, same demo workspace): `sharedCasesResponse` built with `sharedView` (permitted values and review states only, plus tasks; no evidence, crops or raw text).
- `POST /api/cases/:id/plan` (patient): deterministic or AI suggestions passed through `applyPlanTasks`, which replaces earlier suggestions and keeps accepted or completed tasks untouched. Return `planResponse` with `fieldRevision = fieldsRevisionOf(case)`. Practical tasks only, never treatment advice.
- `PATCH /api/cases/:id/tasks/:taskId` (patient, or supporter when the case is shared): `applyTaskAction` → `taskActionResponse` (task plus caseRevision only, so a supporter never receives the full case). Map thrown errors: REVISION_CONFLICT/STATE_CONFLICT → 409, FORBIDDEN → 403, NOT_FOUND → 404. Ownership is checked by demo role (one person per role per workspace), which also avoids the actorId-per-switch problem.
- `fieldsRevision`: `applyFieldChanges` sets it; task, plan and sharing changes keep it. `buildExplanation` should report `fieldRevision: fieldsRevisionOf(case)` instead of `case.revision`, otherwise an explanation looks stale after a task is claimed.
- `applyFieldChanges` now drops proposed tasks (suggestions made for old fields) and keeps accepted or completed ones.

v1.2 review follow-ups (contract helpers updated):

- `sharedView` shares only confirmed values (unconfirmed shared fields show `value: null`) and redacts unshared or unconfirmed values from task descriptions. Planner prompts should still avoid quoting field values in task text.
- `applyTaskAction`: the patient may release a supporter-owned task once sharing is off, so it is not stranded.
- Please stub `PATCH /api/cases/:id/sharing` and `GET /api/shared` as NOT_IMPLEMENTED until built; today they fall through to NOT_FOUND, which the frontend has to probe to tell apart from a missing case.
- Redaction in `sharedView` is a guardrail, not a guarantee: it matches exact values (case-insensitive, whole-word, single digits included) and misses paraphrases or spacing variants such as "0.5mg" for "0.5 mg". Task text should never quote label values in the first place.

## Contract v1.4 (additive, pharmacy lookup)

`@labelbridge/contracts` 1.4.0. Wire `contractVersion` stays `"1"`: all additions are new objects and one widened enum, so existing payloads remain valid. Fixture added: `pharmacies.json` (fictional pharmacies). Implemented in this increment on both sides — `POST /api/cases/:id/pharmacies` in `apps/api` and `Pharmacies.tsx` in `apps/web` — so nothing is pending for either implementer; this entry records the shared decisions.

New: `coarseLocation`, `pharmacy`, `pharmacyLookup`, `pharmacySearchRequest`, `pharmaciesResponse`. Changed: `healthResponse.providers.search` widened from literal `"fixture"` to `"fixture" | "live"`.

Rules that live in the contract, not only in the adapter:

- `coarseLocation` is an allowlist: a 5-digit ZIP or a place name. A street address is rejected rather than forwarded, because the search provider is a third party and the plan permits only a nonidentifying location. Validate with this schema on both sides; the frontend uses it before sending so nothing leaves the browser.
- `pharmacySearchRequest` carries **no `expectedRevision`**, unlike every other `POST /api/cases/:id/*`. The list derives from the location alone, so a revision would imply a dependency that does not exist and would throw away a valid list whenever a task or sharing change bumped the case. Do not add one back without changing the UI accordingly.
- `pharmacyLookup.ordering` is the literal `"source_order"` and there is no distance field anywhere. A coarse location gives no point to measure from, so nothing may be presented as the "closest" pharmacy. If precise coordinates are ever collected, that is a new contract decision with its own privacy consequences, not a UI tweak.
- `status: "location_not_recognised"` exists because the provider answers an unusable location with a successful-looking list of pharmacies in unrelated states (see `docs/verification.md`). Treat it as a distinct state; `results` must be empty unless `status` is `"ok"`.
- `hoursText` is verbatim source text. Do not parse it into an "open now" badge: the data goes stale and sending someone to a closed pharmacy is a real harm.
- `providers.search: "live"` means only that the search adapter is configured. `savings-search` is still unimplemented and returns `NOT_IMPLEMENTED`; do not read the health flag as a claim about it.
