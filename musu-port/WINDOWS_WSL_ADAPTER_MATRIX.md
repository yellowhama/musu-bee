# musu-port Windows/WSL Adapter Matrix

## 목적

이 문서는 `musu-port`를 Windows 메인 + WSL2 타겟 제품으로 확장할 때,

- 무엇이 공유 코어인지
- 무엇을 통역사 계층이 흡수해야 하는지
- 무엇이 Windows/WSL 네이티브 adapter를 요구하는지

를 기능 단위로 고정하기 위한 매트릭스다.

상위 기준:

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`

## 핵심 결론

`musu-port`는 전체를 두 벌로 만드는 프로젝트가 아니다.

정확한 전략:

- route / policy / state / persistence contract는 공유한다
- 실행 컨텍스트와 경로 차이는 통역사 계층이 흡수한다
- discovery / process metadata / launcher / packaging처럼 OS 경계에 닿는 부분만 adapter를 둔다

## 현재 코드의 층 분류

### Shared Core

현재 파일 중 공유 코어에 가까운 영역:

- [route.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/route.rs)
- [control.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/control.rs)
- [storage.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/storage.rs)
- [metrics.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/metrics.rs)
- [state.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/state.rs)

이 층은 `alias`, `ServiceRoute`, promote/ignore, audit/connect policy, metadata, persistence contract를 가진다.

### Data Plane / Runtime

공유는 가능하지만 OS adapter와 연결될 수 있는 영역:

- [server.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/server.rs)
- [l4.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/l4.rs)

### Native Adapter 의존 영역

이미 Linux 전용 가정이 들어가 있는 영역:

- [discovery.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/discovery.rs)
- [scripts/linux-rust-env.sh](/home/hugh51/musu-functions/musu-port/scripts/linux-rust-env.sh)
- [host-gcc-wrapper.sh](/home/hugh51/musu-functions/musu-port/scripts/host-gcc-wrapper.sh)
- [host-gxx-wrapper.sh](/home/hugh51/musu-functions/musu-port/scripts/host-gxx-wrapper.sh)

## 기능별 분해

### 1. Route / Policy / Persistence

- 공유 코어
- 통역사 계층 불필요
- 네이티브 adapter 불필요

대상:

- `ServiceRoute`
- promote / ignore / audit event
- audit policy
- connect mode
- metadata report schema
- SQLite settings key contract

결론:

- 이 영역은 Windows/WSL 공통 구현으로 유지한다.

### 2. HTTP / WS / TCP Alias Runtime

- 공유 코어 성격이 강함
- 일부 실행 바이너리 선택은 통역사 계층 관여 가능
- 직접적인 OS adapter 의존은 낮음

대상:

- HTTP alias proxy
- WS bridge
- TCP L4 runtime

결론:

- 런타임 로직은 공유
- 단, 외부 target resolution이나 launcher 연동이 붙으면 translator contract 필요

### 3. QUIC Runtime

- 공유 코어 가능
- transport bootstrap에서 OS 차이 가능
- 네트워크 stack와 packaging에서 adapter 가능성 있음

결론:

- core contract는 공유
- 실제 bootstrap/packaging은 Windows/WSL 검토 필요

### 4. Listener Discovery

- 통역사만으로 해결 불가
- Windows/WSL native adapter 필요

현재:

- Linux `ss` + `/proc` 기반 구현만 존재

필요:

- Linux/WSL provider
- Windows provider
- provider selection

권장 분리:

- `discovery/linux.rs`
- `discovery/windows.rs`
- `discovery/mod.rs`

### 5. Process Metadata

- 통역사만으로 해결 불가
- OS별 adapter 필요

현재:

- `/proc/<pid>/status`
- `/etc/passwd`

Windows에서 필요:

- PID -> process name
- process owner
- listen endpoint attribution

### 6. Runtime Context Detection

- 통역사 계층 핵심
- 공유 코어에서 분리 필요

필요:

- Windows native
- WSL
- Linux native
- filesystem context

권장 모듈:

- `platform/context.rs`

### 7. Path Translation

- 통역사 계층 핵심
- Windows/WSL 제품화에 필수

필요:

- Win path -> WSL path
- WSL path -> Win path
- 실행 대상 바이너리 기준 경로 정규화

권장 모듈:

- `platform/path_bridge.rs`

### 8. Executable Resolution

- 통역사 계층 핵심

필요:

- `.exe` vs ELF/AppImage 선택
- install root / portable root 탐지
- current context에 맞는 binary resolution

권장 모듈:

- `platform/runtime_resolver.rs`

### 9. Export / Report File Paths

- 공유 코어 + 통역사 계층 혼합

현재:

- metadata export는 현재 Linux 경로 중심

필요:

- Windows 쪽 실행 시 Windows-friendly 경로
- WSL 쪽 실행 시 Linux-friendly 경로
- 같은 사용자 데이터 contract 유지

권장:

- export dir 결정은 core에서 빼고 translator로 이동

### 10. Toolchain / Packaging / Launcher

- 네이티브 adapter + 통역사 계층

현재:

- Linux native env wrapper만 존재

향후 필요:

- Windows launcher
- WSL launcher
- dual install layout
- exe/appimage selection rule

## 현재 상태 요약

### 이미 공유 코어로 잘 잡힌 것

- route model
- audit/connect policy
- metadata report/export schema
- persistence contract
- HTTP/WS/TCP runtime 대부분

### 현재 Linux 전용으로 박혀 있는 것

- discovery provider
- process metadata provider
- toolchain/bootstrap scripts
- export path 기본값 일부

### 지금 없는 것

- runtime context detection
- path bridge
- executable resolver
- Windows discovery provider
- Windows process metadata provider

## 권장 리팩터링 순서

### Step 1. Context / Path / Runtime Resolver 추가

먼저 추가할 것:

- `platform/context.rs`
- `platform/path_bridge.rs`
- `platform/runtime_resolver.rs`

이 단계는 구현보다 contract 정의가 우선이다.

### Step 2. Discovery Provider 분리

현재 `discovery.rs`를 provider 구조로 분리한다.

- Linux/WSL provider
- Windows provider
- common normalization layer

### Step 3. Export / Data Dir Resolution 분리

- metadata export path
- SQLite path
- portable install path

를 runtime context 기반으로 정규화한다.

### Step 4. Launcher / Packaging Contract 정의

- same feature, different binary
- same config contract
- same data contract

를 강제한다.

## 테스트 매트릭스

`musu-port` 최소 검증 축:

1. Windows native binary
2. WSL Linux binary
3. `/mnt/c` 경로 대상
4. WSL ext4 경로 대상
5. Windows discovery provider
6. WSL/Linux discovery provider
7. path translation roundtrip
8. export path resolution parity

## 현재 결론

`musu-port`는 Windows판/리눅스판을 따로 만드는 문제가 아니다.

정확한 문제는:

- control-plane 코어는 공유하고
- 바이링구얼 통역사 계층을 만들고
- discovery / process metadata / launcher 같은 OS 경계만 adapter로 분리하는 것

즉, 필요한 것은 "모든 기능 이중 구현"이 아니라 "어댑터 매트릭스에 맞는 구조 분해"다.
