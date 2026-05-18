# BRAINSTORM — Paperclip external runtime observer + CoS briefing integration

**Wiki ID**: wiki/457
**Date**: 2026-05-18
**Mode**: MODE_Brainstorming.md (Socratic dialogue, 분기점 8개 통과)
**Trigger**: 사용자가 musu/paperclip/hermes 3-layer + HTML wiki memory vision 명료화
**Companion docs**: wiki/455 (HTML over Markdown), wiki/456 (3-layer audit), wiki/458 (HTML architecture overview)
**Status**: Decisions finalized, V23.5 master plan 진입 준비

---

## §1 사용자 vision 최종 정리

| Layer | 책임 | musu 안 implementation | 외부 OSS counterpart |
|---|---|---|---|
| 1. 기계 (machines) | multi-machine mesh + 영구 기억 | musu (this repo) | — |
| 2. 회사 (목적/목표/일감) | "어떤 일을, 어떤 순서로" | musu native `companies` + 5 templates | **Paperclip** (paperclipai/paperclip) |
| 3. 일꾼 (agents) | "어떻게 그 일을 처리하나" | musu native adapters (Claude/Gemini/Codex) + HermesAdapter | **Hermes**, **OpenClaw** |

→ 사용자 발화: "**페이퍼클립은 ai 회사를 운영하는 서비스이고, hermes agent나 오픈클러는 ai agent를 운영하는 서비스니까**"

→ **musu = 외부 layer 2/3 OSS의 *관찰자 (observer) + multi-machine 확장자***. 흡수하지 않고, 인식만.

---

## §2 분기점별 결정 (8개)

### #1 — Paperclip의 자리
**결정**: 길 B (musu가 자체 company 추상을 유지) + 길 A 일부 (외부 paperclip을 *별도 entity*로 인식)
**Why**: paperclip 사용자가 musu를 *멀티 기기 도구*로 추가 사용 가능. 자체 musu 사용자는 paperclip 없어도 작동.
**How to apply**: musu의 자체 `companies` 테이블이 default + Paperclip은 외부 observed entity로 별도.

### #2 — hermes의 자리
**결정**: 해석 (1) — hermes는 *agent 운영 서비스*, musu 입장에서는 adapter level의 connector
**Why**: 사용자가 명시적으로 layer 분리: "**hermes agent나 오픈클러는 ai agent를 운영하는 서비스**". 즉 hermes/OpenClaw는 layer 3 (agent layer)의 외부 OSS.
**How to apply**: HermesAdapter는 현재 그대로 유지. OpenClawAdapter 추가는 V24+ 후보. Paperclip 안에서 hermes/OpenClaw가 이미 사용되니, Paperclip observer만 완성되면 hermes/OpenClaw도 *간접 인식*.

### #3 — Import의 깊이 (3가지 후보 중)
**결정**: **패턴 D — Read-only observation** (복사 안 함, 인식만)
**Why**: 사용자 발화 "**그냥 가져온다...기보다는 그냥 인식만 하면되는거아냐? 페이퍼클립의 설정을 복사해서 가져오는게 아니라, 페이퍼클립 서비스 자체를 인식**". 사용자 자산은 paperclip이 계속 소유.
**How to apply**: musu는 paperclip API를 *read-only*로 호출. 회사 정의 / task / status를 *cache*만 함. 쓰기 작업 절대 안 함.

### #4 — Operations의 범위
**결정**: **(a) Pure observer** — musu는 *보기만*. 회사 시작/중지/task 추가는 paperclip UI에서.
**Why**: 사용자 발화 "**페이퍼클립 쓰던 사람들은 그대로 페이퍼클립 써도되**". paperclip의 control plane은 paperclip이 소유.
**How to apply**: musu의 paperclip adapter는 GET endpoints만 사용. POST/PUT/DELETE 없음.

### #5 — Discovery 메커니즘
**결정**: **(1) 수동 등록 (`~/.musu/runtimes.toml`) + (3) musu-bee "Add runtime" UI 버튼** — 자동 scan은 빼기
**Why**: 명시적 사용자 의도 표명 필요 (보안). 사용자 친화 UI 동시 제공.
**How to apply**: `runtimes.toml` 포맷:
```toml
[[runtime]]
type = "paperclip"
url = "http://localhost:3100"
token = ""  # optional
poll_interval_seconds = 30
```
musu-bee `/app/runtimes` 페이지에서 form으로 같은 TOML row 추가 가능.

### #6 — Status fetch 방식
**결정**: **(a) Pull polling, 고정 30초**
**Why**: paperclip이 webhook 지원하는지 불확실 (README에 명시 없음). 30초 lag은 "회사 통합 조회"에 충분. paperclip API spec에 *얇게* 결합.
**How to apply**: `musu-bridge/runtime_observers/paperclip.py` (신규) — async background task. 30초마다 GET `/api/companies` + GET `/api/companies/{id}/tasks` (paperclip API 기준; 정확한 endpoint 명세는 V23.5 Phase 0 Researcher가 검증).

### #7 — UI 레이아웃
**결정**: **(b) 섹션 분리** — 위쪽 "Musu native companies", 아래쪽 "Paperclip companies (via localhost:3100)"
**Why**: 시각적으로 "자체 vs 외부" 구분 명확. 사용자가 paperclip 사용자라면 자기 회사 어디 있는지 즉시 식별.
**How to apply**: musu-bee `/app` 메인 페이지 회사 목록을 두 섹션으로. 각 paperclip 회사 row에 *"via paperclip @ localhost:3100"* 작은 마커.

### #8 — CoS briefing 깊이
**결정**: **(B) 중간** — CoS가 paperclip 회사 상태도 briefing에 포함 + 종합 ("paperclip 회사 X가 blocked 상태")
**Why**: (A)는 너무 얇아서 "통합 조회" vision 약화. (C)는 CoS prompt가 paperclip API spec에 묶임 — fragile.
**How to apply**:
- `instructions/cos.md`에 한 문단 추가: "musu 자체 companies + 외부 runtime에 등록된 companies 모두를 briefing에 포함한다. 외부 runtime company는 *(via paperclip)* 같은 마커를 붙여 출처 명확히."
- CoS가 회사 목록 조회할 때 musu DB의 `companies` 테이블 (native) + observer cache (external) 둘 다 읽도록 backend handler 수정 (~10 LOC)
- briefing 응답 schema에 `source: "musu" | "paperclip"` field 추가

---

## §3 V23.5 sub-WS 분해 (예비)

이 brainstorm을 master plan으로 끌어올릴 때의 sub-WS:

| Sub-WS | 작업 | LOC est. | Const-gate |
|---|---|---|---|
| O-1 | `runtimes.toml` parser + schema (musu-core/config.py 옆) | ~30 | None |
| O-2 | `musu-bridge/runtime_observers/paperclip.py` (30s poll, read-only) | ~150 | None (no schema change; cache in-memory) |
| O-3 | External company cache layer (in-memory dict 또는 view) | ~50 | **Const III 검토** — 새 테이블이면 migration |
| O-4 | musu-bee `/app/runtimes` UI page + "Add runtime" form | ~120 | None |
| O-5 | musu-bee main page: 회사 목록 섹션 분리 | ~40 | None |
| O-6 | `instructions/cos.md` 업데이트 + handler에 외부 회사 포함 | ~30 LOC + doc | None |
| O-7 | 통합 테스트 — paperclip mock server로 polling/cache/UI/CoS briefing 검증 | ~200 (test) | None |

**Total**: ~600 LOC including tests. 1-2주 estimated. agent-team chain 적용 가능.

---

## §4 Scope NOT included (deferred)

| 항목 | 이유 | 차후 |
|---|---|---|
| Webhook subscribe | paperclip이 webhook 지원 미확인 + 30s polling 충분 | V24+ if paperclip adds webhooks |
| Write operations (task add, company activate) | 사용자 명시: "그대로 페이퍼클립 써도되" | V24+ if user demand |
| Adaptive poll interval | YAGNI — 고정 30초로 충분 | V24+ |
| OpenClaw direct connector | Paperclip이 OpenClaw를 흡수 — paperclip observer로 *간접 인식* 가능 | V24+ if paperclip 없는 OpenClaw 사용자 발생 |
| Hermes direct connector | musu-core에 이미 HermesAdapter 존재 + paperclip 안에서도 사용 가능 | already exists, no new work |
| Sync (양방향) | 사용자 명시: read-only가 vision | never (or very far future) |
| Auto-scan localhost ports | 보안 우려 + 명시적 등록이 더 명확 | never |

---

## §5 사용자 vision의 더 큰 그림 — 4-layer 정정

처음 사용자가 말한 "musu / paperclip / hermes 3-layer" 가 실제로는 **4-layer**임이 brainstorm 중에 드러났습니다:

```
Layer 0 — musu-bridge 집사 (bridge-level steward)
  - **CoS (Chief of Staff = 참모장)**
  - musu 자체 system-level agent
  - seed_agents.py:88 install 시 자동 시드
  - instructions/cos.md (한국어)
  - musu native companies + 외부 paperclip companies 통합 briefing 주는 사람

Layer 1 — 기계 (machines)
  - musu (multi-machine runtime + mesh + memory)

Layer 2 — 회사 (목적/목표/일감)
  - musu native companies (5 templates) OR
  - Paperclip companies (observed read-only)

Layer 3 — 일꾼 (agents)
  - musu native adapters: Claude / Gemini / Codex / Hermes
  - (Paperclip이 인식되면 paperclip 안의 hermes/OpenClaw/Cursor 사용 가능)
```

→ CoS가 layer 0에 있고, 사용자가 *직접 대화하는 대상*. CoS가 layer 1-3을 다 종합해서 briefing.

---

## §6 References

- F:\workspace\musu-bee\musu-bridge\seed_agents.py:84-91 — system-level 6 agents 시드 (ceo, cto, engineer, **cos**, qa, worker)
- F:\workspace\musu-bee\musu-bridge\instructions\cos.md — CoS instruction (한국어 "참모장")
- F:\workspace\musu-bee\musu-core\src\musu_core\config.py — `~/.musu/` config 패턴 (runtimes.toml 추가 위치)
- F:\workspace\musu-bee\musu-bridge\wiki_routes.py — 기존 wiki subsystem (V23.5+ HTML render layer 추가 위치)
- F:\workspace\musu-bee\docs\PRODUCT_CHARTER\SSOT_1PAGE_2026-04-09.md — 3-layer vision 명시 원본
- https://github.com/paperclipai/paperclip — Paperclip OSS (66.3k stars, MIT, TypeScript+Postgres, single-machine, localhost:3100)
- wiki/455 — Tariq HTML over Markdown (companion: V23.5 HTML wiki render gate)
- wiki/456 — 3-layer audit (companion: backend 7.2/10, wiki memory 60%)
- wiki/458 — musu architecture overview (HTML, first HTML wiki page — companion artifact 작성 중)
- [[feedback-self-contained-product]] — paperclip 없어도 musu 작동 (Mode A default)
- [[feedback-no-yagni-architecture]] — webhook/sync/scan은 명시적 demand 전에 안 만듦
- [[feedback-autonomous-loop]] — V23.5 master plan 들어가면 agent-team chain 자동 진행

---

## §7 Next: V23.5 master plan

이 brainstorm의 결정을 master plan으로 들어올릴 때:

1. **Phase -1 strategic gate** — business-panel-experts debate. Seed: "Paperclip 흡수 vs 인식 vs 무시"; "musu가 회사 운영 layer 2를 양보할 가치 vs 직접 운영의 ROI"; "외부 OSS dependency 추가 시 self-contained 위반 위험"
2. **Phase 0 Researcher** — Paperclip API spec 검증 (실제 endpoint URL + auth 방식 + response shape), webhook 지원 여부
3. **Phase 1 Planner** — wiki/459 (V23.5 master plan) 작성, sub-WS O-1..O-7 detail
4. **Phase 1.5 Critic** — system-architect (보안 우려: localhost:3100 trust boundary, token leakage)
5. **Plan-as-spec Auditor** — quality-engineer (CoS instruction 변경의 cross-section invariant)
6. **Phase 3-7** — agent-team chain 자동 진행

**Status**: brainstorm closure 완료. wiki/457 ID 예약. V23.5 master plan 진입 trigger 대기.
