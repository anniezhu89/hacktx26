# LabelBridge repository instructions

Read docs/LabelBridge_Agent_Build_Plan.md completely before implementation. Use synthetic data only.

Ownership: integrator owns packages/contracts, fixtures, root configuration, dependencies/lockfile, scripts, tests/e2e and merges. Frontend owns apps/web. Backend owns apps/api. One writer per worktree. Request shared dependency/schema changes from the integrator; contract changes require version and fixture updates and notification to both implementers.

Run npm run check before committing. Stage only intended files explicitly. Use npm run commit:verified -- "message"; it checks, commits staged files, then installs and checks the exact SHA in a detached worktree and runs smoke tests. Raw commits trigger a reminder; they are unverified until npm run verify:sha -- SHA passes. A failed SHA cannot integrate. Diagnose and create a corrective commit; do not hide failures or rewrite another writer's history. Independent review is a separate gate; automated PASS is not review approval.

Follow the plan's increment handoff format. Never claim clinical verification, live providers, deployment or test success without observed evidence. Do not add fake passing tests for pending workflows. Track acceptance gaps in docs/verification.md. Preserve the preexisting untracked Microsoft directory.
