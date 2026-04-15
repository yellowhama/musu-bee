# Phase 5 후속 — 다음 단계

> 작성: 2026-04-14 | 최종 업데이트: 2026-04-14 (세션 종료)

---

## 현재 상태 (세션 종료 기준)

| 항목 | 상태 |
|------|------|
| Phase 5A — musu-bridge MeshRouter | ✅ 완료 + 커밋 |
| Phase 5B — musu-port advertised-routes | ✅ 완료 + 커밋 |
| Phase 5C — musu-core inter-node forwarding | ✅ 완료 + 커밋 |
| 코드 감사 (C1/C2 픽스) | ✅ 완료 + 커밋 |
| git push origin main | ✅ 완료 (`1aad1c45`) |
| Rust 빌드 검증 | ✅ exit 0 |
| 인덱서 | ✅ exit 0 |
| **점수** | **79/100** |

---

## P0 — 원격 머신 재배포 (다음 세션 시작 시 즉시)

원격 머신 (`100.121.211.106`) 에서 실행:

```bash
cd ~/musu-functions
git pull origin main

# musu-port 재빌드 (5B 변경사항 포함)
cd musu-port && cargo build --release

# ~/.musu/nodes.toml 업데이트 (아직 안 됐으면)
# self = "main-pc" 로 수정
# 각 노드에 url 필드 추가:
#   second-pc → url = "http://100.126.67.88:8070"
#   main-pc   → url = "http://127.0.0.1:8070"

# 서비스 재시작
sudo systemctl restart musu-portd
sudo systemctl restart musu-bridge  # 또는 프로세스 kill & 재실행

# 검증
curl http://localhost:1355/advertised-routes | jq '.[].alias'
curl http://localhost:1355/mesh-routes | jq '{local_count:(.local|length)}'
```

---

## P1 — High 이슈 잔존 픽스

코드 감사에서 발견, 즉각 위협 없음이지만 다음 세션에 처리:

### H1 — mesh_router.py 예외 좁히기

`musu-bridge/mesh_router.py` 의 `except Exception` → 구체적 예외로:

```python
except (httpx.ConnectError, httpx.TimeoutException) as exc:
    logger.warning("mesh forward failed: %s", exc)
    raise
except httpx.HTTPStatusError as exc:
    logger.warning("mesh forward HTTP error: %s", exc)
    raise
```

### H3 — server.rs stale route eviction

`musu-port/crates/musu-port-core/src/server.rs` 피어 프로빙 루프에서:

```rust
// 피어가 unreachable 되면 imported_routes에서 제거
if snapshot.status != "ok" {
    probe_state.imported_routes.write().await.remove(&url);
}
```

---

## P1 — musu-control MCP 24개 도구 검증 (Phase 4C, 계속 보류)

Claude Code 재시작 후:

```
/mcp → musu-control 24개 도구 목록 확인
mcp__musu-control__list_agents 호출 테스트
mcp__musu-control__list_tasks 호출 테스트
```

---

## P2 — Phase 5D 상태 동기화

**완료 기준**: A에서 만든 company가 B에서도 보임

### 5D-1: 메시지 히스토리 동기화
- musu-bridge `GET /api/messages` → 다른 노드에 복제
- SQLite WAL 기반 incremental sync
- 예상: 4h

### 5D-2: Company 레코드 동기화
- company layer last-write-wins
- 부팅 시 peers에서 company 목록 pull
- 예상: 3h

### 5D-3: 에이전트 ID 통일
- agent name을 canonical ID로 사용
- nodes.toml `agent_assignments`에 따라 home node 설정
- 예상: 2h

---

## P3 — musu-bee 배포 준비 (Phase 4E, 블로커 있음)

- Auth 온보딩: `NEXT_PUBLIC_AUTH_ENABLED=false` → `true`
- **블로커**: Paddle 크레덴셜 미수령
- musu.pro Vercel 배포: env vars 설정 필요 (`MUSU_BRIDGE_URL`, `MUSU_BRIDGE_TOKEN`)

---

## 점수 트래킹

| 날짜 | 점수 | 주요 달성 |
|------|------|-----------|
| 2026-04-07 | 40/100 | 기초 인프라 |
| 2026-04-12 | 67/100 | Phase 1-4: UI, company, MCP, WS |
| 2026-04-14 | 79/100 | Phase 5A/B/C: 자동 mesh 라우팅 + 감사 픽스 |
| 목표 | 90/100 | 원격 재배포 + 5D 상태 동기화 |
