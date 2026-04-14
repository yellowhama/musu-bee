# musu-port Operator Ingress Acceptance Packet (Wave B)

## Goal

Freeze a canonical operator-machine acceptance packet for `musu-port` ingress/control surface so Wave C (`musu-connects` wire closure) can consume it directly.

## Scope

- In scope:
  - Linux/WSL runtime proof replay for `musu-port` core behavior.
  - Real MCP ingress discovery/promote/connect preview proof.
  - Windows-native replay contract and owner-bound escalation path.
- Out of scope:
  - `musu-connects` wire transport implementation.
  - CRT live attach integration.

## Canonical Replay Commands

0. Wrapper packet generation:
   - `cd /home/hugh51/musu-functions/musu-port && ./scripts/operator-ingress-acceptance.sh`
1. Linux core parity and regression set:
   - `cd /home/hugh51/musu-functions/musu-port && ./scripts/linux-rust-env.sh cargo test -p musu-port-core`
2. Linux operator ingress proof against real MCP:
   - `cd /home/hugh51/musu-functions/musu-port && MUSU_REAL_MCP_SMOKE_WORK_DIR=/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke MUSU_REAL_MCP_SMOKE_PRESERVE_WORK_DIR=1 MUSU_REAL_MCP_SMOKE_SUMMARY_PATH=/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke-summary.json ./scripts/real-mcp-smoke.sh`
3. Windows-native operator shell proof (must run on Windows host shell):
   - `cd /home/hugh51/musu-functions/musu-port && ./scripts/windows-native-smoke.ps1`

## Artifact Manifest

- Canonical manifest JSON:
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/manifest.json`
- Current run artifacts:
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/cargo-test-musu-port-core.log`
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke.log`
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke-with-summary.log`
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke-summary.json`
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/run-windows-smoke.log`
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/windows-native-smoke-result.json`
  - `/home/hugh51/musu-functions/work/mus147-operator-ingress/windows-runtime-capability.txt`

## Current Verdict (2026-04-03)

- Linux/WSL-hosted replay: proven.
  - `cargo test -p musu-port-core`: `45` unit + `6` parity integration tests passed.
  - `real-mcp-smoke`: passed with discovery/promote/connect preview/audit evidence.
  - wrapper rerun determinism: `scripts/operator-ingress-acceptance.sh` now resets preserved smoke state before execution so alias/target evidence is stable across reruns.
- Windows-native replay: proven.
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-windows-smoke.ps1` passed from WSL launch path.
  - Result artifact: `/home/hugh51/musu-functions/work/mus147-operator-ingress/windows-native-smoke-result.json`
  - Build+smoke log: `/home/hugh51/musu-functions/work/mus147-operator-ingress/run-windows-smoke.log`
- Status: `DONE` for Wave B acceptance packet.

## L4 Parity Fix (2026-04-14)

- `standalone_runtime_matches_parity_baseline`: PASS (2026-04-14)
- Fix: `state.rs` L974-979 — promote 후 즉시 `reconcile_routes()` 호출
- 결과: 6/6 parity tests pass (WSL runtime)
- 기존 45 unit tests 영향 없음 (전체 통과)

## Handoff

- Next packet: `musu-connects` wire-level transport closure (Wave C), consuming this acceptance bundle as upstream ingress truth.
