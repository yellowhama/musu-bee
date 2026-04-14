# Phase 11 — 인간 편의성 + AI 오케스트레이터 편의성
> 작성: 2026-04-15 | 목표: 두 컴퓨터 운영의 마찰 제거

---

## 현황 평가 (Phase 10 완료 후)

| 항목 | 점수 | 문제 |
|------|------|------|
| 인간 편의성 | 6/10 | nodes.toml 수동 편집, httpx 런타임 누락 |
| AI 오케스트레이터 | 4/10 | 동기 HTTP (300s 블로킹), 전체 응답 반환 (토큰 낭비) |

---

## Phase 11A — 인간 편의성

### 11A-1: httpx 런타임 의존성 수정
**문제**: `httpx`가 `[project.optional-dependencies].dev`에만 있음
→ `pip install musu-bridge` 후 `handlers.py`, `mesh_router.py`에서 ImportError

**해결**: `musu-bridge/pyproject.toml`의 `[project.dependencies]`에 `httpx>=0.27` 추가

### 11A-2: `musu-bridge init` CLI
**문제**: 새 머신에서 `~/.musu/nodes.toml`을 직접 편집해야 함
→ `self` 이름 설정, URL 확인이 오류 유발

**해결**: `python -m musu_bridge init` 명령어
```bash
$ python -m musu_bridge init
# 또는 seed 동시에
$ python -m musu_bridge init --seed
```

**동작**:
1. `~/.musu/nodes.toml` 생성 (이미 있으면 `[mesh] self` 만 업데이트)
2. `node_name` = `MUSU_NODE_NAME` env 또는 hostname
3. `public_url` = `MUSU_BRIDGE_PUBLIC_URL` env 또는 `http://{tailscale_ip}:8070`
4. `--seed` 플래그 → `seed_agents.py` 로직 실행 (6 에이전트 시딩)

**생성되는 nodes.toml 예시**:
```toml
[mesh]
self = "hugh-main-1"
public_url = "http://100.121.211.106:8070"

# Add remote nodes below:
# [[mesh.nodes]]
# name = "other-node"
# url = "http://100.x.x.x:8070"
```

---

## Phase 11B — AI 오케스트레이터 편의성

### 11B-1: 비동기 태스크 위임 엔드포인트

**문제**: `POST /api/route`는 동기 → 에이전트 응답까지 최대 300초 블로킹
→ 오케스트레이터가 한 번에 하나만 위임 가능, 토큰 낭비

**해결**:
```
POST /api/tasks/delegate   → 즉시 { task_id } 반환, 백그라운드 실행
GET  /api/tasks/{task_id}  → { status, summary, output, error, created_at }
```

- `route_executions` 테이블 재사용 (이미 있음)
- `summary` = output 앞 500자 + 구조화 추출 (DONE/FAILED 한 줄 요약)
- 오케스트레이터: submit multiple → poll when needed

**사용 패턴**:
```python
# 1. 제출 (즉시 반환)
res = await post("/api/tasks/delegate", {"channel": "engineer", "sender_id": "ceo", "text": "..."})
task_id = res["task_id"]

# 2. 폴링 (필요할 때만)
status = await get(f"/api/tasks/{task_id}")
if status["status"] == "done":
    summary = status["summary"]  # 500자 이하
```

### 11B-2: MCP delegate_task 도구

**문제**: musu-control에 `delegate_task` 도구 없음 → 오케스트레이터가 직접 HTTP 호출 필요

**해결**: 두 MCP 도구 추가
```python
@mcp.tool()
async def delegate_task(channel: str, instruction: str, sender_id: str = "orchestrator") -> str:
    """Submit a task to an agent asynchronously. Returns task_id immediately."""

@mcp.tool()
async def get_task_status(task_id: str) -> str:
    """Poll task status. Returns {status, summary} — not full output."""
```

### 11B-3: 응답 요약 레이어

**summary 생성 규칙**:
1. `output`이 None → `"(no output)"`
2. `output` ≤ 500자 → 그대로
3. `output` > 500자 → 첫 500자 + `\n...[truncated, {N} chars total]`
4. `output`이 JSON → 핵심 키만 추출 (`result`, `status`, `message`, `error`)

---

## 구현 파일 요약

| 파일 | 변경 | Phase |
|------|------|-------|
| `musu-bridge/pyproject.toml` | httpx → main deps | 11A-1 |
| `musu-bridge/cli.py` | init CLI (새 파일) | 11A-2 |
| `musu-bridge/pyproject.toml` | cli.py wheel include + __main__ | 11A-2 |
| `musu-core/.../local.py` | `get_route_execution()` 추가 | 11B-1 |
| `musu-bridge/server.py` | `/api/tasks/delegate`, `/api/tasks/{id}` | 11B-1,3 |
| `musu-control/.../server.py` | `delegate_task`, `get_task_status` tools | 11B-2 |

---

## 검증 방법

```bash
# 11A-1: httpx dep
pip install -e musu-bridge/  # httpx 설치되는지 확인

# 11A-2: init CLI
cd musu-bridge && python -m musu_bridge init
cat ~/.musu/nodes.toml  # self 섹션 확인

# 11B-1: async delegation
curl -X POST localhost:8070/api/tasks/delegate \
  -H "Content-Type: application/json" \
  -d '{"channel":"engineer","sender_id":"ceo","text":"ping"}'
# → {"task_id": "..."}

curl localhost:8070/api/tasks/{task_id}
# → {"status":"done","summary":"...","output":"..."}

# 11B-2: MCP tool (Claude Code에서)
# delegate_task("engineer", "ping test")
# get_task_status("task-id-from-above")
```
