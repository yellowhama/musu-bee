# Master Execution Packet — MUSU Lightweight Control Plane (2026-04-09)

목표: MUSU를 “무거운 일을 하는 본체”가 아니라 “가볍게 떠 있으면서 분배/감시/이어주는 운영층”으로 고정한다. 이 패킷은 **구현 실행이 아니라 CEO 위임용 계획 패킷**이다.

---

## 1) Current Truth

- `musu-worker` 보호장치 Wave 1~4는 이미 일부 올라가 있다.
  - 동시성 cap
  - systemd/cgroup guardrails
  - disk hygiene cleanup
  - `/stats` 기반 observability minimum
- 하지만 현재 갭은 남아 있다.
  - idle 상태 예산이 숫자로 고정되지 않았다.
  - 코어/워커/UI/진단 경계가 코드 구조 차원에서 충분히 강제되지 않았다.
  - polling/tick 기반 경로가 어디까지 남아 있는지 전수 inventory가 없다.
  - “증거/진단은 필요할 때만”이라는 원칙이 표준화되지 않았다.

즉, 다음 단계는 새 기능 추가가 아니라 **가벼운 control plane 규율을 문서/코드 구조/운영 기준으로 닫는 일**이다.

---

## 2) Product Rule To Lock

- MUSU core는 항상 떠 있지만 거의 자원을 먹지 않아야 한다.
- 무거운 일(LLM, 인덱싱, 변환, 대용량 실행, GPU 점유)은 core가 직접 하지 않는다.
- 기본 동작은 polling이 아니라 event/delta/wake-on-demand여야 한다.
- UI는 실시간처럼 보여도 내부는 샘플링/가시 영역 갱신으로 절제해야 한다.
- proof/evidence/audit는 상시 생성물이 아니라 on-demand artifact여야 한다.

---

## 3) Workstreams

### Wave 5 — Idle Budget & Heavy-Work Blacklist

detail plan:
- `/home/hugh51/musu-functions/plans/84_idle_budget_and_heavy_work_blacklist_2026-04-09.md`

목표:
- idle/normal/stress 자원 목표를 숫자로 고정한다.
- core에서 하면 안 되는 heavy-work blacklist를 명시한다.

### Wave 6 — Polling Inventory → Event-Driven Refresh

detail plan:
- `/home/hugh51/musu-functions/plans/85_event_driven_refresh_and_sampling_2026-04-09.md`

목표:
- tick/polling 경로를 inventory화하고, delta/event/sampling으로 전환할 우선순위를 고정한다.

### Wave 7 — Core/Worker/UI/Diagnostics Boundary Enforcement

detail plan:
- `/home/hugh51/musu-functions/plans/86_core_worker_ui_boundary_enforcement_2026-04-09.md`

목표:
- 코어/워커/UI/진단의 역할 경계를 명시하고, import/runtime/process 경계로 강제할 실행 계획을 만든다.

---

## 4) Delegation Model

이 패킷은 CEO가 직접 구현하는 문서가 아니다. 아래처럼 위임한다.

- `CTO`
  - boundary 설계 확정
  - polling inventory 우선순위 승인
  - acceptance gate 정의
- `Founding Engineer`
  - hot path inventory 작성
  - 구현 후보 코드 위치 수집
  - replay/metrics baseline 측정
- `QA Lead`
  - idle/normal/stress acceptance 체크리스트 작성
  - regressions 감시 기준 수립
- `Chief of Staff`
  - detail plan/issue/TODO 연결
  - unblock packet 형태로 evidence 요구사항 정리

---

## 5) Out of Scope

- 이번 패킷에서 새 runtime capability 구현
- Web GUI 기능 확장
- 새로운 인덱서/LLM/desktop 기능 추가
- worker 기능 확장

이번 패킷은 어디까지나 **가벼운 control plane 원칙을 실행 가능한 위임 패킷으로 자르는 것**까지다.

---

## 6) Required Evidence

각 wave는 아래 증거 없이 close하지 않는다.

- target modules/files 명시
- 현재 hot path / polling / heavy-work truth
- 제안 변경 후 검증 명령
- pass/fail gate
- “core가 가벼워졌는지”에 대한 수치 또는 구조 증명

---

## 7) Exit Criteria

- CEO가 이 3개 detail plan을 바로 각 owner에게 배분할 수 있다.
- `MASTER_PLAN.md`, `CURRENT_STATE.md`, `TODO_EXECUTION_BOARD.md`가 같은 truth를 말한다.
- 구현 전에 “무엇을 절대 코어에서 하지 말아야 하는지”가 명시된다.

---

## 8) Next Handoff

1. `84_idle_budget_and_heavy_work_blacklist_2026-04-09.md`
2. `85_event_driven_refresh_and_sampling_2026-04-09.md`
3. `86_core_worker_ui_boundary_enforcement_2026-04-09.md`
4. 이후 CEO가 Paperclip issue packet으로 분배
