# Root Product Control Layer Model

## 목적

`musu-functions` 루트에서 가져야 할 제품 control layer의 최소 구조를 고정한다.

이 control layer는 `musu_corp`에서 먼저 도그푸딩된 control CLI와 운영 read/control surface를 제품 capability로 환원한 것이다.

## 구성 요소

### 1. status surface

- queue summary
- lane summary
- watchdog status
- supervisor status
- report summary

이유:

- 제품은 자기 runtime과 company runtime 상태를 빠르게 읽을 수 있어야 한다.

### 2. control actions

- scheduler tick
- executor tick
- watchdog ensure
- supervisor run
- approval decision trigger
- low-cost worker service ensure

이유:

- 제품 control layer는 단순 조회가 아니라 bounded control action을 제공해야 한다.

### 3. output surfaces

- CLI
- MCP tool family
- desktop self-control surface

이유:

- 같은 control layer를 다른 consumer가 공유해야 한다.

## owner boundary

- root product control layer가 명령 surface를 가진다.
- `MUSU-WORKS`는 domain object와 governance truth를 가진다.
- runtime infra는 root runtime capability가 가진다.

즉:

- control layer = 조종 표면
- works = 회사 도메인 truth
- runtime capability = 실제 실행/worker/service plane

## first concrete cuts

1. queue/lane/report read surface
2. watchdog/supervisor control surface
3. approval/review action handoff

## not in this layer

- actual queue data persistence
- actual worker spawn implementation
- actual governance storage

이건 각각 `MUSU-WORKS`와 runtime capability가 가진다.
