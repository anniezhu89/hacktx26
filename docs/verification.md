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
