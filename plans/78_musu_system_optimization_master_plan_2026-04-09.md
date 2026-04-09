# Master Plan — MUSU System Optimization & Safety Guardrails (2026-04-09)

요청: “MUSU 돌리다가 컴터 터지는 거 아니냐? 최적화/가드레일을 마스터 플랜 + 세부 플랜으로 문서화하고, 실제 구현을 TODO로 끝까지.”

---

## 0) Current State (as-is)

### Where the real risk is
- `musu-worker`는 의도적으로 원격 프로세스 실행(`/execute/process`)을 제공한다 → **RCE + 리소스 폭주**가 핵심 리스크.
- `musu-bridge`는 rate limit/guard가 비교적 강한 편(웹 API 범위가 제한적).
- `musu-indexer`는 세션 정리/timeout 등 “장기 실행 안정화”가 이미 어느 정도 있음.

### Guardrails already present
- Timeouts:
  - `musu-worker`: `/execute/process` 기본 600s, max 7200s
  - `musu-worker`: `/execute/cli` 기본 300s, max 3600s
- Rate limiting:
  - `musu-worker`: token/IP 기반 rate limit 존재(OPEN MODE에서도 IP 기준 적용)
- Output caps:
  - `musu-worker`: stdout/stderr 메모리 캡(기본 2MB, env로 조절)

---

## 1) Optimization Strategy (what “최적화” means here)

최적화 = “빠르게 만들기”보다 “**폭주/장기행/실수**로 시스템이 죽지 않게”가 1순위.

### A. Safety first (must)
- 동시 실행 상한(동시에 여러 커맨드가 들어와도 프로세스 폭증 방지)
- 큐잉/거절 정책(블로킹 vs 즉시 거절)
- 디스크/로그/아티팩트 정리 정책(무한 증식 방지)

### B. Predictability (should)
- 기본값이 안전(보수적)하고, 고급 사용자가 env로 확장 가능
- 리소스 사용(대략적) 지표 제공(현재 실행중인 작업 수, 최근 실패율 등)

### C. Performance (nice-to-have)
- 캐시/증분 빌드(작업 유형별)
- 장기 실행 작업은 분리된 워커/큐로 격리

---

## 2) Waves (execution order)

### Wave 1 — Worker Concurrency Cap (1일)
- `musu-worker`에 동시 실행 cap 도입:
  - `/execute/process`와 `/execute/cli` 공통 적용
  - 정책: 기본은 “즉시 거절(429/503)” + 옵션으로 “대기”

### Wave 2 — Systemd/cgroup guardrails (1~2일)
- 리소스 제한을 운영 레이어에서 강제:
  - `MemoryMax`, `CPUQuota`, `TasksMax`
  - 재시작 정책/로그 로테이션
- detail plan: `plans/80_systemd_cgroup_guardrails_detail_2026-04-09.md`

### Wave 3 — Disk hygiene (1일)
- `~/.musu/logs`, `~/.musu/run`, 아티팩트 폴더의 TTL/크기 상한
- “cleanup” 커맨드 추가(주기 실행 가능)
- detail plan: `plans/81_disk_hygiene_cleanup_detail_2026-04-09.md`

### Wave 4 — Observability & “safe defaults” docs (1일)
- 운영 체크리스트/문제해결(runbook) 문서화
- 최소한의 “현재 실행중 작업 수” 같은 상태 노출

---

## 3) CEO Decisions (1~2개만 고르면 됨)

1) 기본 정책: 동시성 cap 도달 시 **즉시 거절**(추천) vs **대기(큐잉)**.
2) Pro/외부 노출은 항상 `MUSU_WORKER_TOKEN` 필수로 강제할지(추천: YES).

---

## 4) Exit Criteria

- “실수로 커맨드 폭주”를 해도 프로세스 수/메모리 폭주로 OS가 죽지 않는다.
- 기본값이 보수적이고, 고급 사용자는 env로 확장할 수 있다.
- 어떤 값이 안전한지 문서/체크리스트가 있다.
