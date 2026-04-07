# musu-port TODO

## 진행 원칙

- 이 TODO는 `MASTER_PLAN.md`를 구현 단위로 쪼갠 실행 backlog다.
- 각 phase 시작 전에는 `plans/NN_<slug>.md`를 먼저 확정한다.
- 구현이 끝난 항목은 체크하고, 차이는 별도 메모를 남긴다.

## 완료

- [x] 원본 포트 매니저 분석 메모 작성
- [x] 마스터 플랜 작성
- [x] 세부 플랜 문서 규칙 작성

## Phase 1. Workspace Bootstrap

- [x] workspace 루트 `Cargo.toml` 작성
- [x] `crates/musu-port-core` 생성
- [x] `apps/musu-portd` 생성
- [x] 공통 config/env 로딩 추가
- [x] 기본 상태/metrics 타입 추가
- [x] health endpoint skeleton 추가
- [x] `/routes` skeleton 추가
- [x] `cargo check` 통과

## Phase 2. Route Contract Freeze

- [x] `ServiceRoute` 타입 고정
- [x] seed supervisor route source 추가
- [x] `extra_routes` in-memory store 추가
- [x] route merge 로직 추가
- [x] base URL 실제 bind 포트 기준 계산
- [x] `MUSU_PORT_MANAGER_BASE_URL` 설정
- [x] `/routes` 출력 구조 원본과 맞추기

## Phase 3. HTTP/WS Alias Router

- [x] `/{service}` HTTP proxy 구현
- [x] `/{service}/{*rest}` HTTP proxy 구현
- [x] request header filtering 구현
- [x] response header filtering 구현
- [x] retry/backoff env 처리 구현
- [x] `/ws/{service}` websocket bridge 구현
- [x] `/ws/{service}/{*rest}` websocket bridge 구현
- [x] `/metrics` Prometheus export 구현
- [x] `/metrics/json` JSON export 구현

## Phase 4. L4 Runtime: TCP First

- [x] `L4Runtime` skeleton 추가
- [x] route -> desired spec 변환 추가
- [x] reconcile loop 추가
- [x] TCP passthrough runner 구현
- [x] runner stop/remove 처리 구현
- [x] runner status snapshot 노출
- [x] dead route quick probe 추가

## Phase 5. Linux Discovery

- [x] Linux TCP listener snapshot 수집
- [x] Linux UDP listener snapshot 수집
- [x] PID/process/user 파싱
- [x] current signature 계산
- [x] legacy signature 계산
- [x] exposure 분류 구현
- [x] owner 분류 구현
- [x] severity 분류 구현
- [x] false-positive 판정 구현
- [x] unmanaged endpoint 정렬/출력 구현

## Phase 6. Promote / Ignore / Persistence

- [x] SQLite settings schema 추가
- [x] promoted routes load/save 구현
- [x] ignored signatures load/save 구현
- [x] audit event load/save 구현
- [x] promote endpoint API 구현
- [x] ignore endpoint API 구현
- [x] unignore endpoint API 구현
- [x] stale cleanup persistence 반영 구현

## Phase 7. QUIC / Extended Policy Surface

- [x] QUIC passthrough runner 구현
- [x] QUIC probe 구현
- [x] audit policy 타입/저장 구현
- [x] connect mode 타입/저장 구현
- [x] connect stable probe 구현
- [x] metadata export 구현

## Phase 11. Coverage Parity Surface

- [x] coverage report 타입 고정
- [x] standalone coverage endpoint 구현
- [x] managed alias / external route / discovered unmanaged / ignored signature 집계 구현
- [x] l4 runner / quic probe / connect status / audit / metadata 통합 집계 구현
- [x] alert level / alert messages / all_known_endpoints_managed 계산 구현
- [x] parity 제외 항목 문서화

## Phase 9. Linux Toolchain Recovery And Live Smoke

- [x] Codex shell 기준 `HOME` / `PATH` / `CARGO_HOME` / `RUSTUP_HOME` mismatch 원인 확정
- [x] Linux native `cargo` / `rustc` 활성화 경로 확정
- [x] 필요 시 env bootstrap wrapper 또는 문서화된 실행 명령 추가
- [x] Linux native `cargo check` 통과
- [x] Linux native `cargo test -p musu-port-core` 통과
- [x] Linux native `cargo run -p musu-portd` 기동 확인
- [x] `/health` live smoke 확인
- [x] `/routes` live smoke 확인
- [x] `/discovery` live smoke 확인
- [x] TCP promote + `/l4/runners` live smoke 확인
- [x] restart 후 persistence restore smoke 확인

## Phase 8. Parity Verification

- [x] fixture 기반 route parity 테스트 작성
- [x] HTTP proxy smoke test 작성
- [x] TCP forward smoke test 작성
- [x] discovery smoke test 작성
- [x] persistence recovery smoke test 작성
- [x] 원본 대비 차이 문서 작성

## Phase 10. Windows WSL Bilingual Adapter Planning

- [x] shared core / translator / native adapter 분류 문서 작성
- [x] Windows/WSL adapter matrix 작성
- [x] discovery provider 분리 대상 정의
- [x] runtime context / path bridge / executable resolver backlog 정의
- [x] Windows/WSL 테스트 매트릭스 정의

## Phase 12. Runtime Context Path Bridge Productization

- [x] `platform/context.rs` 추가
- [x] `platform/path_bridge.rs` 추가
- [x] `platform/runtime_resolver.rs` 추가
- [x] env path normalization을 config에 연결
- [x] metadata export path display normalization 연결
- [x] `/health` runtime context surface 추가
- [x] Windows/WSL translator unit test 추가
- [x] `cargo test -p musu-port-core` 재통과
- [x] `cargo check` 재통과

## Phase 13. Discovery Provider Split

- [x] `discovery.rs` common facade 재구성
- [x] `discovery/linux.rs` 분리
- [x] `discovery/windows.rs` 추가
- [x] `MUSU_PORT_DISCOVERY_PROVIDER=auto|linux|windows|both` 추가
- [x] `/health`에 selected discovery provider 노출
- [x] Windows netstat/tasklist parser test 추가
- [x] `cargo test -p musu-port-core` 재통과
- [x] `cargo check` 재통과

## Phase 14. Windows Process Metadata Provider

- [x] `tasklist.exe /V /FO CSV` metadata parser 추가
- [x] `process_user` surface 연결
- [x] Windows CSV parser test 추가
- [x] `cargo test -p musu-port-core` 재통과
- [x] `cargo check` 재통과

## Phase 15. Dual Path Surface And Data Root

- [x] `MUSU_PORT_DATA_ROOT` contract 추가
- [x] default metadata/connect report dir를 `data_root` 기준으로 전환
- [x] `/coverage.metadata_dual_path_status` 실제 object surface 추가
- [x] `cargo test -p musu-port-core` 재통과
- [x] `cargo check` 재통과

## Phase 16. Launcher Bootstrap Contract

- [x] executable layout 자동 탐지 추가
- [x] env override 기반 install layout contract 추가
- [x] `/health`에 preferred executable / candidates / interop launcher surface 추가
- [x] `cargo test -p musu-port-core` 재통과
- [x] `cargo check` 재통과

## Phase 17. Windows WSL Validation Matrix

- [x] Windows/WSL smoke checklist 문서 작성
- [x] WSL ext4 smoke 실행 및 결과 기록
- [x] `/mnt/c` vs ext4 path parity smoke 실행
- [x] discovery provider manual smoke 기록
- [x] Windows native shell live smoke 실행

## Phase 18. AI Native Service Classification

- [x] `mcp_server` / `agent_facing` service class contract 고정
- [x] MCP-like endpoint 식별 힌트 정의
- [x] health/coverage/metadata에 classification 반영 위치 확정
- [x] backward compatibility 영향 정리

## Phase 19. Device Profile Contract And Translator Binding

- [x] `device_id` baseline 추가
- [x] `device_profile_path` baseline 추가
- [x] device profile JSON shape 문서화
- [x] translator가 읽을 launch/health/path/report 필드 계약 정의
- [x] AI agent/system prompt용 guidance field 정의

## Phase 20. MCP Service Discovery And Promotion

- [x] `/mcp/health` probe heuristic 정의
- [x] MCP-like endpoint alias 추천 규칙 정의
- [x] metadata/report에 MCP service tag 정의
- [x] optional auto-promote 정책 설계/구현

## Phase 21. Connect Ingress Parity Surface

- [x] original desktop connect policy flow 재분석
- [x] `/audit/connect-denied` endpoint 추가
- [x] connect denied audit buffer/persistence 연계
- [x] 필요 시 `/connect/{service}` minimal tunnel surface 구현
- [x] parity report 갱신

## Phase 22. Manual Validation Execution

- [x] WSL ext4 smoke 실행
- [x] Windows native shell smoke 실행
- [x] `/mnt/c` path parity smoke 실행
- [x] discovery provider `linux` manual smoke 기록
- [x] discovery provider `windows` manual smoke 기록
- [x] discovery provider `both` manual smoke 기록
- [x] real MCP server smoke 기록

## Phase 24. Validation Automation And Windows Bridge Handoff

- [x] `scripts/real-mcp-smoke.sh` 추가
- [x] `scripts/windows-native-smoke.ps1` 추가
- [x] real MCP smoke를 스크립트 + 문서 양쪽에 고정
- [x] Windows native shell harness를 실제 Windows product shell에서 실행

## Phase 23. Deferred Policy Decisions

- [x] deeper MCP probe(`initialize`, `tools/list`) 정책 결정
- [x] device profile validation failure policy 결정
- [x] device profile template priority/match rule 고도화
- [x] `/connect/{service}` actual tunnel scope 결정

## Phase 25. MCP Auto Promote Baseline Recovery

- [x] failing parity test root cause 확정
- [x] auto-promote policy decision 고정
- [x] `state.rs` / parity fixture / 문서 정렬
- [x] `./scripts/linux-rust-env.sh cargo check` 재통과
- [x] `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 재통과

## 현재 검증 메모

- `wsl-windows-exec` wrapper로 Windows `cargo`를 사용해 `cargo check` 통과
- `http://127.0.0.1:24680/health` 검증 완료
- `http://127.0.0.1:24680/routes` 검증 완료
- `/discovery`는 코드 반영 후 새 실행 파일 락/재기동 이슈 때문에 smoke 검증이 남아 있음
- `L4Runtime`, `/promote`, `/ignore`, `/unignore`, `/l4/runners` 코드는 추가됐고 `cargo check` 기준 통과
- `cargo test -p musu-port-core tcp_proxy_spike_forwards_payload -- --nocapture` 통과
- SQLite settings + promoted/ignored/audit persistence 코드 추가, startup restore 연결 완료
- `cargo test -p musu-port-core storage::tests -- --nocapture` 통과
- `./scripts/linux-rust-env.sh cargo check` 통과
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
- `http://127.0.0.1:24682/health`, `/routes`, `/discovery` live smoke 확인
- seeded HTTP alias proxy 확인
- TCP promote + `/l4/runners` + echo payload forward 확인
- restart 후 promoted route / audit / L4 runner restore 확인
- `GET /audit/policy`, `POST /audit/policy`, `POST /audit/policy/preset` 구현
- `GET /connect/mode`, `POST /connect/mode`, `GET /connect/status` 구현
- `GET /metadata/report`, `POST /metadata/export`, `GET /metadata/export/history` 구현
- control-plane surface 포함 상태에서 `cargo check` 통과
- `cargo test -p musu-port-core` 5 tests 통과
- 새 control-plane endpoint smoke 확인
- translator/productization 1차 slice + discovery provider split까지 포함해 `cargo test -p musu-port-core` 32 tests 통과
- Windows provider live smoke는 Codex snap shell vsock 제한 때문에 미완료
- 최근 `device_id` / `device_profile_path` baseline 추가 후 `cargo check` 재통과
- 최근 `device_id` / `device_profile_path` baseline 추가 후 `cargo test -p musu-port-core` 재통과
- AI-native/device-profile/connect ingress 확장 후 `cargo fmt --all` 통과
- AI-native/device-profile/connect ingress 확장 후 `cargo test -p musu-port-core` 재통과
- WSL ext4 live smoke에서 `/health`, `/routes`, `/discovery`, `/connect/{service}`, `/audit/connect-denied`, `/metadata/export` 확인
- connect policy에 original desktop의 `high severity coverage gaps` blocker 반영
- MCP auto-promote baseline 구현 및 parity integration test 추가
- device profile validation summary(`/health`) 추가
- deeper MCP probe(`health -> initialize -> tools/list`) 구현
- `device_profile.validation.on_error=warn|fail` 추가 및 strict startup failure test 추가
- device profile template scoring(`match_process_names`, `match_protocols`, `match_ports`, `priority`) 추가
- `/connect/{service}` 응답에 `delivery_contract=connect_url_handoff`, `bridge_owner=musu-port`, `remote_bridge_supported=false` 추가
- `/mnt/c` path parity smoke에서 `roundtrip_ready=true`, Windows path display, metadata export/history 확인
- discovery provider manual smoke:
  - `linux`: `discovery_count=27`
  - `windows`: `discovery_count=0`
  - `both`: `discovery_count=26`
- `./scripts/real-mcp-smoke.sh`로 실제 `MUSU-AS-MCP/server.py` 기준 health / initialize / tools/list / discovery / promote / connect preview smoke 확인
- 현재 test baseline: `45` unit tests + `6` parity integration tests
- 현재 standalone parity 이후 남은 큰 작업은 Windows native shell smoke뿐이고, cross-device tunnel은 `musu-connects` 범주
- 2026-04-02 재검증:
  - `./scripts/linux-rust-env.sh cargo check` 통과
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
  - `mcp_candidates_can_auto_promote_from_device_profile_policy` 회귀 복구
  - auto-promote policy:
    - `service_templates`가 있으면 matching template가 있는 endpoint만 auto-promote
  - 다음 실행 phase는 `musu-computer-tools/MASTER_PLAN.md` 기준 helper lifecycle productization
