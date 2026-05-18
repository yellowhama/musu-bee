# RESEARCH — 3-layer architecture audit + HTML wiki memory gap analysis

**Wiki ID**: wiki/456
**Date**: 2026-05-18
**Trigger**: User clarified musu의 의도된 3-layer 아키텍처와 영구 기억 장치 vision
**Companion docs**: wiki/455 (HTML over Markdown — Tariq), [[project-musu-repo-layout]], [[project-musu-v21-master-plan]]
**Method**: 3 Explore subagents parallel — (a) paperclip/hermes traces, (b) musu-bridge backend strength, (c) wiki/memory subsystem state

---

## §0 TL;DR (3 sentences)

1. **3-layer is real, but incomplete**: `paperclip` (agent companies)는 production code로 존재함 (`musu-plugin/hooks/paperclip_guard.py`). `hermes` (advanced agents)도 production adapter로 존재함 (`musu-core/adapters/hermes.py`). 단 둘 다 "first-class routable runtime"이 아니라 — 위 layer (musu) 안에서 *referenceable*한 정도. SSOT 문서 (`docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md`)에 layer 모델 명시됨.
2. **Backend는 "탄탄" 7.2/10**: async 동시성 모델, semaphore gating, HMAC constant-time auth, schema migrations, 93 test files — 강함. 단 error opacity, mesh-wide tracing 부재, /health/ready가 migration 상태 verify 안 함 — V23.4 hardening이 musu-relay에만 적용되고 musu-bridge에 미적용.
3. **HTML wiki memory는 60% 완성**: wiki subsystem이 실제로 존재함 (FTS5 search + CRUD API + agent용 MCP tools 4개). 단 *markdown only* (HTML 미지원), session memory 없음 (every agent invocation은 fresh start), `/wiki` UI 없음. 사용자 vision의 "HTML 영구 기억 장치"는 *markdown 영구 지식 장치*까지는 와있고 HTML 렌더링 layer만 추가하면 됨.

---

## §1 Layer 1: musu (machines runtime) — 현재 상태

### 1.1 Top-level module layout (verified)

| Module | Purpose | Status |
|---|---|---|
| **musu-bridge** | FastAPI HTTP server, agent dispatch, API layer | Active |
| **musu-core** | DB (SQLite), router, adapters, config | Active |
| **musu-bee** | Next.js UI + Tauri desktop, Paddle billing, chat surface | Active |
| **musu-control** | MCP server (50+ tools for agents) | Active |
| **musu-indexer** | MCP code search server | Active |
| **musu-plugin** | Claude Code plugin, commands, **paperclip guard** | Active |
| **musu-port** | Rust port manager, channel broker | Active |
| **musu-relay** | WebRTC signaling rendezvous | Active |
| **musu-supervisor** | Rust process supervisor | Active |
| **musu-worker** | Subprocess task executor | Active |
| **musu-writer** | MCP server, long-form writing tools | Active |
| **musu-ai-detector** | AI-generated content detection | Active |

→ 12 modules, all active. README는 8개만 나열하지만 실제 코드는 12개.

### 1.2 Backend 견고성 (musu-bridge + musu-core)

**Verdict: 7.2/10 — 탄탄하지만 완전히는 아님**

| 영역 | Rating | 핵심 근거 |
|---|---|---|
| HTTP API surface | STRONG | 117 async handlers, router 패턴, 모듈화 |
| Schema/DB layer | STRONG | 14 tables, WAL mode, foreign keys ON, 7 migration test files (v29-v36) |
| Test coverage | STRONG | 93 bridge tests + 54 core tests, 17K+ LOC, e2e 6 files |
| Error handling | OK | 878 try/except, but silent swallowing at `handlers.py:165-170`, `server.py:697-698` |
| Auth + security | STRONG | HMAC `compare_digest` (timing-safe), dual-token (MUSU_BRIDGE_TOKEN + MUSU_TOKEN), CSRF guard |
| Concurrency | STRONG | async-first, channel semaphores w/ 120s timeout, task dedup |
| Observability | OK | JSON logs + Prometheus metrics, but no distributed tracing across mesh |
| V23.4 hardening | WEAK | Applied to musu-relay only; **NOT** applied to musu-bridge |
| Dead code | OK | `_legacy_mattermost/` isolated, no obvious orphans |

**Top 3 weaknesses** (영향도 순):
1. Error opacity in critical paths (`handlers.py:165-170, 186-205`, `server.py:697-698`) — operator가 route 실패를 진단 못함
2. Mesh-wide tracing 부재 — multi-node 디버깅이 추측에 의존, X-Request-ID가 `forwarded_event` 통과 시 끊김
3. `/health` (server.py:3002-3036) circuit breaker 상태 verify 안 함, `/health/ready` (server.py:3042-3063) migration 완료 verify 안 함

**Top 3 strengths**:
1. async + semaphore gating으로 burst load 견딤
2. HMAC `compare_digest` + dual-token으로 multi-node mesh가 shared secret 없이 동작
3. Schema migrations + WAL + 7 migration test files로 schema evolution이 안전

→ V23.4 Tier-1 패턴 (install_attempt sweeper + uniform DB-write try/catch + state file enrichment)을 musu-relay에 적용했지만 musu-bridge에는 미적용. 같은 패턴 audit이 musu-bridge POST /api/route + DB-write hot paths에 필요.

---

## §2 Layer 2: paperclip (agent companies) — 현재 상태

### 2.1 Active code (검증됨)

**Paperclip 자체는 별도 external runtime concept** (per SSOT) 이지만, musu 안에 paperclip-aware code가 있음:

1. **`musu-plugin/hooks/paperclip_guard.py`** (172 LOC, production):
   - PreToolUse hook
   - 4개 MCP tool 보호: `pause_agent`, `resume_agent`, `resolve_approval`, `update_issue`
   - 명시적 confirmation token 요구 (예: `CONFIRM_PAUSE_AGENT`)
   - `hooks.json`에 등록됨: `mcp__.*__(pause_agent|resume_agent|resolve_approval|update_issue)`

2. **`.agents/skills/paperclip*`** (3 skill bundles):
   - `paperclip`, `paperclip-create-agent`, `paperclip-create-plugin` — stub 형태 (~100 bytes each)

3. **Git history**:
   - `53e08d4` — "feat(company): add registry and paperclip sync"
   - `fe27043` — "paperclip: add unblock pack + remote exec plan"
   - `0891cd1` — "chore(repo): purge paperclip-era debug scripts + dup installer"

### 2.2 Current "company" concept (musu 안)

musu가 자체적으로 가진 "company" 추상 (paperclip의 자리를 잡고 있음):

- **Schema**: `companies`, `company_role_templates`, `company_project_index`, `company_approvals_queue` 테이블 (db.py:15-236)
- **API**: `POST /api/companies`, `GET /api/companies/{ID}/briefing` 등 (MANUAL.md §214-254)
- **Templates** (company_templates.py): `dev-team`, `content-team`, `writer-studio`, `research-team`, `marketing-team` — 각각 4-5 agents
- **Models**: `CompanyCreateRequest`, `CompanyUpdateRequest` (bridge_models.py)

### 2.3 Gap: paperclip이 "first-class routable" 가 아님

`FLEET_LAYER_NEXT_STEPS_2026-05-13.md:17`:
> "But it does not yet model external runtimes such as Paperclip, OpenClaw, and Hermes as first-class installable/routable capabilities."

`FLEET_LAYER_NEXT_STEPS_2026-05-13.md:32`:
> "paperclip (stub — v18.B will implement real detector)"

→ paperclip은 *concept + guard + stub*까지 있고, *runtime detector*가 빠짐. musu의 "company" 추상이 paperclip의 자리를 *partially* 잡고 있지만, 사용자 vision의 layer 2 (외부 paperclip runtime)와는 다름.

---

## §3 Layer 3: hermes (advanced agents) — 현재 상태

### 3.1 Active code (검증됨)

**`musu-core/adapters/hermes.py`** (128 LOC, production):
- `class HermesAdapter(BaseAdapter)`
- Hermes Agent CLI을 subprocess로 실행
- Config keys: `command`, `model`, `provider`, `toolsets`, `timeout_sec`, `yolo`, `quiet`
- stdout parsing → (response_text, session_id)
- adapter registry에 등록됨:
  - `registry.py:9` — `from .hermes import HermesAdapter`
  - `registry.py:23` — `hermes = HermesAdapter()`
  - `registry.py:33` — global adapter dict에 등록

### 3.2 Fallback chain integration

`agents.py:89`:
> Each entry: `{"adapter_type": "hermes", "model": "...", ...}`

→ agents의 `fallback_chain`에 hermes를 한 entry로 넣을 수 있음. Tests at `test_fleet_runtimes.py`, `test_agents.py` 검증.

### 3.3 Agent tier 부재

현재 모든 agent는 단일 `Agent` dataclass (agents.py:78-97). "basic vs advanced" tier 없음. 차이는:
- adapter_type (claude / gemini / codex / hermes)
- role (Lead / Engineer / QA / Writer / etc)
- fallback_chain 깊이

→ 사용자 vision의 "hermes = 고도화된 에이전트 tier"는 *adapter level*에서는 구현되어 있지만 (HermesAdapter), *tier 개념*은 명시적이지 않음.

---

## §4 LLM wiki = 영구 기억 장치 vision — 현재 상태

### 4.1 Wiki subsystem (검증됨, 60% 완성)

**완전히 작동하는 wiki API**:

1. **Backend** (`musu-bridge/wiki_routes.py`, 250 LOC):
   - `GET /api/wiki/pages` — 전체 페이지 리스트
   - `GET /api/wiki/search?q=...` — FTS5 full-text search w/ ranking
   - `GET /api/wiki/page/{id}` — 단일 페이지
   - `POST /api/wiki/page/{id}` — create/update
   - `DELETE /api/wiki/page/{id}` — delete

2. **Storage**: `~/llm-wiki/wiki/` (home dir, NOT in repo) — musu agents의 사용자별 영속 저장소

3. **Frontend** (`musu-bee/src/lib/wiki.ts`):
   ```typescript
   type WikiPage = {
     id, scope, title, summary, key_points, evidence,
     related, open_questions, source_raw, created_at, updated_at
   };
   ```
   구조화된 metadata가 SQLite에 column으로, content는 `source_raw`에 markdown으로.

4. **CLI ingest** (`wiki_ingest.py`, 200 LOC) — `~/llm-wiki/wiki/`에서 push/import

5. **LLM extraction** (`musu-bee/src/app/api/wiki/route.ts`, 149 LOC) — LLM으로 raw text → 구조화 wiki page 변환

### 4.2 Agent → wiki access (검증됨)

**musu-control MCP tools 4개** (`musu-control/server.py:2854-3106`):
- `list_wiki_pages()` — 2854
- `search_wiki(query)` — 2890
- `get_wiki_page(page_id, summary)` — 2944
- `write_wiki_page(page_id, content)` — 3089

**Agent instructions가 wiki를 SSOT로 사용 중**:
- `instructions/cto.md:30, 42` — work 전 wiki search, work 후 wiki save
- `instructions/marketing_strategist.md:21` — "Always save findings to wiki"
- `instructions/analytics_lead.md:12-13` — search + write wiki
- `instructions/content_creator.md:17-19` — search + get specific pages (e.g., `BRAND_VOICE_GUIDE`)

→ **wiki는 이미 영구 기억 장치 역할을 하고 있음**, 단 markdown으로.

### 4.3 Gaps (사용자 vision까지의 거리)

| Vision 항목 | 현재 상태 | Gap |
|---|---|---|
| 영구 저장 | ✅ `~/llm-wiki/wiki/` SQLite | 없음 |
| Agent access | ✅ MCP tools 4개 | 없음 |
| Search | ✅ FTS5 ranking | 없음 |
| 구조화 metadata | ✅ summary/key_points/evidence/related/open_questions | 없음 |
| **HTML 렌더링** | ❌ markdown only | **있음** — `musu-bee/AIDisplay.tsx:309`는 `<pre>{markdown}</pre>` (raw display) |
| `/wiki` UI 페이지 | ❌ API only | **있음** — `musu-bee/app/wiki/page.tsx` 없음 (`api/wiki/route.ts`만 있음) |
| Session memory | ❌ 매 invocation 새 시작 | **있음** — `handlers.py:2331` "Module-level in-memory store. Wipes on bridge restart" |
| Automatic context injection (RAG) | ❌ agent가 명시적으로 search_wiki 호출해야 함 | **있음** — auto-retrieval layer 없음 |
| Agent-to-agent memory handoff | ❌ 메커니즘 없음 | **있음** |

### 4.4 `~/.musu/memory/` 패턴은 없음

사용자의 Claude memory system (`C:\Users\empty\.claude\projects\.../memory/`)에 해당하는 musu-side 패턴이 없음. musu agents는 *wiki만* 영속, *대화 history는 비영속*. 

→ 이게 사용자 vision의 핵심 gap: "LLM wiki를 HTML로 만들어서 영구 기억 장치가 되어야 한다"의 의미가 *wiki를 conversation memory + knowledge memory 통합 layer*로 만들어야 한다는 뜻이라면, conversation persistence layer가 빠져 있음.

---

## §5 사용자 vision vs 현실 — 4-축 갭 매트릭스

| Vision | Layer 1 musu | Layer 2 paperclip | Layer 3 hermes | HTML wiki memory |
|---|---|---|---|---|
| **존재?** | ✅ 12 modules | ⚠️ guard + stub (concept) | ✅ adapter | ⚠️ markdown only |
| **Production ready?** | ✅ V23.4 hardening 진행 중 | ❌ "first-class routable" 미완 | ✅ subprocess CLI 작동 | ⚠️ FTS5 + CRUD OK, HTML/UI/RAG 없음 |
| **사용자 vision과 align?** | ✅ "맨앞에 musu파트" 동의 | ⚠️ musu의 자체 "company"가 paperclip 자리 점유 — 혼란 가능 | ⚠️ adapter level OK, tier level 미명시 | ⚠️ "HTML 영구 기억"의 HTML 부분 미구현 |
| **가장 큰 단일 gap** | mesh-wide tracing + V23.4 hardening bridge 적용 | "first-class routable" detector 구현 (v18.B 계획만 있음) | tier 개념 명시 (basic vs advanced agents) | markdown→HTML render layer + `/wiki` UI + RAG auto-retrieval |

---

## §6 권장 우선순위 — 사용자 vision 실현까지

### Step 1 (즉시, V23.5 후보): musu-bridge 백엔드 hardening 마무리

[[feedback-self-contained-product]] 통과, [[feedback-no-yagni-architecture]] 통과 — V23.4가 이미 50% 진행.

- musu-bridge POST /api/route + DB-write hot paths에 uniform try/catch (V23.4 F-B2-3 패턴)
- `/health/ready`에 migration 상태 + circuit breaker 추가
- X-Request-ID propagation through `forwarded_event` + mesh_router
- Error classification (DB / network / timeout) + full traceback logging

→ 이게 사용자가 말한 "백엔드가 탄탄해야하고" 의 직접 답. 7.2 → 8.5 목표.

### Step 2 (V23.5, 중간 cost): HTML wiki 렌더 layer 추가

wiki/455 §9 Step 2와 정렬:
- `musu-bee/app/wiki/[id]/page.tsx` 추가 (현재 없음) — Next.js page route
- markdown→HTML render (react-markdown + DOMPurify) 클라이언트 사이드
- wiki 구조화 metadata (summary, key_points, evidence)을 Tariq use case #14 "Feature Explainer" 형태로 렌더 (TL;DR + collapsible + tabbed code + FAQ)
- 자주 다시 읽히는 wiki page 우선 적용

→ 사용자 vision의 "HTML로 만들어서" 부분 직접 답. wiki/455 Step 2와 동일 작업.

### Step 3 (V24 후보, high cost): paperclip first-class routing

- `node_runtimes` 테이블에 paperclip을 stub이 아닌 real detector로 (FLEET_LAYER_NEXT_STEPS v18.B에 계획됨)
- musu가 자체 "company" 추상을 *paperclip aware*하게 — 즉 외부 paperclip runtime이 있으면 그쪽으로 routing, 없으면 자체 company로 fallback
- [[feedback-no-yagni-architecture]] gate 통과 필요: 외부 paperclip runtime이 실제로 *존재하는지* 먼저 결정. 없으면 musu의 자체 "company" 추상이 곧 layer 2 — 별도 paperclip layer 불필요

→ 이게 vision 실현의 가장 큰 architectural decision: paperclip을 **별도 external runtime**으로 둘지, musu가 **paperclip의 역할도 흡수**할지.

### Step 4 (V24 후보, high cost): wiki를 session memory와 통합

- conversation persistence table 추가 — `agent_session_memory` (agent_id, turn_id, summary, references_wiki_pages)
- agent invocation 시 wiki + recent session 자동 context로 inject (RAG)
- [[feedback-no-yagni-architecture]] gate 통과 필요: 현재 agent들이 *명시적으로 search_wiki()를 호출*하는 패턴이 작동 중. 자동 RAG가 가치를 더하는지 측정 필요

→ 사용자 vision의 "영구 기억 장치" 완성. 단 YAGNI 가장 위험한 영역 — 명시 호출 패턴이 *덜 마법적이지만 더 디버그 가능*.

### Step 5 (deferred): hermes tier 명시화

- `agents.tier` column 추가 (basic / advanced)
- advanced tier = hermes adapter + fallback_chain 의무화 + budget 상승
- 현재는 adapter_type 선택으로 사실상 같은 효과 — column 추가는 *YAGNI 위험 매우 높음*

→ 사용자 vision에 명시적이지 않으면 deferred. 현재 adapter level 구분이 충분.

---

## §7 References

- F:\workspace\musu-bee\docs\PRODUCT_CHARTER\SSOT_1PAGE_2026-04-09.md — 3-layer 모델 명시 (line 10-11)
- F:\workspace\musu-bee\docs\PRODUCT_CHARTER\FLEET_LAYER_NEXT_STEPS_2026-05-13.md — paperclip/hermes "first-class routable" 미완 명시 (line 17, 32, 34)
- F:\workspace\musu-bee\musu-plugin\hooks\paperclip_guard.py — paperclip production code
- F:\workspace\musu-bee\musu-core\src\musu_core\adapters\hermes.py — hermes production adapter
- F:\workspace\musu-bee\musu-bridge\wiki_routes.py — wiki backend (250 LOC, 5 endpoints)
- F:\workspace\musu-bee\musu-control\src\musu_control\server.py:2854-3106 — wiki MCP tools (4개)
- F:\workspace\musu-bee\musu-core\src\musu_core\db.py:15-236 — schema (14 tables, WAL, FK ON)
- F:\workspace\musu-bee\musu-core\src\musu_core\middleware.py:117-158 — HMAC bearer token auth
- wiki/455 — HTML over Markdown research (Tariq) — companion doc
- [[project-musu-repo-layout]] — musu.pro path vs musu-bee distinction
- [[feedback-self-contained-product]] — external runtime dependency gate
- [[feedback-no-yagni-architecture]] — every step의 정당화 gate

---

## §8 Honesty notes

1. **3-layer는 vision이고 SSOT 문서에 있지만 production code가 layer-aware하지 않음**. musu의 "company" 추상이 paperclip의 자리를 *반쯤* 점유 중 — 사용자가 외부 paperclip runtime을 *별도로 가져올 계획*이라면 충돌 가능, *없다면* musu가 paperclip 역할도 흡수하는 게 [[feedback-no-yagni-architecture]] 통과.

2. **Backend 7.2/10는 honest 평가**: V23.4 hardening이 musu-relay에 집중되고 musu-bridge에 미적용된 게 가장 큰 gap. 코드 자체는 잘 짜여 있지만 V23.4 audit pattern을 적용하지 않으면 같은 class의 결함이 musu-bridge에 누적 가능.

3. **HTML wiki memory는 60% 완성이지만 핵심 layer (HTML render + `/wiki` UI) 부재**. 사용자가 wiki/455 (Tariq research)를 읽고 vision을 떠올린 게 정확함 — 인프라가 거의 다 있고 render layer만 추가하면 됨. 단 *session memory*와 *knowledge memory*를 통합할지는 별도 결정 (Step 4).

4. **"고도화된 에이전트 = hermes" 가정 검증 필요**: HermesAdapter는 *Hermes CLI를 subprocess로 실행하는 adapter*. 사용자가 말한 "hermes agent (고도화된 에이전트)"가 *Hermes CLI* 자체인지, *agent tier*인지 확인 필요. 현재 코드는 전자 — adapter level. 후자라면 tier 추가 작업 필요 (Step 5).

**Status**: Research 완료. wiki/456으로 ID 예약. 4 step 권장 우선순위 (§6) 사용자 확인 후 master plan 진입.
