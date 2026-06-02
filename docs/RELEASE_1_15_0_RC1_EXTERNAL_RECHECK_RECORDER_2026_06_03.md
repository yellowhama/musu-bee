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
- `p2p_env`
- `p2p_evidence_result`
- `go_no_go_blockers`
- `blockers`

## Tooling Changes

- `record-external-release-gate-recheck.ps1` runs child release scripts through
  timeout-bounded `powershell.exe` child processes and captures stdout, stderr,
  exit code, timeout state, elapsed time, parsed JSON, and raw output.
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
