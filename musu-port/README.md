# Musu Port Manager Reproduction Notes

## 목적

이 폴더는 원본 `musu-desktop`의 포트 매니저 구현을 따로 재현해 보기 위한 작업 공간이다.

- 원본 코드는 수정하지 않는다.
- 먼저 "어떻게 동작하는지"를 문서로 고정한다.
- 그 다음 이 문서를 기준으로 `musu-port` 안에서 별도 구현을 만든다.

## 왜 포트 매니저를 만들었는가

원본 포트 매니저의 목적은 단순히 "현재 열려 있는 포트 보기"가 아니다.

핵심 의도는 아래 3가지다.

1. 포트 번호를 서비스 ingress로 추상화한다.
   - 사용자는 raw port를 직접 기억하기보다 `alias`, `protocol`, `entrypoint_url` 기준으로 서비스에 접근한다.
   - HTTP/WS는 alias URL로, TCP/QUIC는 managed bind port로 다시 노출한다.
2. 로컬에서 돌아가는 unmanaged endpoint를 운영 가능한 상태로 편입한다.
   - discovery로 현재 열려 있는 listener를 찾고
   - promote로 managed route/L4 runner로 승격하고
   - ignore로 의도적인 예외를 관리한다.
3. 동적 운영 관리를 가능하게 한다.
   - 포트 변경, 프로세스 재시작, runner 재생성, audit 정책, connect mode 같은 운영 상태를 "포트 번호"가 아니라 "관리된 ingress 표면" 기준으로 다룬다.

즉, 포트 매니저는 "포트를 보여주는 도구"가 아니라 "로컬 서비스 접근 표면을 추상화하고 동적으로 운영하는 control-plane"에 가깝다.

여기서 `port`는 단순한 숫자 포트가 아니라, 기기와 서비스, 더 작게는 AI agent나 MCP 같은 연결들이 드나드는 "항구" 또는 "길목"에 가깝다.

- raw port는 내부 구현 세부사항이다.
- `musu-port`는 그 세부사항 앞단에 있는 managed ingress 표면이다.
- 사용자는 "몇 번 포트"보다 "어떤 alias / 어떤 ingress / 어떤 route"로 접근하는지가 중요하다.
- 이 의미에서 `musu-port`는 포트 번호 자체가 아니라 "연결이 들어오고 흘러가는 표면"을 관리한다.

## `musu-connects`와 붙으면 무엇이 되는가

현재 `musu-port`는 로컬 기기 안에서만 동작하는 ingress/control-plane이다.

- alias 관리
- unmanaged discovery
- promote/ignore
- HTTP/WS/TCP ingress
- audit/persistence

여기에 `musu-connects`가 붙으면 역할이 한 단계 커진다.

- `musu-port`: 로컬 서비스 표면을 추상화하고 관리한다.
- `musu-connects`: 기기 간 secure transport와 peer advertisement를 담당한다.

둘이 결합되면 `raw port -> local managed ingress -> cross-device managed ingress` 구조가 된다.

즉, `musu-port`만 있을 때는 "로컬 ingress/control-plane"이고, `musu-connects`까지 붙으면 MUSU가 의도하는 개인용 mesh/network plane으로 확장된다.

주의:

- 프로세스 lifecycle 자체는 `musu-port`의 1차 책임이 아니다.
- process restart / sandbox / supervisor orchestration은 supervisor/warden 계층이 따로 맡는 것이 맞다.
- 포트 매니저는 우선 "접근 표면과 운영 상태를 관리하는 레이어"로 보는 편이 정확하다.

## 문서 구조

- `README.md`: 원본 구현 분석 메모
- `PARITY_REPORT.md`: 현재 standalone parity 결과와 intentional diff
- `MASTER_PLAN.md`: `musu-port` 구현 마스터 플랜
- `WINDOWS_WSL_ADAPTER_MATRIX.md`: `musu-port`의 Windows/WSL bilingual adapter 분해 문서
- `MUSU_AS_MCP_RELATION.md`: `MUSU-AS-MCP`를 `musu-port` 관점에서 해석한 연결 문서
- `DEVICE_PROFILE_CONTRACT.md`: `device_id + device profile + translator` 계약과 예시 JSON
- `MANUAL_VALIDATION_CHECKLIST.md`: 남은 Windows/WSL product smoke checklist와 WSL 실행 기록
- `DEFERRED_POLICY_BACKLOG.md`: 구현은 가능하지만 제품 결정이 필요한 정책 항목 정리
- `scripts/real-mcp-smoke.sh`: 실제 `MUSU-AS-MCP` 기준 real MCP smoke harness
- `scripts/operator-ingress-acceptance.sh`: operator ingress acceptance packet을 생성하는 canonical harness
- `scripts/windows-native-smoke.ps1`: 실제 Windows product shell smoke harness
- `../musu-connects/MUSU_PORT_INTEGRATION.md`: `musu-port`와 `musu-connects`가 결합될 때의 canonical integration 메모
- `plans/`: 단계별 세부 실행 계획 문서
- 현재 마감 단계 문서군: `plans/22_manual_validation_execution.md` ~ `plans/24_validation_automation_and_windows_bridge_handoff.md`

## 원본 기준 위치

분석 기준 원본:

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop`

핵심 파일:

- `src-tauri/src/main.rs`
- `src-tauri/src/state.rs`
- `src-tauri/src/port_manager.rs`
- `src-tauri/src/port_manager_l4.rs`
- `src-tauri/src/commands/port_manager.rs`
- `src/hooks/usePortManager.ts`
- `src/lib/tauri.ts`
- `src/components/v4/PortManagerView.tsx`

관련 있지만 핵심은 아닌 파일:

- `src-tauri/src/commands/program_registry.rs`
- `src-tauri/migrations/V18__registered_programs.sql`

`registered_programs`는 터미널/IDE/프로세스 등록용 CRUD이고, 포트 매니저 본체는 아니다.

## 한 줄 요약

포트 매니저는 단순한 "포트 목록 UI"가 아니다. 실제 구현은 아래 4개가 합쳐진 로컬 서비스다.

1. Supervisor 라우트를 HTTP alias URL로 노출하는 로컬 라우터
2. 승격(promote)된 TCP/QUIC 엔드포인트를 별도 bind port로 포워딩하는 L4 런타임
3. OS listener snapshot을 스캔해서 "관리되지 않는 포트"를 찾아내는 discovery 엔진
4. ignore/promote/audit/connect mode를 SQLite settings에 저장하는 관리 계층

즉, 재현 대상은 "UI"가 아니라 "라우터 + L4 프록시 + discovery + persistence" 묶음이다.

## 현재 재현 상태

2026-04-01 기준 `musu-port`에서 재현된 범위:

- HTTP alias router
- WebSocket bridge baseline
- TCP promote/L4 runtime
- Linux discovery
- SQLite 기반 promoted/ignored/audit persistence
- audit policy / connect mode / metadata export baseline
- Linux native build/test/run 경로
- Windows/WSL bilingual translator 첫 슬라이스
  - runtime context detection
  - Windows path <-> WSL path bridge
  - `.exe` / ELF / AppImage executable resolver baseline
- discovery provider split baseline
  - Linux/WSL provider 유지
  - Windows `netstat.exe` / `tasklist.exe` parser/provider 추가
  - `MUSU_PORT_DISCOVERY_PROVIDER=auto|linux|windows|both`
- device-aware runtime baseline
  - `device_id`
  - `device_profile_path`
  - device profile surface on `/health`
  - translator guidance / service template / custom MCP health path contract
- AI-native service baseline
  - `service_class` / `agent_facing`
  - profile-aware `/mcp/health` probe
  - deep MCP probe(`initialize`, `tools/list`)
  - device-id-based MCP alias suggestion
  - device profile validation policy(`warn|fail`)
  - template priority scoring
  - `/audit/connect-denied`
  - `/connect/{service}` decision + handoff contract surface

검증 완료 항목:

- Linux native `cargo check`
- Linux native `cargo test -p musu-port-core`
- `/health`
- `/routes`
- `/coverage`
- `/discovery`
- HTTP alias proxy smoke
- TCP promote + payload forward smoke
- restart 후 persistence restore smoke
- `/audit/policy`, `/connect/status`, `/metadata/report`, `/metadata/export` smoke
- `/quic/probe/summary`, `/connect/stable-probe`, `/connect/stable-probe/history` smoke
- QUIC promote + UDP payload forward smoke
- Windows/WSL runtime translator unit tests
- WSL runtime에서 Windows path 입력 정규화 테스트
- discovery provider split unit tests
- Windows netstat/tasklist parser tests
- profile-aware MCP discovery integration test
- connect ingress parity integration test
- strict device profile startup failure integration test
- `/mnt/c` path parity smoke
- discovery provider `linux` / `windows` / `both` manual smoke
- 실제 `MUSU-AS-MCP/server.py` 기준 real MCP smoke

남은 product-shell 항목:

- Windows native shell smoke

standalone parity baseline은 완료 상태다.
최종 차이 문서는 `PARITY_REPORT.md`에 정리했다.
그 다음 제품화 기준선은 `plans/12_runtime_context_path_bridge_productization.md`부터 `plans/24_validation_automation_and_windows_bridge_handoff.md`까지 이어진다.

## 전체 구조

### 1. 앱 시작

`main.rs`에서 `port_manager_feat` feature가 켜져 있으면 별도 스레드에서 current-thread Tokio runtime을 띄운다.

- 포트: `MUSU_PORT_MANAGER_PORT` 환경변수 우선, 기본값 `1355`
- 호출: `port_manager::run_port_manager(...)`

즉, 포트 매니저는 Tauri main async runtime 안에 직접 붙는 게 아니라, 별도 thread/runtime으로 살아간다.

### 2. 앱 상태

`state.rs`에서 포트 매니저 관련 상태를 `AppState`에 보관한다.

- `extra_routes: Arc<TokioMutex<HashMap<String, ServiceRoute>>>`
- `l4_runtime: Arc<TokioMutex<L4Runtime>>`

`extra_routes`는 supervisor가 원래 알고 있던 route 외에, 사용자가 promote 해서 추가한 route들의 in-memory 집합이다.

앱 시작 시 SQLite `settings`에서 `port_manager.promoted_routes`를 읽어 복원한다.

### 3. 런타임 본체

`port_manager.rs`가 실제 alias router 서버다.

시작 시 하는 일:

1. listener bind
2. 실제 bind된 포트 기준으로 `MUSU_PORT_MANAGER_BASE_URL` 설정
3. supervisor route registry를 그 base URL 기준으로 sync
4. reconcile loop 시작
5. axum route serve 시작

axum route 표면:

- `/health`
- `/routes`
- `/metrics`
- `/metrics/json`
- `/discovery`
- `/audit/events`
- `/audit/policy`
- `/audit/summary`
- `/l4/runners`
- `/connect/mode`
- `/connect/status`
- `/connect/stable-probe`
- `/connect/stable-probe/history`
- `/quic/probe/summary`
- `/metadata/report`
- `/metadata/export`
- `/metadata/export/history`
- `/promote`
- `/ignore`
- `/unignore`
- `/audit/connect-denied`
- `/connect/{service}`
- `/{service}`
- `/{service}/{*rest}`
- `/ws/{service}`
- `/ws/{service}/{*rest}`

### `/health` v0.2 telemetry

`GET /health` now includes host and queue telemetry fields:

- `cpu_pct`: global CPU usage percent from `sysinfo`
- `ram_used`: used RAM (bytes as reported by `sysinfo`)
- `ram_total`: total RAM (bytes as reported by `sysinfo`)
- `gpu_util`: GPU utilization percent from `nvidia-smi` (nullable)
- `gpu_mem_used`: GPU memory used (MiB from `nvidia-smi`, nullable)
- `gpu_mem_total`: GPU memory total (MiB from `nvidia-smi`, nullable)
- `queue_depth`: current broadcast backlog across channel hub queues

Quick check:

```bash
curl -fsS http://127.0.0.1:24680/health | jq '{cpu_pct,ram_used,ram_total,gpu_util,gpu_mem_used,gpu_mem_total,queue_depth}'
```

Verifier script:

```bash
./scripts/port_health_verify.sh http://127.0.0.1:24680/health
./scripts/port_health_verify.sh http://127.0.0.1:24680/health artifacts/health/local-health.json
```

### 4. 관리 명령 계층

`commands/port_manager.rs`는 Tauri command layer다.

핵심 명령:

- `port_manager_coverage`
- `port_manager_promote_endpoint`
- `port_manager_ignore_signature`
- `port_manager_unignore_signature`
- `port_manager_get_audit_policy`
- `port_manager_set_audit_policy`
- `port_manager_apply_audit_policy_preset`
- `port_manager_get_connect_mode`
- `port_manager_set_connect_mode`
- `port_manager_export_metadata_report`
- `port_manager_run_metadata_dual_path`
- `port_manager_run_connect_stable_probe`

즉, 프론트는 거의 전부 이 command layer를 통해서만 동작한다.

### 5. 프론트

`usePortManager.ts`가 UI polling hook이다.

- 초기 stagger refresh: `1.5s`
- 주기 refresh: `10s`
- 같이 가져오는 것:
  - `portManagerCoverage()`
  - `supervisorRoutes()`
- mutate 후에는 항상 `refresh()` 재호출

`PortManagerView.tsx`는 대체로 화면 표현 계층이고, 핵심 로직은 백엔드에 있다.

## 핵심 데이터 모델

`ServiceRoute`는 복원 코드 기준 아래 필드를 가진다.

```rust
ServiceRoute {
    name: String,
    alias: String,
    protocol: String,
    enabled: bool,
    running: bool,
    port: Option<u16>,
    target_url: Option<String>,
    entrypoint_url: String,
}
```

포트 매니저 재현에서 이 구조는 사실상 필수다.

### route 집합 구성 방식

실행 시 실제 사용 route는 두 소스를 합쳐서 만든다.

1. supervisor가 원래 제공하는 route
2. `extra_routes`에 들어 있는 promoted route

이 merge 결과를 기준으로:

- HTTP/WS alias resolution
- L4 runner reconcile
- coverage report
- 중복 alias 검사
- managed port 집합 계산

이 일어난다.

## 실제 동작 흐름

### 1. HTTP alias routing

`run_port_manager()`는 local HTTP router를 띄운다.

- supervisor route 또는 promoted route를 alias로 resolve
- target URL로 HTTP 요청을 전달
- metrics 누적

예:

- entrypoint: `http://127.0.0.1:1355/my-service`
- target: `http://127.0.0.1:8787`

### 2. WebSocket routing

`/ws/{service}` 경로로 alias를 받아 target 쪽 websocket으로 전달한다.

즉, HTTP와 WS는 기본적으로 "같은 alias registry"를 공유한다.

### 3. TCP/QUIC L4 forwarding

`port_manager_l4.rs`가 담당한다.

핵심 타입:

- `IngressProtocol { Http, Ws, Tcp, Quic }`
- `TlsMode { None, Optional, Required }`
- `L4RouteContract`
- `L4Runtime`

L4 runtime은 `ServiceRoute` 목록을 보고 desired spec을 만든 뒤:

- 없어져야 할 runner는 중지
- 새로 필요한 runner는 시작
- 상태 snapshot 갱신

지원 포워딩:

- TCP passthrough
- TCP with optional/required TLS termination
- QUIC passthrough

주의:

- L4 contract validation은 `tcp`, `quic`만 허용
- bind address는 loopback 또는 unspecified만 허용
- `0.0.0.0` bind는 `MUSU_ALLOW_EXTERNAL_PORT_FORWARDING=1` 없으면 막는다

## discovery 엔진

핵심 함수는 `collect_discovered_unmanaged_endpoints(...)`다.

이 로직은 OS에서 현재 listen 중인 포트를 모아서 "아직 관리되지 않는 엔드포인트"를 계산한다.

### managed 판정

이미 아래에 포함된 포트는 skip한다.

- supervisor route의 `port`
- promoted extra route의 `port`

### signature

현재 signature 형식:

```text
protocol|process_name|listen_addr|port
```

구버전 호환 signature:

```text
process_name|listen_addr|port
```

ignore 테이블은 둘 다 비교한다.

### 분류 항목

listener마다 아래를 계산한다.

- `exposure`
  - `loopback`
  - `wildcard`
  - `private`
  - `public`
  - `unknown`
- `owner`
  - `musu_runtime`
  - `external_process`
- `false_positive_candidate`
- `severity`
- `suggested_alias`
- `suggested_action`

### owner 판정

프로세스명이 아래 문자열을 포함하면 `musu_runtime`으로 본다.

- `musu`
- `hive_link`
- `forgejo`
- `openclaw`

아니면 `external_process`.

### severity 판정

기본 민감 포트:

- `22`
- `2375`
- `2376`
- `3306`
- `5432`
- `6379`
- `6443`
- `9200`
- `27017`

이 목록은 `MUSU_PORT_MANAGER_CRITICAL_PORTS`로 override 가능하다.

민감 포트가 `private/wildcard/public`에 노출되면 `critical`.
그 외 기본값은 대체로:

- loopback -> `medium`
- private -> `high`
- wildcard -> `high`
- public -> `high`

### false positive 후보

시스템성 프로세스명이고 low port일 때 suppress 후보로 분류한다.

예:

- `launchd`
- `mdnsresponder`
- `systemd`
- `sshd`
- `cupsd`
- `pid-...`

### OS별 listener 수집

Linux:

- `ss -ltnpH`
- `ss -lunpH`

Windows:

- `netstat -ano -p tcp`
- `netstat -ano -p udp`
- `tasklist /FO CSV /NH /V`

macOS:

- `lsof -nP -iTCP -sTCP:LISTEN -Fpcn`
- UDP variant
- `ps -axo pid=,user=,comm=`

즉, standalone 재현도 처음에는 Linux 버전부터만 구현하는 게 맞다.

## promote 동작

핵심 함수는 `port_manager_promote_endpoint(...)`.

지원 protocol:

- `http`
- `ws`
- `tcp`
- `quic`

승격 흐름:

1. 현재 supervisor route와 extra route를 읽는다.
2. `managed_ports`, `alias_in_use`를 계산한다.
3. ignore 된 signature면 거절한다.
4. discovery 결과에서 대상 endpoint를 찾는다.
5. alias를 sanitize 하고 중복이면 `-<port>`를 붙인다.
6. protocol별 entrypoint/target/bind_port를 만든다.
7. `ServiceRoute`를 만들어 `extra_routes`에 넣는다.
8. `port_manager.promoted_routes`로 persistence 한다.
9. audit event를 남긴다.
10. Lighthouse resource도 자동 등록한다.

### protocol별 차이

#### http / ws

- entrypoint: `http://127.0.0.1:<manager-port>/<alias>`
- target: `http://127.0.0.1:<endpoint-port>`
- route.port: endpoint port 그대로

즉, HTTP/WS는 alias router를 통과한다.

#### tcp

- free local TCP port를 하나 새로 잡는다
- entrypoint: `tcp://127.0.0.1:<new-port>`
- target: `tcp://127.0.0.1:<endpoint-port>`

즉, TCP는 alias path가 아니라 새 bind port를 만든다.

#### quic

- free local UDP port를 하나 새로 잡는다
- entrypoint: `quic://127.0.0.1:<new-port>`
- target: `quic://127.0.0.1:<endpoint-port>`

즉, QUIC도 새 bind port를 만든다.

## cleanup / self-healing

### reconcile loop

`run_port_manager()` 내부 loop는 2초마다 돈다.

- 현재 route 집합 수집
- `l4_runtime.reconcile_routes(&routes)`
- runner health check

### dead promoted route eviction

약 30초마다 dead promoted route를 in-memory에서 제거한다.

- TCP: 짧은 timeout으로 `TcpStream::connect`
- QUIC: `probe_quic_target(...)`

중요:

- 이 단계는 메모리 정리 위주다.
- SQLite persistence + audit cleanup의 완전 반영은 command layer 쪽 user action 시 같이 처리된다.

## persistence 키

settings table에 쓰는 주요 키:

- `port_manager.promoted_routes`
- `port_manager.ignored_signatures`
- `port_manager.audit_events`
- `port_manager.audit_policy`
- `port_manager.connect_mode`
- `port_manager.metadata_export_history`
- `port_manager.connect_probe_history`
- `port_manager.connect_policy_denied_last_total`

standalone 재현도 처음부터 이 key 이름을 유지하는 편이 원본 비교에 좋다.

## metrics

`PortManagerMetrics`에서 Prometheus text export를 제공한다.

대표 카운터:

- `http_requests_total`
- `http_errors_total`
- `http_bytes_sent`
- `ws_connections_total`
- `ws_messages_forwarded`
- `connect_tunnels_total`
- `connect_tunnels_rejected`
- `connect_policy_denied_total`
- `http_retry_total`
- `http_retry_success_total`
- `quic_attempts_total`
- `quic_fallback_total`
- `quic_recover_total`
- `quic_timeout_total`
- `quic_unreachable_total`
- `quic_io_error_total`

standalone 재현 초기 버전에서는 이 중 일부만 구현해도 되지만, 이름은 유지하는 편이 좋다.

## 재현 우선순위

원본을 "그대로 이해하기 위한" 최소 재현 순서는 아래가 적절하다.

### Phase 1: 백엔드 단독 실행판

목표:

- Tauri 없이도 포트 매니저만 따로 실행

최소 구성:

- 작은 Rust binary 하나
- in-memory `SupervisorRoutes` mock 또는 file-based seed
- `ServiceRoute` 모델
- `extra_routes`
- axum HTTP alias router
- `L4Runtime`의 TCP passthrough 먼저
- `/health`, `/routes`, `/{service}` 지원

이 단계에서 먼저 볼 것:

- alias routing이 실제로 원본 개념과 같은지
- HTTP route와 TCP route가 완전히 다른 경로로 처리되는지

### Phase 2: discovery 추가

Linux 한정으로 먼저 구현:

- `ss -ltnpH`
- `ss -lunpH`
- signature 계산
- ignore/promote 분기
- severity/exposure 분류

이 단계에서 볼 것:

- unmanaged endpoint가 어떤 기준으로 surface 되는지
- false positive가 얼마나 많이 뜨는지

### Phase 3: SQLite persistence 추가

유지할 테이블/키:

- settings table
- `port_manager.*` key 이름 그대로

이 단계에서 볼 것:

- promote/ignore/audit가 앱 재시작 후 어떻게 복원되는지

### Phase 4: QUIC / CONNECT / metadata

현재 baseline 구현 완료:

- QUIC passthrough / probe summary
- connect stable probe / history
- metadata export / history
- audit policy preset

이제 남은 건 최종 parity verification이다.

## 별도 재현 시 꼭 유지해야 할 원본 성질

재현판이 원본과 닮으려면 아래는 유지해야 한다.

1. base URL을 런타임 시작 후 실제 bind 포트 기준으로 계산할 것
2. supervisor route와 promoted extra route를 merge해서 쓸 것
3. HTTP/WS와 TCP/QUIC 승격 경로를 분리할 것
4. discovery 결과는 "managed port 제외" 후 계산할 것
5. ignore signature는 current + legacy signature 둘 다 수용할 것
6. promoted route persistence key 이름을 그대로 유지할 것
7. 2초 reconcile loop와 별도 L4 runtime 개념을 유지할 것

이 7개가 빠지면 "비슷해 보이는 다른 프로그램"이 될 가능성이 높다.

## 먼저 따로 돌려볼 실험 시나리오

### 시나리오 A: HTTP

1. 임시 HTTP 서버를 `127.0.0.1:8787`에 띄운다.
2. discovery에서 해당 endpoint를 찾는다.
3. alias `demo-http`로 promote 한다.
4. `http://127.0.0.1:1355/demo-http` 호출이 원본 target으로 프록시되는지 본다.

### 시나리오 B: TCP

1. 임시 TCP echo 서버를 띄운다.
2. 해당 endpoint를 `tcp`로 promote 한다.
3. 새 bind port가 하나 생기는지 본다.
4. 그 bind port로 접속했을 때 target으로 포워딩되는지 본다.

### 시나리오 C: stale cleanup

1. promoted endpoint를 만든다.
2. target 프로세스를 죽인다.
3. 다음 reconcile/cleanup에서 dead route가 정리되는지 본다.

이 3개만 먼저 돌아가도 원본 구조 이해에는 큰 도움이 된다.

## 지금 결론

원본 Musu의 포트 매니저는 "Supervisor 위에 얹힌 로컬 alias router + L4 port forwarder + unmanaged listener discovery + SQLite policy/persistence layer"다.

그래서 `musu-port` 재현도 아래 순서로 가는 게 맞다.

1. Tauri 없이 backend-only로 먼저 분리
2. HTTP alias routing부터 살리기
3. TCP promote/L4 runtime 붙이기
4. Linux discovery 붙이기
5. SQLite persistence 붙이기

이 문서를 기준으로 다음 단계에서는 `musu-port` 안에 standalone 재현용 Rust 프로젝트를 만들면 된다.
