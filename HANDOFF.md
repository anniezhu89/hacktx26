# LabelBridge v4 handoff

Updated 2026-10-25. The current status below supersedes the historical inventory later in this file.

## Current increment

Role: Integrator / frontend continuation.
Branch and exact checkpoint SHA: `design/labelbridge-refresh`, `058e411cca8fb3574535bd5c6a9f16d716ef5c4d`.

- All preexisting v4 implementation work is committed. Initial SHA `db3c5ff6c9f009d91d2e86e5a7f2c4a2c835998d` FAILED clean fixture validation because two fixtures were omitted from staging. Corrective SHA `058e411cca8fb3574535bd5c6a9f16d716ef5c4d` PASSED clean `npm ci`, `npm run check` (229 tests, 12 fixtures, production build), and the two foundation browser tests. The failure remains in the ledger and local reports.
- Continuation files: `apps/web/src/App.tsx`, the Explanation/MedicineTranslator/Pharmacies/Savings/SharedSupport components, `apps/web/src/style.css`, `tests/e2e/workspaces.spec.ts`, this handoff, and `docs/verification.md`.
- User-visible behavior: signup keeps the welcome/preferences screen after account creation. Previously `screen === "auth" && !me` removed AuthScreen as soon as signup populated the account. The browser reproduced the missing welcome screen before the fix.
- The original walkthrough also used an exact Password selector that did not match the label containing password guidance. New tests match the actual accessible name and the actual "Saved fictional labels" heading.
- Sign-in fields now receive the same control styling as other text fields. The auth grid can shrink at 320px with Largest text; before the fix its content widened the page to 342px.
- Support sections now use h2 below the page h1 and h3 within sections, including the medicine translator. CSS selectors retain the presentation.
- Contract changes requested or applied by continuation: none. The committed checkpoint contains v1.6, both app pins, lockfile, and the two contract-validated synthetic fixtures.
- Commands run and actual outcomes: the pre-fix signup regression FAILED because the welcome screen disappeared. After correction, browser tests passed signup/preferences, saved-label confirmation, two-session invitation/selective sharing/revocation, settings at 320/360/430px and 844x390, and fixture source-dialog focus restoration. Photo-editor tests passed separately at 1440px and 390px after correcting their completion-message selector. Failures in earlier draft selectors were diagnosed; retries are disabled. The final combined suite is run by `commit:verified` and its actual result belongs to the exact SHA report.
- Clean committed-SHA verification result: checkpoint PASS as above. For the continuation's exact SHA and command outcomes, use `git log -1 --format=%H` and `.verification/<SHA>.json`; never infer PASS from this handoff.
- Independent review result: pending. Author inspection and automation are not independent review.
- Provider mode used: fixture, synthetic data only. Medicine UI responses are explicitly intercepted browser fixtures; API provider adapters retain their unit coverage. No new live requests or clinical verification are claimed.
- Known failures, missing access or assumptions: real-device camera/HEIC/EXIF/voices remain untested. Accounts and data are in memory only; recovery has no email provider; approval is an env allowlist; reopened labels have no local image preview; DailyMed reuse permission is unresolved; personalized interactions are unavailable. Full keyboard/screen-reader audit, 200% browser zoom, deployment, and independent review remain pending.
- Next smallest integration step: independently review the committed v1.6 API/contracts and frontend changes, then perform the real-device checks. Do not merge a failed SHA or imply that these browser checks cover every planned product journey.

## Reproduce current browser coverage

```sh
cd /Users/saramoore/hacktx26/.worktrees/design
npm run check
GEMINI_API_KEY= SERPAPI_API_KEY= LABELBRIDGE_REFERENCE_LOOKUPS=0 npm run smoke
```

The suite now includes 12 browser tests (two foundation plus ten workspace tests). Screenshots are saved under ignored `test-results/` for photo editing, sharing previews, supporter views, Largest-text settings, and the source explorer. Failure traces remain ignored. They contain synthetic data only.

The root `dev` checkout and `agent/backend` worktree have not been merged or modified. Backend design-reference exports, ignored `.env` credentials, and any preexisting Microsoft directory are untouched.

## Historical inventory from the pre-commit handoff

The following describes the original v4 work and its earlier checks; unfinished browser/commit statuses below are historical, superseded by the current increment above.

## Where

- Worktree: `/Users/saramoore/hacktx26/.worktrees/design`
- Branch: `design/labelbridge-refresh`, HEAD `b5fecc6`, with all changes uncommitted (see `git status`)
- Design export: `/Users/saramoore/Downloads/design-reference-v4`
- Node 24.22.1 is required: `export PATH=~/.nvm/versions/node/v24.22.1/bin:$PATH`

## Important notes

- **Accounts and data live only in memory.** Accounts, sessions, saved labels, circle invitations and grants, reviews, and the medicine caches are all lost when the API restarts. There is no database.
- **AI derivatives of labeling are disabled by default.** `LABELBRIDGE_ALLOW_LABELING_DERIVATIVES=0` turns off Gemini summaries and translations of DailyMed text, because the manufacturer SPL text may not be reusable. Users see the original passages and MedlinePlus links instead. The AI path has been tested only with mocks, never live.
- **Fixture smoke results are not live-provider verification.** `npm run smoke` runs in fixture mode. It passes 2/2 with the keys blanked, and it fails with the real `.env` keys because it expects `dataMode: fixture`. NLM was checked live in a separate manual probe, described under Checks.
- **The browser walkthrough is incomplete.** Status is in the next section.

## Browser walkthrough status

- **Script:** `/private/tmp/claude-501/-Users-saramoore-hacktx26/09b4b6dd-3a44-4184-87a1-75bed748b489/scratchpad/v4-walk.mjs`. It ran against a fixture-mode server on port 43411 (Gemini off).
- **How it ended:** I stopped it, and no PASS/FAIL list was printed.
- **Screenshots:** only these exist, in `/private/tmp/claude-501/-Users-saramoore-hacktx26/09b4b6dd-3a44-4184-87a1-75bed748b489/scratchpad/v4-shots/`:
  - guest home and photo editor at desktop width: `desktop-01`, `desktop-02`
  - the same two screens at 390px: `m390-01`, `m390-02`
- **Likely failures, not yet diagnosed:** no desktop screenshots exist from signup onward, yet the run moved on to the 390px pass. That suggests the account steps (signup, translator, circle, settings) failed or timed out. The likely cause is a selector mismatch in the script or a UI bug.
- **Not yet checked in the browser:** the account screens, translator UI, source explorer, sharing, supporter view, and the 320/360/430px and 844x390 landscape viewports.
- **Device testing not done:** real phone camera capture, HEIC on iOS Safari, EXIF from a real device, and speech voices. Emulation cannot show native camera behavior.

## Completed (uncommitted)

### Contracts

- v1.6.0, additive: accounts, circle, reviews, and the medicine schemas.
- Task actions now include decline and cancel.
- Version bumped in both app `package.json` files and `package-lock.json`.

### API (`apps/api/src`)

- **Accounts (`accounts.ts`, `routes/accounts.ts`):**
  - scrypt password hashes, session rotation, a 7-day idle limit
  - preferences, and deletion confirmed with the password and "DELETE"
  - an explicit guest-label attach
  - recovery returns 503, because no email provider exists
- **Circle (`circle.ts`, `routes/circle.ts`):**
  - hashed, single-use invitations that expire after 72 hours
  - per-label field grants, plus a separate image grant
  - revocation and per-supporter task permissions
- **Reviews (`reviews.ts`, `routes/reviews.ts`):**
  - volunteers are approved through the env allowlist
  - claims are atomic, expire after 15 minutes, and can be released
  - the cropped image is served only to the volunteer who claimed it
  - the patient can cancel, and stale revisions are refused
- **Medicine (`providers/rxnorm|dailymed|medlineplus|medicine-ai.ts`, `routes/medicine.ts`):**
  - consent before any lookup, then match checks and explicit confirmation
  - DailyMed passages carry IDs and version
  - MedlinePlus is link-out only, in English and Spanish
  - AI output is validated for citations, numbers and advice
  - 12-hour cache with identity-keyed invalidation
  - personalized interactions are shown as unavailable (NLM retired the API)
- **Plan:** `plan.ts` builds a deterministic task plan.

### Web (`apps/web/src`)

- **Navigation (`App.tsx`):** workspace nav and switcher, and three text sizes.
- **Account screens (`components/account/*`):**
  - auth, settings, My labels and the support circle
  - supporter and volunteer workspaces
  - "Save to My labels"
- **Medicine translator (`MedicineTranslator.tsx`):** source explorer dialog and Listen/Pause/Stop (on-device voices only, `useSpeech.ts`).
- **Photo intake (`Intake.tsx`, `lib/photo.ts`, `PhotoEditor.tsx`):** camera or choose, HEIC handling, EXIF, rotate/crop, limits.
- **Review section image:** `ReviewSectionImage.tsx`.

### Tests, fixtures, config

- **New tests:**
  - `tests/unit/api/{accounts-circle,reviews-volunteer,medicine}.test.ts`
  - `tests/unit/web/v4-workspace.test.ts`
- **New fixtures:** `fixtures/medicine-info.json` and `fixtures/circle.json`.
- **`.env.example`:** gains three variables (listed under Configuration).

### Integrator-owned files touched (need integrator review)

- `packages/contracts`
- `fixtures/*`
- `scripts/validate-fixtures.ts`
- `.env.example`
- `package-lock.json`
- `tests/unit/foundation.test.ts`

## Checks

| Check                             | Result                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                   | Passed: 229 tests, 12 fixtures, build. This ran before the DailyMed title fix; after the fix only the medicine tests were rerun, and they pass. **Rerun the full check.**              |
| `npm run smoke` with keys blanked | 2/2 passed (fixture mode)                                                                                                                                                              |
| `npm run smoke` with `.env` keys  | Fails: expects fixture mode, gets `live`. This is an environment difference.                                                                                                           |
| Live NLM probe (manual)           | Passed: RxNorm matches lisinopril 10 MG Oral Tablet, DailyMed v12 has passages in every section, and MedlinePlus returns English and Spanish links. A fictional name returns no match. |
| AI summaries and translations     | Mocked tests only; never run live.                                                                                                                                                     |
| Browser walkthrough               | Incomplete; see above.                                                                                                                                                                 |

## Unfinished tasks

1. Rerun the browser walkthrough, capturing output to a file rather than piping it through `tail`. Diagnose the account-flow steps and fix them.
2. Check the remaining viewports: 320, 360 and 430px, and 844x390 landscape.
3. Rerun `npm run check` and the smoke suite with keys blanked.
4. Test on a real device: iOS camera and HEIC, Android camera, EXIF orientation, speech voices.
5. Commit through `npm run commit:verified`, staging files explicitly, after the integrator reviews the contract and fixture changes.
6. Known gaps to track in `docs/verification.md`:
   - no persistence
   - no email, so no account recovery
   - volunteer approval only through the env allowlist
   - HEIC converts only where the browser can decode it (Safari)
   - labels reopened from My labels have no local image preview
   - support-step headings skip a level
   - DailyMed reuse permission is unconfirmed
   - no interaction provider

## Configuration

- **Existing keys:** `GEMINI_API_KEY` and `SERPAPI_API_KEY`, in `.env`. Never print them.
- **`LABELBRIDGE_APPROVED_VOLUNTEERS`:** comma-separated account emails.
- **`LABELBRIDGE_REFERENCE_LOOKUPS`:** default `1`. Set it to `0` to turn off the NLM lookups.
- **`LABELBRIDGE_ALLOW_LABELING_DERIVATIVES`:** default `0`.

## Resume commands

```sh
cd /Users/saramoore/hacktx26/.worktrees/design
export PATH=~/.nvm/versions/node/v24.22.1/bin:$PATH
npm ci
npm run check
GEMINI_API_KEY= SERPAPI_API_KEY= npm run smoke
# Preview in fixture mode (pick a free port; don't stop other checkouts' servers)
npm run build && GEMINI_API_KEY= PORT=43411 node apps/api/dist/server.js
# Walkthrough, with output saved to a file
S=/private/tmp/claude-501/-Users-saramoore-hacktx26/09b4b6dd-3a44-4184-87a1-75bed748b489/scratchpad
node $S/v4-walk.mjs $S/v4-shots http://127.0.0.1:43411/ > $S/v4-walk.log 2>&1
```
