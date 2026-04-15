# TASK-2D: MUSU-WORKS backport — musu-core company layer

> 작성: 2026-04-14 | 우선순위: P2 | 예상: 6h
> 참조: MASTER_BACKLOG_2026-04-14.md

---

## 목적

musu-core LocalBackend에 "회사" 개념이 없음.
에이전트가 어느 회사를 위해 일하는지 모름.
Company OS 완성에 필요한 4개 테이블 추가.

---

## 변경 파일

| 파일 | 작업 |
|------|------|
| `musu-core/src/musu_core/db.py` | 4개 테이블 CREATE TABLE IF NOT EXISTS 추가 |
| `musu-core/src/musu_core/migrations.py` | v4_company_layer 마이그레이션 추가 |
| `musu-core/src/musu_core/backends/local.py` | company CRUD 메서드 추가 |
| `musu-bridge/server.py` | GET/POST /api/companies 엔드포인트 추가 |

---

## 1. db.py — 4개 테이블 스키마

`_SCHEMA` 끝부분 (fallback_metrics 이후)에 추가:

```sql
CREATE TABLE IF NOT EXISTS companies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    template_key    TEXT NOT NULL DEFAULT 'default',
    workspace_id    TEXT NOT NULL DEFAULT '',
    meta            TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_role_templates (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    instructions    TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_project_index (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'archived')),
    assigned_to     TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_approvals_queue (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by    TEXT NOT NULL DEFAULT '',
    reason          TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_role_templates_company ON company_role_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_project_index_company ON company_project_index(company_id);
CREATE INDEX IF NOT EXISTS idx_approvals_company ON company_approvals_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON company_approvals_queue(status);
```

---

## 2. migrations.py — v4_company_layer

기존 DB에도 이 테이블들을 추가하기 위한 마이그레이션.
테이블 존재 여부로 idempotent 처리:

```python
def _v4_up(conn: sqlite3.Connection) -> None:
    """Add company layer tables: companies, role_templates, project_index, approvals_queue."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS companies (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            template_key TEXT NOT NULL DEFAULT 'default',
            workspace_id TEXT NOT NULL DEFAULT '',
            meta        TEXT NOT NULL DEFAULT '{}',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS company_role_templates (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            role        TEXT NOT NULL,
            instructions TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS company_project_index (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            project_name TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'archived')),
            assigned_to TEXT REFERENCES agents(id) ON DELETE SET NULL,
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS company_approvals_queue (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            status      TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
            requested_by TEXT NOT NULL DEFAULT '',
            reason      TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_role_templates_company ON company_role_templates(company_id);
        CREATE INDEX IF NOT EXISTS idx_project_index_company ON company_project_index(company_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_company ON company_approvals_queue(company_id);
        CREATE INDEX IF NOT EXISTS idx_approvals_status ON company_approvals_queue(status);
    """)


def _v4_down(conn: sqlite3.Connection) -> None:
    """Drop company layer tables."""
    conn.executescript("""
        DROP TABLE IF EXISTS company_approvals_queue;
        DROP TABLE IF EXISTS company_project_index;
        DROP TABLE IF EXISTS company_role_templates;
        DROP TABLE IF EXISTS companies;
    """)
```

MIGRATIONS 리스트에 추가:
```python
("v4_company_layer", _v4_up, _v4_down),
```

---

## 3. local.py — company CRUD 메서드

LocalBackend 클래스에 추가:

```python
# --- Company helpers ---

def create_company(self, name: str, template_key: str = "default", workspace_id: str = "", meta: dict | None = None) -> dict[str, Any]:
    company_id = str(uuid.uuid4())
    meta_json = json.dumps(meta or {})
    self._db.execute(
        "INSERT INTO companies (id, name, template_key, workspace_id, meta) VALUES (?, ?, ?, ?, ?)",
        (company_id, name, template_key, workspace_id, meta_json),
    )
    row = self._db.execute("SELECT * FROM companies WHERE id = ?", (company_id,))
    return dict(row[0])


def list_companies(self, workspace_id: str | None = None) -> list[dict[str, Any]]:
    if workspace_id:
        rows = self._db.execute("SELECT * FROM companies WHERE workspace_id = ? ORDER BY created_at DESC", (workspace_id,))
    else:
        rows = self._db.execute("SELECT * FROM companies ORDER BY created_at DESC")
    return [dict(r) for r in rows]


def get_company(self, company_id: str) -> dict[str, Any] | None:
    rows = self._db.execute("SELECT * FROM companies WHERE id = ?", (company_id,))
    return dict(rows[0]) if rows else None


def update_company(self, company_id: str, **kwargs: Any) -> dict[str, Any] | None:
    allowed = {"name", "template_key", "workspace_id", "meta"}
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    if not updates:
        return self.get_company(company_id)
    if "meta" in updates and isinstance(updates["meta"], dict):
        updates["meta"] = json.dumps(updates["meta"])
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    set_clause += ", updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
    self._db.execute(
        f"UPDATE companies SET {set_clause} WHERE id = ?",
        (*updates.values(), company_id),
    )
    return self.get_company(company_id)


def delete_company(self, company_id: str) -> bool:
    rows = self._db.execute("DELETE FROM companies WHERE id = ? RETURNING id", (company_id,))
    return len(rows) > 0
```

---

## 4. musu-bridge/server.py — /api/companies 엔드포인트

```python
from pydantic import BaseModel

class CompanyCreateRequest(BaseModel):
    name: str
    template_key: str = "default"
    workspace_id: str = ""
    meta: dict = {}

@app.get("/api/companies", summary="List companies")
async def list_companies(workspace_id: str | None = None) -> list[dict]:
    return backend.list_companies(workspace_id=workspace_id)

@app.post("/api/companies", summary="Create a company")
async def create_company(req: CompanyCreateRequest) -> dict:
    return backend.create_company(
        name=req.name,
        template_key=req.template_key,
        workspace_id=req.workspace_id,
        meta=req.meta,
    )

@app.get("/api/companies/{company_id}", summary="Get a company")
async def get_company(company_id: str) -> dict:
    company = backend.get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company

@app.delete("/api/companies/{company_id}", summary="Delete a company")
async def delete_company(company_id: str) -> dict:
    ok = backend.delete_company(company_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"deleted": company_id}
```

musu-bridge/server.py에 backend 인스턴스 접근 방법 확인 후 작성.
현재 `backend = LocalBackend(cfg.db_path)` 형태로 초기화되어 있음.

---

## 검증

```bash
# musu-bridge 재시작 후
curl localhost:8070/api/companies
# → []

curl -X POST localhost:8070/api/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Corp", "workspace_id": "ws-001"}'
# → {"id": "...", "name": "Test Corp", ...}

curl localhost:8070/api/companies?workspace_id=ws-001
# → [{"id": "...", "name": "Test Corp", ...}]

# musu-core pytest 전체 pass
cd musu-core && python -m pytest tests/ -v
```

---

## 제외 범위

- company_role_templates CRUD API (musu-bee UI 미사용)
- company_project_index CRUD API (musu-bee UI 미사용)
- company_approvals_queue CRUD API (musu-bee UI 미사용)
- 위 3개는 테이블만 추가, API는 companies 기본 4개(list/create/get/delete)만
