# TASK-2B: musu-port Windows/WSL Parity

> 작성: 2026-04-14 | 우선순위: P2 | 예상: 4h

---

## 현황

`cargo test -p musu-port-core --test parity_verification` → 5 pass, 1 FAIL

### 실패 테스트

```
test standalone_runtime_matches_parity_baseline ... FAILED
thread panicked at: l4 runner did not become ready: tcp-parity
```

### 실패 원인 추정

`wait_for_l4_runner`가 80회 (8초) poll하지만 `/l4/runners`에서 `tcp-parity` 항목이 `running: true`로 나타나지 않음.

경로:
1. POST /promote → `alias: "tcp-parity"` promote 요청
2. server.rs promote handler → ServiceRoute 추가 → L4 reconcile 호출
3. L4Runtime.reconcile_routes() → tcp runner 생성 → `running: true` 상태 추가
4. GET /l4/runners → `[{alias: "tcp-parity", running: true, ...}]` 반환 기대

실패 가능 원인:
- promote → L4 reconcile 비동기 타이밍 이슈 (reconcile이 지연되거나 호출 안됨)
- TCP bind 실패 (포트 충돌)
- WSL 환경에서 localhost TCP bind 특수 케이스

---

## 작업 목표

1. `standalone_runtime_matches_parity_baseline` 테스트 통과
2. `OPERATOR_INGRESS_ACCEPTANCE.md` 업데이트 — WSL parity 확인 상태 기록
3. (선택) Windows listener discovery adapter 코드 검토 후 문서화

---

## 접근법

### Step 1: 진단

`server.rs`의 promote 핸들러에서 L4 reconcile이 실제로 호출되는지 확인.
L4Runtime이 `Arc<Mutex>` 또는 `Arc<RwLock>` 안에 있고 reconcile이 await를 빠뜨렸을 가능성.

### Step 2: 수정

promote 후 즉시 L4 reconcile을 await하도록 수정.
또는 `health_check` 루프가 L4 상태를 업데이트하는 타이밍 조정.

### Step 3: OPERATOR_INGRESS_ACCEPTANCE.md 업데이트

WSL parity 상태 및 테스트 통과 여부 기록.

---

## 검증

```bash
cd musu-port
~/.cargo/bin/cargo test -p musu-port-core -q
# → 6 passed, 0 failed (또는 all tests pass)
```

---

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `crates/musu-port-core/src/server.rs` | promote 핸들러, L4 reconcile 호출 |
| `crates/musu-port-core/src/l4.rs` | L4Runtime, reconcile_routes, L4RunnerStatus |
| `crates/musu-port-core/tests/parity_verification.rs` | 실패 테스트 |
