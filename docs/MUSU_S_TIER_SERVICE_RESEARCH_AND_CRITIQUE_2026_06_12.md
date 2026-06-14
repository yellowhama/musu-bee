# MUSU S-Tier Service Research and Critique

Date: 2026-06-12

## Product Standard

MUSU should not feel like a dashboard that happens to list machines. It should
feel like a resident command center for a personal compute fleet:

- Pick a machine, give it work, see where the work went.
- Leave the window, get pulled back only when the result matters.
- When a machine or order fails, the next action is visible on the failed object.
- Status labels must be evidence-backed. If MUSU does not know, it says so.

## Reference Findings

Tailscale establishes the machine-list baseline: users expect searchable and
filterable devices, online/offline state, and real `last seen` semantics. Its
device docs call out last-seen filters and exporting fields such as device name,
client version, and last seen.

Raycast and Linear establish the speed baseline: power users expect a command
surface reachable by keyboard, short aliases/hotkeys, and repeated actions that
do not require navigating the UI tree.

Vercel establishes the failure-debugging baseline: failed work must lead directly
to logs/activity context and a recovery action. Logs and activity are not
secondary documentation; they are part of the work object.

## Current MUSU Critique

Strong:

- The cockpit already has a focused desktop shell, not a generic web dashboard.
- Fleet rows are clickable and keyboard-accessible.
- Running cards show elapsed time instead of fake progress.
- Failed cards have a retry action.
- OS notifications and tray behavior make MUSU resident instead of transient.

Weak:

- A task card did not show the routed target, so a user could not scan where work
  was sent after the fact.
- Retry previously preserved text only, not the target. That made the "same
  order" claim false if the composer target changed later.
- Offline last-seen values were being synthesized, which weakened trust in the
  fleet list.
- Terminal cards showed output/error but did not offer a direct "take this with
  me" action such as copying the result.

## Implemented S-Tier Slice

This pass makes task cards behave more like operational objects:

- Cards now carry the order tuple: text plus target.
- Cards show a route chip: `auto-route` or `to <machine>`.
- Cards expose a `Details` drawer with task id, route, status, elapsed/artifact
  evidence, and a bounded status activity log.
- When bridge route evidence exists, task Details shows recorded route proof:
  path kind, peer, candidate address, result, proof grade, and recorded time.
- When a remote peer callback returns, MUSU writes callback proof and task
  Details shows callback delivery, remote task id, callback node, and received
  time. This proves the cross-machine result reconciliation step, not just the
  initial send.
- Callback proof now uses the bridge node identity (`MUSU_NODE_NAME`), not the
  raw OS hostname, so a task routed to `studio-pc` reconciles as callback node
  `studio-pc`.
- Done cards now surface a collapsed proof summary such as `returned from
  studio-pc` plus route kind/result/proof grade, so the user does not have to
  open Details to trust that cross-machine reconciliation happened.
- Retry uses the card's stored target instead of the current composer dropdown.
- Terminal cards expose `Copy result` when output/error/artifact text exists.
- Unknown offline timestamps render as `offline`, not fabricated relative time.
- Fleet rows now have local `All`, `Online`, `Targetable`, `This PC`, `Stale`,
  and `Offline` filters with counts. `Targetable` means online and able to
  receive work now; `Stale` means offline but backed by a real last-seen
  observation; `Offline` keeps no-evidence offline peers honest instead of
  inventing a timestamp.
- Fleet `last_seen` is now sourced from live probe time, cached registry
  heartbeat, or `nodes.toml` last health evidence.
- `npm run test:tauri-shell` pins those cockpit contracts so the same regressions
  fail fast.
- `scripts/windows/smoke-two-bridge-route-proof.ps1` starts two independent
  bridge homes, delegates from source bridge to target peer via
  `/api/tasks/delegate`, waits for the callback on the source task detail, and
  asserts durable route evidence plus callback proof files exist.
- `scripts/windows/smoke-real-peer-route-proof.ps1` attaches to an already
  running source bridge and validates a target peer. It can register a target
  URL or Tailscale IP, delegate through `/api/tasks/delegate`, wait for
  source-side callback reconciliation, assert durable route/callback proof, and
  enforce `route_proof.route_kind = tailscale` for a true Tailscale run.
- The Tailscale route contract is now explicit: Tailscale is an optional overlay
  with a control-plane dependency, not MUSU's local-first foundation. A true
  `route_kind=tailscale` smoke must prove `tailscale ip -4`, `tailscale ping`,
  target bridge `/health` over the tailnet IP, and callback reconciliation.
  Headscale is documented as the self-hosted control-plane option for a
  personal/small-team single tailnet.
- `playwright.tauri-shell.config.ts` plus
  `src-tauri-shell/cockpit-browser.spec.ts` render the built desktop shell in a
  real Chromium page with a mocked Tauri API. The fixture verifies fleet
  online/offline counts, target selection, remote completion proof summary,
  Details proof rows, copy-result behavior, attaches a screenshot artifact, and
  compares against desktop and compact pixel baselines. Only the task-log
  timestamp is masked.
- The compact cockpit layout has an explicit 420px visual baseline and a
  no-horizontal-overflow assertion. At that width, the order composer becomes a
  two-row grid and proof/task metadata wraps instead of forcing the window wide.
- The fleet filter row is included in both desktop and compact pixel baselines,
  including `Targetable`, `This PC`, and `Stale`.

## Verification Performed

- `node --check musu-bee/src-tauri-shell/main.js`
- `npm run test:tauri-shell` (`5/5` cockpit contract tests)
- `cargo test --manifest-path musu-rs/Cargo.toml --lib last_ -- --nocapture`
  (`4/4` focused last-seen tests)
- `cargo test --manifest-path musu-rs/Cargo.toml --lib route_proof -- --nocapture`
  (route proof + callback proof summary test)
- `cargo test --manifest-path musu-rs/Cargo.toml --lib
  node_status_uses_runtime_registry_addr -- --nocapture` (`1/1`)
- `cargo test --manifest-path musu-rs/Cargo.toml --lib
  callback_node_name_prefers_musu_node_name -- --nocapture` (`1/1`)
- `cargo build --manifest-path musu-rs/Cargo.toml --bin musu`
- `powershell -NoProfile -Command '$errors=$null;
  [void][System.Management.Automation.PSParser]::Tokenize((Get-Content
  -LiteralPath "scripts/windows/smoke-two-bridge-route-proof.ps1" -Raw),
  [ref]$errors); if ($errors) { exit 1 }'`
- `powershell -NoProfile -ExecutionPolicy Bypass -File
  scripts/windows/smoke-two-bridge-route-proof.ps1 -Json -TimeoutSec 120`
  passed on 2026-06-13 KST. Evidence:
  `.local-build/two-bridge-route-proof/20260613-002216/two-bridge-route-proof.evidence.json`.
  It verified source task `done`, remote echo output, `route_proof.result =
  success`, `callback_delivered = true`, `callback_node = studio-pc`, and both
  route/callback proof files.
- `powershell -NoProfile -ExecutionPolicy Bypass -File
  scripts/windows/smoke-real-peer-route-proof.ps1 -Json -MusuHome
  .local-build/two-bridge-route-proof/20260613-004510/this-laptop -TargetNode
  studio-pc -ExpectedRouteKind lan -TimeoutSec 120` passed against a running
  source bridge and existing peer. Evidence:
  `.local-build/real-peer-route-proof/20260613-004527/real-peer-route-proof.evidence.json`.
- `npm run build:tauri-shell`
- `npx playwright test --config=playwright.tauri-shell.config.ts
  --update-snapshots` generated the initial pixel baselines
  `src-tauri-shell/cockpit-browser.spec.ts-snapshots/tauri-shell-proof-summary-win32.png`
  and
  `src-tauri-shell/cockpit-browser.spec.ts-snapshots/tauri-shell-proof-summary-compact-win32.png`.
- `npm run test:tauri-shell:browser` (`2/2` browser-rendered shell fixtures with
  pixel baseline comparison)
- `git diff --check`
- Headless cockpit mock path: local-only fleet rendered with online/offline
  machines, filter counts were exposed, order submitted to `studio-pc`, done
  card showed `to studio-pc`, result copied as `remote result ok`, and no browser
  errors were emitted.
- Headless task drawer mock path: `Details` opened a per-task inspector showing
  task id, route, status, elapsed time, artifact path, and the status log
  `queued locally -> running on target -> completed with result`.
- Headless route proof mock path: task Details rendered backend `route_proof`
  as path, peer, address, result, proof grade, recorded time, callback delivery,
  remote task id, callback node, and callback received time.
- Browser-rendered shell path: Playwright opened the built desktop shell,
  rendered a three-machine fleet, verified `Targetable 2` excludes the stale
  peer, verified `Stale 1` isolates the evidence-backed offline peer, submitted
  an order to `studio-pc`, verified the collapsed proof summary `returned from
  studio-pc`, opened Details, copied the remote result, attached a screenshot
  artifact, and compared it against the stored pixel baseline.
- Compact browser path: Playwright rendered the same proof scenario at 420px
  width, asserted no horizontal overflow, and compared it against the compact
  pixel baseline.
- Headless retry mock path: after failure, the composer dropdown was changed to
  `lab-pc`, but Retry submitted `restart worker` to the stored `studio-pc`
  target again.
- Real-peer harness path: the new smoke script validated the same source bridge
  task-detail contract without spawning the peer itself. On separate hardware,
  run it as:
  `powershell -NoProfile -ExecutionPolicy Bypass -File
  scripts/windows/smoke-real-peer-route-proof.ps1 -TargetNode <peer-name>
  -TailscaleIp <100.x.y.z> -ExpectedRouteKind tailscale -Json`.

## Next S-Tier Gaps

- Enrich route proof further with relay payload proof once that backend evidence
  is attached to task status.
- Promote the UI-only fleet filter semantics into explicit backend fields if
  other clients need the same `targetable`, `this_pc`, or `stale` labels.
- Expand pixel baselines to additional operating-system/window chrome variants
  if packaging changes the available viewport; current coverage is desktop and
  compact proof-summary states.
- Execute `smoke-real-peer-route-proof.ps1` on two physical machines over
  Tailscale with `-ExpectedRouteKind tailscale`. The harness is now present and
  locally validated; the remaining gap is the external hardware/network run.
  For a self-hosted overlay, first join both machines with `tailscale login
  --login-server=<headscale-url>`, then run the same smoke against the resulting
  tailnet IP.

## Sources

- Tailscale device filtering and last-seen filters:
  https://tailscale.com/docs/features/access-control/device-management/how-to/filter
- Tailscale device export fields:
  https://tailscale.com/docs/features/access-control/device-management/how-to/export-list
- Tailscale CLI reference:
  https://tailscale.com/docs/reference/tailscale-cli
- Tailscale 100.x.y.z address reference:
  https://tailscale.com/docs/concepts/tailscale-ip-addresses
- Headscale:
  https://github.com/juanfont/headscale
- Raycast command aliases and hotkeys:
  https://manual.raycast.com/command-aliases-and-hotkeys
- Linear command menu workflow reference:
  https://www.morgen.so/blog-posts/linear-project-management
- Vercel build logs:
  https://vercel.com/docs/deployments/logs
- Vercel activity log:
  https://vercel.com/docs/activity-log
