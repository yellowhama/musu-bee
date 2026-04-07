# QA Gate And Release Readiness

작성일: 2026-04-03

## 목적

`MUS-16`의 release readiness 기준을 현재 canonical workspace 상태 기준으로 고정한다.

## Test Matrix

| Scenario | Expectation | Evidence Files |
| --- | --- | --- |
| Happy path (canonical harness boot + ready summary) | root/ready/summary marker가 모두 존재하고 summary 렌더가 정상 동작 | `harness/canonical/index.html`, `harness/canonical/app.js`, `harness/canonical/styles.css` |
| Retry/attach-close path (remote session) | remote session fixture의 attach/close status가 `active/closed` | `mock/remote_session_fixture.json`, `harness/canonical/remote_session_runtime.js` |
| Failure handling (gate fail-fast) | smoke check 하나라도 false면 non-zero exit | `tools/canonical_harness_smoke.py` |

## Automated QA Gate

1. server bootstrap

```bash
cd /home/hugh51/musu-functions
python3 -m http.server 8788
```

2. gate execution (다른 셸)

```bash
python3 /home/hugh51/musu-functions/MUSU-CRT/tools/canonical_harness_smoke.py
```

2026-04-03 실행 결과: 모든 check 통과 (`failures: []`).

## Release Checklist (Go / No-Go)

- Go 조건
  - `tools/canonical_harness_smoke.py` 결과가 전부 true
  - `CANONICAL_DIRECT_SMOKE_PROOF_2026-04-02.md`와 동등한 기준 유지
  - `REMOTE_SESSION_CANONICAL_PROOF_2026-04-02.md` 기준 유지
- No-Go 조건
  - smoke 출력에서 `failures`가 비어 있지 않음
  - `harness/canonical/index.html`의 `crt-canonical-ready` marker가 누락됨
  - `mock/remote_session_fixture.json`의 attach/close expected status가 깨짐

## Rollback Criteria And Steps

rollback trigger:

- smoke gate fail
- canonical ready marker 누락
- remote session fixture status mismatch

rollback steps:

1. `RUNTIME_FACING_PREP_CHECKLIST_2026-04-02.md` 기준으로 runtime-facing 산출물 유지 여부 재검토
2. canonical smoke gate 재실행 (`tools/canonical_harness_smoke.py`)
3. 실패 항목을 file-level로 분리 기록
   - harness markup 문제: `harness/canonical/index.html`
   - runtime state wiring 문제: `harness/canonical/app.js`, `harness/canonical/remote_session_runtime.js`
   - fixture 문제: `mock/signaling_fixture.json`, `mock/stream_lifecycle_fixture.json`, `mock/remote_session_fixture.json`
4. 통과 전에는 release no-go 유지

## 결론

현재 workspace canonical 상태에서 `MUS-16` QA gate는 재현 가능한 자동화 검증과 file-level rollback 기준을 가진다.
