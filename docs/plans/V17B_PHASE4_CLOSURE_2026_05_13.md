# Phase 4 — v17.A closure (wiki + MEMORY) (2026-05-13)

> Master plan §Phase 4. v17.A Sprint Contract Audit Cycle 의 6 finding 종합
> + workspace migration 합쳐서 wiki entry 1개 + reusable pattern MEMORY 3개.

## 산출물

### wiki 313 — v17.A + migration closure

`F:\workspace\llm-wiki\wiki\313_V17A_AUDIT_CLOSURE_AND_MIGRATION_2026_05_13.md`

내용 (구조):

1. **사이클 개요**: v17.A 의 audit cleanup scope (TODO A + F4-F13)
   + 사이클 끝에 추가된 workspace migration (C: → F:)
   + cleanup 2 pass (paperclip-era 잡스 + CODEX.MD/references_AI)
2. **fix 별 요약** (1줄씩):
   - TODO A: Engineer accept 시 lock_sprint_contract — qa_loop.py 의 첫 iteration 시점에 hook.
   - F4 TOCTOU: select-then-write → conditional UPDATE + rowcount 분기.
   - F5: sprint_contracts.updated_at 컬럼 (migration v26).
   - F7: SprintContractUpdateRequest 의 list/item length 제약 (DoS 차단).
   - F10: useRef + closure capture 로 stale task switch race 방지.
   - F12: controlled textarea trailing-empty 보존, submit 시 trim.
   - F13: swipe gesture 의 target.closest() interactive element check.
3. **Migration**: C:\dev\musu-bee → F:\workspace\musu-bee. 트리거 = workspace 통합.
4. **재사용 가치 있는 패턴 3개** (separate MEMORY entry 로 분리):
   - TOCTOU conditional update pattern
   - controlled textarea trailing newline UX
   - useRef stale-check for async state mutation
5. **다음**: v17.B (이 사이클) infra cleanup.

### MEMORY entries (3개)

자리: `C:\Users\empty\.claude\projects\C--Users-empty\memory\`
(없으면 생성 — 사용자 첫 MEMORY 사용일 수 있음)

**1. `pattern-toctou-atomic-update.md`** (feedback type)

- Rule: lock/state 검사 + write 가 분리되면 race 위험. conditional UPDATE 한 statement
  로 묶고 rowcount 로 분기.
- Why: v17.A F4 — `update_sprint_contract` 가 `SELECT locked → UPDATE` 두 단계 → 그 사이
  에 다른 transaction 이 lock 가능. rowcount=0 일 때 SELECT 으로 LookupError vs
  PermissionError 구분.
- How to apply: SQLite/Postgres 같은 lock/state 컬럼 가진 row update 할 때. 새 conditional
  UPDATE 가 atomic 보장.

**2. `pattern-controlled-textarea-trailing-newline.md`** (feedback type)

- Rule: controlled textarea 의 onChange 에서 `trim` / `filter(empty)` 하면 사용자가
  Enter 누른 직후 cursor 가 안 내려감. trailing-empty 는 typing 중에는 보존, submit
  단계에서만 거름.
- Why: v17.A F12 — `EditList` 가 `e.target.value.split("\n").filter(s => s.length > 0)` 으로
  list 만드는데, 마지막 빈 줄도 drop 됨. 사용자가 줄바꿈 못 느낌.
- How to apply: list 입력 controlled component. internal text 가 raw (`["a","b",""]` OK),
  외부 emit 시 trim.

**3. `pattern-useref-stale-check.md`** (feedback type)

- Rule: async fetch 의 응답이 도착했을 때 그 사이 user 가 다른 entity 로 navigate 했으면
  setState 무시. `useRef` 로 latest id mirror + closure capture 한 start id 비교.
- Why: v17.A F10 — `useSprintContract.save()` 가 task A 의 contract PUT 보냄 → 응답 오기
  전 user 가 task B 로 전환 → 옛 응답이 task B 의 state 를 task A 데이터로 오염.
- How to apply: React hook 에서 외부 entity id (taskId, userId) 기반 fetch + setState.
  `currentIdRef = useRef(id)` + useEffect mirror + `const startId = id; const isStale =
  () => currentIdRef.current !== startId; if (!isStale()) setState(data)` 패턴.

### MEMORY.md 인덱스

`C:\Users\empty\.claude\projects\C--Users-empty\memory\MEMORY.md` 생성 (없으면):

```markdown
- [TOCTOU atomic update](pattern-toctou-atomic-update.md) — race-free conditional UPDATE + rowcount dispatch
- [Controlled textarea trailing newline](pattern-controlled-textarea-trailing-newline.md) — preserve raw text in state, trim only at submit
- [useRef stale-check for async state](pattern-useref-stale-check.md) — capture id at fetch start, compare to ref at completion
```

### wiki commit

새 313 entry 만 add (`git add wiki/313_*.md`). 기존 dirty (modified 5 / deleted 5 /
untracked 30+) 는 user 작업물이라 손대지 않음. commit 후 push (wiki repo 의 master
브랜치 — 4 unpushed 가 함께 가는 효과, 의도된 것).

## 검증

- wiki 313 entry 가 F: llm-wiki 안에 있고 git tracked + push 까지.
- MEMORY dir + index + 3 entries 존재.
- musu-bee repo 의 main HEAD 는 변경 없음 (이 phase 는 wiki + memory 만 다룸).

## 위험

- **wiki 원본이 WSL 에도 있음** (마이그레이션 때 robocopy 로 옮겼지만 옛 위치도 유지).
  F: 에서 commit + push 하면 origin/master 에 들어감. WSL clone 은 outdated state.
  user 가 만약 다음에 WSL 에서 또 작업하면 `git pull github master` 해야.
- **MEMORY 디렉터리 부재 시 생성**: 첫 Write 가 mkdir 자동으로 됨 (Write tool 동작).

## Status

- [ ] wiki 313 entry 작성
- [ ] MEMORY 3 entries + MEMORY.md 작성
- [ ] wiki commit 313 entry → push origin master (dirty 다른 파일 손대지 않음)
- [ ] commit Phase 4 detail plan + 빈 진행
