# Design Brief — PR #34 Fleet And Install UI

Date: 2026-06-27 KST
PR: https://github.com/yellowhama/musu-bee/pull/34
Design issue: https://github.com/yellowhama/musu-bee/issues/35
Status: **approval requested, not yet approved**

## Purpose

This PR changes user-facing UI copy for the same product goal: make MUSU a
trustworthy multi-PC local executor and control plane, not a screen that implies
remote work can run when the route is stale or unproven.

The UI changes are intentionally narrow:

- `/download`: show the public one-line Windows installer command for another PC
  and the post-first-launch proof commands that emit release JSON.
- `/install`: expose the same command in the install surface and keep non-Windows
  states as planned, not available. It also exposes the PC-local proof command.
- `/fleet` and `/dashboard/fleet`: rename online totals and relay wording so a
  relay-display heartbeat is not presented as a proven work route.

## Changed UI Files

- `musu-bee/src/app/download/page.tsx`
- `musu-bee/src/app/install/page.tsx`
- `musu-bee/src/app/fleet/page.tsx`
- `musu-bee/src/app/dashboard/fleet/page.tsx`
- `musu-bee/src/lib/fleetState.ts`

## Design Decisions

1. The install command is shown as a command block, not a marketing CTA. The
   expected user task is to copy/paste on a second Windows PC.
2. The copy explicitly says the beta certificate is trusted by the installer and
   that App Installer updates are registered. This prevents a hidden install
   trust boundary.
3. `/download` adds post-install verification commands:
   `musu package-status`, `musu nodes --json`, and the hosted
   `fleet-proof.ps1` JSON proof wrapper.
4. `/install` also shows the hosted `fleet-proof.ps1` proof command so the
   install path does not end at a weak package-status check.
5. `/fleet` no longer says "Reachable over relay" for a display-only heartbeat.
   It says "Recent relay heartbeat; direct route not proven."
6. `/dashboard/fleet` changes the summary from "Nodes Online" to "Direct Online"
   so the count matches the runtime contract.
7. Card radii were reduced to 8px and heading letter spacing was reset to 0 to
   align with the current UI design rules.

## Screenshots

Local screenshots captured from `http://127.0.0.1:3000`:

- `docs/design-artifacts/pr34-download.png`
- `docs/design-artifacts/pr34-install.png`
- `docs/design-artifacts/pr34-fleet.png`

`pr34-download.png` and `pr34-install.png` were refreshed after the hosted
`fleet-proof.ps1` command was added to the install surfaces. The `/fleet`
artifact captures the empty local state. The relay/direct text is covered by
source and contract tests because this local browser session did not have paired
PCs in the web fleet store.

## Verification

- `npm run test:public-release` passed 16/16 and asserts `/download` and
  `/install` expose the hosted `fleet-proof.ps1` proof command.
- `npm run typecheck` passed.
- `npm run build` passed. Compile took 79s; the only visible warning was the
  existing Next 16 `middleware` convention deprecation.
- Playwright screenshot refresh for `/download` and `/install` passed desktop
  horizontal-overflow checks; `/download` also passed a 390px mobile
  horizontal-overflow check.
- `cargo test registry_last_seen_to_heartbeat --lib` passed 1/1
  (`registry_last_seen_to_heartbeat_uses_registry_stamp`).
- PR #34 code/test CI checks pass on the current branch lineage; only
  `design-gate` remains pending actual approval evidence. Issue #35 has an
  evidence-refresh comment
  `https://github.com/yellowhama/musu-bee/issues/35#issuecomment-4813006122`,
  but no explicit CEO/design approval comment yet.
- The design gate now requires a real GitHub issue comment URL matching
  `https://github.com/.../issues/<number>#issuecomment-<number>`. A standalone
  `Design: Approved` line without that approval comment URL must still fail.

## Approval Requirements

This document and the PNG artifacts are **not** approval. To satisfy the design
gate without faking approval:

1. Add an explicit CEO/design approval comment on issue #35.
2. Update the PR body from `Design: Pending` to:

```markdown
Design: Approved

Design brief issue: https://github.com/yellowhama/musu-bee/issues/35
Design artifact:
- https://github.com/yellowhama/musu-bee/blob/feat/v33-residual-finalize/docs/design-artifacts/pr34-download.png
- https://github.com/yellowhama/musu-bee/blob/feat/v33-residual-finalize/docs/design-artifacts/pr34-install.png
- https://github.com/yellowhama/musu-bee/blob/feat/v33-residual-finalize/docs/design-artifacts/pr34-fleet.png
Approval comment: https://github.com/yellowhama/musu-bee/issues/35#issuecomment-<approval-comment-id>
```
