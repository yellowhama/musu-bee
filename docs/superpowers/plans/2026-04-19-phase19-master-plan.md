# Phase 19 Master Plan — 4-Track

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track A(MCP smoke test) + Track B(MUSU_TOKEN 활성화) + Track C(Workspace persist) + Track D(제품 피벗) 완료

**Architecture:** 4개 독립 트랙. A+B는 같은 세션에서 가능(작업량 적음). C는 musu-core → musu-bridge → musu-bee 수직 추가. D는 vibecode-town 랜딩 + 수동 E2E.

**Tech Stack:** Python/FastAPI (musu-bridge), TypeScript/Next.js (musu-bee, vibecode-town), SQLite (musu-core), Rust (musu-connects)

---

## 현재 상태

- musu-core: v9 migration, 76 bridge tests pass
- musu-bridge: 35 MCP 엔드포인트 완성, MUSU_TOKEN config 있음, `/api/admin/peer-status` 있음
- musu-control: 35 MCP tools (`@mcp.tool()` × 35)
- musu-bee: 5개 company 채널 패널 + SearchPanel 완성
- vibecode-town: node_tokens + nodes API + account 페이지 토큰 발급 UI 완성
- musu-connects: daemon + mDNS→SyncOrchestrator Phase 18에서 완성

---

## Track A — MCP 35도구 Smoke Test

> **목표:** musu-bridge 실행 상태에서 35개 엔드포인트 전수 호출 → non-5xx 확인

**실행 조건:** musu-bridge가 `http://localhost:8070`에서 실행 중이어야 함

### A-1: musu-bridge 실행 확인

- [ ] **Step 1: 브릿지 상태 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/health
```
Expected: `200`. 실패 시:
```bash
cd /home/hugh51/musu-functions/musu-bridge
MUSU_BRIDGE_TOKEN=dev-token uvicorn server:app --port 8070 &
sleep 2
```

- [ ] **Step 2: canonical company_id 확인**

```bash
COMPANY_ID=$(curl -s \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/companies \
  | python3 -c "import sys,json; data=json.load(sys.stdin); print(data[0]['id'] if data else '')")
echo "COMPANY_ID=$COMPANY_ID"
```
Expected: UUID 출력 (ex: `f27a9bd2-688a-450b-98b4-f63d24b0ab50`)

---

### A-2: Smoke Test 스크립트 작성 + 실행

**파일 생성:** `scripts/smoke_test_mcp_endpoints.py`

- [ ] **Step 3: 스크립트 작성**

```python
#!/usr/bin/env python3
"""Smoke test: call all 35 musu-bridge MCP-mapped endpoints, report pass/fail."""
import os, sys, json, asyncio
import httpx

BASE = os.getenv("MUSU_BRIDGE_URL", "http://localhost:8070")
TOKEN = os.getenv("MUSU_BRIDGE_TOKEN", "dev-token")
COMPANY_ID = os.getenv("PAPERCLIP_COMPANY_ID", "f27a9bd2-688a-450b-98b4-f63d24b0ab50")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# Each tuple: (method, path, body_or_None)
# Placeholders {cid} are replaced with COMPANY_ID at runtime
ENDPOINTS = [
    # Agent group (6)
    ("GET",   "/api/companies/{cid}/agents",       None),
    ("GET",   "/api/agents/nonexistent-id",        None),  # expect 404, not 5xx
    ("POST",  "/api/agents/nonexistent-id/pause",  None),  # expect 404
    ("POST",  "/api/agents/nonexistent-id/resume", None),  # expect 404
    ("GET",   "/api/companies/{cid}/org-chart",    None),
    ("POST",  "/api/agents/nonexistent-id/heartbeat", None),  # expect 404
    # Issue group (5)
    ("GET",   "/api/companies/{cid}/issues",       None),
    ("POST",  "/api/companies/{cid}/issues",
              {"title": "smoke-test-issue", "description": "auto"}),
    ("GET",   "/api/issues/nonexistent-id",        None),  # 404
    ("PATCH", "/api/issues/nonexistent-id",        {"status": "in_progress"}),  # 404
    ("POST",  "/api/issues/nonexistent-id/checkout", {"agent_id": "smoke"}),  # 404
    # Comment group (2)
    ("GET",   "/api/issues/nonexistent-id/comments", None),  # 404
    ("POST",  "/api/issues/nonexistent-id/comments",
              {"author_id": "smoke", "body": "test"}),  # 404
    # Approval group (2)
    ("GET",   "/api/companies/{cid}/approvals",    None),
    ("POST",  "/api/approvals/nonexistent-id/approve", None),  # 404
    # Project group (3)
    ("GET",   "/api/companies/{cid}/projects",     None),
    ("GET",   "/api/projects/nonexistent-id",      None),  # 404
    ("POST",  "/api/companies/{cid}/projects",
              {"project_name": "smoke-proj"}),
    # Goal group (2)
    ("GET",   "/api/companies/{cid}/goals",        None),
    ("POST",  "/api/companies/{cid}/goals",        {"title": "smoke-goal"}),
    # Cost group (2)
    ("GET",   "/api/companies/{cid}/costs/summary",    None),
    ("GET",   "/api/companies/{cid}/costs/by-agent",   None),
    # Activity (1)
    ("GET",   "/api/companies/{cid}/activity",     None),
    # Watchdog / runs (2)
    ("GET",   "/api/companies/{cid}/runs",         None),
    ("GET",   "/api/runs/nonexistent-id",          None),  # 404
    # Tasks (2)
    ("GET",   "/api/companies/{cid}/tasks",        None),
    ("GET",   "/api/tasks/nonexistent-id",         None),  # 404
    # Delegation (1)
    ("POST",  "/api/companies/{cid}/tasks",
              {"title": "smoke-task", "assigned_to": "smoke-agent"}),
    # Dashboard (1)
    ("GET",   "/api/companies/{cid}/dashboard",    None),
    # Peer / admin (3)
    ("GET",   "/api/admin/peer-status",            None),
    ("GET",   "/api/admin/discovered",             None),
    ("GET",   "/api/nodes",                        None),
    # Index search (1)
    ("GET",   "/api/index-search?q=test",          None),
    # Company CRUD (2)
    ("GET",   "/api/companies",                    None),
    ("GET",   f"/api/companies/{COMPANY_ID}",      None),
]

async def run():
    passed, failed = 0, []
    async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
        for method, path, body in ENDPOINTS:
            url = BASE + path.replace("{cid}", COMPANY_ID)
            try:
                if method == "GET":
                    r = await client.get(url)
                elif method == "POST":
                    r = await client.post(url, json=body or {})
                elif method == "PATCH":
                    r = await client.patch(url, json=body or {})
                else:
                    r = await client.request(method, url, json=body)
                ok = r.status_code < 500
                if ok:
                    passed += 1
                    print(f"  ✅ {method:6} {path[:60]:<60} → {r.status_code}")
                else:
                    failed.append((method, path, r.status_code, r.text[:120]))
                    print(f"  ❌ {method:6} {path[:60]:<60} → {r.status_code}")
            except Exception as e:
                failed.append((method, path, "ERR", str(e)))
                print(f"  💥 {method:6} {path[:60]:<60} → {e}")

    print(f"\n{'='*60}")
    print(f"RESULT: {passed}/{len(ENDPOINTS)} passed")
    if failed:
        print("\nFAILED:")
        for m, p, code, body in failed:
            print(f"  {m} {p} → {code}: {body}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
```

- [ ] **Step 4: httpx 의존성 확인 + 스크립트 실행**

```bash
cd /home/hugh51/musu-functions/musu-bridge
source .venv/bin/activate
pip show httpx > /dev/null 2>&1 || pip install httpx
MUSU_BRIDGE_TOKEN=$MUSU_BRIDGE_TOKEN \
PAPERCLIP_COMPANY_ID=$PAPERCLIP_COMPANY_ID \
python3 /home/hugh51/musu-functions/scripts/smoke_test_mcp_endpoints.py
```
Expected: `RESULT: 35/35 passed` (404는 통과, 5xx만 실패)

- [ ] **Step 5: 실패 항목 처리**

실패한 엔드포인트가 있으면:
- 5xx: musu-bridge/server.py에서 해당 핸들러 확인 → 즉시 픽스
- 404가 예상됐는데 5xx: 예외 처리 누락 → try/except 추가
- `missing endpoint` (404 expected 아닌 경우): 핸들러 자체 누락 → handlers.py 확인

- [ ] **Step 6: 스크립트 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add scripts/smoke_test_mcp_endpoints.py
rtk git commit -m "test(track-a): MCP 35-endpoint smoke test script"
```

---

## Track B — MUSU_TOKEN 활성화 + peer-status 실동작

> **목표:** 두 노드 모두 musu.pro 클라우드 레지스트리에 등록, `/api/admin/peer-status`에서 `cloud_registry_enabled: true` + 상대 노드 보임

**사전 조건:** musu.pro (vibecode-town)가 Vercel에 배포되어 있어야 함

### B-1: musu.pro 노드 API 배포 확인

- [ ] **Step 1: nodes API 라이브 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer invalid-token" \
  https://musu.pro/api/v1/nodes
```
Expected: `401` (API가 살아있고 토큰 검증 중)
`404`가 나오면 → vibecode-town 배포 상태 확인 필요

- [ ] **Step 2: nodes register API 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"node_name":"test","public_url":"http://test.example"}' \
  https://musu.pro/api/v1/nodes/register
```
Expected: `401`

---

### B-2: 토큰 발급 + musu-bridge 설정

- [ ] **Step 3: musu.pro/account에서 토큰 발급 (수동)**

브라우저에서 `https://musu.pro/account` → "Node Tokens" 섹션 → "Generate Token" 클릭
토큰 전체값 복사 (한 번만 표시됨)

- [ ] **Step 4: musu-bridge .env.local에 MUSU_TOKEN 추가**

```bash
# /home/hugh51/musu-functions/musu-bridge/.env.local 에 추가
echo "MUSU_TOKEN=<복사한_토큰>" >> /home/hugh51/musu-functions/musu-bridge/.env.local
echo "MUSU_NODE_NAME=hugh-dev-1" >> /home/hugh51/musu-functions/musu-bridge/.env.local
```
`.env.local`은 `.gitignore`에 있으므로 커밋 안 됨 ✅

- [ ] **Step 5: musu-bridge 재시작 + 하트비트 로그 확인**

```bash
# 기존 프로세스 종료 후 재시작
pkill -f "uvicorn server:app" 2>/dev/null; sleep 1
cd /home/hugh51/musu-functions/musu-bridge
source .venv/bin/activate
MUSU_BRIDGE_TOKEN=$MUSU_BRIDGE_TOKEN uvicorn server:app --port 8070 &
sleep 3
```
로그에서 확인:
```
INFO:     registry: heartbeat task started for node='hugh-dev-1'
INFO:     registry: peer discovery task started
```

- [ ] **Step 6: peer-status 엔드포인트 확인**

```bash
curl -s \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/admin/peer-status | python3 -m json.tool
```
Expected:
```json
{
  "cloud_registry_enabled": true,
  "node_name": "hugh-dev-1",
  "public_url": "http://...",
  "peer_count": 0,
  "peers": []
}
```

---

### B-3: 원격 노드 등록 + 상호 발견

- [ ] **Step 7: 원격 노드(hugh-main-1, 100.121.211.106)에 동일 설정**

```bash
ssh 100.121.211.106 "
  echo 'MUSU_TOKEN=<같은_토큰>' >> ~/musu-functions/musu-bridge/.env.local
  echo 'MUSU_NODE_NAME=hugh-main-1' >> ~/musu-functions/musu-bridge/.env.local
  pkill -f 'uvicorn server:app'; sleep 1
  cd ~/musu-functions/musu-bridge
  source .venv/bin/activate
  MUSU_BRIDGE_TOKEN=\$MUSU_BRIDGE_TOKEN nohup uvicorn server:app --port 8070 &
"
```

- [ ] **Step 8: 30초 대기 후 peer 확인**

```bash
sleep 35
curl -s \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/admin/peer-status | python3 -m json.tool
```
Expected: `"peer_count": 1` + peers 배열에 `hugh-main-1` 표시

---

## Track C — Plan 232 Workspace Registry Followthrough

> **목표:** company 선택이 musu-bridge에 persist되어 다른 클라이언트에서도 동일한 active company 조회 가능

### C-1: musu-core v10 migration — kvstore 테이블

**파일 수정:** `musu-core/src/musu_core/migrations.py`

- [ ] **Step 1: 실패 테스트 작성**

`musu-core/tests/test_kvstore.py` 신규:
```python
"""Tests for kvstore backend methods."""
import pytest
from musu_core.backends.local import LocalBackend

@pytest.fixture
def backend(tmp_path):
    b = LocalBackend(str(tmp_path / "test.db"))
    return b

def test_set_and_get_kv(backend):
    backend.set_kv("active_company_id", "company-001")
    assert backend.get_kv("active_company_id") == "company-001"

def test_get_kv_missing_returns_none(backend):
    assert backend.get_kv("nonexistent_key") is None

def test_set_kv_overwrites(backend):
    backend.set_kv("active_company_id", "company-001")
    backend.set_kv("active_company_id", "company-002")
    assert backend.get_kv("active_company_id") == "company-002"
```

- [ ] **Step 2: 실패 확인**

```bash
cd /home/hugh51/musu-functions/musu-core
source .venv/bin/activate 2>/dev/null || true
PYTHONPATH=src python -m pytest tests/test_kvstore.py -v 2>&1 | tail -10
```
Expected: `AttributeError: 'LocalBackend' object has no attribute 'set_kv'`

- [ ] **Step 3: v10 migration 추가**

`musu-core/src/musu_core/migrations.py` — 파일 끝 `_MIGRATIONS` 리스트 바로 위에 추가:
```python
def _v10_up(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS kvstore (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )"""
    )

def _v10_down(conn: sqlite3.Connection) -> None:  # noqa: ARG001
    pass  # non-destructive rollback

```
그리고 `_MIGRATIONS` 리스트에:
```python
("v10_kvstore", _v10_up, _v10_down),
```

- [ ] **Step 4: LocalBackend에 get_kv / set_kv 추가**

`musu-core/src/musu_core/backends/local.py` — 파일 끝 `__del__` 메서드 앞에 추가:
```python
# ── KV store ────────────────────────────────────────────────────────

def get_kv(self, key: str) -> str | None:
    row = self._db.execute(
        "SELECT value FROM kvstore WHERE key = ?", (key,)
    ).fetchone()
    return row["value"] if row else None

def set_kv(self, key: str, value: str) -> None:
    self._db.execute(
        """INSERT INTO kvstore (key, value)
           VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        """,
        (key, value),
    )
    self._db.commit()
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd /home/hugh51/musu-functions/musu-core
PYTHONPATH=src python -m pytest tests/test_kvstore.py -v 2>&1 | tail -10
```
Expected: `3 passed`

- [ ] **Step 6: 전체 musu-core 테스트 확인**

```bash
PYTHONPATH=src python -m pytest tests/ -q 2>&1 | tail -5
```
Expected: `79+ passed, 0 failed`

- [ ] **Step 7: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-core/src/musu_core/migrations.py \
            musu-core/src/musu_core/backends/local.py \
            musu-core/tests/test_kvstore.py
rtk git commit -m "feat(musu-core): v10 kvstore migration + get_kv/set_kv"
```

---

### C-2: musu-bridge workspace 엔드포인트

**파일 수정:** `musu-bridge/server.py`, `musu-bridge/handlers.py`

- [ ] **Step 8: 실패 테스트 작성**

`musu-bridge/tests/test_workspace.py` 신규:
```python
"""Tests for GET/PUT /api/workspace endpoint."""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))
from server import app

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


def test_get_workspace_returns_empty_when_unset():
    with patch("server.get_kv_record", return_value=None):
        resp = client.get("/api/workspace")
    assert resp.status_code == 200
    assert resp.json() == {"active_company_id": None}


def test_put_workspace_sets_active_company():
    with patch("server.set_kv_record") as mock_set, \
         patch("server.get_kv_record", return_value="company-001"):
        resp = client.put(
            "/api/workspace",
            json={"active_company_id": "company-001"},
        )
    assert resp.status_code == 200
    assert resp.json()["active_company_id"] == "company-001"
    mock_set.assert_called_once_with("active_company_id", "company-001")


def test_put_workspace_rejects_empty_string():
    resp = client.put("/api/workspace", json={"active_company_id": ""})
    assert resp.status_code == 422
```

- [ ] **Step 9: 실패 확인**

```bash
cd /home/hugh51/musu-functions/musu-bridge
MUSU_BRIDGE_TOKEN=test-token python -m pytest tests/test_workspace.py -v 2>&1 | tail -10
```
Expected: `ImportError` 또는 `404`

- [ ] **Step 10: handlers.py에 get_kv_record / set_kv_record 추가**

`musu-bridge/handlers.py` — 파일 끝에 추가:
```python
# ── KV store wrappers ────────────────────────────────────────────

def get_kv_record(key: str) -> str | None:
    return _backend().get_kv(key)

def set_kv_record(key: str, value: str) -> None:
    _backend().set_kv(key, value)
```

- [ ] **Step 11: server.py에 workspace 엔드포인트 추가**

`musu-bridge/server.py` — company 엔드포인트 블록 끝 (line ~580 근방) 뒤에 추가:
```python
# ── Workspace ────────────────────────────────────────────────────────────────

class WorkspaceUpdateRequest(BaseModel):
    active_company_id: str = Field(..., min_length=1)


@app.get("/api/workspace", summary="Get workspace state")
def api_get_workspace() -> dict:
    """Return current workspace state (active_company_id)."""
    from handlers import get_kv_record
    val = get_kv_record("active_company_id")
    return {"active_company_id": val}


@app.put("/api/workspace", summary="Update workspace state")
def api_put_workspace(body: WorkspaceUpdateRequest) -> dict:
    """Persist active company selection."""
    from handlers import set_kv_record, get_kv_record
    set_kv_record("active_company_id", body.active_company_id)
    return {"active_company_id": get_kv_record("active_company_id")}
```

- [ ] **Step 12: 테스트 통과 확인**

```bash
cd /home/hugh51/musu-functions/musu-bridge
MUSU_BRIDGE_TOKEN=test-token python -m pytest tests/test_workspace.py tests/test_agent_control.py -q 2>&1 | tail -5
```
Expected: `81+ passed`

- [ ] **Step 13: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-bridge/handlers.py musu-bridge/server.py \
            musu-bridge/tests/test_workspace.py
rtk git commit -m "feat(musu-bridge): GET/PUT /api/workspace for active_company persistence"
```

---

### C-3: musu-bee — company 선택 시 workspace PUT 호출

**파일 수정:** `musu-bee/src/lib/useCompanyState.ts`

- [ ] **Step 14: handleSelectActiveCompany에 workspace PUT 추가**

`musu-bee/src/lib/useCompanyState.ts` — `handleSelectActiveCompany` 콜백 (line ~206) 수정:

현재:
```typescript
const handleSelectActiveCompany = useCallback(
  async (companyId: string) => {
    const res = await fetch(`/api/company-activation?${companyScopeQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", companyId }),
    });
```

추가 (PATCH 호출 성공 후, `setCompanyActivation` 호출 직전):
```typescript
    if (res.ok) {
      // Persist to musu-bridge so remote clients see same active company
      void fetch("/api/bridge/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_company_id: companyId }),
      }).catch(() => {/* bridge unavailable is non-fatal */});
    }
```

- [ ] **Step 15: TypeScript 빌드 확인**

```bash
cd /home/hugh51/musu-functions/musu-bee
npx tsc --noEmit 2>&1 | head -20
```
Expected: 에러 없음

- [ ] **Step 16: 수동 E2E 확인**

1. musu-bee dev 서버 실행: `npm run dev`
2. 브라우저 열고 Company 패널에서 company 선택
3. 확인:
```bash
curl -s \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/workspace | python3 -m json.tool
```
Expected: `{"active_company_id": "<선택한_company_id>"}`

- [ ] **Step 17: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-bee/src/lib/useCompanyState.ts
rtk git commit -m "feat(musu-bee): persist active company to musu-bridge workspace on select"
```

---

## Track D — 제품 피벗

> **목표:** musu.pro Hero를 "자동화 머니메이커" 타겟으로 재작성 + 핵심 E2E 플로우(로컬 mDNS) 확인

**중요:** 카피 작성 전 반드시 브랜딩 파일 읽기 (절대 규칙)

### D-1: 브랜딩 파일 읽기 (필수)

- [ ] **Step 1: 브랜딩 SSOT 읽기**

```bash
cat /mnt/f/Aisaak/Projects/vibecode-blog/branding/voice.md
cat /mnt/f/Aisaak/Projects/vibecode-blog/branding/examples.md
cat /mnt/f/Aisaak/Projects/vibecode-blog/branding/platforms.md
```

읽기 전에 카피 한 줄도 쓰지 말 것.

---

### D-2: musu.pro Hero 카피 재작성

**파일 수정:** `/mnt/f/Aisaak/Projects/vibecode-town/src/app/page.tsx`

- [ ] **Step 2: 현재 Hero 구조 파악**

```bash
grep -n "AI proposes\|MUSU enforces\|hero\|Hero\|headline\|subhead\|CTA\|painTags\|hubCards" \
  /mnt/f/Aisaak/Projects/vibecode-town/src/app/page.tsx | head -30
```

- [ ] **Step 3: 카피 방향 결정 (유저 승인 필요)**

카피 시안 3개를 대화로 제시하고 유저 승인 후 구현.
방향: "컴퓨터 N대, 화면 1개" — 기술 용어(HMAC, QUIC, STRIDE) 없음, 결과 중심

**시안 A:**
```
헤드라인: 컴퓨터 10대, 화면 1개.
서브: 지금 기기마다 들어가서 하나씩 확인하고 있지? MUSU 켜면 전부 보임.
CTA: 무료로 시작하기
```

**시안 B:**
```
헤드라인: 자동화 멈췄는지 지금 확인하러 들어갔지?
서브: 로그인 → 탭 열고 → 다음 기기 → 또 로그인. MUSU는 전부 한 화면에 있어.
CTA: 지금 설치하기
```

**시안 C:**
```
헤드라인: 어젯밤 자동화, 전부 살아있어?
서브: MUSU가 켜져 있으면 알아. 기기 몇 대든.
CTA: 무료로 시작하기
```

→ **유저 승인 후에만 Step 4 진행**

- [ ] **Step 4: page.tsx Hero 섹션 수정 (승인된 시안으로)**

수정 대상:
- `painTags` 배열: 바이브 코더 스택 제거 → 자동화 머니메이커 페인 포인트
- `hubCards` 배열: 기술 설명 → 결과 중심 언어
- Hero headline/subhead JSX 수정
- `trustBadges`: HMAC/STRIDE 배지 제거 또는 하위 배치

- [ ] **Step 5: 빌드 확인**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
npm run build 2>&1 | tail -15
```
Expected: `✓ Compiled successfully`

- [ ] **Step 6: 유저에게 미리보기 확인 요청 후 커밋**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
git add src/app/page.tsx
git commit -m "feat(landing): hero 카피 피벗 — 자동화 머니메이커 타겟"
```

---

### D-3: 핵심 E2E 플로우 확인 (로컬 mDNS)

> "노트북에서 musu-bee 열면 → 데스크탑이 노드 목록에 보이고 → 프로세스 관리 가능한가?"

- [ ] **Step 7: 로컬 musu-bridge 실행 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/health
```

- [ ] **Step 8: musu-connectsd daemon 실행 (mDNS 모드)**

```bash
cd /home/hugh51/musu-functions/musu-connects
cargo run --bin musu-connectsd -- daemon --mdns \
  --bridge-url http://localhost:8070 2>&1 &
sleep 3
echo "daemon started"
```

- [ ] **Step 9: 원격 노드에도 daemon 실행**

```bash
ssh 100.121.211.106 "
  cd ~/musu-functions/musu-connects
  nohup cargo run --bin musu-connectsd -- daemon --mdns \
    --bridge-url http://localhost:8070 2>&1 &
  echo 'remote daemon started'
"
```

- [ ] **Step 10: NodePanel에서 노드 표시 확인**

```bash
curl -s \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/nodes | python3 -m json.tool
```
Expected: 2개 노드 (로컬 + hugh-main-1)

musu-bee에서: `http://localhost:3001` 접속 → Devices 탭 → 노드 2개 표시 확인

- [ ] **Step 11: 프로세스 관리 E2E 확인**

musu-bee NodePanel에서 원격 노드 클릭 → 프로세스 목록 확인
(현재 ProcessesPanel이 구현되어 있으므로 companyId propagation으로 확인)

- [ ] **Step 12: 결과 문서화**

```bash
cat >> /home/hugh51/musu-functions/plans/E2E_FLOW_RESULT_2026-04-19.md << 'EOF'
# E2E Flow Test Result

Date: 2026-04-19
Nodes: [로컬 노드명] + hugh-main-1

| 단계 | 결과 | 비고 |
|------|------|------|
| 노드 발견 (mDNS) | ✅/❌ | |
| musu-bee NodePanel 노드 표시 | ✅/❌ | |
| 원격 프로세스 목록 조회 | ✅/❌ | |
| 프로세스 시작/중지 | ✅/❌ | |
EOF
```

---

## 실행 순서 (권장)

```
세션 1: Track A + Track B (smoke test + MUSU_TOKEN 설정, 합쳐서 ~2-3h)
세션 2: Track C (workspace persist, ~3h)
세션 3: Track D (제품 피벗, 카피 승인 포함 ~4h)
```

Track B Step 7 (원격 노드 설정)은 Track D Step 9 (원격 daemon)와 같은 세션에 묶으면 SSH 2회 접속 절약.

---

## 관련 파일

| 파일 | Track | 용도 |
|------|-------|------|
| `scripts/smoke_test_mcp_endpoints.py` | A | 신규 smoke test 스크립트 |
| `musu-bridge/.env.local` | B | MUSU_TOKEN, MUSU_NODE_NAME (비추적) |
| `musu-core/src/musu_core/migrations.py` | C | v10 kvstore migration |
| `musu-core/src/musu_core/backends/local.py` | C | get_kv / set_kv |
| `musu-core/tests/test_kvstore.py` | C | 신규 |
| `musu-bridge/handlers.py` | C | get_kv_record / set_kv_record |
| `musu-bridge/server.py` | C | GET/PUT /api/workspace |
| `musu-bridge/tests/test_workspace.py` | C | 신규 |
| `musu-bee/src/lib/useCompanyState.ts` | C | workspace PUT 추가 |
| `vibecode-town/src/app/page.tsx` | D | Hero 카피 재작성 |
| `plans/E2E_FLOW_RESULT_2026-04-19.md` | D | E2E 결과 기록 |
