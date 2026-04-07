# Company Runtime Contract Shortlist

## 목적

`musu_corp`에서 도그푸딩된 회사 runtime 기능 중, `MUSU-WORKS`가 정식 owner가 되어야 할 contract object를 shortlist로 고정한다.

이 문서는 실제 코드 이동이 아니라 canonical contract ownership과 범위를 분명히 하는 단계다.

## shortlist

### 1. Queue Item

- 최소 필드:
  - `task_id`
  - `workspace`
  - `owner`
  - `queue`
  - `title`
  - `body`
  - `source`
  - `priority`
  - `retry_budget`
  - `handoff_payload`
- 이유:
  - 회사가 어떤 작업을 어떤 lane으로 보냈는지 나타내는 기본 단위다.

### 2. Lane State

- 최소 필드:
  - `lane_key`
  - `workspace`
  - `owner`
  - `status`
  - `last_task_id`
  - `last_result_status`
  - `last_result_reason`
  - `last_worker_result`
  - `updated_at`
- 이유:
  - 회사 runtime에서 owner/lane이 현재 어떤 상태인지 읽는 표면이다.

### 3. Worker Result

- 최소 필드:
  - `task_id`
  - `worker_type`
  - `status`
  - `reason`
  - `provider`
  - `auth_mode`
  - `artifacts`
  - `retryable`
  - `created_at`
- 이유:
  - infra 결과가 아니라, 회사가 다음 handoff를 판단하는 실행 evidence다.

### 4. Handoff Payload

- 최소 필드:
  - `handoff_type`
  - `from_owner`
  - `to_owner`
  - `trigger`
  - `context_refs`
  - `expected_output`
  - `review_required`
- 이유:
  - planning -> implementation -> verification -> governance로 이어지는 회사 handoff의 기본 contract다.

### 5. Governance Review Objects

- 범위:
  - approval item
  - escalation item
  - morning review packet
  - board decision entry
- 이유:
  - 이 네 개는 회사가 결과를 검토하고 결정하는 surface다.

---

## Governance Consumer Contracts

각 governance consumer의 실행 계약을 명시한다. 모든 entry는 implied가 아닌 contracted 상태여야 한다.

### G1. Blocker Escalation Path

| Field | Value |
|---|---|
| **Trigger** | `blockers.json` 내 blocker가 `open` 상태로 존재하고, lane owner가 스스로 해소할 수 없을 때 |
| **Owner** | 해당 lane owner (escalation 개시자) |
| **Escalation target** | 상위 role — lane owner → PM (Chief of Staff) → CTO → CEO 순서 |
| **Condition** | 동일 blocker가 1 heartbeat 이후에도 open 상태일 때 다음 role로 escalate |
| **Output** | `blockers.json`의 해당 item에 `escalated_to`, `escalated_at`, `escalation_reason` 기록 |
| **Destination** | `governance_reviews.json` → `escalations[]` 에 escalation record 추가; Paperclip issue comment로 blocker note 게시 |

### G2. Approval Consumer

| Field | Value |
|---|---|
| **Trigger** | lane 또는 worker action이 `approval_guarded` safety profile에 해당할 때 (deployment, destructive_command, new_external_mcp) |
| **Owner** | 해당 action을 요청하는 lane owner |
| **Lanes requiring approval** | `governance` lane 진입 시 approval_required=true인 handoff; `implementation` lane에서 destructive_command 실행 전 |
| **Output** | `governance_reviews.json` → `approvals[]` 에 approval request 추가 (task_id, action, lane, requestor, status=pending) |
| **Destination** | 승인 전까지 lane은 `waiting_approval` 상태로 hold; 승인 수신 시 `board_decisions[]` entry가 생성되어 execution으로 materialize |

### G3. Morning Review

| Field | Value |
|---|---|
| **Trigger** | 매 review 사이클 (daily) 또는 `governance` lane에서 `qa_report_ready` handoff가 수신될 때 |
| **Owner** | PM (Chief of Staff) |
| **Board-visible summary criteria** | (1) 전날 완료된 task 수 및 lane별 결과, (2) 현재 open blockers, (3) approval pending 항목, (4) governance lane 통과/실패 비율 |
| **Output** | `governance_reviews.json` → `morning_reviews[]` 에 review packet 추가 (date, completed_tasks, open_blockers, pending_approvals, lane_summary) |
| **Destination** | CEO/board에게 board-readable summary로 노출; Paperclip issue 또는 comment로 게시 |

### G4. Board Decision Consumer

| Field | Value |
|---|---|
| **Trigger** | board (human 또는 CEO agent)가 approval 또는 governance decision을 내릴 때 |
| **Owner** | 결정을 수신하는 lane owner (보통 governance lane) |
| **Input** | Paperclip approval API 응답 또는 board comment의 명시적 decision keyword |
| **Output** | `governance_reviews.json` → `board_decisions[]` 에 decision record 추가 (decision_id, type, outcome, decided_by, decided_at, target_task_id) |
| **Destination** | 해당 task의 lane 상태가 hold → resume으로 전환; `contract.json` approval_gates 상태 업데이트; 이후 handoff가 `planning` lane으로 재진입하여 다음 사이클 개시 |

## outside works ownership

아래는 `MUSU-WORKS`가 직접 owner가 아니다.

- BitNet resident process lifecycle
- Codex process spawn detail
- generic watchdog process supervision
- low-level worker process health probe

이들은 루트 runtime capability에서 관리하고, `MUSU-WORKS`는 결과 상태와 review surface를 소비한다.

## immediate next cut

1. 위 contract object를 mock/viewer/MCP surface와 어떻게 연결할지 정리한다.
2. `approval / escalation / morning review / board decision`의 read model shape를 더 구체화한다.
3. 이후 `MUSU-AS-MCP` consumer surface positioning과 연결한다.

## 완료 기준

- `MUSU-WORKS`가 어떤 runtime/govnernance object를 정식으로 소유하는지 명확하다.
- 루트 runtime capability와의 경계가 문서로 분리돼 있다.
- 다음 모듈 작업이 contract object 수준에서 이어질 수 있다.
