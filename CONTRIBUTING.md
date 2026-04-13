# Contributing

## Landing Route Governance Gate

PRs that change landing-route files must carry the `ceo-approved` label before merge.

Landing-route scope (merge-gated):
- `musu-bee/src/app/page.tsx`
- `musu-bee/src/app/landing/**`
- `musu-bee/src/app/landing-exp/**`
- `musu-bee/src/app/(marketing)/**`
- `musu-bee/src/components/PublicSiteShell.tsx`
- `musu-bee/src/lib/publicSiteContent.ts`

CI enforcement:
- Workflow: `.github/workflows/landing-ceo-approval-gate.yml`
- Required check name: `landing-ceo-approval-gate`

Expected behavior:
1. Landing files changed + missing `ceo-approved` label => check fails.
2. Landing files changed + `ceo-approved` label present => check passes.
3. Non-landing PRs => check passes.

Branch protection:
- Mark `landing-ceo-approval-gate` as a required status check on the default branch.
- Do not use commit-message or title conventions as approval bypasses.
