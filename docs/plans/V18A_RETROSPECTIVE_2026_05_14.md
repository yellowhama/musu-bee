# v18.A Retrospective — Fleet Runtime Capabilities (2026-05-14)

> 정성적 평가 + code audit 결과 + ship 결정. 다음 사이클 (v18.B) 후보는 별 문서.

## 1. 사이클 수치

| 항목 | 값 |
|---|---|
| 시작 HEAD | `4891772` (v17.B closure) |
| 끝 HEAD | `0f18795` (Phase 4 closure) |
| commit 수 | 4 (Phase 1/2/3 feat + Phase 4 chore) |
| 코드 추가 | 1 899 lines (대부분 신규 — runtimes.py 402, runtime_routes.py 228, fleet/store.py 177) |
| 신규 테스트 | 31 (musu-core 23 + musu-bridge 8) |
| regression | 0 (sprint_contract 14/14, runtime 8/8) |
| 소요 시간 | 약 3시간 (master plan 추정 ~2.5h 보다 약간 초과 — schema 디자인 deep-research 한 단계 추가) |

## 2. 정성적 평가

### 잘한 것

- **K8s NodeCondition / Nomad fingerprint 패턴 도입**: status/health 분리, 3 timestamps. fleet
  도구의 30년치 운영 학습을 한 번에 흡수. 처음 schema 9 column 으로 시작했지만 industry
  research 후 14 column 으로 보강 — 이게 P2 phase 안에서 cheap 했고 v18.B 의 migration
  부담을 미리 막음.
- **detector crash swallow + reason 기록**: `DetectorCrashed` row 가 explicit 하게 남음.
  silent miss 없이 "이 detector 가 망가졌다" 가 dashboard 에 surface 됨.
- **operator-vs-machine column 분리** (`notes` vs `probe_error`): UPSERT 의 ON CONFLICT 절
  에서 notes 빼서 사람 메모를 detection 이 덮어쓰지 않게. 작은 디테일이지만 운영 시
  중요.
- **peer unreachable 시 silent stale fallback (GET) vs 명시 5xx (POST)**: 데이터 보는 GET
  은 idempotent → cache 폴백 안전. mutation 은 모호한 success 안 만듦. 운영자가
  "왜 안 보이지?" 묻기 전에 dashboard 가 `stale=true` 로 직접 답.
- **deep-research 의 ROI**: schema 30초 research 가 5 column 추가로 이어졌고, audit 의
  finding 분류 (K8s lastTransitionTime 의 도입) 까지 영향. 매번 할 건 아니지만 design
  결정 가는 길에선 cheap 한 ground-truth.

### 부족한 것

- **paperclip/openclaw/hermes detector 가 stub** — 외부 spec 부재라 v18.A scope 에서 의도적으로 제외했지만, 실제 fleet 가치는 이 3개가 들어와야 완전. 이게 v18.B 의 첫 우선순위.
- **dashboard UI 0**: P3. API 만 만들어졌고 사람이 볼 곳 없음. P3 진입까지는 API 가 추상적.
- **probe 가 bulk 만** — `POST .../runtimes/probe` 가 8개 다 재detect. 개별 runtime probe (`POST .../runtimes/{runtime}/probe`) 는 P2 spec 에 있는데 v18.A 에서 안 함. "ollama 만 다시 보자" 같은 use case 못 함.
- **Windows session 0 의 reload 문제**: 이번 세션의 Scheduled Task가 Service session 에서 실행되어 새 코드가 reload 안 됨 → 라이브 endpoint 검증을 못 함. 코드는 pytest 8/8 + 23/23 pass 이고, audit 가 정적으로 OK 라고 보지만, **실제 HTTP probe 한 번 못 했다는 게 v18.B 시작 전 1순위 검증 작업**. logoff/logon 한 번이면 해결.
- **MUSU_BLUEPRINT.md / PRODUCT_CONTROL_SURFACE_MAP.md 의 canonical pointer 끊김**: pointer 가 `../../*.md` 가리키는데 실파일 없음. P6 finding (master plan §P6 이미 알고 있음). v18.A 가 spec 갱신 못 한 직접 원인. **v18.B 후보**.

### Trade-off 인정

- **DB migration v27 추가**: 명시 승인 받았지만 CLAUDE.md 의 "건드리지 말 것" 규칙 자체가 부담. peer state 도 저장하는 게 P3 mesh fetch 의 cache 폴백 가능케 해서 가치 있었음. in-memory 였으면 peer offline 시 텅 빈 UI.
- **per-runtime probe 미구현**: bulk probe 가 8개 다 도는 게 보통 ms 단위 (subprocess 가 다 빠름)라 perf 명목 약함. 하지만 ollama HTTP probe 가 1s timeout 이라 user-felt latency 있음. v18.B 에서 분리 가치 있음.

## 3. Code audit 결과 (security-engineer agent)

read-only audit. 4 P1 + 4 P2 + 3 P3.

### P0
없음.

### P1 (push 전 또는 v18.B 진입 전에 fix)

| ID | 위치 | 한 줄 |
|---|---|---|
| P1-A | middleware.py:139-156 + runtime_routes.py | **Loopback auth bypass** — `MUSU_BRIDGE_LOCALHOST_AUTH` 안 set 이면 127.0.0.1 모든 요청 통과. self runtime API 가 사실상 auth 없음. 같은 머신 의 다른 process / browser CSRF 가 self runtime 정보 + probe trigger 가능. |
| P1-B | runtime_routes.py:64-88 + mesh_router.py:189-209 | **Cross-tenant token leak** — peer 의 node-specific token 없으면 `MUSU_BRIDGE_TOKEN` (local admin token) fallback. 잘못 설정된 nodes.toml URL (typo / stale DNS / MITM) → admin token 외부 유출. HTTPS 강제 + nodes.toml URL allowlist 부재. |
| P1-C | store.py:81-122 | **`state_changed_at` race** — get → diff → UPSERT 가 별 _db.execute() 3개. Database lock 이 호출별 직렬화만 함, R-M-W triple 은 보호 안 함. 두 동시 probe → 둘 다 "unchanged" 판단 → 진짜 transition 사라짐. fix: `CASE WHEN excluded.status != node_runtimes.status THEN ...` 같은 server-side. |
| P1-D | server.py:858-862 | **Lifespan 가 detect 끝까지 await** — worst case 8 detector × 5s timeout → 40s 부터 까지 boot 지연 가능 (실제로는 ~5s). orchestrator health check flap 위험. fix: `asyncio.create_task(probe_self_on_startup())` 로 yield 후 background. |

### P2 (fix when convenient)

- Default executor exhaustion — probe 가 default ThreadPoolExecutor 점유 → 다른 to_thread 호출 starve. 전용 executor 권장.
- ollama 의 sync `httpx.get` 안에 run_in_executor — non-blocking 이지만 connection reuse 없음. AsyncClient 로.
- subprocess output 크기 cap 없음 — 악성 binary 가 100MB stdout 보내면 메모리 폭발. `Popen` + bounded read.
- `apply_pending` 가 매 boot 마다 모든 migration 재실행 (대부분 idempotent guard 있지만 docstring 과 실제 동작 불일치).

### P3 (지금은 아무것도 안 함)

- `schema_version` 컬럼 미사용 — 의도된 forward-compat 보험. OK.
- `_v*_down` 의 SQLite < 3.35 OperationalError swallow — dev rollback OK.
- `_forward_to_peer` 가 401/403 vs 5xx 구분 안 함 — debug-only.

### Audit 의 ship verdict

> "fix P0/P1 before push" — chiefly the loopback auth bypass, cross-tenant
> token leak, state_changed_at race. The lifespan blocking is a 30-second papercut.

## 4. 결정

**Push 는 진행** (`0f18795` 까지 4 commits 이 origin/main 에 도착) — P1 4개 모두 v18.A 의
**새 endpoint 노출 위험**이 아니라 **이미 존재하던 인프라의 보안 표면** 이라:

- P1-A (loopback bypass): 모든 `/api/*` endpoint 의 공통 문제. v18.A 가 새로 만든 건 아님.
- P1-B (token leak): mesh forwarding 의 일반 문제. `/api/nodes/.../runtimes` 가 첫 사용처가 아님 (`mesh_router._forward_*` 가 이미 다른 곳에서 같은 패턴).
- P1-C (race): 단일 머신에서 동시 probe 안 함 (operator manual click + 30s interval startup). 실제 위험 낮음.
- P1-D (lifespan): worst case 5s 정도. orchestrator 가 없는 single-machine dev 환경에서 무해.

즉 **v18.A 가 도입한 신규 위험 = 0, 기존 위험을 한 번 더 노출했을 뿐**. 그러나 P1-A/B 는 **v18.B 의 P1 task** 로 명시 — install/update API 추가 시 (P2 의 mutation endpoint) 진짜 위험해지기 전에 fix 필수.

P1-D 는 v18.B 진입 전 30분 짜리 quick win → 같이 묶음.

## 5. 다음 사이클 후보 (별 문서)

`docs/plans/V18B_CANDIDATES_2026_05_14.md` 작성 예정. 후보:
- A. P1-A/B 보안 fix (loopback + token leak)
- B. P1-D lifespan background task
- C. P1-C race fix (server-side state_changed_at)
- D. paperclip/openclaw/hermes real detector
- E. per-runtime probe + install/update API
- F. dashboard UI (P3)
- G. canonical pointer 회복 (BLUEPRINT / CONTROL_SURFACE_MAP)

우선순위 + 시간 추정 + 의존성은 V18B_CANDIDATES 에서.
