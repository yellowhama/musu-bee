# `musu-port` + `musu-connects` Integration Notes

이 문서는 `musu-port` 쪽 로컬 참고본이다.

canonical 문서 위치:

- `/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md`

## 목적

이 문서는 standalone `musu-port`가 이후 `musu-connects`와 결합될 때 어떤 시스템이 되는지, 그리고 두 계층의 책임을 어디까지 나눌지 고정하기 위한 메모다.

핵심 질문:

- `musu-port`만으로는 어디까지인가
- `musu-connects`가 붙으면 무엇이 추가되는가
- 둘 사이의 계약면(contract)은 무엇인가

## 핵심 비유

`musu-port`의 `port`는 단순한 네트워크 포트 번호가 아니다.

더 정확히는:

- 기기들이 연결되는 항구
- 서비스와 트래픽이 드나드는 길목
- 작게는 AI agent나 MCP 같은 연결 단위까지 수용하는 ingress 표면

즉, `musu-port`는 "포트 번호 관리 도구"가 아니라 "연결이 드나드는 표면을 추상화하는 레이어"다.

## 한 줄 요약

- `musu-port`는 로컬 ingress/control-plane이다.
- `musu-connects`는 peer 간 secure transport/network plane이다.
- 둘이 결합되면 MUSU식 개인용 mesh가 된다.

즉:

`raw port -> local managed ingress -> cross-device managed ingress`

## 책임 분리

### 1. `musu-port`

책임:

- `ServiceRoute(alias, protocol, entrypoint_url, target_url)` 중심의 로컬 서비스 추상화
- unmanaged listener discovery
- promote / ignore / audit / persistence
- HTTP/WS alias ingress
- TCP/QUIC managed bind ingress
- local route table / local coverage / local policy 계산

### 2. `musu-connects`

책임:

- peer discovery
- device identity
- secure transport
- remote endpoint advertisement
- cross-device tunnel or QUIC session
- remote route reachability / peer health

즉, `musu-connects`는 서비스가 아니라 "기기 간 연결망"을 만든다.

### 3. supervisor / warden

책임:

- process lifecycle
- restart
- sandbox / isolation
- local runtime supervision

주의:

- 이 레이어를 `musu-port`에 섞으면 역할이 과도하게 비대해진다.
- 포트 매니저는 우선 ingress/control-plane으로 남기고, lifecycle은 supervisor/warden이 맡는 것이 구조적으로 더 맞다.

## `musu-connects`가 붙었을 때 생기는 변화

현재:

- 로컬에서 열린 서비스 포트를 alias와 managed bind port로 재표면화한다.
- 로컬 discovery / promote / audit만 수행한다.

결합 후:

- 한 기기의 promoted route를 다른 기기에서도 alias로 소비할 수 있다.
- local route와 remote route가 같은 관리 표면에 들어오게 된다.
- connect mode / audit policy가 "로컬 포트" 기준이 아니라 "peer identity + route identity" 기준으로 확장된다.
- AI agent나 MCP 같은 로컬 연결 단위도 결국 이 ingress 표면을 통해 다뤄질 수 있다.

즉, 사용자는 더 이상 "어느 기기의 몇 번 포트"를 직접 다루지 않고, MUSU 네트워크 안의 managed service 표면을 다루게 된다.

## 필요한 계약면

`musu-port`와 `musu-connects`가 결합하려면 최소 아래 계약이 필요하다.

### 1. Route Advertisement

`musu-port -> musu-connects`

- promoted/local managed route publish
- alias
- protocol
- entrypoint kind
- target reachability metadata
- visibility/scope

### 2. Route Import

`musu-connects -> musu-port`

- remote peer가 publish한 route를 local route table에 import
- local route와 remote route를 같은 alias registry에 넣되, source 구분이 가능해야 함

### 3. Target Kind 분리

현재 `target_url`은 거의 로컬 endpoint 기준이다.

결합 후에는 최소 아래 구분이 필요하다.

- local process target
- local managed ingress target
- remote peer target
- tunneled or relayed target

즉, route 모델이 "URL 문자열 하나"만으로는 부족해질 수 있다.

### 4. Identity / Policy 확장

현재 policy는 주로 local unmanaged endpoint 기준이다.

결합 후에는 아래 기준이 추가돼야 한다.

- peer identity
- peer trust level
- advertised route source
- local-only / peer-visible / shared visibility

### 5. Health / Reconcile 확장

현재 reconcile loop는 local route / local L4 runner 중심이다.

결합 후에는 아래도 들어와야 한다.

- remote route freshness
- peer connectivity state
- tunnel health
- import된 route의 stale cleanup

## 구현 관점에서의 권장 분리

권장 구조:

1. `musu-port-core`
   - local route model
   - local discovery
   - local ingress
   - local persistence

2. `musu-connects`
   - peer mesh
   - route advertisement/import
   - remote transport

3. integration adapter
   - local route -> advertised route 변환
   - advertised route -> imported route 변환
   - policy/identity bridge

즉, `musu-port` 안에 mesh를 직접 우겨 넣기보다, adapter 계층으로 붙이는 쪽이 맞다.

## 현재 결론

- `musu-port`만으로는 로컬 ingress/control-plane
- `musu-connects`가 붙으면 cross-device ingress/network plane
- supervisor/warden까지 결합되면 process lifecycle까지 포함한 MUSU meta-OS control surface가 된다

다만 현재 standalone 재현 단계에서는 우선 `musu-port` 자체의 parity를 먼저 맞춘다.

그 다음 단계에서 `musu-connects` 통합 플랜을 별도 마스터 플랜으로 분리하는 것이 좋다.
