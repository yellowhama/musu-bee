# Root Runtime Capability Model

## 목적

`musu-functions` 루트에서 공용 runtime capability로 가져야 할 기능을 고정한다.

이 capability는 `musu_corp`에서 먼저 검증된 supervisor/watchdog/worker/BitNet service를 제품 공용 기능으로 다시 읽은 것이다.

## 구성 요소

### 1. worker plane

- manager worker profile
- employee worker profile
- provider-backed worker
- low-cost local worker

### 2. worker routing

- queue family별 primary/fallback worker
- reasoning depth / cost / risk 기준 routing

### 3. resident services

- persistent BitNet employee service
- future resident manager services

### 4. runtime supervision

- watchdog
- supervisor
- bounded persistent loop
- stop conditions / retry budget

### 5. execution result surfaces

- worker result
- retryable / blocked / failed / success
- escalation coupling

## owner boundary

- root runtime capability가 process/service/worker execution을 가진다.
- `MUSU-WORKS`는 그 실행 결과가 연결되는 company domain truth를 가진다.
- control layer는 이 capability를 읽고 조종한다.

## first concrete cuts

1. worker profile/routing model
2. resident BitNet employee service
3. watchdog/supervisor policy
4. result/escalation coupling

## not in this capability

- actual board decisions
- actual approval ownership
- company/project/agent domain semantics

이건 `MUSU-WORKS`가 가진다.
