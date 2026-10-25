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

## Frontend F3 (explanation and savings, fixture mode)

Commits `d8affefe6133977813202fc6e0596e747938b3fa` (F3) and `0f31e8c6d18f7dd88046866f2c8292c6d5878705` (review fixes): clean verification PASS for each, 80 tests.

Implemented: the original label directions shown beside the plain-language text, with reference passages/links and pharmacist questions. It is blocked until the critical fields are confirmed (422 is shown as a block, 409 reloads). The plain-language text is hidden if it adds clock times, intervals, times of day or meals, drops "as needed"/PRN/"as directed" or a "do not" warning, or does not match the confirmed directions or field revision. Savings: a location and optional copay form that never infers insurance. Prices appear only with source evidence, are never ranked or guaranteed, and a price for a different strength, form or quantity is never shown. Each option shows its source link, retrieval time, eligibility and unknowns, and the data mode (including for empty results). Both results are tied to the field revision, removed on any field change, and late responses for older revisions are dropped.

Review: an independent subagent review of `d8affef` found no blocking issues and two should-fix items (a mismatched-product price was still shown with a caveat; the guard missed a dropped "as needed" and added timing words). Both were fixed in `0f31e8c` and re-reviewed with no regressions. A human independent review has not been done.

Browser evidence (scripted Chromium, outside the repository): fixture build 25/25 (block before confirmation, side-by-side explanation, savings form validation and results, invalidation after an edit, 360px layout); F2 regression 26/26; against the B1 backend 11/11 (the real explanation route including its pharmacist question; savings shows "not available on this server yet").

Known gaps: backend savings search is NOT_IMPLEMENTED; the explanation fixture has no reference passages, so reference rendering is untested with real data; the mock copies the backend's explanation patterns (moving them to contracts would avoid drift); explanation and savings results are not kept across a demo-view switch; server-supplied source text is not filtered for "guaranteed" claims (backend responsibility); `z.string().url()` accepts non-HTTP schemes (an `https?:` rule in the contract is recommended).

## Contract v1.2 (integration, additive)

Added `fieldsRevision` on cases, `ownerRole` on tasks, sharing request, supporter shared-case view and response, task action response, and shared helpers for sharing, plan merging and task actions. Field changes now drop proposed tasks. Ten fixtures validate. Contract tests in `tests/unit/contracts-v1-2.test.ts` cover explicit claims and double-claim rejection, owner-only complete/release, completed tasks that cannot be released, re-planning that keeps accepted tasks, revision versus fieldsRevision, the supporter view's field filtering, and withdrawal. Backend routes for v1.2 are pending (docs/handoff.md).

## Frontend F4 (shared support, fixture mode)

Commits `b097d7e1849eefdd70ed9dade7fc4069f62d52f4` (F4) and `9fea31fab06c627c922ebdf3aa7028942f9d114c` (review fixes), plus contract follow-ups `b37dee429deaf133c4c05546df32d19c81a293fd` and `607559f99e1fd5577c9a7c5c6af9eb0d0403cb0e`: clean verification PASS for each, 94 tests on the frontend branch.

Implemented: the patient chooses exactly which fields a supporter may see and can withdraw, with a note that information already seen cannot be erased and that nothing is sent externally. Practical suggestions come from availability, travel, budget and chosen savings results; they are tasks and tradeoffs only, never doses or schedules. Tasks need an explicit claim, then complete or release; double claims are rejected; re-planning keeps accepted tasks. A supporter persona sees only confirmed values of shared fields, with unshared or unconfirmed values redacted from task text, and acts only on its own tasks. After withdrawal the patient can take back a supporter's task. Explanation and savings are keyed by `fieldsRevision`, so task, plan and sharing changes no longer discard them. The patient view reloads when switching back from another persona.

Review: an independent subagent review found no blocking issues and three should-fix items (missing-route versus missing-case confusion, task text able to reveal unshared values, a supporter task stranded after withdrawal). All were fixed; the re-review found no regressions, and its remaining minor item (single-digit values) was fixed in `607559f`. A human independent review has not been done.

Browser evidence (scripted Chromium, outside the repository): fixture build 21/21 (sharing validation and save, suggestions and tradeoffs, explicit patient claim with the explanation kept, the supporter seeing only the shared field and accepting the ride, patient re-plan keeping the accepted ride, withdrawal with the patient taking the ride back, supporter access removed, 360px layout); F2 26/26 and F3 25/25 regressions. Against the B1 backend, the shared-support and supporter views show "not available on this server yet".

Known gaps: backend routes for sharing, the shared view, plans and tasks; redaction misses paraphrases (guardrail only); the lookbehind regex in redaction needs Safari 16.4 or later; one supporter per workspace by design; persona switching is not authentication.

## Provider capability spike and live image extraction (B2, backend)

Date: 2026-10-24. Spike scripts were run outside the repository; raw probes are not committed.

Capability findings, from actual requests with the configured credentials:

| Provider                                            | Result                                                                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini (`generativelanguage.googleapis.com/v1beta`) | Image input confirmed. Structured output via `responseSchema` confirmed.                                                                                                                                         |
| Meta (`api.meta.ai/v1/responses`, `muse-spark-1.3`) | Text works. **Image input is silently ignored**: a request carrying a 1x1 red PNG returned HTTP 200 and answered "white", with input tokens 15 (text only) versus 20 (text plus image). NOT used for extraction. |
| SerpApi                                             | Credentials valid, Free Plan, 1249 searches left at the time of the spike. Not yet implemented.                                                                                                                  |

Image ingestion was confirmed by token accounting, not by the model's answer alone: the same 1x1 PNG raised Gemini's input tokens from 6 to 1099, while Meta's rose from 15 to 20.

Model availability varies by account and by hour. Three real calls per model: `gemini-3.5-flash` 3/3 (1.7-3.1 s) and `gemini-3-flash-preview` 3/3 (2.2-5.4 s); `gemini-3.6-flash` 3/3 HTTP 429; `gemini-3.1-flash-lite` timeout, 503, 15.8 s; `gemini-3.8-flash` timeout, 503, 503. `gemini-2.5-flash`, `gemini-2.0-flash` and `gemini-2.5-flash-lite` return 404 for new users. Defaults are therefore `gemini-3.5-flash` with `gemini-3-flash-preview` as the fallback.

Implemented: `apps/api/src/providers/gemini.ts` extracts fields from an uploaded image and maps them onto contract-valid `LabelField`s. Values are kept verbatim, unknown fields stay null and `unresolved`, model boxes convert to normalized crops (dropped when the value is null or the box is invalid), and `reviewState` is never better than `unreviewed`, so model confidence cannot pre-confirm a critical field. The label image is treated as untrusted data in the system prompt. Timeout 15 s, one jittered retry per model on 429/5xx, then the fallback model once; 400/401/403 stop immediately so no second billable call is made. Any failure returns an explicit unresolved state and the response stays labeled `fixture`. `apps/api/src/server.ts` now loads `.env` through `process.loadEnvFile` (no new dependency); `createApp` is fixture-mode unless a caller passes `extraction`, so tests can never reach a live provider through ambient environment variables.

Contract v1.3 (additive): `healthResponse.providers.extraction` widened to `"fixture" | "live"`. `explanation` and `search` stay literal `"fixture"`, so the contract itself still prevents claiming a provider that does not run.

Automated checks: `npm run check` PASS, 113 tests (19 new in `tests/unit/api/gemini.test.ts`, all against a stubbed fetch, no live calls).

Live evidence, against the built server with real credentials, using the committed fixtures in `fixtures/labels/` (generated by `scripts/make-sample-labels.mjs`):

- `clear.png` → `dataMode: live`, status `reviewing`, all five fields read, `0.5 mg` preserved exactly, directions verbatim with no invented clock times.
- `unreadable.png` → `dataMode: live`, status `needs_help`, strength `null`/`unresolved` with a generated pharmacist question, other four fields read.
- `ambiguous.png` → `dataMode: live`, status `reviewing`, quantity `null`/`unresolved`, and questions raised for both the 25 mcg versus 50 mcg conflict and the unclear quantity.
- Direct `POST /api/cases/:id/explanation` on the unreadable case returned HTTP 422 `NEEDS_CLARIFICATION`, so the dosing explanation is blocked at the API, not only in the UI.
- One earlier upload hit a genuine upstream `503` on `gemini-3.5-flash`. The fallback behaved as designed: `dataMode: fixture`, all fields unresolved, no invented values, and `providerError: "extraction provider 503"` logged with no label content. The model fallback was added in response to this observation.

Known gaps and limitations: extraction accuracy is evidenced only by the three synthetic labels above, on clean rendered text — not photographs, angles, glare, handwriting or non-English labels, and not by any clinical review. Crop coordinates are model-reported and unverified against pixel ground truth. Upstream 429/503 remain possible and then produce the unresolved fixture state. The reviewer-image and savings paths are unchanged. Explanation and search remain fixture-only. No independent review of this change has been done, and these are synthetic fixtures only.

### Commit record for this change

| SHA                                        | Clean verification | Note                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2c1b09aab7f75b9d1b7478a886d9d72db7747aa0` | **FAILED**         | `npm ci` tried to fetch `@labelbridge/contracts@1.2.0` from the registry. `packages/contracts` was bumped to 1.3.0 while `apps/api` and `apps/web` still pinned `1.2.0` exactly and the lockfile still recorded 1.2.0, so npm stopped resolving it as a workspace link. Not integrable. |
| `317cd6f0d989f10662377e5165d4623bb51fa2cd` | **PASS**           | Corrective commit: both apps pinned to 1.3.0 and the lockfile regenerated, with no dependency additions or upgrades. `npm run check` plus the Playwright smoke suite (2 tests) passed in the clean detached worktree.                                                                   |

A version bump in `packages/contracts` must be applied in the same commit as the matching pins in `apps/api/package.json`, `apps/web/package.json` and `package-lock.json`, or clean install breaks even though the working tree checks pass.

## Pharmacy lookup via SerpApi (B4 slice, backend, contract and frontend)

Date: 2026-10-24. Spike scripts were run outside the repository; raw probes are not committed.

Capability findings, from actual requests with the configured credential:

| Probe                                            | Result                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /account`                                   | Active, Free Plan, 1249 searches left before this work.                                                                                                                       |
| `engine=google_maps` with `ll=@30.2747,-97.7404` | HTTP 200 in 0.9 s, 20 `local_results` with title, address, `gps_coordinates`, phone, `operating_hours`, website.                                                              |
| `engine=google_maps` with a ZIP in `q`, no `ll`  | HTTP 200 in 14.1 s, 20 correctly localized results. **Coordinates are not required**, so only a coarse location is ever sent.                                                 |
| Invalid API key                                  | HTTP 401 in 0.08 s with a JSON `error` field.                                                                                                                                 |
| `q=pharmacy near ZZ00000 Nowhere`                | **HTTP 200, `search_metadata.status: "Success"`, no error field, and 14 real pharmacies in Kansas City MO, Clearwater KS and Tulsa OK.** An unusable location fails silently. |

The last row drove the design. Like the Meta image finding, the provider returns a confident, well-formed, wrong answer rather than an error, so the adapter cannot treat HTTP 200 as success.

Implemented: `apps/api/src/providers/serpapi.ts` looks up pharmacies near a coarse location. The only case data sent to the third party is the ZIP or place name the user typed: no medication name, strength, directions, quantity, prescription number, patient name or label text, and no coordinates, since none are collected. `localize()` verifies the answer before any of it is shown — at least one returned address must mention the requested place, and results are then kept only within 50 km of the median of those anchor coordinates, which both rejects the unrelated-cities failure above and drops outliers that ride along with good results. Distances are computed only for that check and never shown or ranked on: with a coarse location there is no point to measure from, so the response carries `ordering: "source_order"` and no distance field, and nothing is labeled "closest". Opening hours are passed through verbatim and never parsed into an "open now" claim. Normalized lookups are cached for 15 minutes keyed on the location alone, so the cache holds no personal data; a cache hit is labeled `cached`, never `live`. Failures are separated: 401/403/400 stop immediately with no further search credit spent, 429/5xx get one jittered retry, an empty result set and the provider's own no-results message are treated as answers rather than failures, and any real failure returns 503 with an adapter-written reason rather than a stale or invented list. Searches are capped at 12 per demo workspace per 10 minutes.

Contract v1.4 (additive): `coarseLocation` (allowlist: a 5-digit ZIP or a place name, so a street address is rejected rather than forwarded), `pharmacy`, `pharmacyLookup`, `pharmacySearchRequest`, `pharmaciesResponse`, and `healthResponse.providers.search` widened to `"fixture" | "live"`. `pharmacySearchRequest` deliberately carries no `expectedRevision`, unlike the sibling case routes: the list derives from the location alone, so tying it to a revision would imply a dependency that does not exist and would discard a valid list whenever an unrelated task or sharing change bumped the case. `providers.search` reports only that the adapter is configured; `savings-search` remains unimplemented and still returns `NOT_IMPLEMENTED`.

Frontend: `apps/web/src/components/Pharmacies.tsx`, mounted in the patient review screen. It validates the location with the same `coarseLocation` schema before sending, so a street address never leaves the browser, and it surfaces the data mode, the source, the retrieval time, the ordering caveat, the stale-hours caveat and the explicit `location_not_recognised` and `no_results` states. The offline mock client answers from `fixtures/pharmacies.json` (fictional pharmacies) so the fixture build stays functional.

Automated checks: `npm run check` PASS — 150 tests, 37 new in `tests/unit/api/serpapi.test.ts`, all against a stubbed fetch with no live calls. They encode the observed scattered-results payload and assert it is rejected, and assert that no label text reaches the provider URL.

Live evidence, against the built server with real credentials:

- `GET /api/health` → `providers.search: "live"`.
- `{"location":"78751"}` → `dataMode: live`, `status: ok`, 10 results, all in Austin 787xx including a genuinely nearby 78723 and 78705; ranks contiguous from 1.
- `{"location":"Madison, WI"}` → `dataMode: live` on the first call for that location, all results in Madison 537xx.
- `{"location":"Nowhereville"}` → HTTP 200, `status: location_not_recognised`, **zero results**. The guard held against the live provider: none of the unrelated-city pharmacies reached the response.
- `{"location":"1200 Example Pkwy, Springfield"}` → HTTP 400 before any search was spent.
- `{"location":"78751","medicationName":"LEVOTHIX"}` → HTTP 400; the strict request schema refuses to carry label data toward the provider.
- A repeat of a looked-up location → `dataMode: cached` with no new upstream request.
- Exceeding the cap → HTTP 429 `RATE_LIMITED` with `Retry-After: 515`.
- Request logs for all of the above contain route, status, latency and provider mode only: a scan for the locations, the medication name and the returned pharmacy names found zero occurrences.

Browser evidence (scripted Chromium at 420px, outside the repository): the section renders in the patient review screen; entering `1200 Example Pkwy` is rejected in the browser with no request made; `78704` returns 10 real pharmacies with addresses, verbatim hours, phone links and website links, under a "Live data" badge.

Known gaps and limitations: the result list is the source's own relevance order, which is not a proximity ranking, and no distance is available — the UI says so rather than implying "closest". The 50 km cluster radius and the address-token anchor are heuristics tuned against the observed payloads, not a geocoder; a location whose name does not appear in returned addresses will read as `location_not_recognised` even if results were usable. Opening hours and phone numbers are unverified third-party data that may be stale. Pharmacy results say nothing about stock, price or whether a prescription can be filled there. `savings-search`, the explanation provider and the remaining pending routes are unchanged. No independent review of this change has been done.

### Commit record for this change

| SHA                                        | Clean verification | Note                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `74bdaad417b9bf33ea2844f73c1ff37c7e814ed2` | **PASS**           | `npm run check` (150 tests) plus the Playwright smoke suite (2 tests) in the clean detached worktree. The 1.3.0 lesson was applied up front: the contracts bump, both app pins and the lockfile moved to 1.4.0 in this one commit, and the lockfile diff is the three version lines only. |

## Savings search, first increment: programs and resources (B4, backend, contract and frontend)

Date: 2026-10-24. Spike scripts were run outside the repository; raw probes are not committed.

Capability findings, from actual requests with the configured credential:

| Probe                                                           | Result                                                                                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `levothyroxine 50 mcg tablet 30 count price`                    | Five sources, five different numbers: $4.00, $9.00, $10.82, $13.50 and "around $1x", across different pharmacies, discount programs and conditions. A snippet number is not an attributable price.    |
| `LEVOTHIX 0.5 mg tablet price` (an **invented** medication)     | **HTTP 200 with five results about levothyroxine, carrying real prices ($4.00, $23.79, $155.61).** The engine fuzzy-matched a nonexistent drug to a real one and answered confidently.                |
| `levothyroxine prescription savings program patient assistance` | Manufacturer and assistance programs with stated conditions (Synthroid, Tirosint, Unithroid, Medicare Extra Help). Quotable, and the right shape for `optionType: "program"`.                         |
| The same query plus a ZIP code                                  | **Worse**: generic manufacturer portals (AstraZeneca "Affordability", "Pfizer for All", AbbVie "Patient Assistance") displaced the drug's own programs, and four of six results named no drug at all. |

The second row is the third instance in this project of the same failure shape, after Meta silently discarding images and the Maps engine answering an unusable location with pharmacies in three states: a confident, well-formed, wrong answer rather than an error.

Design consequences, all of which are enforced in code:

- **Identity gate before any search.** `apps/api/src/providers/generic-drugs.ts` holds a seed allowlist of generic names with brand aliases. An unlisted or invented name returns `product_not_identified` and **no search is spent**. Only a `user_confirmed` medication name is ever searched; an unreviewed AI reading is not enough, because a wrong name returns real programs for a medication the patient is not taking.
- **No amounts at all in this increment.** Every option is `amount: null`, `currency: null`, `priceBasis: "unknown"`, with the source's snippet kept verbatim as `sourceEvidence`. This is the plan's own fallback: "If live price evidence is poor, show sourced savings resources rather than invented prices."
- **Only the generic is claimed to match.** `matchedProduct` carries the generic and leaves strength, form and quantity null, because the source did not state them for that result. Guessing them is what would make a price dangerous.
- **Result and host filtering.** A result must mention the identified generic in its title or snippet, and come from an allowlisted host. Nothing is ever fetched, only linked. `ai_overview` is ignored: it is generated text, not a source.
- **No location is sent.** The query is the generic name plus fixed program wording. `savingsRequest.location` became optional and `coarseLocation`-typed; the UI no longer asks for a location in this increment, since asking for data that is not used would be misleading.
- Deterministic throughout: no model is involved anywhere in the savings path.

Contract v1.5 (breaking for one unimplemented route): `savingsResponse` data changed from `{ options }` to `savingsLookup` (`product`, `sourceTitle`, `retrievedAt`, `status`, `options`, `notes`), because an empty list could not distinguish "nothing found" from "we could not tell which medication this is". Invariants: options only with `status: "ok"`, and `product === null` exactly when `status === "product_not_identified"`. `savingsRequest.location` is now optional and `coarseLocation`. `coarseLocation` moved earlier in the module so `savingsRequest` can use it. The route previously returned `NOT_IMPLEMENTED`, so no live client depended on the old shape.

Automated checks: `npm run check` PASS — 176 tests, 26 new in `tests/unit/api/savings.test.ts`, all against a stubbed fetch with no live calls. They encode the invented-name case and assert it is refused without a search.

Live evidence, against the built server with real credentials:

- Confirmed medication `LEVOTHIX` → HTTP 200, `status: product_not_identified`, `product: null`, zero options, `dataMode: fixture`, and the stubbed fetch counter confirms **no search was spent**.
- Confirmed medication `Levothyroxine` → `dataMode: live`, `status: ok`, `product: "levothyroxine"`, three options from `synthroidpro.com`, `unithroid.com` and `goodrx.com`, every one with `amount: null` and `priceBasis: "unknown"`, and a note that six results not mentioning levothyroxine were set aside.
- A medication name that is present but not `user_confirmed` → `product_not_identified`, no search spent.
- Request logs contain route, status, latency and provider mode only; a scan for the medication names and the returned source names found zero occurrences.

Known gaps and limitations: **the built-in demo samples still use the invented name "Fictional Demo Tablet", so the demo's own savings path currently returns `product_not_identified`.** Switching the samples to a real generic is the agreed next increment and is required before this feature demonstrates anything positive. The allowlist is a 30-entry seed, not a drug database, so most real medications will be refused; that is the intended trade, but it means coverage is low. Host allowlisting means a legitimate program on an unlisted site is dropped silently apart from the count in `notes`. No price, copay comparison or eligibility determination exists yet; `copay` is accepted by the contract and currently unused. The changed Savings UI has **not** been exercised in a browser in this increment. No independent review of this change has been done.

## Demo medication identity, and savings fixes found by exercising the UI

Date: 2026-10-24.

The savings guard was refusing the project's own demo labels, which named an invented product ("Fictional Demo Tablet" in the sample text, "LEVOTHIX" on the rendered label images). That is the correct refusal — searching an invented name returns a real different medication's results — but it meant the feature could only ever demonstrate its refusal.

The samples now use **levothyroxine sodium**, chosen because real levothyroxine labels print the strength both as micrograms and as a decimal milligram value, which preserves the existing decimal-preservation fixture (`0.05 mg`) and the mcg-versus-mg conflict fixture (25 mcg against 50 mcg) rather than losing that safety coverage. The patient, prescriber, pharmacy, prescription number and directions remain fictional, so the demo data is still synthetic. Changed: `fixtures/{clear,unreadable,ambiguous,review-submitted}.json`, `apps/web/src/samples.ts`, `apps/web/public/samples/*.svg`, `scripts/make-sample-labels.mjs` with `fixtures/labels/*.png` regenerated, and the affected string assertions across the unit tests. `tests/unit/api/savings.test.ts` deliberately keeps "LEVOTHIX" and "Fictional Demo Tablet": they are the invented-name cases the guard must keep refusing.

Two test expectations changed as real consequences, not as accommodations:

- `extract.test.ts` relied on the old product name containing the word "Tablet" for the dosage form to be read off the name line. The test text now says "Levothyroxine Sodium Tablet" so that path is still covered.
- `contracts-v1-2.test.ts` relied on "Tablet" sitting inside the shared medication name to show that an unshared dosage form is redacted even there. That coverage is preserved by an added assertion that redacts "tablet" appearing as an ordinary word in task text.

### A pre-existing extraction gap, confirmed not to be a regression

Text intake does not read a medication name that sits on its own line: `apps/api/src/extract.ts` only derives a name from the text preceding a strength **on the same line**. Running the **old** sample text through the unchanged extractor returns `medicationName: null` as well, so this predates the rename. `docs/handoff.md` already recorded "a medication name on its own line" as a requested extraction fix that was never implemented. The consequence is that a patient must type the medication name into the field before confirming it; the field is editable and the flow works, but it is friction that the savings feature now makes visible. Not fixed in this increment.

### Two defects found by exercising the UI in a browser

The previous increment shipped without browser verification, and doing it here found both:

- **A false "this is for a different product than your label" warning on every savings card.** The adapter claimed `matchedProduct.medicationName: "levothyroxine"`, and `productMatch` compares exact normalized strings, so a label confirmed as "Levothyroxine Sodium" read as a mismatch. Fixed by claiming no product attributes at all: a programme or resource page states no specific product, and which medication was searched for is already carried by `savingsLookup.product`. Regression test added that runs a mapped option through the real `productMatch` helper.
- **A currency figure rendered directly beneath "No price available."** The verbatim source snippet is quoted as evidence, and a manufacturer snippet reads "Uninsured patients will pay $39.95 for a 30-day prescription". The snippet is kept, because quoting the source is the honest thing and is why a patient would click, but the card now says explicitly that any amount in the quoted text is the source's own wording for its own conditions, not a price for this prescription, and that eligibility was not checked.

Browser evidence (scripted Chromium at 420px, outside the repository), against the built server with real credentials: the sample label is read, the medication name is typed and confirmed along with the other four fields, "Ways to save" unlocks, and a live search returns three results from `synthroidpro.com`, `unithroid.com` and `goodrx.com` under a "Live data" badge, with the ordering, no-prices and set-aside-results notes shown, no price rendered as an amount, and no mismatch warning. A repeated search within the cache window shows "Cached data".

Automated checks: `npm run check` PASS, 177 tests.

Known gaps: the extraction gap above is unfixed. The allowlist remains a 30-entry seed, so most real medications are still refused. No amounts, copay comparison or eligibility determination exist. No independent review of this change has been done.

## Frontend design refresh (branch design/labelbridge-refresh, uncommitted)

Presentation layer of `apps/web` replaced with the Figma Make export's visual design (tokens, hero, three-step flow, method cards, zoomable label preview, sticky review layout, support step). The typed API client, state hooks, field rules, samples and support components were kept, so the same backend routes and contracts are used. Requested by the project owner; `apps/web` normally belongs to the frontend implementer, so this needs that owner's or the integrator's review.

Checked: `npm run check` (187 tests, including 10 new in `tests/unit/web/design-flow.test.ts` that drive the real HTTP client against the real API app), `npm run smoke` on isolated ports, and a scripted Chromium walkthrough against this branch's production server in fixture mode at 1440px, 360px and 640x450 (approximating 200% zoom): 111/111 checks. Token contrast pairs computed at or above WCAG AA. No screen-reader session, manual keyboard-only pass, or real-device test was performed; automated checks are not an accessibility audit.

Gaps: the clear sample's text puts the medication name on a line the backend extractor leaves unresolved, so the patient must type it; human reading help, sharing, plans and tasks have no backend routes on `dev` and show as unavailable; the support step's headings skip from h1 to h3 because the kept components use h3; "Start over" clears the case in the browser but does not call `DELETE /api/cases/:id` (the client has no delete method), so the server copy expires after 60 minutes.

## v4 checkpoint verification correction (2026-10-25)

- SHA `db3c5ff6c9f009d91d2e86e5a7f2c4a2c835998d`: **FAILED** clean verification. Author check passed all 229 tests and 12 fixtures, but the two new fixture files were omitted from staging. Clean `npm ci` passed; fixture validation then failed with ENOENT for `fixtures/medicine-info.json`. No smoke result or integration approval is claimed for this SHA.
- Corrective commit adds `fixtures/medicine-info.json` and `fixtures/circle.json`. Independent review remains pending. Exact corrective-SHA outcomes are stored in `.verification/<SHA>.json`.

## v4 continuation: signup and browser evidence (2026-10-25)

Checkpoint SHA `058e411cca8fb3574535bd5c6a9f16d716ef5c4d`: **PASS** clean `npm ci`, `npm run check` (229 unit/API tests, 12 fixture validations, production build), and both foundation Playwright tests. This corrects the missing-fixture failure recorded above; no history was rewritten.

The new committed browser suite (`tests/e2e/workspaces.spec.ts`) continues the previously interrupted walkthrough. It reproduces a signup defect: the account became non-null and unmounted AuthScreen before its welcome/preferences step. The fix keeps the auth screen until its completion callback chooses the next screen. It also corrects a 342px-wide auth layout at a 320px viewport with Largest text, and the support page's skipped heading levels. Earlier draft test failures from Password, My-labels, warning-text, and photo-completion selectors were diagnosed rather than treated as flaky passes; retries remain disabled.

Coverage: signup and persisted optional-workspace preferences; pending volunteer state; text intake, four critical confirmations and explicit save; two independent account sessions accepting an invitation with no automatic sharing; previewing and sharing only directions, hiding strength, and revoking access; settings and sign-in at 320/360/430px and 844x390 with Largest text; synthetic PNG rotation/crop and malformed HEIC guidance at 1440/390px; and the medicine source explorer with synthetic browser responses, mismatched candidate blocking, explicit AI-disabled state, original warning text, Escape and focus restoration. The medicine browser test uses intercepted fixture responses and is **not live NLM or AI verification**. Other workspace interactions use the real local API.

Commands: `GEMINI_API_KEY= SERPAPI_API_KEY= LABELBRIDGE_REFERENCE_LOOKUPS=0 npm run smoke`; `npm run commit:verified -- "Fix signup onboarding and complete fixture browser walkthrough"`. Exact committed-SHA outcomes are recorded in ignored `.verification/<SHA>.json`. Screenshots/traces live in ignored `test-results/`; clean verification retains its own worktree and artifacts. Independent review remains pending.

Remaining acceptance gaps: no persistence (accounts, sessions, labels, invitations, reviews and medicine cache disappear on restart); no email recovery; volunteer approval only through the environment allowlist; HEIC requires native browser decoding; real-device camera capture, real EXIF and voice behavior untested; reopened saved labels have no local image preview; manufacturer-label reuse permission unconfirmed and AI derivatives disabled by default; no personalized interaction provider. Full keyboard-only/screen-reader and 200% browser-zoom audits, all five planned product smoke journeys, independent review, deployment and deployed-SHA verification are still pending. This increment makes no clinical, live-provider, deployment, or independent-approval claim.

## Supplied Figma reference integration

Uncommitted frontend changes based on `29c82310ef4c34dc73ff0d53da80f412b85eb1a4`. Reference: the local React/CSS export at `C:/Users/wongc/Downloads/Design Reference`. Its AGENTS/CLAUDE files describe its Figma preview environment; those instructions were read as reference context, not applied as changes to this npm workspace. No Figma hosting, analytics/custom scripts, Tailwind/pnpm setup, simulated extraction, fake account data or medical-reference placeholders were imported.

Applied its 1320px content width, compact header/demo navigation, sage/ivory/lavender/peach presentation, sample selectors, pink demonstration label cards, icons, review-card styling, account-card spacing and mobile treatment to existing API-backed components. Sample medication names, strength, quantity and exact directions are preserved; image evidence crop coordinates were updated with the redrawn SVGs. Upload/photo conversion, Gemini routing, field revisions, explicit confirmation, source access, accounts and sharing continue through the existing clients. Consent now visibly disables intake until required fictional-data acknowledgement and valid input are present. Practical support remains reachable while explanation generation still returns NEEDS_CLARIFICATION for unreviewed/unresolved critical fields.

Diagnostics are in a keyboard-accessible collapsed details panel; the health smoke tests open it explicitly. Added tests cover the reference width, sample-card height, consent gate, keyboard acknowledgement, help disclosure, actual case creation and direct API explanation blocking, 320/360px Largest-text home layouts and real multipart image intake through the production-served frontend. Existing tests cover photo editing, signup/preferences, source-dialog focus, saved labels, invitation/sharing/revocation and account layouts at 320/360/430px and 844x390. Test server keys are explicitly blanked to keep all automated provider use in fixture mode.

Observed outcomes: npm run check PASS (formatting, lint, TypeScript, twelve fixture validations, 229 unit/API tests and production build); npm run smoke PASS, 16 Chromium tests, retries disabled. Initial new browser checks caught the guest navigation being mounted inside the active-case branch; it was moved into the app shell. A draft assertion incorrectly treated all support navigation as blocked before confirmation; it was replaced with direct verification of the actual API explanation gate, preserving access to practical resources. Both issues were resolved before the final complete suite passed.

Visual comparison: rendered the reference React and custom CSS in an isolated preview with base CSS resets, without executing its Figma Vite plugins. Compared 1440px desktop and 390px mobile screenshots; final current-app captures are `.verification/design-comparison/final-desktop.png` and `final-mobile.png`. Browser-suite screenshots are under ignored test-results. No provider call or deployment was executed for this presentation change; no new commit or clean committed-SHA verification is claimed. Independent review, a full screen-reader audit, real-device testing, actual browser 200% zoom and full-app Spanish translation remain pending.
