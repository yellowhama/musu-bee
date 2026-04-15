# CTO Plan-Eng-Review — MUS-1701

Date: 2026-04-13 (KST)
Issue: MUS-1701 (`7ddf1f0c-a99d-42af-89c2-37870365995e`)

## Objective
Protect landing-route changes behind explicit CEO approval, enforced in CI and required for merge.

## Architecture
1) Detect touched files in PR against base branch.
2) If touched files match landing-path filter, require label `ceo-approved`.
3) Emit hard fail status check when label missing.
4) Keep check required in branch protection for default branch.

## Candidate landing path filter
- `musu-bee/src/app/landing/**`
- `musu-bee/src/app/(marketing)/**` (if present)
- `musu-bee/src/app/page.tsx` (if landing is root-routed)
- relevant CSS/modules under same route subtree

## Failure modes
- FM1: False negative path filter => unapproved landing change merges.
  - Mitigation: include explicit glob list + regression test matrix in PR evidence.
- FM2: Label check can be bypassed on direct push.
  - Mitigation: require branch protection + required check; no direct push to protected branch.
- FM3: Non-landing PRs blocked by overbroad glob.
  - Mitigation: publish touched-files log in job summary for auditability.
- FM4: Label typo drift.
  - Mitigation: normalize to one canonical label: `ceo-approved`.

## Security and governance
- Check must run with least-privilege `GITHUB_TOKEN` scopes.
- Do not rely on commit message markers or mutable local conventions.
- Governance signal must be reproducible from PR metadata.

## Acceptance contract (tightened)
A1. Workflow file added and active in repo CI.
A2. Touched-file filter clearly shows landing-path match/no-match behavior.
A3. Missing label on landing-change PR => check fails with explicit reason.
A4. Adding `ceo-approved` label => same PR check passes.
A5. CONTRIBUTING doc updated with exact rule and label name.
A6. Evidence bundle includes two run URLs (fail then pass) and touched-files excerpt.
