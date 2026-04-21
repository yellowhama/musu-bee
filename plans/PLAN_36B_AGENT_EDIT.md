# Phase 36B: Dashboard 에이전트 편집 UI 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** musu.pro 대시보드에서 에이전트의 role과 model을 인라인으로 편집할 수 있게 한다.

**Architecture:** musu-bridge에 `PATCH /api/agents/{id}` 추가 (백엔드 함수 이미 존재). vibecode-town의 catch-all proxy가 PATCH를 이미 통과시킴. AgentGrid에 인라인 편집 모드 추가.

**Tech Stack:** Python/FastAPI (musu-bridge), Next.js/React (vibecode-town), pytest

---

## 현재 코드 상태

- `musu-core/src/musu_core/agents.py:131` — `AgentRegistry.update()` 완성됨
- `musu-core/src/musu_core/backends/local.py:186` — `LocalBackend.update_agent()` 완성됨
- `musu-bridge/handlers.py:251` — `set_agent_status()` 패턴 참고
- `musu-bridge/server.py:677` — pause/resume 패턴 참고
- `vibecode-town/src/app/api/bridge/[...path]/route.ts` — PATCH 메서드 이미 proxy 통과함
- `vibecode-town/src/app/dashboard/AgentGrid.tsx:1` — 읽기 전용, CANONICAL_TEAM 6개 고정

---

## 파일 구조

| 파일 | 동작 |
|------|------|
| `musu-bridge/handlers.py` | `update_agent_fields(agent_id, role, model)` 추가 |
| `musu-bridge/server.py` | `PATCH /api/agents/{agent_id}` 엔드포인트 추가 |
| `musu-bridge/tests/test_agent_patch.py` | 신규 단위 테스트 |
| `vibecode-town/src/app/dashboard/AgentGrid.tsx` | 인라인 편집 UI 추가 |

---

### Task 1: handlers.py — update_agent_fields 추가

**Files:**
- Modify: `musu-bridge/handlers.py` — `set_agent_status` 함수 직후

- [ ] **Step 1: update_agent_fields 추가**

`set_agent_status` 함수(라인 254) 직후에 삽입:

```python
def update_agent_fields(
    agent_id: str,
    *,
    role: str | None = None,
    model: str | None = None,
) -> dict[str, Any] | None:
    """Update agent role and/or model. Returns updated agent dict or None if not found.

    `model` maps to adapter_config["model"] when adapter_type is claude/gemini/openai.
    For other adapter types the model field is stored as-is in adapter_config.
    """
    backend = _get_backend()
    existing = backend.get_agent(agent_id)
    if existing is None:
        return None

    kwargs: dict[str, Any] = {}
    if role is not None:
        kwargs["role"] = role

    if model is not None:
        # Merge model into existing adapter_config
        config = dict(existing.get("adapter_config") or {})
        config["model"] = model
        kwargs["adapter_config"] = config

    if not kwargs:
        return existing  # nothing to update

    return backend.update_agent(agent_id, **kwargs)
```

- [ ] **Step 2: import 확인**

```bash
rtk grep -n "^from\|^import\|dict\[str, Any\]" /home/hugh51/musu-functions/musu-bridge/handlers.py | head -10
```

`from typing import Any` 또는 `dict[str, Any]`가 이미 임포트되어 있는지 확인.
없으면 파일 상단에 추가.

---

### Task 2: server.py — PATCH /api/agents/{agent_id} 추가

**Files:**
- Modify: `musu-bridge/server.py` — `api_resume_agent` 함수(라인 692) 직후

- [ ] **Step 1: Request 모델 + 엔드포인트 추가**

```python
class AgentUpdateRequest(BaseModel):
    role: str | None = None
    model: str | None = None


@app.patch("/api/agents/{agent_id}", summary="Update agent role/model")
async def api_update_agent(agent_id: str, req: AgentUpdateRequest) -> dict:
    """Update mutable agent fields (role, model). Returns 404 if not found.
    Only role and model are mutable from the dashboard — status uses pause/resume endpoints.
    """
    if req.role is None and req.model is None:
        raise HTTPException(status_code=422, detail="At least one of role or model must be provided")
    result = update_agent_fields(agent_id, role=req.role, model=req.model)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return result
```

- [ ] **Step 2: import 확인**

`update_agent_fields`가 handlers.py에서 임포트되는지 확인:

```bash
rtk grep -n "from handlers import\|from .handlers import\|import handlers" /home/hugh51/musu-functions/musu-bridge/server.py | head -5
```

handlers.py에서 `*` 또는 명시적 임포트로 가져오고 있으면 OK.
아니면 `from handlers import update_agent_fields` 추가 필요.

---

### Task 3: 테스트 작성 + bridge 재시작으로 검증

**Files:**
- Create: `musu-bridge/tests/test_agent_patch.py`

- [ ] **Step 1: 테스트 작성**

```python
# musu-bridge/tests/test_agent_patch.py
"""Integration-style tests for PATCH /api/agents/{agent_id}."""
import pytest
from fastapi.testclient import TestClient

# server.py는 startup lifespan이 있어 TestClient 사용
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_patch_agent_role(tmp_path, monkeypatch):
    """PATCH updates role field."""
    monkeypatch.setenv("MUSU_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MUSU_BRIDGE_TOKEN", "test-token")

    from server import app
    with TestClient(app, raise_server_exceptions=True) as client:
        # Create agent first via internal handler
        from handlers import _get_backend
        backend = _get_backend()
        backend.initialize()
        backend.upsert_agent(
            agent_id="test-agent",
            name="Test",
            role="old role",
            adapter_type="claude",
            adapter_config={"model": "claude-3-5-sonnet-20241022"},
        )

        resp = client.patch(
            "/api/agents/test-agent",
            json={"role": "new role"},
            headers={"Authorization": "Bearer test-token"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["role"] == "new role"


def test_patch_agent_not_found(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSU_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MUSU_BRIDGE_TOKEN", "test-token")

    from server import app
    with TestClient(app) as client:
        resp = client.patch(
            "/api/agents/nonexistent",
            json={"role": "x"},
            headers={"Authorization": "Bearer test-token"},
        )
        assert resp.status_code == 404


def test_patch_agent_no_fields_422(tmp_path, monkeypatch):
    monkeypatch.setenv("MUSU_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("MUSU_BRIDGE_TOKEN", "test-token")

    from server import app
    with TestClient(app) as client:
        resp = client.patch(
            "/api/agents/any",
            json={},
            headers={"Authorization": "Bearer test-token"},
        )
        assert resp.status_code == 422
```

- [ ] **Step 2: curl로 수동 검증 (실제 bridge)**

```bash
BRIDGE_TOKEN=$(grep MUSU_BRIDGE_TOKEN ~/.musu/bridge.env | cut -d= -f2 | tr -d '"')
# 에이전트 목록 확인
curl -s http://localhost:8070/api/agents -H "Authorization: Bearer $BRIDGE_TOKEN" | python3 -m json.tool | head -30
```

```bash
# 첫 번째 에이전트 ID 추출 후 PATCH
AGENT_ID=$(curl -s http://localhost:8070/api/agents \
  -H "Authorization: Bearer $BRIDGE_TOKEN" | python3 -c "import json,sys; agents=json.load(sys.stdin); print(agents[0]['id'] if agents else '')")
echo "Agent ID: $AGENT_ID"

curl -s -X PATCH "http://localhost:8070/api/agents/$AGENT_ID" \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "Chief Executive Officer"}' | python3 -m json.tool
```

Expected: `{"id": "...", "role": "Chief Executive Officer", ...}`

- [ ] **Step 3: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-bridge/handlers.py musu-bridge/server.py
rtk git commit -m "feat(bridge): PATCH /api/agents/{id} — role and model update"
rtk git push
```

---

### Task 4: AgentGrid 인라인 편집 UI

**Files:**
- Modify: `vibecode-town/src/app/dashboard/AgentGrid.tsx`

**현재 구조**: CANONICAL_TEAM 6개를 statusMap으로 상태 표시. 카드당 name, role, status, model 표시.

- [ ] **Step 1: AgentGrid에 편집 상태 + PATCH 호출 추가**

전체 파일을 아래로 교체 (기존 읽기 전용 로직 보존 + 편집 레이어 추가):

```tsx
"use client";

import { useState } from "react";

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: "active" | "paused" | "error" | string;
  model?: string;
}

export const CANONICAL_TEAM_SIZE = 6;

const CANONICAL_TEAM: { id: string; label: string; role: string }[] = [
  { id: "ceo", label: "CEO", role: "Chief Executive Officer" },
  { id: "cto", label: "CTO", role: "Chief Technology Officer" },
  { id: "cos", label: "CoS", role: "Chief of Staff" },
  { id: "engineer", label: "Engineer", role: "Software Engineer" },
  { id: "qa", label: "QA", role: "Quality Assurance" },
  { id: "vp", label: "VP", role: "Vice President" },
];

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "qwen-9b",
  "qwen-14b",
];

const AGENT_DOT: Record<string, string> = {
  active: "#22c55e",
  paused: "rgba(253,252,240,0.2)",
  error: "#ff6b6b",
};

const STATUS_LABEL: Record<string, string> = {
  active: "active",
  paused: "idle",
  error: "error",
};

interface AgentGridProps {
  agents: Agent[];
  loading: boolean;
  error: string | null;
}

interface EditState {
  agentId: string;
  role: string;
  model: string;
  saving: boolean;
  error: string | null;
}

export function AgentGrid({ agents, loading, error }: AgentGridProps) {
  const [editing, setEditing] = useState<EditState | null>(null);

  const statusMap = new Map<string, { status: string; model?: string; id?: string }>();
  for (const a of agents) {
    const key = a.id?.toLowerCase() ?? a.name?.toLowerCase();
    if (!statusMap.has(key) || a.status === "active") {
      statusMap.set(key, { status: a.status, model: a.model, id: a.id });
    }
  }

  async function saveEdit(agentId: string) {
    if (!editing) return;
    setEditing({ ...editing, saving: true, error: null });
    try {
      const res = await fetch(`/api/bridge/agents/${encodeURIComponent(agentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editing.role || undefined,
          model: editing.model || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { detail?: string }).detail ?? `HTTP ${res.status}`;
        setEditing({ ...editing, saving: false, error: msg });
        return;
      }
      setEditing(null);
    } catch {
      setEditing({ ...editing, saving: false, error: "Network error" });
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "8px",
      }}
    >
      {CANONICAL_TEAM.map((member) => {
        const live = statusMap.get(member.id);
        const status = live?.status ?? "paused";
        const model = live?.model;
        const agentId = live?.id ?? member.id;
        const isEditing = editing?.agentId === member.id;

        return (
          <div
            key={member.id}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: isEditing
                ? "1px solid rgba(255,209,102,0.4)"
                : "1px solid rgba(255,255,255,0.06)",
              borderRadius: "10px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              position: "relative",
            }}
          >
            {/* Header row: dot + label */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: AGENT_DOT[status] ?? "rgba(253,252,240,0.2)",
                  flexShrink: 0,
                  animation:
                    status === "active"
                      ? "musu-status-pulse 1.5s ease-in-out infinite"
                      : undefined,
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#FDFCF0",
                  fontFamily: "var(--font-jetbrains), monospace",
                }}
              >
                {member.label}
              </span>
              {/* Edit button */}
              {!isEditing && (
                <button
                  onClick={() =>
                    setEditing({
                      agentId: member.id,
                      role: live?.model ? "" : member.role,
                      model: model ?? "",
                      saving: false,
                      error: null,
                    })
                  }
                  title="Edit"
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "rgba(253,252,240,0.25)",
                    cursor: "pointer",
                    fontSize: "11px",
                    padding: "0 2px",
                    lineHeight: 1,
                  }}
                >
                  ✏
                </button>
              )}
            </div>

            {/* Status label */}
            <span
              style={{
                fontSize: "10px",
                color: "rgba(253,252,240,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {STATUS_LABEL[status] ?? status}
            </span>

            {/* Model badge (view mode) */}
            {model && !isEditing && (
              <span
                style={{
                  fontSize: "10px",
                  color: "rgba(253,252,240,0.4)",
                  fontFamily: "var(--font-jetbrains), monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {model}
              </span>
            )}

            {/* Edit form */}
            {isEditing && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginTop: "4px",
                }}
              >
                <input
                  autoFocus
                  placeholder="Role"
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "5px",
                    color: "#FDFCF0",
                    fontSize: "11px",
                    padding: "4px 8px",
                    fontFamily: "inherit",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <select
                  value={editing.model}
                  onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                  style={{
                    background: "#2D1D19",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "5px",
                    color: "#FDFCF0",
                    fontSize: "11px",
                    padding: "4px 8px",
                    fontFamily: "var(--font-jetbrains), monospace",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer",
                  }}
                >
                  <option value="">— model —</option>
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                {editing.error && (
                  <span style={{ fontSize: "10px", color: "#ff6b6b" }}>
                    {editing.error}
                  </span>
                )}

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    disabled={editing.saving}
                    onClick={() => void saveEdit(agentId)}
                    style={{
                      flex: 1,
                      background: "rgba(255,209,102,0.1)",
                      border: "1px solid rgba(255,209,102,0.3)",
                      borderRadius: "5px",
                      color: "#FFD166",
                      fontSize: "11px",
                      fontWeight: 700,
                      cursor: editing.saving ? "wait" : "pointer",
                      padding: "4px 0",
                      fontFamily: "inherit",
                    }}
                  >
                    {editing.saving ? "…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "5px",
                      color: "rgba(253,252,240,0.5)",
                      fontSize: "11px",
                      cursor: "pointer",
                      padding: "4px 0",
                      fontFamily: "inherit",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading && !live && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(45,29,25,0.6)",
                  borderRadius: "10px",
                }}
              />
            )}
          </div>
        );
      })}

      {error && (
        <div
          style={{
            gridColumn: "1 / -1",
            fontSize: "11px",
            color: "#ff6b6b",
            padding: "8px 12px",
            background: "rgba(255,107,107,0.07)",
            borderRadius: "7px",
            border: "1px solid rgba(255,107,107,0.2)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
rtk tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음

- [ ] **Step 3: catch-all proxy가 PATCH 통과하는지 확인**

```bash
rtk grep -n "PATCH\|method\|allowedMethods" /mnt/f/Aisaak/Projects/vibecode-town/src/app/api/bridge/\[...path\]/route.ts | head -10
```

`export const PATCH = ...` 또는 `export const { GET, POST, PATCH, DELETE, PUT } = handler` 형태로 PATCH가 export 되어있는지 확인.
없으면 추가 필요.

- [ ] **Step 4: 커밋 + 푸시**

```bash
cd /mnt/f/Aisaak/Projects/vibecode-town
rtk git add src/app/dashboard/AgentGrid.tsx
rtk git commit -m "feat(dashboard): inline agent role/model edit in AgentGrid"
rtk git push origin main
```

---

### Task 5: 최종 E2E 검증

- [ ] **Step 1: Vercel 배포 대기 (1-2분)**

```bash
sleep 30
curl -s "https://musu.pro/api/bridge/agents" \
  -H "Authorization: Bearer test" \
  -w "\nHTTP:%{http_code}" 2>&1 | tail -3
```

- [ ] **Step 2: 로컬 bridge에서 PATCH 동작 확인**

```bash
BRIDGE_TOKEN=$(grep MUSU_BRIDGE_TOKEN ~/.musu/bridge.env | cut -d= -f2 | tr -d '"')
AGENT_ID=$(curl -s http://localhost:8070/api/agents \
  -H "Authorization: Bearer $BRIDGE_TOKEN" | python3 -c \
  "import json,sys; a=json.load(sys.stdin); print(a[0]['id'] if a else 'none')")

curl -s -X PATCH "http://localhost:8070/api/agents/$AGENT_ID" \
  -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"claude-sonnet-4-6\"}" | python3 -m json.tool
```

Expected: `{"id": "...", "role": "...", "adapter_config": {"model": "claude-sonnet-4-6"}, ...}`
