# WSL2 Bilingual Runtime Architecture

## 목적

이 문서는 MUSU 전체 제품군의 상위 제약을 고정한다.

핵심 전제:

- 주 타겟 유저는 Windows 메인 유저다.
- 이 유저들은 WSL2를 적극적으로 쓴다.
- 따라서 제품은 사용자 관점에서 "바이링구얼"이어야 한다.

즉, 같은 기능이:

- Windows 쪽에서는 `.exe`
- Linux/WSL 쪽에서는 ELF/AppImage

형태로 존재하더라도, 유저 입장에서는 "같은 제품 기능"으로 느껴져야 한다.

## 핵심 질문에 대한 답

질문:

- 모든 기능이 Windows용 / Linux용으로 각각 따로 있어야 하는가
- 아니면 통역사 계층만 있으면 되는가

답:

- 모든 기능을 이중 구현하는 것은 아니다.
- 기본 원칙은 `공유 코어 + 통역사 계층 + OS별 네이티브 어댑터`다.

즉:

1. 순수 도메인 로직은 공유한다.
2. 실행 위치와 파일/프로세스 컨텍스트 차이는 통역사 계층이 흡수한다.
3. OS 경계에 직접 닿는 기능만 Windows/Linux 네이티브 어댑터를 둔다.

## 설계 원칙

### 1. 사용자 경험은 단일 제품이어야 한다

유저는 아래를 의식하면 안 된다.

- 지금 내가 `.exe`를 쓰는지
- 지금 내가 WSL ELF/AppImage를 쓰는지
- 경로가 `C:\...`인지 `/mnt/c/...`인지

프로그램이 알아서 현재 문맥을 감지하고 올바른 쪽을 호출해야 한다.

### 2. 내부 구조는 3층으로 나눈다

#### A. Shared Core

공유되는 영역:

- route / policy / metadata / state machine
- alias 모델
- promote / ignore / audit 규칙
- business logic
- serialization contract

이 층은 가능하면 OS 비의존적으로 유지한다.

#### B. Bilingual Runtime Translator

통역사 계층이 맡는 것:

- 현재 실행 문맥 감지
- `.exe` vs ELF/AppImage 선택
- Windows path <-> WSL path 번역
- env 정규화
- CRLF/LF 정규화
- 호출 대상 binary resolution
- cross-boundary process spawn
- stdout/stderr / exit code 표준화

이 계층이 MUSU의 핵심 UX 차별점이다.

#### C. Native Adapters

OS별 구현이 필요한 영역:

- process discovery
- listener discovery
- filesystem permission handling
- GUI automation
- tray / OS integration
- system service registration
- low-level network introspection
- Windows/WSL-specific packaging and install behavior

이 층은 Windows adapter와 Linux/WSL adapter를 따로 둘 수밖에 없다.

## 어떤 기능은 통역사만 있으면 되는가

대체로 아래는 통역사 + 공유 코어로 해결 가능하다.

- 같은 명령을 `.exe` 또는 ELF/AppImage 중 어디로 보낼지 결정
- 경로 변환
- config 파일 위치 정규화
- export/import 파일 포맷 정규화
- 로그/출력/에러 포맷 정규화
- 포트/route/policy 같은 순수 control-plane 로직

즉, `musu-port`의 상당수 control-plane 로직은 공유 코어에 가깝다.

## 어떤 기능은 네이티브 구현이 필요한가

대체로 아래는 OS별 어댑터가 필요하다.

- Windows 프로세스와 WSL 프로세스를 각각 탐지하는 로직
- 소켓/리스너 탐지 방식 차이
- 권한/실행 비트 처리
- `/mnt/c`와 ext4에서의 파일 속성 차이
- `.exe` 실행과 ELF/AppImage 실행 방식 차이
- GUI/desktop integration

즉, 통역사만으로 다 해결되지는 않는다. 경계면에 닿는 부분은 결국 네이티브 provider가 필요하다.

## 바이링구얼 런타임의 필수 계약

### 1. Context Detection

프로그램은 현재 자신이:

- Windows native인지
- WSL인지
- Linux native인지
- Windows filesystem 위인지
- Linux filesystem 위인지

를 빠르게 판단해야 한다.

### 2. Path Translation

반드시 양방향이 되어야 한다.

- `C:\Users\...` -> `/mnt/c/Users/...`
- `/mnt/c/Users/...` -> `C:\Users\...`

또한 "실행 바이너리 문맥" 기준으로 최종 경로를 내보내야 한다.

### 3. Executable Resolution

동일한 기능이라도 현재 컨텍스트에 맞는 바이너리를 선택해야 한다.

예:

- Windows 쪽에서는 `tool.exe`
- WSL/Linux 쪽에서는 `tool.AppImage` 또는 ELF

### 4. Text And File Normalization

- 줄바꿈은 읽기/쓰기 시 정규화
- 텍스트 인코딩 가정 최소화
- 실행 비트와 파일 권한 차이 고려

### 5. Process Boundary Contract

cross-OS 실행 결과는 동일한 형식으로 표준화한다.

- stdout
- stderr
- exit code
- structured error
- resolved command
- resolved path

## 패키징 원칙

유저 머신에는 둘 다 존재할 수 있다.

- Windows용 `.exe`
- Linux/WSL용 ELF/AppImage`

하지만 실행 entry는 단일해야 한다.

권장 원칙:

- 런처는 현재 컨텍스트에 맞는 바이너리를 선택한다.
- 설정/데이터 디렉터리는 가능한 공유 contract를 가진다.
- 바이너리 포맷이 달라도 기능 contract는 동일해야 한다.

## `musu-port`에 주는 의미

`musu-port`는 control-plane 성격이 강하므로, 많은 부분을 공유 코어로 유지할 수 있다.

하지만 아래는 adapter가 필요할 수 있다.

- Windows listener discovery
- WSL listener discovery
- Windows process metadata
- Linux process metadata
- Windows path 기준 export
- WSL/Linux path 기준 export

즉, port manager 전체를 이중 구현하는 것이 아니라:

- route/policy/state는 공유
- discovery/provider는 OS adapter 분리

가 맞다.

## `musu-connects`에 주는 의미

`musu-connects`는 network plane이므로 상대적으로 공유 코어 비중이 더 크다.

하지만 아래는 여전히 adapter 경계가 있다.

- local interface enumeration
- device identity material storage
- firewall / OS networking integration
- platform-specific transport bootstrap

## 테스트 매트릭스

최소 검증 축:

1. Windows native 실행
2. WSL 내부 실행
3. Windows filesystem 경로 대상
4. Linux filesystem 경로 대상
5. `.exe` launcher path
6. ELF/AppImage launcher path
7. cross-boundary spawn
8. path translation roundtrip

## 현재 결론

MUSU는 모든 기능을 무식하게 Windows판/리눅스판으로 두 벌 만드는 제품이 아니다.

정확한 전략은:

- 공유 코어를 최대화한다
- 바이링구얼 통역사 계층을 강하게 만든다
- OS 경계에 닿는 부분만 네이티브 adapter로 분리한다

즉, "모든 기능이 두 벌"이 아니라 "모든 기능이 바이링구얼 UX를 가져야 한다"가 맞다.
