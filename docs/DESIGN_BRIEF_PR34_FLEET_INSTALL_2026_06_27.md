# Design Brief — PR #34 Fleet And Install UI

Date: 2026-06-27 KST
PR: https://github.com/yellowhama/musu-bee/pull/34
Status: **approval requested, not yet approved**

## Purpose

This PR changes user-facing UI copy for the same product goal: make MUSU a
trustworthy multi-PC local executor and control plane, not a screen that implies
remote work can run when the route is stale or unproven.

The UI changes are intentionally narrow:

- `/download`: show the public one-line Windows installer command for another PC.
- `/install`: expose the same command in the install surface and keep non-Windows
  states as planned, not available.
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
   `musu package-status` and `musu nodes --json`.
4. `/fleet` no longer says "Reachable over relay" for a display-only heartbeat.
   It says "Recent relay heartbeat; direct route not proven."
5. `/dashboard/fleet` changes the summary from "Nodes Online" to "Direct Online"
   so the count matches the runtime contract.
6. Card radii were reduced to 8px and heading letter spacing was reset to 0 to
   align with the current UI design rules.

## Screenshots

Local screenshots captured from `http://127.0.0.1:3000`:

- `docs/design-artifacts/pr34-download.png`
- `docs/design-artifacts/pr34-install.png`
- `docs/design-artifacts/pr34-fleet.png`

The `/fleet` artifact captures the empty local state. The relay/direct text is
covered by source and contract tests because this local browser session did not
have paired PCs in the web fleet store.

## Verification

- `npx tsx --test src/app/api/health/route.test.ts src/lib/nodeRegistryStore.test.ts src/app/api/v1/nodes/register/route.test.ts src/app/public-metadata-contract.test.ts`
  passed 38/38.
- `npm run test:public-release` passed 11/11.
- PR #34 code/test CI checks pass on head `9ddaf745`; only `design-gate` remains
  pending actual approval evidence.

## Approval Requirements

This document and the PNG artifacts are **not** approval. To satisfy the design
gate without faking approval:

1. Create or link a GitHub issue for this design brief.
2. Add an explicit CEO/design approval comment on that issue.
3. Update the PR body with:

```markdown
Design: Approved

Design brief issue: <issue URL>
Design artifact:
- https://github.com/yellowhama/musu-bee/blob/feat/v33-residual-finalize/docs/design-artifacts/pr34-download.png
- https://github.com/yellowhama/musu-bee/blob/feat/v33-residual-finalize/docs/design-artifacts/pr34-install.png
- https://github.com/yellowhama/musu-bee/blob/feat/v33-residual-finalize/docs/design-artifacts/pr34-fleet.png
Approval comment: <approval comment URL>
```

