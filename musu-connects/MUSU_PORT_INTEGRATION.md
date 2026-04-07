# `musu-connects` x `musu-port` Contract Notes

## 목적

이 문서는 `musu-connects`와 `musu-port` 사이의 canonical integration 메모다.

## 핵심 정리

- `musu-port`는 로컬 ingress/control-plane
- `musu-connects`는 peer 간 secure transport/network plane
- supervisor/warden은 process lifecycle / sandbox 계층

## 필요한 계약면

### 1. Route Advertisement

`musu-port -> musu-connects`

- alias
- protocol
- entrypoint
- target kind
- visibility
- health snapshot

### 2. Route Import

`musu-connects -> musu-port`

- remote peer route import
- source 구분
- alias collision 처리
- remote freshness 상태

### 3. Policy Extension

- peer identity
- trust level
- local-only / peer-visible / shared scope
- remote route audit

### 4. Health And Reconcile

- peer connectivity
- imported route stale cleanup
- advertised route freshness
- tunnel/session health

## 현재 결론

`musu-port` parity가 먼저고, 그 뒤 `musu-connects` integration execution으로 넘어간다.

## 현재 고정된 contract 방향

- local managed route는 `musu-port`가 소유한다.
- advertised route는 `musu-connects`가 source/peer/share/freshness 필드를 붙여 만든다.
- imported route는 local registry에 합쳐지기 전 별도 import 상태를 가진다.
- local route alias가 imported route alias보다 우선한다.

## adapter entry list 초안

### 1. export adapter

`musu-port -> musu-connects`

책임:

- local managed route 읽기
- advertised route payload 생성
- local route health를 advertisement freshness로 변환

### 2. import adapter

`musu-connects -> musu-port`

책임:

- imported route registry 제공
- local alias registry와 충돌 검사
- imported route를 local service surface에 투영

### 3. policy bridge

책임:

- peer trust level 반영
- visibility/share scope 필터 적용
- blocked peer route suppress

### 4. stale cleanup handoff

책임:

- stale imported route 감지
- withdraw/cleanup 이벤트 전달
- local registry 제거 타이밍 통제

## integration order 초안

1. export adapter
2. import adapter
3. policy bridge
4. stale cleanup handoff

## failure mode 초안

- peer disconnected
  - imported route를 `degraded` 후 `withdrawn` 처리
- alias conflict
  - imported route는 `suppressed`
- freshness timeout
  - imported route는 `stale`
- trust downgrade
  - 해당 peer route advertisement/import를 중지

## backport-later boundary

지금 즉시 하지 않는 것:

- 실제 transport session coding
- peer crypto stack 확정
- supervisor/warden lifecycle integration
- Windows/WSL bilingual adapter 세부 구현
