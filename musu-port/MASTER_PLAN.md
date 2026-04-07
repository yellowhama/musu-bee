# musu-port Master Plan

## 목표

`musu-port`는 원본 `musu-desktop`의 포트 매니저를 이 폴더 안에서 독립 실행형으로 재현하는 프로젝트다.

상위 제품 제약:

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/MASTER_PLAN.md`

핵심 목표:

- 원본 `musu-desktop` 코드는 수정하지 않는다.
- 포트 매니저를 Tauri 앱 밖에서 따로 실행 가능하게 만든다.
- 포트 번호 직접 접근 대신 `alias + managed ingress` 기준으로 서비스 접근 표면을 재현한다.
- unmanaged endpoint를 promote/ignore/persistence로 동적으로 운영 관리하는 구조를 재현한다.
- 원본의 핵심 동작을 유지한다.
  - alias 기반 HTTP/WS 라우팅
  - promoted TCP/QUIC 포워딩
  - unmanaged listener discovery
  - SQLite 기반 promote/ignore/audit persistence
- 구현은 한 번에 크게 하지 않고, 마스터 플랜 아래 단계별 세부 플랜 문서를 만들며 진행한다.

## 현재 상태

2026-04-01 기준 진행 상태:

- Phase 1 완료
  - standalone Rust workspace 생성
  - `musu-port-core` / `musu-portd` 생성
  - `cargo check` 통과
- Phase 2 완료
  - `ServiceRoute` 모델 고정
  - seed route source + `extra_routes` merge 구현
  - 실제 bind 포트 기준 `MUSU_PORT_MANAGER_BASE_URL` 설정 구현
- Phase 3 베이스라인 구현 완료
  - `/health`, `/routes`, `/metrics`, `/metrics/json`
  - HTTP alias proxy skeleton
  - WS bridge skeleton
- Phase 5 코드 구현 완료
  - Linux `ss` 기반 listener discovery
  - signature / exposure / owner / severity 분류
  - `/discovery` endpoint 코드 추가
- Phase 4 코드 구현 완료
  - TCP 전용 `L4Runtime`
  - reconcile loop
  - `TCP passthrough` runner
  - `/l4/runners` endpoint
- Phase 6 일부 구현 완료
  - SQLite settings schema
  - promoted/ignored/audit persistence
  - startup restore
  - `/promote`, `/ignore`, `/unignore`, `/audit/events`
- Phase 9 완료
  - `scripts/linux-rust-env.sh`로 Linux native Rust env 복구
  - `.cargo/config.toml` + hostfs gcc/g++ wrapper로 snap 환경 링크 경로 고정
  - Linux native `cargo check` 통과
  - Linux native `cargo test -p musu-port-core` 통과
  - `/health`, `/routes`, `/discovery`, HTTP alias, TCP promote, restart restore live smoke 완료
- Phase 7 core 구현 완료
  - audit policy get/set/preset
  - connect mode get/set/status
  - metadata report/export/history
  - QUIC passthrough / probe summary
  - connect stable probe/history
- Phase 11 구현 완료
  - unified coverage parity surface 구현
  - `/coverage` endpoint 추가
  - `metadata_dual_path_status` 실제 dual-path object로 전환
- Phase 8 구현 완료
  - integration parity test 추가
  - `PARITY_REPORT.md` 작성
  - standalone parity baseline 고정
- Phase 12 구현 완료
  - runtime context / path bridge / executable resolver baseline
  - env path normalization과 runtime display normalization 연결
- Phase 13 구현 완료
  - Linux / Windows discovery provider split
  - `MUSU_PORT_DISCOVERY_PROVIDER=auto|linux|windows|both`
- Phase 14 구현 완료
  - Windows `tasklist.exe /V /FO CSV` 메타데이터 파싱
  - `process_user` surface 추가
- Phase 15 구현 완료
  - `MUSU_PORT_DATA_ROOT` contract 추가
  - metadata/connect report dir를 `data_root` 기준으로 통일
- Phase 16 구현 완료
  - executable contract / preferred executable / interop launcher surface 추가
- Device profile baseline 구현 완료
  - `device_id` canonicalization
  - `device_profile_path` contract
  - `/health`에 device profile surface 추가
  - translator guidance / service template / custom MCP health path contract
- Phase 18 완료
  - `service_class` / `agent_facing` contract
  - classification counts on metadata/coverage surface
  - backward-compatible route/discovery serialization 유지
- Phase 19 완료
  - `DEVICE_PROFILE_CONTRACT.md` 작성
  - reference device profile JSON fixture 추가
  - translator가 읽는 launch/health/transport/path/report/guidance contract 고정
- Phase 20 baseline 구현 완료
  - profile-aware `/mcp/health` probe
  - device-id 기반 MCP alias 추천
  - MCP discovery integration test 추가
- Phase 21 baseline 구현 완료
  - `/audit/connect-denied` endpoint
  - denied audit drain/persistence 연계
  - `/connect/{service}` minimal decision surface
- Phase 23 구현 완료
  - MCP deep probe(`health -> initialize -> tools/list`)
  - device profile validation policy(`warn|fail`)
  - template priority/match scoring
  - `/connect/{service}` handoff contract 고정
- Manual validation 추가 진행
  - `/mnt/c` path parity smoke 완료
  - discovery provider `linux` / `windows` smoke 완료
  - discovery provider `both` smoke 완료
  - real MCP smoke 완료
- Phase 24 구현 완료
  - `scripts/real-mcp-smoke.sh` 추가
  - `scripts/windows-native-smoke.ps1` 추가
  - Windows product-shell smoke 실행 완료
  - `musu-computer-tools` bridge wrapper / generic action runner 연동 완료
- Wave B operator ingress closure packet (2026-04-03)
  - operator acceptance packet 문서 추가: `OPERATOR_INGRESS_ACCEPTANCE.md`
  - canonical evidence bundle 고정: `/home/hugh51/musu-functions/work/mus147-operator-ingress`
  - Linux replay 재검증:
    - `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
    - `MUSU_REAL_MCP_SMOKE_SUMMARY_PATH=... ./scripts/real-mcp-smoke.sh`
  - Windows replay 재검증:
    - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-windows-smoke.ps1` 통과 (fresh Windows build + smoke)
    - evidence: `/home/hugh51/musu-functions/work/mus147-operator-ingress/run-windows-smoke.log`
    - result: `/home/hugh51/musu-functions/work/mus147-operator-ingress/windows-native-smoke-result.json`

검증 메모:

- `./scripts/linux-rust-env.sh cargo check` 통과
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
- `http://127.0.0.1:24682/health` 응답 확인 완료
- `http://127.0.0.1:24682/routes` 응답 확인 완료
- `http://127.0.0.1:24682/discovery` live smoke 확인 완료
- `http://127.0.0.1:24682/demo-api/fixtures/sample_seed_services.json` HTTP alias proxy 확인 완료
- `POST /promote`로 `tcp|python3|127.0.0.1|19092` promote 후 `tcp://127.0.0.1:37113` forward 확인
- 재시작 후 promoted route, L4 runner, audit event restore 확인
- 초기 Windows `cargo` 우회 검증도 유지되지만, 이제 핵심 smoke는 Linux native 경로로 재현 가능
- `http://127.0.0.1:24683/audit/policy` 응답 확인 완료
- `http://127.0.0.1:24683/connect/status` 응답 확인 완료
- `http://127.0.0.1:24683/metadata/report` 응답 확인 완료
- `POST /connect/mode` preview 전환 확인
- `POST /metadata/export` 및 `GET /metadata/export/history` 확인
- `GET /quic/probe/summary` 응답 확인 완료
- `POST /connect/stable-probe` 및 `GET /connect/stable-probe/history` 확인
- `POST /promote`로 `udp|python3|127.0.0.1|19097` promote 후 `quic://127.0.0.1:37371` UDP forward 확인
- `GET /coverage` 응답 확인 완료
- `/coverage` payload에 `managed_aliases`, `uncovered_endpoints`, `quic_probe_summary`, `metadata_dual_path_status` object 확인
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core --test parity_verification -- --nocapture` 통과
- `PARITY_REPORT.md` 작성 완료
- 최근 코드 상태 재검증:
  - `./scripts/linux-rust-env.sh cargo check` 통과
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 통과
  - `45` unit tests + `6` parity integration tests 통과
  - `mcp_candidates_can_auto_promote_from_device_profile_policy` 회귀 복구
- `./scripts/real-mcp-smoke.sh` 통과
  - 실제 `MUSU-AS-MCP/server.py` 기준 health / initialize / tools/list 확인
  - `musu-port` `discovery / promote / connect preview / audit` 확인
- Wave B evidence refresh (MUS-147):
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 재통과 (`45` unit + `6` parity integration)
  - `MUSU_REAL_MCP_SMOKE_SUMMARY_PATH=/home/hugh51/musu-functions/work/mus147-operator-ingress/real-mcp-smoke-summary.json ./scripts/real-mcp-smoke.sh` 재통과
  - `./scripts/operator-ingress-acceptance.sh` 재통과 (deterministic rerun fix 포함)
  - `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/run-windows-smoke.ps1` 재통과

현재 환경 블로커:

- Codex snap shell 기본 env만으로는 Linux toolchain이 안 보인다
- `musu-port` 안에서는 `scripts/linux-rust-env.sh`와 hostfs gcc wrapper로 이 문제를 우회했다
- auto-promote policy는 아래로 고정됐다
  - `service_templates`가 비어 있지 않으면 matching template가 있는 endpoint만 auto-promote
- Windows native shell smoke는 실제 Windows product shell에서 direct/helper/launcher 경로까지 검증 완료
- `plans/25_mcp_auto_promote_baseline_recovery.md`는 종료됐다
- 다음 후속 작업은 helper lifecycle productization, generic bridge를 다른 Windows action으로 넓히는 일, `musu-connects` 통합 범주다

## 비목표

초기 범위에서 제외:

- 원본 `PortManagerView.tsx` UI 복제
- 원본 `musu-desktop` 전체 feature tree 이식
- Lighthouse 자동 등록 완전 복제
- Forgejo, Prime, MCP Broker 같은 주변 기능 이식
- macOS/Windows discovery까지 초반에 같이 구현

초기 목표는 "원본 포트 매니저의 핵심 런타임을 Linux에서 독립적으로 재현"하는 것이다.

단, 이 재현은 최종 제품 관점에서 Windows 메인 + WSL2 타겟을 위한 바이링구얼 런타임 위에 올라가야 한다.

즉:

- 지금 단계는 Linux parity를 먼저 맞추는 것
- 이후 단계는 Windows/WSL adapter와 통역사 계층까지 포함해 제품화하는 것

## 제품 목적 정리

이 프로젝트가 재현하려는 포트 매니저의 제품 목적은 아래와 같다.

1. 포트 번호를 서비스 identity로 직접 쓰지 않고, `ServiceRoute(alias, protocol, entrypoint_url, target_url)`로 추상화한다.
2. 로컬 서비스 landscape에서 unmanaged endpoint를 찾고, promote/ignore로 관리 대상에 편입한다.
3. runner, audit, connect mode, metadata 같은 운영 상태를 포트 단위가 아니라 managed ingress 단위로 제어한다.

즉, 재현 목표는 "포트 목록"이 아니라 "로컬 ingress/control-plane"이다.

여기서 `port`는 네트워크 숫자 포트라기보다, 기기와 서비스, 더 작게는 AI agent나 MCP 같은 연결들이 드나드는 "항구"와 "길목"으로 보는 편이 맞다.

따라서 `musu-port`의 목표는 숫자 포트 자체를 다루는 것이 아니라, 그 앞단의 managed ingress 표면을 재현하는 것이다.

## `musu-connects`와의 관계

현재 마스터 플랜의 범위는 standalone `musu-port`까지다.

역할 분리는 아래처럼 고정한다.

- `musu-port`: 로컬 ingress/control-plane
- `musu-connects`: peer 간 secure transport/network plane
- supervisor/warden: process lifecycle / sandbox / orchestration

따라서 `musu-port`에 `musu-connects`가 붙으면 cross-device managed ingress가 가능해지지만, 그 자체가 현재 재현 범위는 아니다.

관련 메모:

- `../musu-connects/MUSU_PORT_INTEGRATION.md`
- `MUSU_AS_MCP_RELATION.md`

## 원본 기준선

분석 기준 원본:

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop`

직접 참조해야 할 소스:

- `src-tauri/src/main.rs`
- `src-tauri/src/state.rs`
- `src-tauri/src/port_manager.rs`
- `src-tauri/src/port_manager_l4.rs`
- `src-tauri/src/commands/port_manager.rs`
- `src/hooks/usePortManager.ts`
- `src/lib/tauri.ts`
- `/mnt/f/Aisaak/Projects/Musu-new/crates/musu-supervisor/src/supervisor.rs`

이 프로젝트에서는 원본 코드를 "복사 대상"이 아니라 "행동 명세"로 본다.

## 핵심 재현 원칙

아래 성질은 초반부터 지킨다.

1. 라우터 base URL은 실제 bind된 포트로 계산한다.
2. route 집합은 `supervisor routes + promoted extra routes` merge로 구성한다.
3. HTTP/WS와 TCP/QUIC promote 경로를 분리한다.
4. discovery는 managed port를 제외한 뒤 계산한다.
5. ignore signature는 current/legacy 두 형식을 모두 처리한다.
6. persistence key 이름은 원본과 맞춘다.
7. 2초 reconcile loop와 별도 L4 runtime 개념을 유지한다.

이 7개를 놓치면 원본과 비슷해 보여도 구조가 다른 프로그램이 된다.

## 구현 전략

### 전략 결정

초기 구현은 원본 crate에 직접 붙지 않고, `musu-port` 내부의 독립 코드로 진행한다.

이렇게 가는 이유:

- 원본 repo 변경 없이 반복 실험하기 쉽다.
- `musu-desktop` path dependency에 묶이면 실험이 원본 런타임 상태에 끌려간다.
- 먼저 로컬 reproduction 환경을 만들고, 나중에 parity 비교가 더 쉬워진다.

### 허용하는 참조 방식

- 원본 소스는 읽는다.
- 원본 설계와 동일한 타입/함수 흐름은 재현한다.
- 필요하면 최소 타입(`ServiceRoute` 등)은 이 프로젝트 안에 다시 정의한다.
- 초기 단계에서는 `musu-supervisor` 전체를 직접 dependency로 끌어오지 않는다.

## 목표 산출물

최종적으로 이 폴더 안에 아래를 갖는 것을 목표로 한다.

- standalone Rust workspace
- `musu-portd` 또는 동등한 실행 바이너리
- 최소 config/seed route 입력 방식
- 로컬 SQLite persistence
- HTTP alias router
- TCP promote/L4 runtime
- Linux listener discovery
- parity verification 문서와 테스트
- Windows/WSL bilingual translator baseline
- device-aware runtime profile contract
- AI-native service classification surface
- device profile contract reference and fixture

## 권장 디렉터리 구조

초기 권장 구조:

- `Cargo.toml`
- `crates/musu-port-core`
- `apps/musu-portd`
- `plans/`
- `fixtures/`
- `tests/`

세부 구현 중 필요하면 조정 가능하지만, 처음부터 Tauri 구조를 그대로 복제하지는 않는다.

## 단계별 마스터 플랜

### Phase 0. Planning Baseline

목표:

- 원본 구조 분석 문서와 마스터 플랜을 고정
- 세부 플랜 문서 규칙 확정

산출물:

- `README.md`
- `MASTER_PLAN.md`
- `plans/README.md`

완료 기준:

- 원본 소스 기준 파일 목록 확정
- 이후 단계별 문서를 어디에 어떻게 쌓을지 합의됨

### Phase 12. Runtime Context Path Bridge Productization

목표:

- Windows/WSL bilingual translator 첫 슬라이스를 실제 코드로 연결한다

완료 기준:

- runtime context / path bridge / executable resolver가 코드에 존재한다
- `cargo check`, `cargo test -p musu-port-core`가 다시 통과한다

### Phase 13. Discovery Provider Split

목표:

- Linux/WSL와 Windows discovery provider를 공통 facade 뒤로 분리한다

완료 기준:

- provider override가 가능하다
- Windows parser tests가 존재한다

### Phase 14. Windows Process Metadata Provider

목표:

- Windows discovery provider가 `process name + process user`까지 반환한다

완료 기준:

- `tasklist` 기반 metadata cache가 동작한다
- parser tests가 존재한다

### Phase 15. Dual Path Surface And Data Root

목표:

- 데이터/리포트 위치를 `data_root` 기준으로 통일하고 dual-path status를 surface에 노출한다

완료 기준:

- `data_root` contract가 code/config에 존재한다
- `/coverage.metadata_dual_path_status`가 object로 채워진다

### Phase 16. Launcher Bootstrap Contract

목표:

- `.exe` / ELF / AppImage 선택 규칙과 health surface를 고정한다

완료 기준:

- `/health`에서 preferred executable contract를 확인할 수 있다

### Phase 17. Windows WSL Validation Matrix

목표:

- baseline productization slice를 실제 Windows/WSL 환경에서 검증할 수 있는 smoke matrix를 고정한다

완료 기준:

- validation runbook이 존재한다
- live smoke는 별도 실행 단계로 넘길 수 있다
  - 현재 상태: WSL ext4, `/mnt/c`, discovery provider matrix 완료
  - 남은 항목: Windows native shell smoke

### Phase 18. AI Native Service Classification

목표:

- `musu-port`가 MCP/agent-facing endpoint를 일반 HTTP 서비스와 별도 class로 다룰 수 있게 한다

완료 기준:

- classification contract가 문서와 code surface 양쪽에 반영될 준비가 된다
  - 현재 상태: 완료

### Phase 19. Device Profile Contract And Translator Binding

목표:

- 사용자/기기 하드코딩 없이 `device_id + device profile + translator` 계약을 고정한다

완료 기준:

- per-device runtime/launch/health/path contract가 문서로 설명 가능하다
  - 현재 상태: 완료

### Phase 20. MCP Service Discovery And Promotion

목표:

- `MUSU-AS-MCP` 같은 MCP endpoint를 발견, 분류, promote 대상으로 다루는 기준을 고정한다

완료 기준:

- MCP-like probe heuristic과 alias rule이 문서화된다
  - 현재 상태: baseline 완료, real MCP smoke까지 완료

### Phase 21. Connect Ingress Parity Surface

목표:

- 아직 남아 있는 CONNECT ingress parity 차이를 정리하고 standalone 범위의 구현 계획을 고정한다

완료 기준:

- `/audit/connect-denied`, `/connect/{service}` 등 남은 parity gap이 phase 단위로 관리된다
  - 현재 상태: baseline 완료

### Phase 24. Validation Automation And Windows Bridge Handoff

목표:

- 남은 product-shell 검증을 재실행 가능한 script/runbook으로 고정한다

완료 기준:

- real MCP smoke는 script와 문서 양쪽에 남아 있다
- Windows native shell smoke는 PowerShell harness와 체크리스트를 가진다
  - 현재 상태: actual Windows shell 검증까지 완료
- `musu-computer-tools` Windows bridge가 generic action runner까지 확장돼 있다

### Phase 1. Workspace Bootstrap

목표:

- `musu-port` standalone workspace를 만든다
- 최소 빌드/실행 가능 바이너리를 만든다

핵심 작업:

- Rust workspace scaffold
- `musu-port-core` crate 생성
- `musu-portd` binary 생성
- 기본 설정 로딩 구조 추가
- health endpoint skeleton 추가

완료 기준:

- `cargo check` 통과
- `cargo run -p musu-portd`로 빈 서버가 뜬다
- 원본 repo를 건드리지 않고 이 폴더에서만 실행 가능하다

### Phase 2. Route Contract Freeze

목표:

- 원본의 route 모델과 base URL 계산 방식을 고정

핵심 작업:

- `ServiceRoute` 재정의
- supervisor route source 인터페이스 정의
- `extra_routes` in-memory store 추가
- base URL/port/env 처리 추가

완료 기준:

- supervisor seed + extra route merge 결과를 `/routes`로 확인 가능
- route JSON 구조가 원본과 최대한 유사하다

### Phase 3. HTTP/WS Alias Router

목표:

- `port_manager.rs`의 핵심 HTTP/WS 경로를 standalone으로 재현

핵심 작업:

- `/{service}`
- `/{service}/{*rest}`
- `/ws/{service}`
- `/ws/{service}/{*rest}`
- `/health`
- `/metrics`
- `/metrics/json`

완료 기준:

- 임의 HTTP backend를 alias로 프록시 가능
- alias 미존재/disabled/not-running 처리 규칙이 정리됨
- 기본 metrics가 노출된다

### Phase 4. L4 Runtime: TCP First

목표:

- promoted TCP route를 별도 bind port로 포워딩

핵심 작업:

- `L4Runtime` 스켈레톤
- route -> desired spec 변환
- reconcile loop
- TCP passthrough runner
- runner status snapshot

완료 기준:

- TCP echo server를 promote 후 새 bind port로 접근 가능
- route 제거 시 runner가 정리된다

### Phase 5. Linux Discovery

목표:

- Linux listener snapshot 기반 unmanaged endpoint discovery 재현

핵심 작업:

- `ss -ltnpH`
- `ss -lunpH`
- PID/process/user parse
- exposure/owner/severity/false-positive 분류
- current/legacy signature 계산

완료 기준:

- 로컬 listen 프로세스를 unmanaged endpoint로 surface 가능
- managed port 제외가 작동한다
- ignore signature 비교가 작동한다

### Phase 6. Promote / Ignore / Persistence

목표:

- command layer의 핵심 상태 변경 동작을 재현

핵심 작업:

- SQLite settings table
- `port_manager.promoted_routes`
- `port_manager.ignored_signatures`
- `port_manager.audit_events`
- promote/ignore/unignore command API
- stale cleanup persistence 반영

완료 기준:

- promote/ignore 상태가 재시작 후 복원된다
- audit event가 남는다
- stale promoted route 정리 결과가 persistence에 반영된다

### Phase 7. QUIC / Extended Policy Surface

목표:

- 원본의 나머지 핵심 표면을 단계적으로 따라간다

후보 범위:

- QUIC passthrough
- QUIC probe
- audit policy preset
- connect mode
- connect stable probe
- metadata export

완료 기준:

- 어떤 기능을 실제로 parity 대상에 넣을지 명시적으로 선택
- 범위가 큰 기능은 별도 세부 플랜 문서로 분리

현재 결과:

- core 범위는 구현 완료
- coverage parity 표면도 구현 완료

### Phase 11. Coverage Parity Surface

목표:

- 현재 분산된 상태 표면을 원본 `port_manager_coverage`에 가까운 단일 coverage report로 묶는다

핵심 작업:

- coverage report 타입 고정
- `GET /coverage` 또는 동등한 standalone endpoint 추가
- managed alias / unmanaged endpoint / ignored signature / l4 runner / quic probe / connect status / audit / metadata를 한 payload로 통합
- standalone 범위 밖인 항목(`metadata_dual_path_status`, `connect denied drain`, `mcp broker auto promote`)의 처리 방침을 명시
- alert level / all-known-endpoints-managed 계산 규칙을 원본과 비교 가능하게 고정

완료 기준:

- `musu-port` 단독으로 coverage snapshot 한 번에 조회 가능
- 어떤 필드를 parity 대상으로 포함/제외하는지 문서와 코드가 일치
- Phase 8에서 fixture/smoke 기준으로 비교할 입력이 준비됨

현재 결과:

- 완료
- standalone coverage payload는 원본 `PortManagerCoverageReport`의 핵심 필드를 대부분 포함한다
- standalone 범위 밖인 `metadata_dual_path_status`는 `null`로 반환하고, `connect denied drain`과 `mcp broker auto promote`는 제외로 고정한다

### Phase 8. Parity Verification

목표:

- 원본과 `musu-port`의 동작 차이를 명시적으로 비교

핵심 작업:

- fixture 기반 비교 테스트
- manual verification 시나리오
- 차이점 목록 작성
- 남겨둘 차이와 줄여야 할 차이 구분

완료 기준:

- "같다", "의도적으로 다르다", "아직 미구현"이 분리된 parity 문서 존재

현재 결과:

- 완료
- integration test `tests/parity_verification.rs`로 route / HTTP / discovery / promote / persistence / coverage parity baseline을 자동 검증한다
- 최종 차이 문서는 `PARITY_REPORT.md`에 고정했다

### Phase 9. Linux Toolchain Recovery And Live Smoke

목표:

- WSL/Linux native Rust 실행 환경을 복구하고, `musu-port`를 Linux 바이너리로 직접 띄워 live smoke를 끝낸다

핵심 작업:

- 현재 shell의 `HOME` / `PATH` / `CARGO_HOME` / `RUSTUP_HOME` 상태 확인
- `/home/hugh51/.cargo` / `/home/hugh51/.rustup` 기준으로 Linux toolchain 복구 또는 재설치
- native `cargo check` / `cargo test` / `cargo run` 경로 확정
- `/discovery`, `/promote`, `/l4/runners`, persistence restart smoke를 Linux 경로로 재검증
- 필요한 wrapper/env bootstrap을 `musu-port` 문서에 고정

완료 기준:

- Linux native `cargo --version` / `rustc --version`이 현재 Codex shell에서 안정적으로 동작한다
- `cargo check`와 핵심 테스트가 Linux toolchain 기준으로 통과한다
- `musu-portd`를 Linux 바이너리로 실행해 `/health`, `/routes`, `/discovery`, TCP promote smoke를 검증한다
- restart 후 persistence restore까지 확인한다

현재 결과:

- 완료
- 구현 산출물:
  - `.cargo/config.toml`
  - `scripts/linux-rust-env.sh`
  - `scripts/host-gcc-wrapper.sh`
  - `scripts/host-gxx-wrapper.sh`
- 실사용 명령:
  - `./scripts/linux-rust-env.sh cargo check`
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `MUSU_PORT_MANAGER_PORT=24682 MUSU_PORT_SEED_SERVICES=... MUSU_PORT_STATE_DB=... ./scripts/linux-rust-env.sh cargo run -p musu-portd`

### Phase 10. Windows WSL Bilingual Adapter Planning

목표:

- `musu-port`를 Windows 메인 + WSL2 타겟으로 확장하기 위한 adapter 분해를 고정한다

핵심 작업:

- shared core / translator / native adapter 분류
- discovery provider 분리 대상 정의
- runtime context / path bridge / executable resolver 계약 정의
- Windows/WSL 테스트 매트릭스 정의

완료 기준:

- 어떤 기능을 공유하고 어떤 기능을 adapter로 뽑아야 하는지 문서로 설명 가능
- `WINDOWS_WSL_ADAPTER_MATRIX.md`와 세부 플랜이 준비됨

현재 결과:

- 완료
- 산출물:
  - `WINDOWS_WSL_ADAPTER_MATRIX.md`
  - `plans/10_windows_wsl_bilingual_adapter_plan.md`

### Phase 12. Runtime Context Path Bridge Productization

목표:

- Windows/WSL 바이링구얼 제품화 첫 슬라이스를 실제 코드로 연결한다

핵심 작업:

- `platform/context.rs`
- `platform/path_bridge.rs`
- `platform/runtime_resolver.rs`
- config/env path normalization
- metadata/export path display normalization
- `/health`, metadata report에 runtime/binary/filesystem context 노출

완료 기준:

- WSL/Linux 바이너리가 Windows path 입력을 받아도 정상 동작한다
- 현재 runtime/binary/path context를 health/report surface에서 확인할 수 있다
- 다음 단계 discovery/provider split 준비가 된다

현재 결과:

- 완료
- 구현 산출물:
  - `crates/musu-port-core/src/platform/context.rs`
  - `crates/musu-port-core/src/platform/path_bridge.rs`
  - `crates/musu-port-core/src/platform/runtime_resolver.rs`
  - `plans/12_runtime_context_path_bridge_productization.md`
- 검증:
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
  - `./scripts/linux-rust-env.sh cargo check`

### Phase 13. Discovery Provider Split

목표:

- discovery 계층을 Linux 전용 구현에서 provider abstraction 구조로 분리한다

핵심 작업:

- `discovery/linux.rs`
- `discovery/windows.rs`
- common facade `discovery.rs`
- `MUSU_PORT_DISCOVERY_PROVIDER=auto|linux|windows|both`
- `/health` discovery provider surface

완료 기준:

- Linux/WSL provider와 Windows provider가 같은 discovery contract 뒤에 선다
- Windows parser/unit tests가 들어간다
- 이후 단계에서 Windows process metadata provider를 따로 붙일 수 있다

현재 결과:

- 완료
- 구현 산출물:
  - `crates/musu-port-core/src/discovery.rs`
  - `crates/musu-port-core/src/discovery/linux.rs`
  - `crates/musu-port-core/src/discovery/windows.rs`
  - `plans/13_discovery_provider_split.md`
- 검증:
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
  - `./scripts/linux-rust-env.sh cargo check`
- 알려진 제한:
  - Codex snap shell에서는 Windows interop bridge가 vsock 제한으로 막혀 live Windows provider smoke를 완료하지 못함

## 작업 순서 결정

바로 구현에 들어갈 실제 우선순위는 아래다.

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7
8. Phase 9
9. Phase 11
10. 마지막에 Phase 8

이 순서가 좋은 이유:

- discovery보다 먼저 router/L4를 살려야 promote 결과를 검증할 수 있다
- SQLite보다 먼저 in-memory 동작을 확인해야 구조를 단순하게 유지할 수 있다
- QUIC/connect는 핵심 러닝 루프가 검증된 뒤로 미룬다
- parity 문서화 전에 Linux native smoke 경로와 coverage snapshot surface를 먼저 고정해야 검증 결과가 흔들리지 않는다

## 세부 플랜 문서 운영 규칙

각 단계 시작 전에 `plans/` 아래 세부 플랜 문서를 만든다.

문서 규칙:

- 파일명: `NN_<slug>.md`
- 예시:
  - `01_workspace_bootstrap.md`
  - `02_route_contract_freeze.md`
  - `03_http_ws_router.md`

각 문서에는 최소 아래 항목을 넣는다.

- 목표
- 원본 참조 파일
- 이번 단계 범위
- 제외 범위
- 구현 작업 목록
- 검증 방법
- 보류 항목
- 완료 기준

즉, 마스터 플랜은 "전체 로드맵", 세부 플랜은 "당장 실행할 스프린트 문서" 역할이다.

## 기술 결정 초안

현재 기준 제안:

- 언어: Rust
- HTTP server: `axum`
- async runtime: `tokio`
- HTTP client/proxy support: `reqwest`
- persistence: `rusqlite`
- serialization: `serde`, `serde_json`

이 선택은 원본과 최대한 비슷하게 가기 위한 것이다.

## 검증 전략

단계별 검증은 문서화된 시나리오 기준으로 한다.

필수 검증 축:

- build verification
- unit test
- local manual smoke test
- parity note 작성

초기 수동 시나리오:

1. HTTP backend 하나 띄우고 alias proxy 확인
2. TCP echo server 띄우고 promoted bind port 확인
3. unmanaged listener discovery 확인
4. ignore 후 목록 suppress 확인
5. 재시작 후 promote 상태 복원 확인

Phase 9 추가 시나리오:

1. 현재 Codex shell에서 Linux native `cargo` / `rustc` 활성화 확인
2. Linux native `cargo run -p musu-portd`로 서버 기동
3. `/health`, `/routes`, `/discovery` live smoke 재검증
4. TCP promote 후 `/l4/runners` 및 echo 응답 확인
5. 프로세스 재시작 후 promoted/ignored/audit persistence restore 확인

## 리스크

### 1. 숨은 supervisor 결합

원본은 `musu-supervisor`의 `routes()`와 `sync_route_registry()`에 의존한다.
standalone 재현에서는 이 부분을 인터페이스로 먼저 끊지 않으면 원본 결합이 다시 들어온다.

### 2. Tauri command 계층 착시

원본 UI 호출 표면이 Tauri command라서, 실제 핵심 로직과 command layer가 섞여 보일 수 있다.
standalone에서는 command 계층과 core 계층을 분리해야 한다.

### 3. QUIC/TLS 범위 팽창

처음부터 QUIC/TLS까지 따라가면 구현 속도가 급격히 느려진다.
TCP 먼저, QUIC 나중이 맞다.

### 4. listener parsing의 OS 차이

처음에는 Linux만 정확히 맞추고, 나머지 OS는 뒤로 미룬다.

## 당장 다음 액션

다음 구현 시작 시 제일 먼저 볼 문서:

- `PARITY_REPORT.md`
- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`

그 문서들 다음으로 이어질 작업:

- Windows/WSL adapter 구현
- `musu-connects` 통합 설계/구현

이 마스터 플랜은 전체 방향을 고정하고, 실제 구현은 각 단계 세부 플랜 문서를 만들면서 진행한다.
