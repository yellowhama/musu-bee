# MUSU 1.15.0-rc.1 MUSU.PRO Control Plane Roadmap and Control SSE Audit

Date: 2026-06-04 13:37 KST

## Product decision

The product direction is locked to a local-executor model.

- `localhost` and `127.0.0.1` dashboards are local-only operator/developer
  surfaces. They are not cloud dashboard access and they only work while the
  local MUSU runtime/dashboard is running on that same machine.
- `musu.pro` is the real web input, project room, company meeting room,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs receive authenticated web work orders from `musu.pro`,
  then execute work locally on the target machine.
- Local programs own file access, shell/app/browser automation, local bridge
  execution, and P2P mesh traffic.
- `musu.pro` can help devices find each other, exchange route candidates, and
  issue fallback relay leases after direct paths fail. It must not become the
  default data path or execution server.
- Project rooms can coordinate AI workers attached to the same project, but the
  actual work still runs on the matching local devices.

This is the Codex/GitHub-style product shape: the cloud service owns identity,
project/repository context, work orders, presence, and coordination; the local
program owns execution and machine-to-machine transport.

Follow-up lock from the operator discussion:

- The local program and the website are separate product surfaces. The local
  program is not "the website running on localhost"; it is the installed worker
  that owns local execution.
- `https://musu.pro` should be the preferred user entrypoint for remote work
  ordering, project rooms, device presence, and route/session status.
- `localhost` / `127.0.0.1` pages remain useful for local diagnosis and
  same-machine operation, but they are not the remote-user workflow.
- `musu.pro` sends authenticated work-order envelopes and room events. It does
  not run shell commands, edit local files, or become a remote desktop server.
- Devices may use `musu.pro` to rendezvous and exchange signed route offers.
  Once a viable path exists, the devices should talk through direct P2P mesh
  whenever possible.
- The hosted relay path is fallback after direct-route failure and belongs at
  the Connect/Pro boundary. It is not the default data path.

## Release implication

Current work can keep validating one-machine behavior: local runtime startup,
dashboard URL discovery, single-machine smoke, idle CPU, route explain
diagnostics, and control-plane contract checks.

Two-machine release proof cannot be completed until the current MUSU build is
installed and run on a second Windows PC. The second-PC evidence still must
prove:

- current-build MSIX install,
- desktop-open idle CPU under budget,
- runtime CPU scenario matrix under budget,
- multi-device route explain and execution evidence,
- release-grade route transport with peer identity and encryption proof, and
- relay fallback only after direct-path failure.

Immediate roadmap:

1. Keep one-machine release hardening moving while the second Windows PC is not
   available: packaged dashboard URL discovery, local smoke, idle CPU, CPU
   scenario matrix, background-loop audits, local API auth, and work-order
   context integrity.
2. Treat current multi-device work as single-machine-preparable only until the
   current build is installed on the second PC: kit generation, route explain
   diagnostics, evidence importers, and fail-closed verifiers.
3. Build `musu.pro` rooms as the web coordination layer: company/project room,
   work orders, AI worker presence, decisions, handoffs, notes, and status.
4. Build `musu.pro` rendezvous/path selection as the connection bootstrap:
   device identity, presence, route candidates, signed offers, attempted path
   history, and fallback decision records.
5. Complete release-grade relay transport only after the control plane proves
   owner-scoped storage and fallback-only policy: wired connect endpoint, wired
   payload endpoint, lease-bound payload transit, delivery proof, route
   evidence, and `relay_default_data_path=false`.

## Control SSE audit

The Rust background-loop contract audit now explicitly covers
`musu-rs\src\control\http_server.rs`.

New checks:

- control SSE heartbeat uses `IntervalStream` with a bounded 30s interval,
- control SSE emits `heartbeat` events, and
- control SSE maps interval ticks to heartbeat events instead of spinning on an
  empty stream.

This did not change Rust runtime source. It only makes an existing loop
contract visible to the release gate, so current packaged one-machine evidence
does not need to be refreshed for this audit-script change.

## Validation

- PowerShell parser check passed for
  `scripts\windows\audit-rust-background-loop-contract.ps1`
- `audit-rust-background-loop-contract.ps1 -FailOnProblem -Json` passed:
  `ok=true`, `fail_count=0`, `unaudited_loop_hit_count=0`
- Release freshness classifiers now treat `musu-bee/docs/*` as
  documentation/status-only, matching root `docs/*`. This prevents app-level
  product docs from incorrectly staling packaged MSIX/smoke/CPU evidence.

Public release remains No-Go until second-PC runtime/multi-device evidence,
live owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence are complete.
