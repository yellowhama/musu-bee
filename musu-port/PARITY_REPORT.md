# musu-port Parity Report

## 기준

- 원본: `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`
- 원본: `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager_l4.rs`
- 원본: `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`
- 재현판: `/home/hugh51/musu-functions/musu-port`

## 자동 검증 기준

- integration test: [parity_verification.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/tests/parity_verification.rs)
- core/unit coverage:
  - [state.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/state.rs)
  - [control.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/control.rs)
  - [l4.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/l4.rs)
  - [storage.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/storage.rs)

## 현재 맞춘 범위

- `ServiceRoute` 기반 route merge
- 실제 bind 포트 기반 `router_base_url`
- HTTP alias proxy
- Linux/Windows discovery provider baseline
- TCP promote + dedicated L4 runner
- QUIC promote + UDP passthrough
- SQLite 기반 promoted/ignored/audit/connect/metadata/connect-probe persistence
- restart 후 promoted route / ignored signature / audit event restore
- unified `/coverage` payload
- runtime context / path bridge / executable contract surface
- `device_id` / `device_profile_path` / guidance-capable device profile contract
- MCP/AI-native service classification baseline
- MCP deep probe (`health -> initialize -> tools/list`)
- device profile validation policy (`warn|fail`)
- template priority/match scoring
- `/audit/connect-denied` + `/connect/{service}` decision + handoff contract surface

## 자동 검증된 시나리오

- seed route가 `/routes`에 노출되고 HTTP alias proxy가 backend path/query를 그대로 전달한다
- discovery가 test-created TCP/UDP listener를 surface 한다
- TCP discovered endpoint를 `/promote`로 승격하면 `/l4/runners`가 올라오고 payload forwarding이 된다
- UDP discovered endpoint를 `/ignore` 하면 `/discovery`와 `/coverage`에 ignored 상태가 반영된다
- `/coverage`가 `managed_aliases`, `uncovered_endpoints`, `quic_probe_summary`, `connect_status`, `audit_events`, `metadata_report`를 한 payload로 반환한다
- `GET /connect/{service}`가 disabled/preview mode에 따라 decision JSON과 denied audit를 남긴다
- `GET /connect/{service}`가 `delivery_contract=connect_url_handoff` / `bridge_owner=musu-port`를 반환한다
- `GET /audit/connect-denied?drain=true`가 denied audit buffer를 반환하고 비운다
- profile-defined MCP health path가 있으면 `/discovery`가 hardcoded path 대신 device profile을 따라 MCP endpoint를 분류한다
- health path가 없어도 JSON-RPC `initialize` 응답이면 `/discovery`가 `mcp_server`로 분류한다
- invalid profile + `validation.on_error=fail`이면 startup이 거부된다
- 서버 재시작 후 promoted route / L4 runner / ignored signature / audit event가 복원된다

## 의도적으로 남긴 차이

- Tauri command layer/UI polling hook: 미구현
- `/connect/{service}` actual byte tunnel/remote peer bridge: 미구현
- real MCP server smoke: 완료 (`scripts/real-mcp-smoke.sh`)

## Wave B operator ingress acceptance (2026-04-03)

- canonical packet: [OPERATOR_INGRESS_ACCEPTANCE.md](/home/hugh51/musu-functions/musu-port/OPERATOR_INGRESS_ACCEPTANCE.md)
- evidence bundle: `/home/hugh51/musu-functions/work/mus147-operator-ingress`
- re-verified commands:
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
  - `MUSU_REAL_MCP_SMOKE_SUMMARY_PATH=/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke-summary.json ./scripts/real-mcp-smoke.sh`
- Windows native proof:
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-windows-smoke.ps1` 실행으로 fresh Windows `.exe` build + `windows-native-smoke` 통과
  - evidence: `/home/hugh51/musu-functions/work/mus147-operator-ingress/run-windows-smoke.log`
  - result: `/home/hugh51/musu-functions/work/mus147-operator-ingress/windows-native-smoke-result.json`

## 판단

- standalone `musu-port`의 핵심 control-plane parity는 확보됨
- 남은 차이는 remote/connect bridge 계층에 집중돼 있다
- 다음 작업은 `musu-connects` network-plane 통합이다
