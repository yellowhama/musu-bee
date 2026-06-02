# MUSU 1.15.0-rc.1 External Recheck Recorder

Date: 2026-06-03 KST

## Summary

`scripts\windows\record-external-release-gate-recheck.ps1` is now the repeatable
operator command for the external release gates that remain after local
artifact readiness is true.

It records, in one run:

- final `write-release-go-no-go.ps1` state
- second-PC reachability for `192.168.1.192:8949`
- `musu.pro` P2P env status
- live P2P control-plane evidence from the packaged WindowsApps alias path

The script does not mark the product release-ready. It records blocker state
and returns exit `0` by default so operators can capture No-Go evidence without
breaking the handoff flow. Use `-FailOnNotReady` when a CI or release gate must
exit nonzero on any remaining blocker.

## Evidence Schema

New schema:

```text
musu.external_release_gate_recheck.v1
```

Default output:

```text
docs\evidence\external-gates\<VERSION>\*.external-gates.evidence.json
docs\evidence\external-gates\<VERSION>\*.external-gates.summary.md
```

Important fields:

- `release_ready`
- `local_artifacts_ready`
- `single_machine_verified`
- `runtime_idle_cpu_valid_machine_count`
- `runtime_cpu_scenario_matrix_valid_machine_count`
- `second_pc_reachability`
- `second_pc_probe_timeout_ms`
- `p2p_env`
- `p2p_evidence_result`
- `go_no_go_blockers`
- `blockers`

## Tooling Changes

- `record-external-release-gate-recheck.ps1` runs child release scripts through
  timeout-bounded `powershell.exe` child processes and captures stdout, stderr,
  exit code, timeout state, elapsed time, parsed JSON, and raw output.
- The second-PC reachability probe is bounded. It no longer depends on
  `Test-NetConnection` default timing; it records source address/interface,
  bounded ICMP ping timing, bounded TCP connect timing, timeout, and probe
  errors through `second_pc_reachability`.
- `audit-desktop-release-readiness.ps1` now checks that the external recheck
  recorder exists.
- `prepare-final-operator-gate-packet.ps1` copies the recorder and documents
  its command in the final operator README.
- `verify-final-operator-gate-packet.ps1` requires the recorder, this report,
  and the README command text.
- `write-release-go-no-go.ps1`, `verify-single-machine-evidence.ps1`, and
  `verify-runtime-cpu-scenario-matrix.ps1` treat the recorder as status-only
  tooling, so adding it does not stale current runtime evidence.

## Product Spec Impact

Runtime product behavior is unchanged. The product release spec gains a new
evidence artifact: the external gate recheck snapshot. This makes the current
No-Go state auditable without conflating local artifact readiness with the
remaining externally controlled release gates.

## Qualitative Assessment

Local artifact readiness remains credible: the current package, desktop
entrypoint, single-machine smoke, process ownership, startup single-instance,
desktop single-instance, and primary CPU evidence are already verified on
`HUGH_SECOND`.

Public desktop release remains No-Go until these gates close:

- second-PC route evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- live `musu.pro` P2P owner-scoped relay lease evidence
- `musu@musu.pro` mailbox delivery evidence
- Microsoft Store / Partner Center evidence

The currently known P2P blocker is production storage configuration, not local
binary selection: GitHub has `MUSU_P2P_CONTROL_TOKEN_SHA256S`, but the live
environment still lacks `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`.

## Next Clean Evidence Step

After this tooling commit, run from a clean worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-external-release-gate-recheck.ps1 -Json
```

Expected result before external remediation:

- `release_ready=false`
- `local_artifacts_ready=true`
- `second_pc_reachable=false`
- `p2p_env_ok=false`
- `p2p_evidence_ok=false`
- no `go_no_go_git` blocker from the pre-evidence go/no-go phase

## Clean Evidence Result

Clean HEAD `d80e929e` recorded the expected No-Go snapshot:

- external evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-050915-HUGH_SECOND.external-gates.evidence.json`
- external summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-050915-HUGH_SECOND.external-gates.summary.md`
- external evidence SHA256:
  `d203259b78e013afbed225ac02ab467b3eacbd6d37c3b6a12a2183075a2c66a6`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-051044-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-051044-musu.pro.verification.json`

Key result:

- `release_ready=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU valid machines: `1`
- runtime CPU scenario matrix valid machines: `1`
- second-PC `192.168.1.192:8949` is unreachable from `192.168.1.154` on
  interface `이더넷 2`
- P2P evidence uses
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe` with
  `musu_exe_source=windowsapps_alias`
- P2P verification remains `ok=false`, `fail_count=4`, with
  `p2p_relay_lease_kv_not_configured`
- `go_no_go_git` is absent, proving the pre-evidence go/no-go phase ran from a
  clean worktree

Remaining blockers are unchanged: second-PC route/CPU/matrix evidence,
production KV/Upstash owner-scoped P2P lease evidence, `musu@musu.pro` mailbox
delivery evidence, and Microsoft Store / Partner Center evidence.

## Bounded Second-PC Probe Update

`record-external-release-gate-recheck.ps1` now accepts:

```powershell
-SecondPcProbeTimeoutMs 3000
```

The probe uses:

- UDP socket routing to infer `source_address` and `interface_alias`
- `System.Net.NetworkInformation.Ping.Send(..., timeout)` for bounded ICMP
- `TcpClient.ConnectAsync(...).Wait(timeout)` for bounded TCP connect

Dirty-tree smoke with `-SecondPcProbeTimeoutMs 500` recorded the expected
current failure in less than a second for the second-PC subprobe:

- `remote_address=192.168.1.192`
- `source_address=192.168.1.154`
- `interface_alias=이더넷 2`
- `ping_succeeded=false`
- `tcp_test_succeeded=false`
- `tcp_error=tcp_connect_timeout`

After this tooling commit, clean external gate evidence must be refreshed again
so the canonical `docs\evidence\external-gates` snapshot includes
`probe_method=bounded_ping_and_tcp`.

## Bounded Probe Clean Evidence Result

Clean HEAD `080bc6dc` recorded the bounded-probe snapshot:

- external evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-052447-HUGH_SECOND.external-gates.evidence.json`
- external evidence SHA256:
  `964635896f7c94976e21b402d0bd4550af0613a876701a54c55986766d6782bd`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-052547-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-052547-musu.pro.verification.json`

Second-PC reachability now records:

- `probe_method=bounded_ping_and_tcp`
- `probe_timeout_ms=3000`
- `remote_address=192.168.1.192`
- `source_address=192.168.1.154`
- `interface_alias=이더넷 2`
- `ping_succeeded=false`
- `ping_elapsed_ms=2887`
- `tcp_test_succeeded=false`
- `tcp_elapsed_ms=3016`
- `tcp_error=tcp_connect_timeout`

Release status is unchanged: `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU and runtime CPU matrix are each
`1/2`, and public release remains No-Go on second-PC route/CPU/matrix,
owner-scoped `musu.pro` P2P lease evidence, support mailbox evidence, and Store
evidence.
