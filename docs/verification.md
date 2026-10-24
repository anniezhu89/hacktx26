# Verification and acceptance ledger

Provider mode: fixture only. No provider credentials tested, no live calls, no deployment. Synthetic fixtures are test data, not clinical references. The savings URL is illustrative, with no retrieved evidence or numeric quote.

Foundation scope: shared executable v1 schemas and request/response envelopes, decimal/unit preservation, unresolved-field eligibility helper, revision-conflict helper, explicit task acceptance structure, fixture validation, health endpoint, accessible connection status, dev proxy, production assets, clean-SHA verification command and GitHub CI configuration.

Actual command outcomes and bootstrap SHA are recorded in docs/handoff.md and ignored `.verification/<SHA>.json`. Clean automation is not an independent reviewer. This bootstrap is authored and inspected by the same integrator; a separate human/model review remains pending.

Pending acceptance criteria (no passing placeholders):

- B1/F1: demo cookies, roles/ownership, case creation/read/update, actual text intake, upload validation and temporary storage, 60-minute expiry/deletion, sample chooser and evidence review.
- B2: provider capability spike, extraction/OCR adapters, output repair, explicit fallback labeling.
- B3/F2: reviewer queue, atomic claim, stale review rejection, separate patient proposal acceptance, unreadable-image path.
- B4/F3: confirmed-revision explanation guard on API, reference retrieval, source allowlisting, faithful paraphrase checks, savings search and evidence normalization, provider failure handling/cache/rate limits.
- B5/F4: support sharing, task acceptance/concurrency, constraints and practical plan, cleanup and restart recovery.
- F5: complete keyboard path, screen-reader review, 200% zoom, mobile workflows, translation/audio if time permits.
- All five product smoke journeys in plan section 8 beyond health are pending. Full adversarial regression, privacy/logging, authorization and untrusted-input scenarios expand as those features land.
- Independent review of each increment; hosted CI run/required branch checks; deployment and deployed-SHA smoke.

Do not advance a failing commit. Every integration merge requires clean-SHA check and full available end-to-end suite. Do not count pending product criteria as passed by the foundation tests.

## Bootstrap execution evidence

- Initial scaffold SHA `7672d2cb27d5ad0b16c8cfa665fdf272afda3dcf`: **FAILED** clean-SHA verification. `npm ci` passed with zero reported vulnerabilities; `npm run check` failed at formatting because Windows Git checked source files out with CRLF. No integration or implementer branches advanced to this SHA.
- Corrective change: `.gitattributes` requires LF for text files across clean checkouts. Post-commit hook is also marked executable for POSIX hosts. No check was removed or weakened.
- Author checks before initial commit passed format, lint, type checks, six fixture validations, eight unit/API tests and production build. Earlier browser run passed both foundation smoke tests. Those results did not override the clean-SHA failure.
- Corrective-SHA outcomes are recorded by the verifier in `.verification/<SHA>.json` and supplied with the handoff. Product journey and independent-review gaps above remain pending.

- SHA `6d6bf9cfba175f7e65a259038b64059d3dfda23d`: clean `npm ci`, full `check` (eight tests) and both browser smoke tests passed. The wrapper then exited 1 during `git worktree remove` because Windows left the directory nonempty. Its PASS report covered checks but did not cover this cleanup error; do not treat the wrapper invocation as successful.
- Further corrective change retains all isolated verification trees and records their exact paths, avoiding automatic evidence deletion and Windows cleanup failures. The final verifier invocation must exit 0 before handoff; both implementer worktrees will be fast-forwarded to that final SHA while still unused.

## Backend B1 (agent/backend, fixture mode)

Provider capability check: no Meta or SerpApi credentials were present on the backend machine (variables unset, no `.env`), so no live request was attempted. All provider modes remain fixture.

Implemented with backend tests (`tests/unit/api/`): opaque HttpOnly SameSite=Strict demo session cookie via `POST /api/session` (synthetic persona switching, not authentication); workspace and persona checks on case routes; JSON text intake with deterministic verbatim extraction (ambiguous, unit-less, leading-dot/comma decimals and release-type forms stay unresolved; nothing starts confirmed); multipart PNG/JPEG intake validated by signature, dimensions and 5 MB limit, held in memory only, with all fields unresolved because no image provider is configured; `GET`/`DELETE /api/cases/:id`; `PATCH /fields` with revision conflicts; `POST /explanation` returning 422 until critical fields are confirmed, and verbatim directions plus pharmacist questions (no paraphrase, references or schedules) once they are; 60-minute expiry with 410; throttling; metadata-only logs.

Still pending for backend: reviews/claims/responses, savings search, plan and tasks (return `NOT_IMPLEMENTED`), sharing and supporter field filtering, image serving to reviewers, explanation/savings/plan invalidation caches, live providers, restart-recovery UX.

- B1 SHA `0549d65ad940e66f8d4ab8f7a9eb531accd2f41c`: clean verification PASS (`npm ci`, `check` with 32 tests, both smoke tests), run during integration before merging.

## Frontend F1 (agent/frontend, fixture mode)

Commits `28b06ad1dde462f24d49d326b34a0dcabc8082f3` (intake and extraction review) and `78faa018c9854a07d83ddbebf35b32787daf8050` (backend session and default HTTP client): clean verification PASS for each.

Implemented in `apps/web` with tests in `tests/unit/web/`: sample, PNG/JPEG upload (type, 5 MB size and signature checks, preview) and text intake with fictional-data acknowledgement; editable fields beside label excerpts and evidence; separate "unreadable", "unclear meaning" and "not read" states; explicit confirmation of critical fields; explanation blocked until all four are confirmed; demo session start and one retry after 401; 409 reload with explanation; expiry/restart recovery message; stale-response guards; large-text toggle. The in-browser fixture mock is opt-in (`VITE_LABELBRIDGE_API=mock`).

Integration evidence (merge into `integration/bootstrap`): combined unit/API suite and a scripted Chromium journey against the B1 backend. The journey covered session and intake, confirming to ready, the smudged-strength block, multipart upload, a second-tab revision conflict, server restart recovery, 360px layout and no console errors; it lives outside the repository and is not part of `npm run smoke`. The merge SHA's clean-verification report is `.verification/<merge SHA>.json`.

Review: the integration merge was performed by the frontend author at the user's request; independent review of F1 and B1 is still pending.

Known gaps after F1:

- Backend text extraction misses a medication name on its own line, takes the dosage form from the name line, and accepts "Use as directed." without flagging it. Backend owns the fix.
- `LabelField` has no explicit unreadable/unclear marker; the frontend mirrors the backend's unreadable-marker pattern. A contract field is recommended.
- No shared fixture for readable-but-unclear directions (`fixtures/ambiguous.json` is recommended).
- Not yet done: screen-reader testing, real browser zoom (only a 640px viewport at 2x), translation and audio.
- Commit `2867e13` tracks `Microsoft/Windows/PowerShell/ModuleAnalysisCache`, which AGENTS.md says should stay untracked.

## Contract v1.1 (integration, additive)

Added reviewer view and excerpt schemas, `reviewerViewResponse`, `fromReviewId` on field changes (volunteer provenance), documented patient review read and reviewer image routes, and three fixtures (nine validated in total). Contract tests in `tests/unit/contracts-v1-1.test.ts` cover strict rejection of AI values in excerpts, excerpts limited to the selected fields, the authorized image path pattern, and provenance. Backend routes for v1.1 are not implemented yet; see docs/handoff.md.

## Frontend F2 (human reading help, fixture mode)

Commits `376f3446bd5881fa5bb1bc66a160c0fca012a224` (F2) and `46bac23ee511c9143857b9241fca3e569a9cb812` (review fixes): clean verification PASS for each, 66 tests.

Implemented: the patient selects fields and gives explicit consent, then sees request status and compares each volunteer reading with the current value. A reading is applied only by explicit action (`fromReviewId`) and never confirmed automatically, so explanations stay blocked until the patient confirms. The volunteer view shows only the requested label excerpts with no extracted values, requires typed text or "can't read" for each part, or asks for a clearer image. A demo persona switch (labeled as not a login). The HTTP client serializes demo-role switches. The mock implements the v1.1 workflow with double-claim, stale-revision and mismatched-value conflicts.

Review: an independent subagent review of `376f344` found one blocking issue (the mock gave the volunteer the extracted value as "typed text") and several should-fix items. All were fixed in `46bac23` and re-reviewed with no blocking findings. A human independent review has not been done.

Browser evidence (scripted Chromium, outside the repository): the fixture build passed the full patient → volunteer → patient flow, the clearer-image path, 360px layout and named tab stops. The intermittent failure seen once (1 of 7 runs, at a second request after starting over) was not reproduced in 6 later runs and remains under observation. Against the B1 backend, reading help shows "not available on this server yet" because the backend review routes are pending.

Known gaps: backend review routes; one stable volunteer identity per demo workspace across role switches (backend `session.ts`); confirmation resets provenance to `user` (shared helper; changing it needs a backend test update); no fetch timeout in the HTTP client; screen-reader testing.
