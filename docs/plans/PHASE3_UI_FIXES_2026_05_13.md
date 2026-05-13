# Phase 3 — UI fixes (2026-05-13)

> Master plan §Phase 3. F10 + F12 + F13 묶음.

## F10 — useSprintContract.save() cancellation guard

현재: `save(edit)` 가 `fetch(/api/bridge/tasks/${taskId}/sprint-contract)` 호출 후 응답 받으면 `setContract(data)` 호출. 시나리오:

1. operator 가 task A 의 contract 편집 중 → `save()` 호출 → fetch 진행
2. fetch 응답 받기 전에 operator 가 task B 로 전환 → `taskId` 변경 → useEffect 가 새 task B 의 contract fetch
3. 옛 fetch (task A) 가 응답 받음 → `setContract(A)` 호출 → **B 의 state 가 A 로 오염**

Fix: `taskId` 를 `useRef` 에 mirror, save 시작 시 capture, 응답 처리 시 mismatch 면 setContract 무시.

또는 더 정확히: AbortController 로 fetch 자체 cancel + cleanup.

가장 깔끔: useRef + closure capture. (AbortController 가 더 견고하지만 hook complexity 증가.)

## F12 — SprintContractSection EditList trailing newline UX bug

현재 `EditList` 의 onChange:
```typescript
const next = e.target.value.split("\n").map((s) => s.trimEnd());
onChange(next.filter((s, i) => s.length > 0 || i < next.length - 1));
```

문제: 사용자가 "a\nb\n" (b 다음 enter 침) 입력 → `next=["a","b",""]` → filter 가 index 2 ("", length=0, i < 2 false) → drop. 결과 `["a","b"]`. join 다시 표시: `"a\nb"`. **enter 가 사라짐, cursor 가 안 내려감.**

Fix: 컴포넌트 내부에 `rawText` state 도입. textarea 는 controlled component 로 rawText 직접 표시. items 는 derived (`rawText.split("\n").filter(non-empty)`). save 시 derived list 만 부모로.

이게 더 큰 변경이라 컴포넌트 구조 살짝 바꿈. 다만 EditList 가 자체 state 가지면 controlled component 의 single-source-of-truth 깨짐 — 부모 (`draft`) 의 items 과 internal rawText 가 어긋날 수 있음.

**더 안전한 방향**: rawText 를 부모 (`SprintContractSection`) 의 `draft` 에 추가. items 는 항상 derived. UI 가 부모 draft 보고 rawText 보존.

또는 가장 작은 변경: filter 조건만 수정 — empty trailing 도 유지하고, submitEdit 단계에서만 trim:

```typescript
const next = e.target.value.split("\n").map((s) => s.trimEnd());
// Keep all entries including trailing-empty; trim happens on submit.
onChange(next);
```

그리고 `submitEdit` 에서 모든 list field 에 `.filter(s => s.length > 0)` 적용. 가장 작고 안전. F12 fix 로 이걸 선택.

## F13 — AppShell swipe gesture target check

현재 `handleTouchStart`:
```typescript
if (window.innerWidth > 768) return;
if (e.touches.length !== 1) return;
swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
```

textarea / input / canvas 안에서 시작한 touch 도 swipe 으로 간주 → 사용자가 textarea 안에서 horizontal pan (텍스트 선택) 시도 시 swipe 잡힘.

Fix: target 이 interactive element 안이면 swipe 무시.

```typescript
const target = e.target as HTMLElement | null;
if (target?.closest('textarea, input, [contenteditable], canvas')) return;
```

## 검증

- typecheck clean
- `npm run build` clean
- Playwright e2e v15-mobile.spec.ts 의 swipe test 가 textarea 외부에서 작동 (regression 없음)

## Status — COMPLETE

- [x] F10 — `currentTaskIdRef` ref + `startTaskId` closure capture in save(). 두 setContract 호출 (`409 refresh` + `200 success`) 모두 stale check.
- [x] F12 — EditList 의 onChange 가 trailing-empty 보존 (filter 제거). submitEdit 에서 한 번 `.filter(s => s.length > 0)` 로 trim.
- [x] F13 — `handleTouchStart` 가 `e.target.closest('textarea, input, [contenteditable], canvas')` 면 swipe 무시.
- [x] typecheck clean
- [x] build clean (BUILD_ID 생성)
- [ ] commit (Phase 4 closure)

## 추가

- `SprintContract` 타입에 `updated_at: number` 추가 (Phase 2 의 backend 반환 DTO 와 일치).
- `useSprintContract.ts` 의 `useRef` import 추가.

## 다음

Phase 4 closure.
