# W-1 세부 플랜: 역방향 relay callback (보안 SAFE 설계)

> 마스터: `CONNECTION_COMPLETION_MASTER_PLAN_2026_06_20.md` §W-1.
> security-engineer Critic NO-GO → SAFE 설계로 재작성. HIGH-3 서버 검증 완료(아래).

## 문제
relay가 task 전달은 하나 결과 callback이 직접 HTTP만(`runner.rs:347-402`, 3회 재시도 후 포기). NAT/loopback sender는 결과 못 받음 → task 영구 pending. 왕복 절반.

## Critic NO-GO 사유 (전부 반영)
- **HIGH-1**: 같은 account 노드가 가짜 callback 위조 가능. account 토큰 공유라 per-node 신원 없음. status 게이트는 callback이 먼저(pending) 오면 무력. `receive_callback`이 `cb.node`가 실제 executor인지 안 봄.
- **HIGH-2**: 코어 추출 시 HTTP bearer 검증 사라짐, callback엔 executor 바인딩 없어 forwarded_task보다 약함.
- **HIGH-3 (검증완료)**: payload route(`app/api/v1/p2p/relay/payload/route.ts`, **musu-bee에 실재, VPS 별도 worker 아님**). 실측: payload_kind 검증 안 함(화이트리스트 없음 → callback kind 서버변경 불필요 ✅). lease는 `{source,target,session}` 매칭(`:119-126`) → **callback source/target swap이라 forward lease로 매칭 안 됨 → 역방향 lease 별도 필요**. source_node_id는 submitter 선언(`:158`) → 서버 binding 신뢰 불가, 클라 executor 검증이 유일 방어.

## SAFE 설계 (Critic 권고 + 사용자 결정: schema 추가)

### S-1. executor 바인딩 (HIGH-1 close, Const III — 사용자 승인됨)
- additive migration: `route_executions`에 nullable `forwarded_to_node TEXT` + `remote_task_id TEXT`.
- forward 시(`tasks.rs:339-409` Remote 성공 분기) `forwarded_to_node = report.response.node`, `remote_task_id = report.response.task_id` 저장.
- callback 적용 시(HTTP + drain 양쪽) status-gated UPDATE **전에** `cb.node == row.forwarded_to_node` (+ `remote_task_id` 일치) 검증. 불일치 → 거부+audit. **pending일 때 검증해야 first-callback 위조 방어.**

### S-2. 엄격 callback 바인딩 fn (HIGH-2 close)
- `callback_from_relay_payload` = `forwarded_task_from_relay_payload`(`forward.rs:191-252`)의 정확한 mirror: status=="claimed", target==self, claimed_by==self, kind=="task_callback_envelope", bytes/sha256, session/lease 일치, **AND payload.source_node_id == decoded.node(executor)**.
- 추출된 apply-core는 검증된 typed input만 받음. drain에서 이 게이트 없이 도달 불가.

### S-3. 역방향 lease (HIGH-3 close)
- `fire_callback` 시점에 **executor→sender 역방향 callback lease 별도 발급**. forward lease 재사용/서버 direction 완화 **금지**(보안 회귀).

### S-4. direct-first relay-fallback (MED-3)
- `fire_callback` 3회 직접 HTTP 유지(`runner.rs:374-401`), 소진 후에만(`:400`) relay envelope 큐잉. always-relay 아님(forgery 표면+비용).

### S-5. idempotency 보존 (MED-1)
- 코어 추출 시 terminal-no-op early return(`forward.rs:1084-1092`) + rows_affected dispatch 유지. SSE/evidence는 rows_affected>0만. redelivery 테스트.

### S-6. TaskSpec 위생 (MED-2)
- `TaskSpec`(`runner.rs:83`)에 session/target/source/lease 추가. non-Serialize, no Default 유지 → 3개 생성지점(`tasks.rs:318`, `forward.rs:596`, `run.rs`) 컴파일 강제. 없으면 relay no-op(callback_url-None early return mirror).

## 구현 순서 (drain 경로 무관 부분부터 — 검증 가능)
1. S-6 TaskSpec 필드 + 컴파일 강제 통과
2. S-1 migration + forward 시 executor 저장 (Const III 적용)
3. S-2 callback_from_relay_payload + receive_callback 코어 추출(in-process fn)
4. S-3 역방향 lease 발급
5. S-4 fire_callback relay fallback
6. drain kind 분기(`relay_payload.rs:604`)
7. 단위테스트: 위조 callback 거부(source≠executor), redelivery idempotent, 직접성공 시 relay 안 탐

## 검증
- cargo test (단위). 위조/redelivery 케이스 필수.
- W-4 2머신 E2E에서 실제 왕복(별도).
- Auditor가 명시 검증: HIGH-1(executor 바인딩이 pending UPDATE 전 체크), HIGH-2(drain이 게이트 우회 불가), HIGH-3(서버 lease-direction 완화 안 됨).

## Const III 게이트
`route_executions` additive migration(nullable 컬럼 2개) = schema 변경. 사용자 승인됨(2026-06-20 "schema 추가해서 제대로 막기"). apply 시 Const III 배너.
