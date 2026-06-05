# MUSU 1.15.0-rc.1 Post Native RPC Exec Primary Evidence, Audit, and Next Steps

Date: 2026-06-05 KST  
Branch: `harden-relay-fallback-payload-evidence`  
Current evidence HEAD: `3b09dd73072cfd664fff244ef31e0c2e02ed4647`

## Summary

Fresh primary-machine packaged local-runtime evidence was restored after native
RPC exec hardening. The installed MUSU Desktop remains a local program: it runs
the bridge/runtime on this device, does not require a `localhost:3001` web
dashboard, and does not use MUSU.PRO as the execution server.

`musu.pro` remains the remote input, project/company room, meeting,
rendezvous, path-selection, relay-fallback policy, and evidence control plane.
It can deliver authenticated bounded work-order envelopes to local MUSU
programs, but actual work executes on each device. Devices may use `musu.pro`
to bootstrap discovery and then prefer direct P2P mesh.

## Evidence Refresh

The local-sideload MSIX was rebuilt, signed, reinstalled, and verified with the
packaged runtime identity. The repair run started the packaged bridge at
`http://127.0.0.1:6540`, with `dashboard.required=false`, `worker_ok=true`,
and production bridge auth. PATH still contains the known diagnostic shadowing
case where `C:\Users\empty\.cargo\bin\musu.exe` precedes the WindowsApps alias,
so release evidence uses the explicit WindowsApps alias path.

Tracked evidence:

- Single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-230036-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-230036-HUGH_SECOND.verification.json`
- Desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-230300-HUGH_SECOND.desktop-open.evidence.json`
- Five-scenario runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231115-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231115-HUGH_SECOND.verification.json`
- Targeted HUGH-MAIN post-route CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- Targeted HUGH-MAIN verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231836-HUGH_SECOND.target-route.verification.json`

Results:

- Single-machine smoke passed with `single_machine_surface=local-bridge-only`,
  `dashboard_required=false`, bridge `http://127.0.0.1:6540`, and CLI route
  checked.
- Desktop-open idle CPU passed from clean git for `60.032s`: MUSU `0.03`,
  Node `0`, WebView2 `0.16`, hot processes `0`, working set `361.22MB`.
- Five-scenario runtime matrix passed verifier `ok=true`, `fail_count=0`;
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_231115`, route task
  `c0e4c3f1-3e79-44ef-846e-475449e1819e`, max role CPU MUSU `0`, Node `0`,
  WebView2 `0.1`, and max working set `364.89MB`.
- Targeted HUGH-MAIN post-route CPU sample passed verifier `ok=true`,
  `fail_count=0` with `AllowFailedPostRouteProbe`. The route attempt timed
  out to `http://192.168.1.192:8949/api/tasks/delegate`, then CPU stayed
  inside budget for `60.025s`: MUSU `0`, Node `0`, WebView2 `0.05`, hot `0`.
  This is CPU evidence after a targeted route attempt, not successful
  multi-device evidence.

## Go/No-Go

Clean go/no-go after evidence commit `3b09dd73` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `runtime_idle_cpu_verified=false`, valid machines `1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_verified=false`, valid machines
  `1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_verified=true`, valid machines
  `1/1 [HUGH_SECOND]`
- frontend polling, Rust background-loop, idle busy-loop candidate, local API
  auth, operator API security, P2P store-forward relay, secret storage,
  process ownership, startup single-instance, and desktop single-instance
  gates all report `true`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `p2p_control_plane_verified=false`
- `p2p_owner_scope_verified=false`
- hosted relay lease store release-grade `false`
- hosted relay transport wired `false`
- hosted payload endpoint wired `false`
- hosted relay route evidence count `0`
- hosted relay payload delivery proof valid count `0`

Remaining blockers:

- `multi-device`: real second-PC multi-device evidence has not been recorded.
- `runtime-idle-cpu`: second machine desktop-open idle CPU evidence is still
  required.
- `runtime-cpu-scenario-matrix`: second machine five-scenario runtime CPU
  matrix evidence is still required.
- `support-mailbox`: `musu@musu.pro` delivery evidence is missing.
- `store-release`: Partner Center reservation/submission/certification and
  restricted capability evidence are missing.
- `p2p-control-plane`: live `https://musu.pro` still lacks release-grade
  owner-scoped relay lease storage, wired relay transport/payload endpoint,
  owner-scoped relay route evidence, relay payload transport proof, and
  delivery proof.

## Code Audit

Scope:

- The current unpushed delta from `origin/harden-relay-fallback-payload-evidence`
  to `3b09dd73` adds evidence files only. It does not change runtime code.
- The relevant runtime hardening remains commit `fe25c5d8`, which changed
  `musu-rs\src\bridge\handlers\rpc.rs`, `docs\CONFIG.md`, and
  `scripts\windows\audit-operator-api-security-contract.ps1`.

Findings:

- No high or medium issue found in the current diff.
- Native `/api/v1/rpc/exec` is behind the bridge bearer-auth middleware and is
  additionally fail-closed behind `MUSU_RPC_EXEC_ALLOWLIST`.
- The endpoint rejects command paths, user `cwd`, overlong commands/args,
  control characters, and empty allowlists.
- Execution is timeout-bound, clamps `MUSU_RPC_EXEC_TIMEOUT_SECS` to `1..60`,
  uses `kill_on_drop(true)`, caps stdout/stderr to `64 KiB`, and writes audit
  entries for rejected, spawn-failed, timed-out, and completed attempts.
- Residual low-risk item: completed commands with non-zero exit codes still
  return the structured response body while the audit note carries the
  `exit_code`. This preserves caller compatibility, but future audit reporting
  should keep HTTP status semantics and command exit semantics visually
  distinct.

Validation rerun:

- `cargo test rpc_exec --lib`: `6/6` passed.
- `scripts\windows\audit-operator-api-security-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`.
- `scripts\windows\write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120`:
  current public release remains No-Go for the six external/second-PC gates
  listed above.

## Qualitative Evaluation

The local runtime is behaving like the intended product: MUSU Desktop is a
local executor, packaged bridge evidence works without a local Next.js
dashboard, and repeated CPU samples show no idle busy-loop on HUGH_SECOND. The
native RPC exec hardening is directionally correct because it turns a remote
command surface into an explicit, audited, bounded local-runtime contract.

The public release is still not ready. The blockers are not cosmetic: the
second machine is unreachable, the two-machine runtime evidence is incomplete,
and hosted `musu.pro` P2P remains a coordination/control-plane promise without
release-grade live relay proof. The next work should focus on second-PC
installation/reachability first, then live P2P control-plane proof, then manual
support/Store evidence.

## Next Steps

1. Install this exact MUSU build on the second Windows PC and run the second-PC
   release check kit. Import the return zip and verify multi-device,
   desktop-open idle CPU, and five-scenario runtime CPU matrix evidence.
2. Fix HUGH-MAIN reachability or replace it with a reachable second machine.
   Current targeted route attempts time out at `192.168.1.192:8949`.
3. Configure live `musu.pro` P2P control-plane production storage/auth:
   owner-scoped KV/Upstash relay lease store, `relay_default_data_path=false`,
   wired relay connect/payload endpoints, and release-grade route/payload proof.
4. Record `musu@musu.pro` support mailbox delivery evidence.
5. Record Partner Center product reservation, app submission, Microsoft
   certification, and restricted capability review evidence.
6. Keep the product copy strict: local MUSU programs execute work; MUSU.PRO
   provides remote input, room coordination, rendezvous, relay fallback policy,
   and evidence.

## Index Refresh

After this report, wiki/spec, and CoS memory updates, the MUSU local indexer
was refreshed:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `2433 files`, `2705 symbols`, `34984 ms`

gbrain was not rerun for this incremental documentation refresh because the
same-session active blocker is already known: missing `ZEROENTROPY_API_KEY`,
generated/evidence import failures, `sync.last_commit` not advancing, and
`gstack-brain-sync exited undefined`. `AGENTS.md` GBrain Search Guidance remains
intentionally absent until semantic/symbol search is verified on this Windows
machine.
