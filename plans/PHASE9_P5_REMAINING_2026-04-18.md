# MUSU Phase 9 — P5: 잔여 구현 완료

> 작성: 2026-04-18 | 상태: ACTIVE
> P4 (Security + WoL Auth) 완료 이후 남은 모든 작업

---

## 현황 요약

| 항목 | 상태 |
|------|------|
| musu-bee UI (A1~A4, B1~B3, G1~G2) | ✅ 완료 |
| Phase 5A/B/C (mesh routing) | ✅ 완료 |
| 5D-1 메시지 sync (sync_engine.py) | ✅ 구현 완료 — 검증 필요 |
| 5D-2 Company sync (sync_engine.py) | ✅ 구현 완료 — 검증 필요 |
| P4 security 전항목 | ✅ 완료 |
| musu-core pytest 231개 | ✅ pass |
| **H3: stale route eviction** | ❌ 미구현 |
| **pydantic max_items warning** | ❌ 미픽스 |
| **WoL E2E (bridge_token 확인)** | ❌ 미검증 |
| **sync_engine 기동 연결 확인** | ❌ 미확인 |
| **5D-3: 에이전트 ID 통일** | ❌ 미구현 |
| **musu-port cargo build** | ❌ H3 후 필요 |

---

## TASK-H3: server.rs stale route eviction

**파일**: `musu-port/crates/musu-port-core/src/server.rs`

**문제**: peer가 unreachable 되어도 `imported_routes`에서 제거 안 됨 → stale 데이터 노출.

**현재 코드 (line 294~344)**:
```rust
let is_ok = snapshot.status == "ok";
// ...
if is_ok {
    // advertised-routes 가져와서 imported_routes에 저장
}
// ← else 없음. peer 죽어도 imported_routes 그대로
```

**수정**:
```rust
if is_ok {
    // 기존 fetch 로직 그대로
} else {
    probe_state.imported_routes.write().await.remove(&url);
}
```

**위치**: `server.rs` line 344 — `}` (is_ok 블록 닫는 괄호) 바로 뒤에 else 추가

**검증**: `rtk cargo build -p musu-port-core` — exit 0

---

## TASK-PYDANTIC: max_items → max_length

**파일**: `musu-worker/src/musu_worker/main.py:229`

**현재**:
```python
args: list[str] = Field(default_factory=list, max_items=100)
```

**수정**:
```python
args: list[str] = Field(default_factory=list, max_length=100)
```

**검증**: `cd musu-worker && python3 -m pytest --tb=no -q` → 0 warnings (pydantic 경고 사라짐)

---

## TASK-WOL-E2E: bridge_token 컬럼 검증

**방법**: Supabase Management API로 nodes 테이블 조회

```bash
curl -s -X POST https://api.supabase.com/v1/projects/poyclapxmvulvboiebxq/database/query \
  -H "Authorization: Bearer sbp_17e09dee519f531792828842177d4cd43ca92507" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT id, node_name, bridge_token IS NOT NULL as has_token FROM nodes LIMIT 10;"}'
```

**기대**: `has_token = true` 인 row 존재 (bridge가 최소 1번 register 했다면)

---

## TASK-SYNC-VERIFY: sync_engine.py 기동 확인

**확인할 것**:
1. `musu-bridge/server.py`에서 `sync_engine` import 및 `asyncio` startup hook에 등록됐는지
2. `/api/sync/messages`, `/api/sync/companies` 엔드포인트 존재 확인

**파일**: `musu-bridge/server.py` — startup 부분 grep

---

## TASK-5D3: 에이전트 ID 통일

**문제**: 두 머신 모두 `ceo`, `cto` 등 동일 이름의 에이전트를 로컬에 가짐.
mesh_router는 `agent_assignments`에서 `agent_name → node_name` 매핑으로 라우팅.
현재 갭: 두 머신이 서로 다른 에이전트 ID(UUID)를 가짐 → 메시지 agent_id cross-reference 깨짐.

**해결**: nodes.toml에 `agent_assignments`로 홈 노드를 명시적으로 설정.
sync_engine이 message의 agent_id를 그대로 복제하므로 ID 통일 자체는 필요 없음.
대신 `canonical_agent_name`을 기준으로 cross-node lookup 함수 추가.

**구현**:
- `musu-bridge/mesh_router.py` — `canonical_name_for_agent(agent_id)` 함수 추가
- `musu-bridge/handlers.py` — `list_messages()` 응답에 `agent_name` 필드 포함 (이미 있으면 skip)
- 실제 DB UUID 통일은 필요 없음 (이름 기반 라우팅이 충분)

---

## 파일 경로 SSOT

| 파일 | Task |
|------|------|
| `musu-port/crates/musu-port-core/src/server.rs:344` | H3 stale eviction |
| `musu-worker/src/musu_worker/main.py:229` | pydantic fix |
| `musu-bridge/server.py` | sync_engine 기동 확인 |
| `musu-bridge/mesh_router.py` | 5D-3 canonical name |

---

## 실행 순서

```
[즉시] pydantic fix (1분)
[즉시] H3 stale eviction (5분)
[즉시] cargo build musu-port (10~15분)
[즉시] WoL E2E check (2분)
[즉시] sync_engine 기동 확인 (5분)
[즉시] 5D-3 canonical agent name (30분)
[완료] commit + push
```
