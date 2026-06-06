# MUSU 1.15.0-rc.1 Go/No-Go Latest Output Gate

**Wiki ID**: wiki/873
**Generated**: 2026-06-06 20:34 KST
**Worktree state during validation**: dirty, expected for this script/docs change

## Summary

`write-release-go-no-go.ps1` now writes the current go/no-go result to
`.local-build\go-no-go\latest.json` by default and exposes
`go_no_go_output_path` in both JSON and text output.

This fixes a release-evidence reliability gap: before this change,
`.local-build\go-no-go\latest.json` could remain a stale local file while a
fresh go/no-go result was only printed to stdout. That made current release
state easier to misread during CPU, hardening, and P2P gate work.

## Product Impact

This is release-gate evidence hardening, not a runtime feature change.

It supports the current objective by making the CPU/idle-loop and hardening
gate output durable:

- current idle CPU machine count
- current runtime matrix machine count
- Rust background-loop audit state
- frontend polling audit state
- idle busy-loop candidate status
- current manifest dirty state
- blocker list

The output file remains local under `.local-build` and is not a release artifact
by itself. It is a current operator snapshot.

## Code Changes

`scripts\windows\write-release-go-no-go.ps1`:

- added `-OutputPath`
- defaults output to `.local-build\go-no-go\latest.json`
- resolves relative paths under the repo root
- writes the same JSON payload used for stdout
- writes through a temp file and moves it into place
- exposes `go_no_go_output_path`

`scripts\windows\test-release-evidence-verifiers.ps1`:

- added source-contract case `go-no-go writes current latest output evidence`
- verifies the default latest path, `-OutputPath`, JSON serialization reuse,
  file write, atomic move, and text output path marker

## Validation

Parser checks:

- `write-release-go-no-go.ps1`: pass
- `test-release-evidence-verifiers.ps1`: pass

Whitespace check:

- `git diff --check`: pass

Source-contract regression:

- `test-release-evidence-verifiers.ps1 -Json`
- `ok=true`
- `case_count=70`
- `failed_case_count=0`
- new case present:
  `go-no-go writes current latest output evidence`

Rust background-loop audit:

- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`
- `unaudited_spawn_hit_count=0`
- `network_watcher_primitive_hit_count=0`
- `telemetry_flush_primitive_hit_count=0`

Frontend polling audit:

- `ok=true`
- `fail_count=0`
- low-duty call-site count `29`
- direct interval hits `0`
- direct visibility listener hits `0`

Actual go/no-go latest write smoke:

- output path:
  `F:\workspace\musu-bee\.local-build\go-no-go\latest.json`
- file exists: true
- stdout `generated_at` equals file `generated_at`: true
- `ready_for_public_desktop_release=false`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=0`
- `rust_background_loop_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- idle busy-loop candidate count `8`
- `manifest_dirty=true` because the validation was run before committing this
  script/docs change

## Qualitative Audit

No high or medium code issue was found in this change.

Residual risk:

- a stale already-open shell can still have PATH ordering different from a fresh
  terminal, but go/no-go already surfaces that separately through the MSIX
  legacy conflict audit
- `.local-build\go-no-go\latest.json` is an operator snapshot, not canonical
  committed evidence
- public release is still No-Go on second-PC route/CPU/matrix proof, live
  MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof

## Release Interpretation

This closes a reporting reliability gap only. It does not reduce the release
requirements:

- two machines must still pass idle CPU
- a current full runtime matrix must include `post-route`
- local MUSU Desktop remains the executor
- MUSU.PRO remains remote input, rendezvous, path selection, relay fallback,
  and evidence/control plane
