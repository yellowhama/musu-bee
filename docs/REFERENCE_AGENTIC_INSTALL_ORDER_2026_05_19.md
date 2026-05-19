# Reference — Agentic Project Install Order (5-step)

**Wiki ID**: wiki/450
**Date**: 2026-05-19
**Source**: Tweet/post (author unattributed in citation; preserved verbatim for V23.6 master plan input)
**Status**: external reference; informs V23.6 master plan §9 forward-pointers
**Companion**: musu fit-gap analysis in chat 2026-05-19 (summarized in §Application below)

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
| **1. PRIVACY (direnv + secrets manager)** | ❌ 없음 | V23.5 C-3에서 `MUSU_USER_LLM_API_KEY` 환경변수로 받지만, 사용자가 `.env`나 shell rc에 평문으로 둘 가능성 높음. direnv + op run 패턴은 wiki/460 어디에도 없음. [[feedback-self-contained-product]]와는 별개 문제 (operator 측 hygiene). |
| **2. TOKENS (litellm/portkey proxy)** | ❌ 없음 | musu-bridge가 자체 adapter (Claude/Gemini/Codex/HermesAdapter)를 갖고 있는데 caching/fallback/budget cap layer는 없음. C-3 `cos_briefing_agent.py`가 anthropic SDK 직접 호출. "$4k AI bill" 시나리오에 노출. |
| **3. CONTEXT (uv + commit on eval pass)** | 🟡 부분 | uv는 musu-bridge `pyproject.toml`에 미적용 (pip 기반). commit on eval pass는 agent-team chain (Critic/Auditor + commit per sub-WS)이 정확히 그 패턴 — model version 인용 부분만 약함. |
| **4. VISIBILITY (mitmproxy)** | ❌ 없음 | musu-bridge가 LLM call을 자체 logger로 telemetry (V23.5 H-5 + cos_synthesis_ok/failed structured logs)는 있지만, **request/response body wire-tap은 없음**. prompt injection 감지 layer 부재. |
| **5. EVALS (inspect-ai)** | ❌ 없음 | pytest + jest + Playwright는 코드 정확성. agent 행동 quality eval은 없음. V23.7 promotion criterion (40% click rate)도 행동 eval이 아니라 usage metric. |

### "/lessons.md" 부분

musu에는 부분적으로 있음:
- `~/.claude/projects/.../memory/MEMORY.md` (자동 메모리, 8 entries)
- `docs/V23_*_QUAL_EVAL_*.md` (sub-WS별 정성 평가)
- `docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md` (T2-Z runtime smoke-test gap process doc)

다만 "2AM에 발견한 weird agent behavior" 식의 lightweight running log는 없음. `docs/LESSONS_LEARNED.md` 추가는 V23.6 작은 sub-WS 후보.

---

## §3 V23.6 sub-WS 후보 (high-leverage → low-leverage)

| Rank | Item | Est. LOC | Risk | Rationale |
|---|---|---|---|---|
| 1 | **mitmproxy wiretap (dev mode)** | ~80 + doc | LOW | `MUSU_DEV_WIRETAP=1` flag로 musu-bridge LLM call을 :8888 proxy. C-3 synthesis가 첫 consumer. prompt injection 감지의 유일한 코드-단계 layer. |
| 2 | **direnv pattern doc + `.envrc.example`** | ~40 LOC + doc | LOW | musu 설치 가이드에 direnv + op run 추가. `MUSU_USER_LLM_API_KEY` 평문 `.env` 회피. operator 책임, musu 코드 변경 없음. |
| 3 | **litellm in front of cos_briefing_agent** | ~120 LOC | MED | C-3 anthropic 직접 호출 → litellm 교체. budget cap + caching + fallback. 4 hard constraints과 호환 (graceful degrade 더 robust). |
| 4 | **uv migration** | ~60 LOC + lockfile | LOW | musu-bridge `pyproject.toml` + lockfile → uv. install 속도 + reproducibility. CI 영향 작음. |
| 5 | **inspect-ai eval suite** | ~300+ LOC | HIGH | musu agent 행동 (CoS briefing 정확도, workflow runner reliability) eval. V23.7+ 후보. Phase -1 mini-gate 필요 (`[[feedback-no-yagni-architecture]]` 위반 확인). |
| 6 | **LESSONS_LEARNED.md** | ~30 LOC + 5 seed entries | LOW | musu 운영 중 2AM-debugging 발견 사항 lightweight log. wiki/472는 정식 doc, LESSONS는 running journal. |

### 위치 in V23.6 master plan

V23.6 master plan은 운영자 main-merge(#436) 후 작성 예정. Phase -1 strategic gate 입력:
- 위 6개 중 #1, #2, #6은 low-disruption — V23.6 master plan §1 candidate
- #3은 C-3 production usage 데이터 누적 후 결정 (V23.7 promotion criterion와 같이)
- #4는 별개 sub-WS — V23.6 Wave 1 또는 standalone
- #5는 V23.7+ — `[[feedback-no-yagni-architecture]]` 검증 필요 ("내 pytest 못 잡는 것 무엇? 단순 LLM 행동 metric으로 충분?")

---

## §4 References

- wiki/459 v4: V23.5 master plan — Phase -1 strategic gate 형식 입력 후보
- wiki/460: V23.5 implementation plan §9 V23.6 forward-pointers
- wiki/469: V23.5 W-8 closure — 기존 firewall 10 items (수정 후 16 items 검토)
- wiki/479: V23.7 promotion criterion (≥40% click rate / 60d) — inspect-ai eval과 차별점
- [[feedback-self-contained-product]] — #2 litellm + #3 uv: external SaaS dep 추가 위험 검증
- [[feedback-no-yagni-architecture]] — #5 inspect-ai: 현재 pytest 부족 입증 후 도입
- [[feedback-strategic-critic-gate]] — V23.6 master plan Phase -1 board panel에 위 6개 stress-test
- `cos_briefing_agent.py` (V23.5 C-3 commit 822b236) — #3 litellm 교체 대상
- `~/.claude/projects/.../memory/MEMORY.md` — existing /lessons.md proxy
