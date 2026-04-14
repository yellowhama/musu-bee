# Phase 5 후속 — 다음 단계

> 작성: 2026-04-14

---

## 즉시 해야 할 것 (원격 머신)

```bash
# 원격 머신 (100.121.211.106) 에서:
cd ~/musu-functions
git pull origin main

# musu-port 재빌드
cd musu-port && cargo build --release

# ~/.musu/nodes.toml 업데이트
# self = "main-pc" 로 수정
# 각 노드에 url 필드 추가:
#   second-pc → url = "http://100.126.67.88:8070"
#   main-pc   → url = "http://127.0.0.1:8070"

# musu-portd + musu-bridge 재시작
sudo systemctl restart musu-portd  # 또는 프로세스 kill & 재실행

# 검증
curl http://localhost:1355/advertised-routes | jq '.[].alias'
```

---

## Phase 5D — 상태 동기화 (P2, 다음 큰 작업)

**완료 기준**: A에서 만든 company가 B에서도 보임

### 5D-1: 메시지 히스토리 동기화
- musu-bridge GET /api/messages → 다른 노드에 복제
- SQLite WAL 기반 incremental sync
- 예상: 4h

### 5D-2: Company 레코드 동기화
- company layer last-write-wins
- 부팅 시 peers에서 company 목록 pull
- 예상: 3h

### 5D-3: 에이전트 ID 통일
- agent name을 canonical ID로 사용
- nodes.toml agent_assignments에 따라 home node 설정
- 예상: 2h

---

## High 이슈 잔존 픽스 (다음 세션)

```python
# mesh_router.py — except Exception → 구체적 예외로
except (httpx.ConnectError, httpx.TimeoutException) as exc:
    ...
except httpx.HTTPStatusError as exc:
    ...

# server.rs — stale imported_routes eviction
# 피어가 unreachable 되면 imported_routes에서 제거
if snapshot.status != "ok" {
    probe_state.imported_routes.write().await.remove(url);
}
```

---

## Phase 4C — musu-control MCP 24개 도구 검증 (보류 중)

Claude Code 재시작 후 확인 필요:
```
/mcp → musu-control 24개 도구 목록
mcp__musu-control__list_agents 호출 테스트
```

---

## musu-bee 배포 준비 (Phase 4E)

- Auth 온보딩: `NEXT_PUBLIC_AUTH_ENABLED=false` → `true`
- Paddle 크레덴셜 필요 (블로커)
- musu.pro Vercel 배포: env vars 설정 필요

---

## 점수 트래킹

| 날짜 | 점수 | 주요 달성 |
|------|------|-----------|
| 2026-04-07 | 40/100 | 기초 인프라 |
| 2026-04-12 | 67/100 | Phase 1-4: UI, company, MCP, WS |
| 2026-04-14 | 79/100 | Phase 5A/B/C: 자동 mesh 라우팅 |
| 목표 | 90/100 | Phase 5D (상태 동기화) + 배포 |
