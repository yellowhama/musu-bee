# Phase 2 — Schema updated_at + validation limits (2026-05-13)

> Master plan §Phase 2. F5 + F7 묶음.

## F5 — `sprint_contracts.updated_at`

현재 schema 에 `created_at` 만 있음. operator 가 contract 편집해도 언제 마지막으로 바뀌었는지 모름. audit log 측면에서 필수.

### Migration v26

```python
def _v26_up(conn):
    if not _column_exists(conn, "sprint_contracts", "updated_at"):
        conn.execute(
            "ALTER TABLE sprint_contracts ADD COLUMN updated_at REAL NOT NULL DEFAULT 0;"
        )
        # Backfill existing rows from created_at so older contracts have a
        # meaningful timestamp.
        conn.execute(
            "UPDATE sprint_contracts SET updated_at = created_at WHERE updated_at = 0;"
        )
        conn.commit()
```

### `update_sprint_contract` 수정

UPDATE 의 SET 절에 `updated_at = ?` 추가, `time.time()` 전달. `save_contract` 도 신규 row 의 `updated_at = created_at` 으로 시작.

### `get_sprint_contract_for_task` 반환 DTO

`"updated_at": row_value` 추가. v25 와 같은 defensive 패턴 (`try except KeyError`) 으로 옛 row 도 safe.

## F7 — List length / item length 제한

DoS 방어. 1MB string 100 개 보내는 케이스 차단.

### Pydantic constraints

```python
from pydantic import BaseModel, Field, conlist
from pydantic import StringConstraints
from typing import Annotated

ScopeItem = Annotated[str, StringConstraints(min_length=1, max_length=2000)]

class SprintContractUpdateRequest(BaseModel):
    task: str = Field(min_length=1, max_length=2000)
    scope: list[ScopeItem] = Field(default_factory=list, max_length=50)
    out_of_scope: list[ScopeItem] = Field(default_factory=list, max_length=50)
    acceptance_criteria: list[ScopeItem] = Field(default_factory=list, max_length=50)
    done_definition: str = Field(default="", max_length=2000)
```

- 각 list: 최대 50 항목
- 각 item: 1~2000 자 (empty string 거부)
- task / done_definition: 2000 자

### pytest 추가

- oversized list (51 항목) → 422
- oversized item (2001 자) → 422
- updated_at 가 update 후 changed (now > old timestamp)

## Status — COMPLETE

- [x] migration v26 작성 (idempotent `_column_exists`, backfill `updated_at = created_at`)
- [x] update_sprint_contract 가 UPDATE 시 `updated_at = time.time()` 갱신
- [x] save_contract / load_contract / SprintContract dataclass + `__post_init__` 모두 updated_at round-trip (sentinel 0.0 = use created_at)
- [x] get_sprint_contract_for_task DTO 에 `updated_at` 추가 (옛 row 는 created_at fallback)
- [x] SprintContractUpdateRequest: `_ContractItem = Annotated[str, StringConstraints(min_length=1, max_length=2000)]`, list `max_length=50`
- [x] pytest 4개 추가 (oversized_list / oversized_item / empty_string_item / updated_at_advances) — 14/14 pass
- [ ] commit (Phase 4 closure)

## 발견

- `field(default_factory=time.time)` 가 created_at + updated_at 양쪽에 적용되면 두 번 호출 = nanosecond 차이로 `assert a == b` 실패. `__post_init__` 으로 updated_at 가 미설정이면 created_at 값을 받도록 sentinel pattern (`0.0`) 사용.
- Pydantic v2 의 `StringConstraints(min_length=1)` 가 list item 의 empty string 도 거부 — 의도된 동작. operator 가 빈 줄 enter 한 항목은 422.

## 다음

Phase 3 — UI fixes (F10 + F12 + F13).
