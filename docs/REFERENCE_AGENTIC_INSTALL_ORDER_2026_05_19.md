# V23.6 Planning Input — Agentic Project Install Order (5-step) + AutoAgent self-improving meta-agent

**Wiki ID**: wiki/484
**Category**: V23.6 planning input (NOT external reference / research — §3 contains live sub-WS candidates)
**Date**: 2026-05-19
**Source**: §1 = tweet/post (author unattributed); §3.7 = Kevin Goo AutoAgent + Karpathy auto-research (https://www.youtube.com/watch?v=RoaPvj9Ovug)
**Status**: doc-only, informs V23.6 master plan Phase −1 strategic gate when authored
**Predecessor**: wiki/450 (V23.4 Phase 4 iter-2 qual eval — unchanged, this doc was renamed from wiki/450 → wiki/484 in commit follow-up to resolve ID collision detected by Critic, see §Revision)
**Companion**: musu fit-gap analysis in chat 2026-05-19 (preserved in §2-§3 below)

---

## §1 Original text (verbatim)

> anybody who uses or learns agentic systems, SHOULD READ THIS
>
> the install order I run before any new agentic project:
>
> 1. PRIVACY: direnv + a real secrets manager
>
> install direnv, then plug it into your team's password manager (1Password CLI via op run, doppler, infisical, vault, pick one)
>
> what direnv does: loads per-folder environment variables when you cd in, unloads when you cd out. the real move is wiring it into your secrets manager so credentials NEVER live in plain text on disk
>
> what this stops:
> - API keys accidentally committed to git history, the most common AI agent breach pattern in 2026
> - credentials leaking from one project into another through your shell history
> - shared .env files that one teammate quietly backs up to Dropbox
> - secrets that survive a laptop theft because they were sitting in /Users/you/projects
>
> the part nobody mentions: most "my agent got jailbroken" stories actually trace back to one credential the agent had access to that it shouldn't have. scope keys to projects, scope projects to folders, and the blast radius of any single compromise drops dramatically
>
> I shipped 2 agents with keys in .env files before switching. the day I plugged direnv into op run I stopped having that whole class of nightmare
>
> 2. TOKENS: litellm or portkey as your model proxy
>
> one URL that fronts every AI provider (Anthropic, OpenAI, Google, Mistral, local models). all your spend flows through one place
>
> what it saves you:
> - response caching keyed by prompt hash, cuts your bill 30-60% on repeat tasks
> - automatic fallback on rate limits (Sonnet hits a 429? falls to Opus, then GPT, then your local backup, no broken users)
> - per-feature and per-user budget caps, block the call before it costs $200 instead of auditing it after
> - model routing rules, cheap tasks to Haiku, expensive ones to Opus, never the wrong way
> - PII redaction before requests leave your network, security side benefit
>
> the part nobody mentions: every "$4k AI bill" story I've heard ends with "we didn't have a proxy in front." this is where you put guardrails around spend BEFORE the spend happens
>
> I built my own router for 2 weeks. it took 20 minutes to replace with litellm. I will be embarrassed about this forever
>
> 3. CONTEXT: uv + git commit on every passing eval
>
> install uv (the new Python package manager, 10-100x faster than pip+venv, by the Astral team behind ruff). then commit every time an eval suite PASSES, with the model version and pass rate in the commit message
>
> what this preserves:
> - exact dependency set via uv.lock, you always know which packages your agent was using, no nasty surprises from a quiet update
> - exact prompt + code state, you can reproduce any past run from a single git hash
> - exact model version paired to exact pass rate, a paper trail when prod breaks weeks later
> - one-command rollback to a known-working state when a refactor goes sideways
> - a compliance story, every prompt version tied to a model version in your commit log
>
> the security side: when something blows up in prod, you want to say "the prompt was version X, model was Sonnet 4.6.1, last eval pass rate was 94%." not "I think we deployed on Tuesday?" the first is an incident report. the second is a resignation letter
>
> I've lost more agents to "I changed 3 prompts in one session and broke something" than to any actual bug
>
> 4. VISIBILITY: mitmproxy in front of every LLM call
>
> it's basically a wiretap for your agent. install it, point your agent through it, and now you see every conversation your agent has with the model in real time
>
> what actually shows up:
> - every silent retry your SDK sneaks in when a call fails
> - the full prompt being sent (including any creds you accidentally embedded)
> - what the model returns BEFORE your code reacts to it
> - exact token cost per call, per tool, per loop iteration
> - responses that quietly trigger your code into doing something you didn't intend, this is where prompt injection lives
>
> the part nobody talks about: if a website your agent scraped slipped instructions into its data, mitmproxy is how you SEE the moment your agent decides to follow them. without this layer, you're trusting your agent did the right thing, not verifying
>
> I shipped 3 agents before adding this. I have no honest idea what they were doing in production
>
> 5. EVALS: inspect-ai (the framework the labs actually use)
>
> an eval framework is what tells you "this agent works" with numbers instead of vibes. inspect-ai is the one Anthropic, DeepMind, and the UK AI Safety Institute use for the eval reports you read in their papers. open source, MIT licensed
>
> what your homegrown version won't have:
> - run the same task across 5 different models and compare scores side by side
> - pre-built tests for risky agent behavior (lying, manipulating, misusing tools)
> - proper structure for evaluating tool-using agents, not just chat
> - repeatable scoring, the same input always gets graded the same way
> - reproducible eval seeds, so a flaky test is actually flaky and not just unlucky
>
> I wrote my own eval harness 4 times across 4 projects. threw it out 4 times
>
> if you ever want to say "my agent passes safety checks" out loud, the check has to come from a framework someone else can re-run. this is that framework
>
> the move that ties this together: keep a /lessons.md in every repo. every weird agent behavior, every edge case, every config change you find at 2am, write it down
>
> you will not remember it. you'll come back in 3 weeks and the lessons file is the only reason you still know what's going on
>
> lock these 5, keep the lessons file, your next agentic system takes 2 days instead of 2 months
>
> p.s. half of "AI agent" content online is people who've never run mitmproxy on their own loop. they don't actually know what their agent is doing. they're shipping demo videos. don't be that guy

---

## §2 musu fit-gap (chat summary 2026-05-19)

| Step | musu에 있나? | 증거 / 갭 |
|---|---|---|
| **1. PRIVACY (direnv + secrets manager)** | 🟡 부분 | `musu-bridge/.env.example`는 존재 (env-var 패턴 자체는 있음). 그러나 direnv + secrets-manager 자동 inject layer는 없음. V23.5 C-3에서 `MUSU_USER_LLM_API_KEY`를 환경변수로 받는데, 사용자가 평문 `.env`나 shell rc에 둘 가능성 높음. [[feedback-self-contained-product]]와는 별개 (operator 측 hygiene). |
| **2. TOKENS (litellm/portkey proxy)** | ❌ 없음 | musu-bridge가 자체 adapter (Claude/Gemini/Codex/HermesAdapter)를 갖고 있는데 caching/fallback/budget cap layer는 없음. C-3 `cos_briefing_agent.py`가 anthropic SDK 직접 호출. "$4k AI bill" 시나리오에 노출. |
| **3. CONTEXT (uv + commit on eval pass)** | 🟡 부분 | uv는 musu-bridge `pyproject.toml`에 미적용 (pip 기반). commit on eval pass는 agent-team chain (Critic/Auditor + commit per sub-WS)이 정확히 그 패턴 — model version 인용 부분만 약함. |
| **4. VISIBILITY (mitmproxy)** | ❌ 없음 | musu-bridge가 LLM call을 자체 logger로 telemetry (V23.5 H-5 + cos_synthesis_ok/failed structured logs in `cos_briefing_agent.py:180-190` — token counts + duration + page_count만, 4 hard constraint (d) 때문에 prompt/response body 의도적 제외)는 있지만, **request/response body wire-tap은 없음**. 실제 prompt injection surface 존재: `cos_briefing_agent.py:119-129`가 wiki page `summary_excerpt` 내용을 LLM prompt에 직접 inject — wiki page가 agent가 작성하는 경우 이론적 injection chain 가능. |
| **5. EVALS (inspect-ai)** | ❌ 없음 | pytest + jest + Playwright는 코드 정확성. agent 행동 quality eval은 없음. V23.7 promotion criterion (40% click rate)도 행동 eval이 아니라 usage metric. |

### "/lessons.md" 부분

musu에는 부분적으로 있음:
- `~/.claude/projects/.../memory/MEMORY.md` (자동 메모리, 8 entries)
- `docs/V23_*_QUAL_EVAL_*.md` (sub-WS별 정성 평가)
- `docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md` (T2-Z runtime smoke-test gap process doc)

다만 "2AM에 발견한 weird agent behavior" 식의 lightweight running log는 없음. `docs/LESSONS_LEARNED.md` 추가는 V23.6 작은 sub-WS 후보.

---

## §3 V23.6 sub-WS 후보

**Ranking is provisional** — final order decided by V23.6 master plan Phase −1 panel. "Leverage proxy" column gives a falsifiable handle (firewall-unlock / scale-bound / dev-experience), not absolute ordering.

| # | Item | Est. LOC | Risk | Leverage proxy | Rationale |
|---|---|---|---|---|---|
| 1 | **mitmproxy wiretap (dev mode)** | ~80 + doc | LOW | unlocks: dev visibility into 1 call site (C-3) | `MUSU_DEV_WIRETAP=1` flag로 musu-bridge LLM call을 :8888 proxy. C-3 synthesis가 첫 consumer. 현재 prompt injection 감지의 유일한 코드-단계 layer (W-2 DOMPurify는 HTML render layer, prompt layer는 아님). |
| 2 | **direnv pattern doc + `.envrc.example`** | ~40 + doc | LOW | unlocks: operator hygiene baseline | musu 설치 가이드에 direnv + op run 추가. `MUSU_USER_LLM_API_KEY` 평문 `.env` 회피. operator 책임, musu 코드 변경 없음. |
| 3 | **litellm in front of `cos_briefing_agent`** | ~120 | MED | **unlocks 2/4 firewall #7 preconditions** (LLM caching layer + budget UI per W-8 closure §2 row #7) — V23.7 Y-path promotion 전제 조건 직접 충족 | C-3 anthropic 직접 호출 → litellm 교체. budget cap + caching + fallback. 4 hard constraints과 호환 (graceful degrade 더 robust). **V23.7 Y-path promotion 전 단계.** |
| 4 | **uv migration** | ~60 + lockfile | LOW | unlocks: install speed + dep reproducibility | musu-bridge `pyproject.toml` + lockfile → uv. CI 영향 작음. |
| 5 | **LESSONS_LEARNED.md running journal** | ~30 + 5 seeds | LOW | unlocks: 2AM-debugging knowledge capture (현재 qual eval은 sub-WS 사후, MEMORY.md는 structured per type) | wiki/484는 정식 doc, LESSONS는 running journal. |
| 6 | **inspect-ai eval suite** | ~300+ | **HIGH** | unlocks: agent behavior quality eval (현재 pytest는 코드 정확성, V23.7 metric은 usage — 둘 다 행동 quality 아님) | V23.7+ 후보. Phase −1 mini-gate 필요 — [[feedback-no-yagni-architecture]] 검증: "현재 pytest + Playwright + V23.7 click-rate metric이 진짜 행동 quality eval을 못하나?" |
| 7 | **Meta-agent harness experimentation (AutoAgent-style)** — see §3.7 below | **~500+** | **HIGH+ research-tier** | unlocks: harness self-optimization (Karpathy auto-research analog at agent layer) | **V23.7+ 또는 별개 research workstream.** [[feedback-self-contained-product]] 위배 위험 (parallel sandbox + 24h LLM budget); [[feedback-no-yagni-architecture]] 명시 검증 필요; invariant lock 메커니즘 필수. |

### §3.7 Meta-agent harness experimentation — AutoAgent-style (candidate #7 detail)

**Source**: Kevin Goo AutoAgent (https://www.youtube.com/watch?v=RoaPvj9Ovug) — extends Andrej Karpathy's auto-research idea from ML training code to agent harness.

**Core pattern**:
- **Karpathy auto-research**: meta-agent edits `train.py`, runs 5-min training, evaluates, keeps/discards. Human writes `program.md` (natural-language directives) only.
- **AutoAgent**: same loop but target is `agent.py` (task agent harness). Meta-agent spins up thousands of parallel sandboxes, runs task agent on eval benchmarks, decides keep/revert. Result: "domain-specific tooling, verification loops, orchestration logic, things that nobody programmed, that it all discovered autonomously."

**musu fit-gap** (separate from §2 main fit-gap):

| musu의 layer | 현재 상태 | AutoAgent 패턴 적용 시 |
|---|---|---|
| Agent harness | `seed_agents.py` 6 system agents + `instructions/*.md` 18개 + Layer 0 CoS + T2-A' workflow runner | meta-agent가 instruction.md + agent definitions를 mutate |
| Eval target | pytest (코드 정확성) + V23.7 click-rate (usage) | **agent behavior benchmark 부재** — #6 inspect-ai가 prerequisite |
| Sandbox infra | T2-A' (production execution, 1-tier) | parallel meta-experiment sandbox 없음 |
| Natural-language directive layer | 18 `instructions/*.md` 분산 | AutoAgent는 단일 `program.md`로 통합 |
| Meta-agent | **없음** (가장 큰 gap) | task agent를 최적화하는 agent — 신규 layer 도입 |

**Stress points** (V23.7+ Phase −1 strategic gate에서 검증 필요):

1. **[[feedback-self-contained-product]] 위배 위험**: "thousands of parallel sandboxes" + 24h LLM run-time은 사용자 GPU/API 예산을 dramatically 소비. C-3 4 hard constraints (cost preview + explicit API key + graceful degrade) 같은 ceiling을 메타-agent에도 적용해야 함. 사용자가 명시적 opt-in해야 한 번이라도 실행됨.
2. **[[feedback-no-yagni-architecture]] scale 검증**: musu의 현 사용 시나리오는 single user / 4 companies / few PCs. AutoAgent는 ML research lab 규모 가정. **musu scale에서 meta-agent harness optimization이 ROI 있나?** 반론 데이터: V23.5 Phase −1에서 사용자 발화 "agent들이 wiki 쓰면 다음 agent가 더 잘 흡수" — instruction tweak이 agent 협업 품질에 영향 → 자동화 가치 있을 수 있음. 정량 데이터 필요.
3. **Harness drift 위험**: 24시간 무인 실행 후 instruction.md / agent.py가 어떻게 바뀌었는지 사람이 못 따라감. V23.5 H-1/H-5 fail-open invariant + V23.5 C-3 4 hard constraints 같은 **invariant lock 메커니즘** 없이는 위험. musu 도입 시 hard rule 필요: "특정 파일은 meta-agent가 절대 self-modify 못함" (e.g., schema migrations, secrets, system-level seed agents).
4. **#6 inspect-ai prerequisite**: behavior eval 없으면 meta-agent가 keep/revert 결정 못함. #7은 #6 ship 후에만 가능.
5. **Cost ceiling**: AutoAgent 1회 24h run의 LLM cost 추정 — V23.5 C-3 ~$0.20 per synthesis × 수천 iterations = $$$$. 사용자 명시 budget cap이 musu 자체 invariant이어야 함.

**Reactivation criteria for V23.7+ master plan**:
- #6 inspect-ai shipped 그리고 baseline behavior metric 60d 누적
- 사용자가 명시적으로 "harness 자동 최적화 원함" 요청 (현재까지는 instruction.md를 직접 작성하는 게 user vision)
- LLM budget cap + invariant lock 메커니즘 사전 설계
- self-contained 위배 정도 정량 평가 (몇 iteration까지 user 예산으로 감당 가능한가?)

### 위치 in V23.6 master plan

V23.6 master plan은 운영자 main-merge(#436) 후 작성 예정. Phase −1 strategic gate 입력:
- 후보 #1, #2, #5는 low-disruption — V23.6 master plan §1 candidate
- #3은 V23.7 firewall #7 unlock precondition으로 V23.6 우선 (위 leverage proxy 참조)
- #4는 별개 sub-WS — V23.6 Wave 1 또는 standalone
- #6은 V23.7+ — [[feedback-no-yagni-architecture]] 검증 필요
- **#7은 V23.7+ 또는 별개 research workstream** — #6 ship 그리고 60d behavior metric 누적 후에만 검토

---

## §4 References

- wiki/459 v4: V23.5 master plan — example of Phase −1 strategic gate output (template for V23.6 gate when authored)
- wiki/460: V23.5 implementation plan — §9 V23.6 forward-pointers section extended for this doc's candidate table
- wiki/469: V23.5 W-8 closure — V23.6 firewall 10 items (this doc's candidate #3 unlocks 2/4 firewall #7 preconditions)
- wiki/488 reserved: V23.7 promotion criterion (≥40% click rate / 60d) — distinct from candidate #6 inspect-ai (behavior quality eval), distinct from candidate #7 AutoAgent (harness self-optimization)
- [[feedback-self-contained-product]] — applied to candidate #3 (litellm: in-process, no external SaaS), candidate #4 (uv: in-process), candidate #7 (AutoAgent: critical risk — user budget consumption)
- [[feedback-no-yagni-architecture]] — applied to candidate #6 (inspect-ai: prove pytest insufficient), candidate #7 (AutoAgent: prove musu-scale ROI)
- [[feedback-strategic-critic-gate]] — V23.6 master plan Phase −1 panel will stress-test all 7 candidates above
- `cos_briefing_agent.py:55-198` (V23.5 C-3 commit 822b236) — candidate #3 litellm 교체 대상; lines 119-129 prompt construction = candidate #1 mitmproxy visibility target; lines 180-190 H-5 telemetry = current observability layer
- `musu-bridge/.env.example` — candidate #2 direnv pattern current baseline (env-var pattern exists, direnv layer absent)
- Karpathy auto-research + Kevin Goo AutoAgent — candidate #7 source (YouTube 2026-05-19 explainer)
- `~/.claude/projects/.../memory/MEMORY.md` — existing /lessons.md proxy (candidate #5 LESSONS_LEARNED.md complements this with running-journal style)

---

## §Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-05-19 v1 | Initial doc as wiki/450, "Reference" category, 6 candidates | First write per user request "위키에 원문 그대로 넣고, 추후 계획에 넣자" |
| 2026-05-19 v2 (this) | wiki/450 → **wiki/484** rename; category "V23.6 planning input"; candidate #7 AutoAgent added (§3.7); fit-gap rows #1 + #4 tightened; candidate #3 firewall #7 unlock precondition noted; ranking marked provisional + leverage proxy column | Adversarial Critic (system-architect) returned SHIP-WITH-FIXES on commit 3d72020 with 3 HIGH + 5 MED + 2 LOW findings. Key fix: wiki/450 ID collision with V23.4 Phase 4 iter-2 qual eval (5+ inbound citations broken). |
