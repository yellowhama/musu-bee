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
