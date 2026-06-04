# MUSU 1.15.0-rc.1 CLI Route Wait and Web Input Roadmap - 2026-06-04

## Scope

This update records the product split discussed on 2026-06-04 and closes one
remaining local busy-loop candidate in the CLI route wait path.

Product direction:

- `musu.pro` is the web input, project-room, rendezvous, fallback-coordination,
  and evidence surface.
- Local MUSU programs are the executors. They own local files, shell/browser/app
  automation, the local bridge/runtime, and P2P mesh work.
- Web-originated commands are control-plane envelopes: work order, acceptance,
  status, route offer, audit record, and relay request.
- `localhost` dashboards are local operator/dev surfaces. For remote ordering
  or cross-device entry, the product entrypoint should be the real
  `https://musu.pro` website.
- A second Windows machine still needs the current MUSU build installed before
  multi-device route proof or two-machine runtime CPU evidence can close.

## Runtime Hardening

`musu route --wait` no longer polls task status indefinitely:

- added `--wait-timeout-sec`
- default wait timeout: `300s`
- hard ceiling: `3600s`
- status request timeout: `10s`, clamped to the remaining wait budget
- status polling sleeps for `2s`, clamped to the remaining wait budget
- wait timeout records `remote_task_wait_timeout` and keeps route evidence from
  overclaiming a completed task

The Rust background-loop release audit now checks the CLI bridge readiness and
route wait contracts explicitly:

- bridge readiness uses a caller deadline
- bridge readiness health polling starts at `250ms`
- bridge readiness backoff caps at `2000ms`
- route wait has default/maximum timeouts
- route wait status requests are timeout-bound
- route wait sleeps between polls
- route wait timeout has a failure class

## Validation

Passed:

- `cargo fmt`
- `cargo fmt --check`
- `cargo test --lib route_wait_timeout_is_bounded`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-rust-background-loop-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
- `git diff --check`

Note: the broader `cargo test route_wait_timeout_is_bounded` attempt reached
the lib and main targeted tests successfully, then hit the existing Windows
integration-test elevation boundary at `tests\r6_auto_update.rs` (`os error
740`). The accepted targeted validation for this source change is the `--lib`
test above.

## Release State

Dirty-tree go/no-go at `2026-06-04T11:07:36+09:00` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=true`
- blocker count `7`

This source change makes the current release claim dirty until it is committed
and, for public release packaging, followed by current-source primary evidence.

Public release remains No-Go on:

- second-PC runtime idle CPU evidence
- second-PC runtime CPU matrix evidence
- real second-PC multi-device route evidence
- live owner-scoped `musu.pro` relay route and payload proof
- `musu@musu.pro` support mailbox delivery evidence
- Store/Partner Center evidence

## Post-Commit Primary Evidence Refresh

After committing the route-wait source change, the local-sideload MSIX was
rebuilt and installed, then primary-machine evidence was refreshed.

Fresh evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-112129-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-112308-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-112809-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-112954-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go on `c9ada37ba675cff59b259bec05f30a72272d9641` now reports
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
`1/2`, runtime CPU matrix `1/2`, `manifest_git.dirty=false`, and blocker count
`6`.

Canonical follow-up report:

- `docs\RELEASE_1_15_0_RC1_POST_CLI_ROUTE_WAIT_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## Follow-Up: Chat SSE Retry Cap

The same local-executor/web-input roadmap now includes a frontend SSE
busy-loop fix. Chat task SSE reconnect was bounded by delay but not by retry
count. Commit `e92e0e558d2336237b7eca70d59c8ce35f764229` adds
`SSE_MAX_RETRIES=5`, `reconnectAttempts`, and `resetReconnectState()`, and the
frontend polling audit now requires that cap.

Clean go/no-go after the change reports `local_artifacts_ready=true`,
`msix_install_verified=true`, `single_machine_verified=false`, runtime idle CPU
`0/2`, runtime CPU matrix `0/2`, `manifest_git.dirty=false`, and blocker count
`7`, because frontend runtime source changed after the latest primary evidence.

Canonical follow-up report:

- `docs\RELEASE_1_15_0_RC1_CHAT_SSE_RETRY_CAP_HARDENING_2026_06_04.md`
