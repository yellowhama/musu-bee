# Phase 1 — TOCTOU race + lock wiring (2026-05-13)

> Master plan [V17_AUDIT_CLEANUP_MASTER_PLAN_2026_05_13.md](./V17_AUDIT_CLEANUP_MASTER_PLAN_2026_05_13.md) §Phase 1.

## 목표

1. `update_sprint_contract` 의 TOCTOU race (F4) 를 atomic conditional UPDATE 로 fix
2. `qa_loop.run` 에 lock 호출 wiring — Engineer 첫 iteration 시작 시 자동 lock

## F4 fix design

현재 (vulnerable):
```python
existing = self.get_sprint_contract_for_task(task_id)  # read
if existing is None: raise LookupError
if existing.get("locked"): raise PermissionError
self._db.execute("UPDATE sprint_contracts SET ... WHERE id = ?", ...)  # write (no lock check)
```

새 (atomic):
```python
import json
result = self._db.execute(
    """UPDATE sprint_contracts
       SET task=?, scope_json=?, out_of_scope_json=?,
           acceptance_criteria_json=?, done_definition=?, updated_at=?
       WHERE task_id=? AND locked=0""",
    (task, scope_json, ..., time.time(), task_id),
)
# Database.execute returns list[Row] from cursor.fetchall(). For UPDATE we
# need rowcount — use cursor() context manager.
```

**문제**: `Database.execute` 는 `cur.fetchall()` 반환, rowcount 안 노출. → `Database.cursor()` context manager 직접 사용:

```python
with self._db.cursor() as cur:
    cur.execute("UPDATE ... WHERE task_id=? AND locked=0", (...))
    affected = cur.rowcount
```

`affected` 가 0 일 때 — 두 가능성:
- contract 자체 없음 → LookupError
- 있지만 locked=1 → PermissionError

이걸 구분하려면 한 번 더 SELECT 필요 (그러나 race-free: lock 은 one-way 라 이 시점에 locked=1 면 영원히 locked).

```python
with self._db.cursor() as cur:
    cur.execute("UPDATE ... WHERE task_id=? AND locked=0", (...))
    if cur.rowcount == 1:
        # success — fetch refreshed
        ...
    else:
        # 0 rows affected. Decide why.
        cur.execute("SELECT locked FROM sprint_contracts WHERE task_id=?", (task_id,))
        row = cur.fetchone()
        if row is None:
            raise LookupError(...)
        else:
            raise PermissionError(...)  # locked must be 1
```

Race 제거됨: locked check + UPDATE 가 한 SQL statement.

## TODO A lock wiring

위치: `musu-core/src/musu_core/qa_loop.py:run()`, line 100 의 first iteration 시작 직전.

```python
# v17.A — Lock the contract once the Engineer is about to read it.
# After this, operator PUT to /api/tasks/.../sprint-contract returns 409.
# Lock is one-way; only success on iteration 1 to avoid double-write.
if iteration == 1 and task_id and self._backend:
    try:
        self._backend.lock_sprint_contract(task_id)
    except Exception as e:
        logger.warning("Failed to lock sprint contract for %s: %s", task_id, e)
        # Non-fatal: continue loop anyway. Worst case operator can still edit
        # mid-loop, which is no worse than before.
```

**의문**: `QALoop` 클래스가 `self._backend` 를 가지고 있는가? 확인 필요.

`musu-core/qa_loop.py:run()` 가 `self._backend` 든 비슷한 backend handle 든 있어야 호출 가능. 없으면 두 옵션:
- a) QALoop 생성자에 backend 주입
- b) qa_loop 가 task_workspace 사용하듯 backend 도 module-level helper 호출

확인 후 결정.

## 검증

- pytest 기존 7개 (`test_sprint_contract_put.py`) 모두 통과
- 새 race test 1개 추가: 동시에 lock + update — UPDATE 가 0 row affected, PermissionError raise
- typecheck clean

## Status — COMPLETE

- [x] F4 atomic UPDATE 구현 (`backends/local.py:update_sprint_contract` 가 `UPDATE ... WHERE task_id=? AND locked=0` + rowcount)
- [x] LookupError/PermissionError 구분 유지 (rowcount=0 일 때 별도 SELECT 로 분기)
- [x] qa_loop.run 에 lock_sprint_contract 호출 (for-loop 진입 직전, best-effort)
- [x] backend handle 주입: `QALoop.__init__(backend: Any = None)`, handlers.py 의 caller 가 `backend=backend` 전달
- [x] pytest 10 통과 (기존 7 + 새 3: toctou_atomic_update / qa_loop_locks / qa_loop_no_lock_without_task_id)
- [ ] commit (Phase 4 closure 에서 묶음)

## 발견

- `Database.execute()` 가 `cursor.fetchall()` 만 반환 = rowcount 안 노출. → `Database.cursor()` context manager 로 raw cursor 사용해야 atomic UPDATE 의 rowcount 검증 가능.
- `lock_sprint_contract` 도 같은 방식으로 변경 (이전엔 read-then-write, 이제 `UPDATE ... WHERE locked=0` + rowcount=1 검증). 이미 locked 된 경우 False 반환 = idempotent.
- `BackendABC` 에 `lock_sprint_contract` / `update_sprint_contract` 메서드 없음 — duck typing 으로 `hasattr` 체크. 미래에 abstract method 로 추가 가능.

## 다음

Phase 2 — schema updated_at + validation limits.
