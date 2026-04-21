# Phase 36A: route_executions Purge 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `route_executions` 테이블의 오래된 failed/done 레코드를 자동 삭제하여 OOM 재발을 방지한다.

**Architecture:** `LocalBackend`에 `purge_old_executions(days=30)` 추가. server.py startup에서 1회 호출. days=30 기준으로 failed/done 레코드 삭제.

**Tech Stack:** Python, SQLite (musu-core), FastAPI (musu-bridge), pytest

---

## 파일 구조

| 파일 | 동작 |
|------|------|
| `musu-core/src/musu_core/backends/local.py` | `purge_old_executions(days)` 추가 (라인 515 직후) |
| `musu-bridge/server.py` | startup에서 `backend.purge_old_executions(30)` 호출 (라인 310 직후) |
| `musu-core/tests/test_purge.py` | purge 함수 단위 테스트 |

---

### Task 1: purge 함수 테스트 작성

**Files:**
- Create: `musu-core/tests/test_purge.py`

- [ ] **Step 1: 테스트 파일 생성**

```python
# musu-core/tests/test_purge.py
import sqlite3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../src"))

from musu_core.backends.local import LocalBackend


def _make_backend(tmp_path) -> LocalBackend:
    """Helper: fresh backend with in-memory DB seeded to tmp path."""
    db_path = str(tmp_path / "test.db")
    b = LocalBackend(db_path=db_path)
    b.initialize()
    return b


def test_purge_removes_old_failed(tmp_path):
    b = _make_backend(tmp_path)
    db = b._db

    # Insert old failed record (62 days ago)
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('old-1', 'test', 'user', 'hi', 'failed', 3,"
        " datetime('now', '-62 days'))"
    )
    # Insert recent failed record (5 days ago)
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('new-1', 'test', 'user', 'hi', 'failed', 3,"
        " datetime('now', '-5 days'))"
    )
    # Insert old done record (62 days ago)
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('done-1', 'test', 'user', 'hi', 'done', 0,"
        " datetime('now', '-62 days'))"
    )
    # Insert running record — must NOT be deleted
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('run-1', 'test', 'user', 'hi', 'running', 0,"
        " datetime('now', '-62 days'))"
    )

    deleted = b.purge_old_executions(days=30)

    assert deleted == 2, f"Expected 2 deleted, got {deleted}"
    rows = db.execute("SELECT id FROM route_executions ORDER BY id")
    ids = [r["id"] for r in rows]
    assert "old-1" not in ids
    assert "done-1" not in ids
    assert "new-1" in ids   # recent — kept
    assert "run-1" in ids   # running — kept


def test_purge_returns_zero_when_nothing_to_delete(tmp_path):
    b = _make_backend(tmp_path)
    deleted = b.purge_old_executions(days=30)
    assert deleted == 0


def test_purge_respects_days_param(tmp_path):
    b = _make_backend(tmp_path)
    db = b._db
    db.execute(
        "INSERT INTO route_executions (id, channel, sender_id, input, status, retry_count, created_at)"
        " VALUES ('r1', 'c', 'u', 'x', 'failed', 3, datetime('now', '-10 days'))"
    )
    # days=30: 10 days ago is recent → not deleted
    assert b.purge_old_executions(days=30) == 0
    # days=7: 10 days ago is old → deleted
    assert b.purge_old_executions(days=7) == 1
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

```bash
cd /home/hugh51/musu-functions/musu-core
rtk python -m pytest tests/test_purge.py -v 2>&1 | head -30
```

Expected: `AttributeError: 'LocalBackend' object has no attribute 'purge_old_executions'`

---

### Task 2: purge 함수 구현

**Files:**
- Modify: `musu-core/src/musu_core/backends/local.py:515`

- [ ] **Step 1: purge_old_executions 함수 추가**

`fail_stale_route_executions` 함수 직후(라인 516)에 삽입:

```python
def purge_old_executions(self, days: int = 30) -> int:
    """Delete failed/done route_executions older than `days` days.

    Only removes records with status in ('failed', 'done') — never
    touches pending/running records to avoid disrupting active tasks.
    Returns the number of rows deleted.
    """
    rows = self._db.execute(
        "DELETE FROM route_executions"
        " WHERE status IN ('failed', 'done')"
        " AND created_at < datetime('now', ? || ' days')"
        " RETURNING id",
        (f"-{days}",),
    )
    return len(rows)
```

- [ ] **Step 2: 테스트 실행 (통과 확인)**

```bash
cd /home/hugh51/musu-functions/musu-core
rtk python -m pytest tests/test_purge.py -v 2>&1
```

Expected: `3 passed`

- [ ] **Step 3: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-core/src/musu_core/backends/local.py musu-core/tests/test_purge.py
rtk git commit -m "feat(core): add purge_old_executions to LocalBackend"
```

---

### Task 3: server.py startup에서 purge 호출

**Files:**
- Modify: `musu-bridge/server.py` — startup lifespan 함수 내 fail_stale_route_executions 호출 직후

- [ ] **Step 1: 현재 startup purge 위치 확인**

```bash
rtk grep -n "fail_stale_route_executions\|durability\|pending route" /home/hugh51/musu-functions/musu-bridge/server.py | head -10
```

- [ ] **Step 2: purge 호출 추가**

`server.py` 라인 319 (`backend.fail_stale_route_executions(max_retries=3)`) 직후에 추가:

```python
# Purge old failed/done executions (keep last 30 days)
purged = backend.purge_old_executions(days=30)
if purged:
    logger.info("startup: purged %d old route_execution(s) (>30 days)", purged)
```

- [ ] **Step 3: bridge 재시작 + 로그 확인**

```bash
systemctl --user restart musu-bridge && sleep 5
rtk journalctl --user -u musu-bridge --since "now" -f --no-pager 2>&1 | head -20
```

Expected: `INFO __main__: startup: purged 15619 old route_execution(s) (>30 days)`

- [ ] **Step 4: DB 확인**

```bash
sqlite3 ~/.musu/musu.db "SELECT status, COUNT(*) FROM route_executions GROUP BY status;"
```

Expected: `done|N` (failed 레코드 사라짐)

- [ ] **Step 5: 커밋**

```bash
cd /home/hugh51/musu-functions
rtk git add musu-bridge/server.py
rtk git commit -m "feat(bridge): purge old route_executions on startup (30d retention)"
```

---

### Task 4: 푸시 + 검증

- [ ] **Step 1: 푸시**

```bash
cd /home/hugh51/musu-functions
rtk git push
```

- [ ] **Step 2: 최종 DB 상태 확인**

```bash
sqlite3 ~/.musu/musu.db "SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM route_executions;"
```

Expected: 레코드 수 대폭 감소, created_at 범위가 최근 30일 이내
