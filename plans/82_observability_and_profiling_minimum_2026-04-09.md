# Plan — Observability & Profiling Minimum (2026-04-09)

목표: MUSU “최적화”를 감이 아니라 숫자로 운영한다. 특히 `musu-worker`는 보조 프로그램이므로 **idle 비용**과 **폭주 상황**을 모두 관측 가능해야 한다.

---

## 1) What to measure (MVP)

- 요청 카운트/실패율/거절률(429)
- 실행 시간 분포(요청 단위)
- 출력 크기(캡에 걸린 비율)
- 동시 실행(active runs)
- 디스크 사용량(`~/.musu/*`)

---

## 2) Implementation (thin slice)

### Worker surface
- `GET /stats` (auth required)
  - active_runs, max_concurrent_runs, mode, output cap values
- (next) `GET /metrics` (Prometheus) or JSON logs 기반 집계

### Local scripts
- `musu_cleanup.py --json` 출력 저장 + daily timer 로그를 evidence로 활용

---

## 3) Verification commands

```bash
curl -sf http://127.0.0.1:9700/health
curl -sf http://127.0.0.1:9700/stats

./scripts/musu_cleanup.py --json | jq '.planned_delete_bytes_total'
```

---

## 4) Exit

- “지금 왜 느린지/왜 거절되는지/얼마나 자원을 쓰는지”를 1분 안에 설명 가능

