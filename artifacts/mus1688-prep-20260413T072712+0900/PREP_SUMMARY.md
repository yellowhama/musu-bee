# MUS-1688 Blocked-Phase Prep Summary (2026-04-13 KST)

## Scope guard
- Parent design lane (`MUS-1707`) has not posted explicit `UNBLOCK: GO`.
- This prep run performed **no product code mutation**.
- Allowed prep completed: branch hygiene snapshot, migration inventory draft, runtime risk register.

## 1) Branch hygiene snapshot
- Branch: `main` (`branch.txt`)
- Working tree has substantial unrelated modifications (`git_status_short.txt`, 234 lines).
- Implementation packet should land on an isolated branch after unblock to avoid cross-packet contamination.

## 2) CSS variable migration inventory (landing/dashboard/settings)
Evidence files:
- `inline_style_counts.txt`
- `brand_color_hits.txt`
- `app_route_inventory.txt`
- `settings_surface_search.txt`

Key observations:
- Inline-style hotspots (top):
  - `musu-bee/src/components/CompanyTemplateModal.tsx` (68)
  - `musu-bee/src/app/page.tsx` (64)
  - `musu-bee/src/app/pro/page.tsx` (63)
  - `musu-bee/src/components/Sidebar.tsx` (58)
  - `musu-bee/src/components/OnboardingModal.tsx` (54)
  - `musu-bee/src/app/landing/page.tsx` (50)
  - `musu-bee/src/app/pricing/page.tsx` (40)
- Existing brand token usage is concentrated in `musu-bee/src/app/landing-exp/page.module.css`.
- Current app routes include landing + app + pro, but no dedicated settings route detected (`settings_surface_search.txt` empty).

Migration-first candidate map (post-unblock):
1. Token source of truth: `musu-bee/src/app/globals.css`
2. Public shell and landing: `musu-bee/src/components/PublicSiteShell.tsx`, `musu-bee/src/app/landing/page.tsx`, `musu-bee/src/app/page.tsx`
3. App/dashboard shell: `musu-bee/src/components/AppShell.tsx`, `musu-bee/src/components/Sidebar.tsx`, `musu-bee/src/components/ChatArea.tsx`, `musu-bee/src/app/app/page.tsx`, `musu-bee/src/app/pro/page.tsx`
4. Shared auth pages and modals: `musu-bee/src/app/auth/*`, `musu-bee/src/components/*Modal.tsx`

## 3) Runtime attach risk register (`MUS-1716` dependency)
Evidence files:
- `check_pencil_connection.log`
- `check_pencil_connection.exit`
- Historical references under `artifacts/mus1716-pencil-attach-*`

Fresh verification command:
```bash
skills/pencil-dev-design-workflow/scripts/check_pencil_connection.sh \
  /home/hugh51/musu-functions/artifacts/mus1644-work-hub.pen \
  /home/hugh51/.config/Pencil/logs/main.log
```
Result:
- Exit code `3`
- `process-running: 0`
- `loadFile: 1`, `addResource: 1`, `initialized: 0`

Investigate (root-cause-first):
- Investigate: markers exist for target file in log window, but no active process and no `[IPC] initialized` marker.
- Analyze: attach lifecycle is partially progressing (target load/add) but fails liveness/initialization invariants.
- Hypothesis: process lifecycle instability and/or incomplete IPC initialization handshake causes MCP transport shutdown.
- Implement: deferred (design gate still active; no runtime code mutation in this prep run).

Direct MCP probe in this run:
- `pencil/get_editor_state` -> `Transport closed`
- `pencil/get_screenshot` -> `Transport closed`

## Risk register (post-unblock execution risks)
1. **High**: Massive inline style surface raises regression blast radius when tokenizing.
2. **High**: Dirty baseline tree complicates proving packet-local diffs.
3. **High**: Runtime attach dependency still fails hard gate (`process-running` + transport closed).
4. **Medium**: No dedicated settings surface detected; acceptance mapping may require CTO clarification on target files.

## Suggested immediate next gate actions (owner-specific)
- CTO: publish design handoff artifacts + mapping table + explicit `UNBLOCK: GO` on `MUS-1707`.
- FE (after unblock): isolate branch, apply token migration in phased slices, and run proof commands + `/design-review` request.
- Runtime owner for `MUS-1716`: restore stable Pencil process + `[IPC] initialized` marker + successful MCP calls in same window.
