# Detail Plan — `musu-worker` Concurrency Cap (2026-04-09)

목표: `musu-worker`에서 동시에 여러 요청이 들어와도 **프로세스 폭증으로 CPU/RAM이 죽지 않게** 상한/정책을 추가한다.

---

## 1) UX / Behavior

### Endpoints
- 적용 대상:
  - `POST /execute/process`
  - `POST /execute/cli`

### Policy
- 기본값: “즉시 거절”
  - cap 초과 시 `429`(또는 `503`) 반환 + 메시지에 현재 cap/정책 포함
- 옵션: “대기(큐잉)”
  - env로 대기 허용, 일정 시간 이상 대기하면 `429/503`

---

## 2) Configuration (env; repo-hardcode 금지)

- `MUSU_WORKER_MAX_CONCURRENT_RUNS` (default: `2`)
- `MUSU_WORKER_CONCURRENCY_MODE` (default: `reject`) values:
  - `reject` / `wait`
- `MUSU_WORKER_CONCURRENCY_WAIT_TIMEOUT_SEC` (default: `2`)

---

## 3) Implementation Sketch

- App-level `asyncio.Semaphore(max_concurrent)`
- FastAPI dependency로 acquire/release를 감싸고, handler는 기존 로직 재사용
- 거절/대기 정책은 dependency에서 처리

---

## 4) Verification

로컬에서:
- cap=1로 띄운 뒤, 긴 작업 1개 + 즉시 2번째 작업 요청 → 2번째가 `reject`면 429/503

원격(mesh)에서:
- 동일 패턴으로 2노드에 각각 cap 적용 확인

