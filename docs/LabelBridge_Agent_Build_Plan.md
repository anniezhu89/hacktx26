# LabelBridge: frontend, backend, and verification briefs

Working build plan • HackTX • October 24, 2026

This document is a proposed implementation specification, not an implemented or tested application. The project name is provisional. It incorporates the agreed medication-label, savings, shared-support, and volunteer-review concepts. Automated checks reduce risk; they do not establish clinical correctness or guarantee uptime.

## 1. Team and AI assignments

| Role                                | Recommended setup                                                                                   | Responsibility                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Frontend implementer                | Cursor Agent, using an available strong coding model                                                | React UI, accessibility, contract-based mock responses, UI tests                                                  |
| Backend implementer                 | Claude Code if available; otherwise a separate Cursor Agent using Claude                            | API, validation, provider adapters, storage, search normalization, backend tests                                  |
| Integrator and independent reviewer | ChatGPT/Codex with repository access; otherwise ChatGPT reviewing supplied diffs and command output | Initial scaffold and contract, integration branch, adversarial review, end-to-end checks, release evidence        |
| In-app AI provider                  | Meta API if the available account supports the required input/output                                | Extract or explain text and summarize shared needs; this is an application service, not another repository writer |
| Search provider                     | SerpApi, called only by backend                                                                     | Sourced drug-information and savings-resource discovery                                                           |

Cursor is the coding environment; Claude and other models may run inside it. Do not treat those as mutually exclusive choices. Ordinary ChatGPT/Claude subscriptions do not by themselves prove API or terminal access. Do a capability check first. If Claude is browser-only, use it for backend design/review and have Cursor apply changes. A chat-only reviewer cannot honestly claim to have run tests.

Avoid model churn during the hackathon. Assign ownership and keep one writer per worktree. Use a second model for review rather than having two models repeatedly rewrite the same feature.

## 2. Target outcome and strict scope

Demo story: a patient uploads a fictional medication label, reviews extracted fields, understands the original instructions, discovers sourced affordability options, and coordinates practical help with a trusted supporter. If a field cannot be read, a simulated volunteer offers a transcription or requests a new image. Unresolved medication details remain unresolved.

### Must finish

1. Fictional sample-label upload plus text fallback.
2. Editable, source-linked extraction of name, strength, dosage form, quantity, and exact directions, with unknowns left blank.
3. Original directions beside a faithful plain-language explanation and linked reference material for two or three supported sample products.
4. Volunteer transcription workflow, including an unreadable-image outcome.
5. Sourced savings resources and a shared practical task checklist with patient/supporter/reviewer demo views.
6. Large text, keyboard access, loading/error/retry states, and a reproducible local demo.

### Finish next if core works

One reviewed second language, browser audio playback, a polished shared-plan summary, and deployment. Live retrieval can fail without preventing label review and task coordination.

### Exclude from this build

Drug interaction checking, clinical dose verification, medication changes, pill identification from appearance, automatic schedules inferred from ambiguous directions, actual insurance adjudication, guaranteed lowest-price claims, real volunteer recruitment, real-patient accounts, notifications to other people, and unrestricted real-patient uploads.

Use synthetic data throughout. Label every screen with a compact “Demo: fictional medication data” indicator. A public demo must not expose private case data or a real reviewer queue. Production authentication, clinician workflows, and genuine patient-data handling are separate work.

## 3. Bootstrap and coordination: complete before parallel implementation

Integrator owns this phase. Read existing repository instructions first; adapt this plan to an established stack rather than replacing it.

If starting fresh, use one TypeScript repository with npm workspaces:

```text
apps/web/                 React + Vite frontend
apps/api/                 Node + Express backend
packages/contracts/      Zod schemas, inferred TypeScript types, shared enums
fixtures/                Synthetic labels and sanitized provider fixtures
tests/e2e/               Playwright journey tests
scripts/                 Check commands, commit-verification wrapper
docs/                    Provider setup, architecture, demo runbook
```

Select currently compatible stable dependencies, pin a supported Node version, and commit the lockfile. Use one package manager. Production backend serves the compiled web assets; development frontend proxies `/api` to the backend. This avoids unnecessary cross-origin setup.

Create branches `agent/frontend` and `agent/backend` with separate worktrees. Integrator controls `packages/contracts`, root configuration, lockfile, test runner setup, and integration merges. Frontend owns `apps/web`; backend owns `apps/api`; reviewer owns `tests/e2e`. Request shared changes through the integrator. Do not edit another agent's uncommitted files or perform destructive Git commands.

Bootstrap shared contracts, fixtures, root scripts, and one fake working request before agents split. Frontend uses the same contract-valid fixtures the backend uses in tests. Contract changes require a version change, updated fixtures, and both implementers being notified.

### Capability spike: first 45 minutes

- Confirm Meta credentials, endpoint, model identifier, image support, structured-output support, and an actual minimal successful request. Never invent SDK methods or assume slide-listed products are accessible.
- If Meta image input works, use it for extraction. If only text works, use a tested OCR adapter then Meta for text interpretation. If neither works quickly, retain text intake and clearly labeled fixture image extraction. Do not describe fixture output as live AI.
- If Gemini API credentials are separately available, it can be the extraction adapter from the original plan. Do not assume access merely because ChatGPT, Claude, or Cursor is available.
- Confirm one SerpApi query with actual credits; capture a sanitized fixture and test empty-result/error cases.
- Confirm both agents can install, start the application, and run the same checks. Establish the local path before trying hosting.
- Try an early deployment only after the local skeleton runs; timebox hosting investigation to 45–60 minutes. Hosting is independent of which AI builds the code.

## 4. Shared API and data contract

Implement these in `packages/contracts` first. Do not rely on prose alone: generate executable request/response schemas and representative fixtures. All identifiers are opaque strings; timestamps are ISO strings. Every resource response includes `contractVersion: "1"`, `requestId`, and `dataMode: "live" | "cached" | "fixture"`.

### Core objects

- `Case`: id, revision integer, createdAt, expiresAt, fictionalData=true, case status, extracted fields, sharing settings, questions, tasks.
- `LabelField`: key, rawText nullable, value nullable, evidence excerpt, crop coordinates nullable, provenance (`ai`, `user`, `volunteer`), and review state (`unreviewed`, `user_confirmed`, `needs_help`, `unresolved`). Coordinates must be in normalized 0–1 image space; text fallback uses text excerpts instead.
- Critical fields: medication name, strength, dosage form, and exact directions. Human confirmation means transcription review, never clinical approval. Quantity is required for any product-specific price comparison.
- `Explanation`: original directions, simplified text, field revision, reference passages and URLs, unresolved questions, and `eligibleForExplanation`.
- `SavingsOption`: source title, URL, retrieval timestamp, matched product attributes, option type, amount nullable, currency nullable, price basis (`source_listed`, `estimate`, `unknown`), eligibility notes, and missing requirements. An amount is allowed only with supporting source evidence. A source-listed price is not a pharmacy-confirmed payable quote.
- `Task`: id, category (`research`, `call_pharmacy`, `transport`, `review_label`), description, owner nullable, status, and acceptedAt nullable. AI-proposed tasks start unassigned; only explicit action accepts one.
- `ReviewRequest`: id, caseId, case revision, selected fields, consent timestamp, status (`pending`, `claimed`, `submitted`, `needs_new_image`, `closed`), and transcription proposals. Never call a result “medication verified.”

### Routes

| Method and path                      | Input                                                            | Output / behavior                                                      |
| ------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GET `/api/health`                    | None                                                             | App status, contract version, available provider modes; no secrets     |
| POST `/api/cases`                    | Multipart image OR text; fictional-data acknowledgement          | Case and initial extraction; empty/unreadable fields remain unresolved |
| GET `/api/cases/:id`                 | Authorized demo session                                          | Current case or expiry response                                        |
| PATCH `/api/cases/:id/fields`        | expectedRevision, explicit field changes and confirmation states | Updated case; invalidate dependent explanations/options/plans          |
| POST `/api/cases/:id/explanation`    | expectedRevision                                                 | Validated explanation or `NEEDS_CLARIFICATION`                         |
| POST `/api/cases/:id/savings-search` | expectedRevision, location, optional user-entered copay          | Sourced resources; never inferred insurance benefits                   |
| POST `/api/cases/:id/reviews`        | expectedRevision, selected fields, consent                       | Review request for synthetic reviewer queue                            |
| GET `/api/reviews`                   | Reviewer demo session                                            | Authorized synthetic queue only                                        |
| POST `/api/reviews/:id/claim`        | expected review state                                            | Atomic claim; already claimed returns conflict                         |
| POST `/api/reviews/:id/response`     | expectedRevision, visible transcriptions OR needs_new_image      | Proposal; does not auto-confirm critical fields                        |
| POST `/api/cases/:id/plan`           | expectedRevision, supporter constraints, selected option IDs     | Practical suggested tasks and tradeoffs, no treatment advice           |
| PATCH `/api/cases/:id/tasks/:taskId` | expectedRevision, claim/complete/release action                  | Updated task/case; prevent double claims                               |
| DELETE `/api/cases/:id`              | Authorized patient demo session                                  | Delete case, image, review records and dependent caches                |

Errors use `{error:{code,message,retryable,requestId}}`; never include stacks or prescription text. Use 400 malformed input, 401/403 access issues, 404 missing, 409 revision/state conflict, 410 expired, 413 oversized image, 415 unsupported image, 422 unresolved or invalid output, 429 rate limit, and 503 temporary provider failure. API schemas define one consistent success envelope.

For this synthetic prototype, use server-issued opaque HttpOnly session cookies and server-checked demo role/case ownership. Persona switching is an explicit synthetic-demo feature, not authentication. Do not use that mechanism for real patient data or call it production security. Reviewer images are served through authorized endpoints, not guessable public file paths.

## 5. Frontend agent brief: paste this section plus sections 2–4 and 7–9

You own `apps/web`. Build the defined experience against `packages/contracts`, not a separate guessed API. Use contract-valid mock handlers until the backend is ready. Do not call Meta or SerpApi from the browser. Do not modify root dependencies, lockfiles, shared schemas, or backend files without coordinating with the integrator.

### UI sequence

1. **Start:** sample-label chooser, upload, text fallback, fictional-data acknowledgement. Preview before submission; reject unsupported/oversized files with helpful messages.
2. **Review extraction:** label image and enlarged evidence beside editable fields. Clearly distinguish unreadable text from unclear meaning. Require explicit review of critical fields. Provide “Request human reading help,” “Upload clearer image,” and “Prepare pharmacist questions.”
3. **Volunteer view:** selected image/evidence first, without AI suggestions. Reviewer transcribes only visible content or requests another image. Show no unrelated identity information. The returned proposal is a separate review step for the patient.
4. **Understand:** original directions and simplified explanation side by side, with source passages and questions. Block generated dosing explanations when critical fields are unresolved; allow questions and image correction. Never display invented clock times.
5. **Savings:** distinguish sourced prices, estimates, and unavailable information. Match drug, strength, form, quantity, location, and price conditions before comparisons. Show source links/timestamps and eligibility unknowns. If precise prices are unavailable, show useful savings-program resources instead.
6. **Shared plan:** patient and supporter cards, availability/transport/budget preferences, tasks, explicit acceptance, completion, and release. Changing availability updates suggestions but preserves accepted tasks unless the user explicitly changes them.
7. **Accessibility:** large-text toggle and keyboard-first review throughout. If time allows, add one reviewed translation with original text available and audio with stop/replay controls. Show an unavailable state if the browser has no suitable voice. Never autoplay speech.

Use a restrained, readable visual system: generous spacing, clear headings, consistent buttons, and status text beyond color alone. Test 360px mobile and desktop, 200% zoom, focus order, accessible names, and error announcement. Avoid dense dashboards.

### State and concurrency rules

- Render from server state and revision; disable duplicate submissions while pending.
- Ignore stale asynchronous responses if the case revision or selected case changed.
- On field edits, remove stale explanation/price/plan displays and request fresh data; no silent reuse.
- On 409, reload current state and explain the conflict. On expiry, clear image/object URLs and offer a fresh sample.
- Every remote operation has loading, empty, success, failure, and retry states. Display `live`, `cached`, or `fixture` mode visibly; never disguise fallback data.
- Sharing begins with an explicit patient action and selection. No automatic email, SMS, or external messaging.

### Deliver in small increments

F1 intake and review; F2 clarification and volunteer interface; F3 explanation/savings; F4 shared tasks; F5 accessibility and polish. Each increment must leave the application runnable and pass section 7 checks. Submit screenshots of key mobile/desktop states and exact command results; do not claim browser validation without doing it.

## 6. Backend agent brief: paste this section plus sections 2–4 and 7–9

You own `apps/api`. Implement schemas and endpoints from `packages/contracts` first, then provider adapters. Never infer clinical intent. The backend is the authority for validation, access checks, revisions, blocking states, and task transitions; frontend checks are additional UX only.

### Services

1. **Intake and storage:** validate actual file signature and image dimensions, not extension alone; allow JPEG/PNG with a configured 5 MB limit and reject SVG/HTML. Store synthetic images temporarily outside the public directory. Use a store interface with an in-memory implementation for this single-process hackathon demo, 60-minute expiry, periodic cleanup, explicit deletion and startup cleanup of old temporary files. State is lost on restart; disclose this and provide one-click fixture reseeding. Do not claim zero retention across logs/providers without evidence.
2. **Extraction adapter:** image/text → contract-valid fields with evidence. Treat label content as untrusted data, never executable instructions. Preserve decimals, units, exact directions and unknowns. Validate outputs with Zod; allow at most one repair attempt before returning an unresolved state. Self-reported model confidence never clears critical-field review.
3. **Explanation service:** operate on confirmed field revision only. Retrieve reference passages for the exact supported product. Clearly separate patient directions from general reference material. Use narrow templates plus model paraphrasing; compare structured dose/unit/frequency/conditions against the input and reject detected changes. These checks are guardrails, not proof of medical correctness. Ambiguity produces a question, not a guessed answer.
4. **Search adapter:** server-only SerpApi requests with normalized drug attributes and nonidentifying location. Never send patient names, prescription numbers, or complete uploaded labels to search. Inspect HTTP errors, response errors, and empty result sets separately. Cache normalized searches for 15 minutes without personal data, limit queries per case, and debounce user-triggered reruns. Search snippets alone cannot establish eligibility, full drug instructions, or a payable pharmacy quote.
5. **Source handling:** use exact allowlisted sources for drug references. Treat retrieved text as untrusted input; it cannot change system instructions or authorize tools. Do not fetch arbitrary model-generated URLs. If fetching source pages, restrict hosts/protocols, recheck redirects, block private/internal network destinations, cap size and timeout. Never render retrieved HTML directly.
6. **Savings normalization:** accept numeric prices only with attributable evidence and matching product details. Unknowns stay null. Deterministic code performs any arithmetic. No invented insurance benefits, deductible outcomes, substitutions, or cost guarantee. If evidence is inadequate, return links and questions rather than a fabricated comparison.
7. **Human review:** implement pending/claimed/submitted/needs-new-image transitions and atomic claims. Hide AI guesses in the initial reviewer response. Mark output as proposed transcription; keep provenance and disagreement. Repeated submission must not create duplicates. Review of an old case revision returns 409; nothing silently overwrites new patient edits.
8. **Group plan:** use Meta text generation, if available, to summarize budget/transport/availability tradeoffs and suggest practical tasks. Validate references to existing options and supporters. Tasks remain proposals until explicitly accepted. AI cannot alter medications, clinical directions, commitments, or prices. If AI fails, deterministic unassigned task suggestions keep the workflow usable.

### Reliability and privacy

- All secrets stay in environment variables on the server; commit `.env.example` with placeholders only.
- Provider clients have bounded timeouts (initial target 15 seconds), abort handling, at most one transient-error retry with jitter, and no retries for invalid credentials or malformed requests. Do not make duplicate billable calls through accidental UI resubmission.
- Missing credentials activate explicit fixture mode in the demo; never pretend providers succeeded. Health reports provider configuration without revealing keys.
- Log request ID, latency, status, and provider mode only; do not log images, extracted labels, request bodies, tokens, or personal information.
- Apply request-size limits, basic request throttling, safe cookies, restrictive origins if needed, and authorization on case/reviewer/image routes.
- Return useful errors when providers are unavailable. Do not make every provider's availability a requirement for starting the server.

### Backend increments

B1 schema-conformant fake endpoints and sessions; B2 intake/extraction; B3 review workflow and revision controls; B4 reference/search/savings; B5 planning and cleanup. Run meaningful backend checks per increment, then integrate with the frontend immediately rather than waiting for all endpoints to finish.

## 7. Redundant verification after every commit

Integrator implements the commands below in the repository; they are requirements, not commands already available. Keep checks meaningful and deterministic. Do not rerun costly live provider calls after every commit.

### Layer 1: author checks before commit

`npm run check` must run formatting verification, lint, TypeScript checks, contract/fixture validation, unit and API integration tests, and production build. Use fixtures and isolated case stores. Do not swallow failures or mark missing tests as success. Branch-only UI/API checks may run during development; the combined check is required on integration.

### Layer 2: automatic verification of the exact committed SHA

Create `npm run commit:verified -- "commit message"` as the documented commit path. It runs checks, commits only explicitly staged files, records the resulting SHA, then verifies that SHA in a clean detached temporary worktree. Do not copy ignored credentials or unstaged files. Install from the lockfile with `npm ci`; use fixture mode and isolated ports/stores.

For EVERY commit, clean verification runs `npm run check` plus the short cross-layer Playwright smoke suite. Capture command outcomes in an ignored local report keyed by SHA. Configure a lightweight post-commit reminder/hook for raw `git commit` so bypasses are visible; hooks are not the only enforcement.

If verification fails, label the commit FAILED, stop further feature work/integration, diagnose, and make a corrective commit. Do not rewrite another agent's history or silently remove checks. Verify the corrective SHA from clean state again. A commit existing locally does not mean it is approved for merging.

### Layer 3: independent review

After each commit, the non-author reviewer examines `git show <SHA>` against the acceptance criteria. Focus on changes to medication meaning, price provenance, state blocking, sensitive-data exposure, authorization, and stale revisions. Record PASS/FAIL with concrete evidence and file references. A chat-only reviewer receives the diff plus exact command output and identifies what it could not execute. Model agreement never substitutes for tests.

### Layer 4: integration and release checks

For each integration merge, repeat clean checks on the merge SHA plus the full end-to-end suite; use repository-host CI if available and make it required before merging. If CI is unavailable, the clean-worktree verifier remains mandatory. Git branch protections depend on repository permissions and must not be assumed.

Before release, smoke-test the deployed URL and record the deployed SHA, provider mode, browser, and outcome. Never use real medication data in traces or screenshots. A failed test that passes on retry is flaky evidence to investigate, not an unconditional pass. Retain failure traces/screenshots privately for synthetic fixtures.

## 8. Required test scenarios and acceptance evidence

### Short smoke suite: every committed SHA

1. Start API and web from clean state; health and sample intake work.
2. Clear sample → confirm fields → original directions and explanation remain consistent.
3. Unreadable strength → critical field remains unresolved → dosing explanation blocked even through direct API calls.
4. Request human reading help → reviewer proposal → patient review, without automatic clinical verification.
5. Search fixture → source and data-mode labels visible → accept a practical task.

### Full regression suite: every integrated feature/merge

- Decimal/units: preserve `0.5`, `mg` versus `mcg`, and dosage-form distinctions; missing units stay unresolved.
- “Twice daily”: no generated 8 AM/8 PM schedule; “as needed” is not converted to a routine dose. Taper/complex instructions are unsupported and routed to clarification.
- Incorrect extraction: correction invalidates previous explanation, prices, and plan; old responses cannot restore them.
- Human review: unreadable image requests new image; two reviewers cannot claim the same request; stale review cannot overwrite updated fields.
- Savings: wrong strength/form/quantity never ranks as an equivalent price; no results and missing eligibility remain useful explicit states.
- Provider failures: missing keys, invalid credentials, 429, timeout, malformed JSON and empty SerpApi results all produce controlled states. Cached/fixture output remains labeled.
- Authorization: a different case session cannot read another case/image, modify its tasks, or access the reviewer queue.
- Sharing: supporter sees only permitted fields; withdrawing permission updates subsequent API access. Already seen information cannot be promised to disappear from a person's memory or external copies.
- Task ownership: double-clicks and concurrent claims do not duplicate tasks; availability changes do not silently cancel accepted commitments.
- Privacy: no secrets in frontend bundle or tracked files; no label content in application logs; deletion/expiry removes related local records, review data and temporary images.
- Untrusted content: label/source instructions such as “ignore prior rules” cannot alter application behavior, reveal secrets, or cause arbitrary URL fetches.
- Accessibility: keyboard-only full path, screen-reader names/errors, 200% zoom, 360px layout, audio stop control, unavailable voice state, and original text accessible beside translation.
- Restart: in-memory state loss produces a clear recovery message and sample reset, not an endless spinner or silent wrong case.

Maintain `docs/verification.md` with SHA, scenario, command, outcome, provider mode, and known limitations. Use test artifacts as evidence; never invent successful results. Once the suite passes, repeat only for new commits or unresolved failures rather than running indefinite loops.

## 9. Integration order, time budget, and cut line

| Hours | Frontend                              | Backend                              | Integrator/reviewer                               |
| ----- | ------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| 0–2   | Review contract and screen flow       | Provider capability spike            | Scaffold, contracts, fixtures, scripts, ownership |
| 2–5   | Intake/review using shared fixtures   | Sessions, intake and extraction      | First real frontend–backend connection            |
| 5–9   | Human-review and clarification states | Reviewer transitions and revisions   | Test clear and unreadable paths                   |
| 9–13  | Explanation, savings and task views   | Source/search adapter and group plan | Integrate each slice and inspect provenance       |
| 13–16 | Accessibility and mobile polish       | Failure handling, expiry and logs    | Full regression; fix actual failures              |
| 16–18 | Presentation polish                   | Hosting configuration                | Deploy if practical; smoke-test deployed SHA      |
| 18–20 | Rehearse exact demo                   | Fix blockers only                    | Record synthetic backup demo and freeze features  |

Cut animations, extra languages, maps and real-time synchronization first. Retain visible source evidence, unresolved-state blocking, volunteer transcription boundaries, working task acceptance, and offline fixture recovery. If live price evidence is poor, show sourced savings resources rather than invented prices. If live image AI is unavailable, disclose fixture extraction and keep text intake genuinely functional.

## 10. Independent reviewer prompt

You are reviewing a LabelBridge commit, not rewriting the whole application. Read the shared contracts and this plan. Obtain the target SHA, diff, test output and current verification report. Inspect the committed code, not only the author's summary. Run the specified checks if you have terminal access. Prioritize medication-meaning changes, unsupported price claims, blocked-state bypass, untrusted content, access controls, stale data and API contract drift. Reproduce failures with synthetic fixtures. Report findings ordered by severity with file references, reproduction steps, expected behavior, and the smallest useful fix. Do not approve unresolved critical failures, disable tests, or claim clinical validation. If no blocking issue is found, state exactly what was checked and what remains untested. Coordinate fixes with the owning agent. Recheck the corrected SHA.

## 11. Required agent handoff format

Every implementer ends each increment with:

```text
Role:
Branch and exact commit SHA:
Files changed:
User-visible behavior completed:
Contract changes requested or applied:
Commands run and actual outcomes:
Clean committed-SHA verification result:
Independent review result:
Provider mode used (live/cached/fixture):
Known failures, missing access or assumptions:
Next smallest integration step:
```

Do not say “fully working” if integration, deployment, accessibility or providers have not been checked. Do not expand scope to compensate for missing credentials. Preserve the runnable demo and explicitly communicate limitations.

## Reference documentation

- Cursor Agent: https://prod.cursor.com/help/ai-features/agent
- SerpApi response and error handling: https://serpapi.com/api-status-and-error-codes
- SerpApi search response: https://serpapi.com/search-api
- Playwright CI: https://playwright.dev/docs/ci
- Playwright retries: https://playwright.dev/docs/test-retries
- Playwright traces: https://playwright.dev/docs/trace-viewer

These references support tooling setup, not a claim that this planned application has passed checks or is clinically validated.
