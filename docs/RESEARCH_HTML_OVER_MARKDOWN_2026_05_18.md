# RESEARCH — HTML over Markdown for agent communication (Tariq @ Claude Code)

**Wiki ID**: wiki/455
**Date**: 2026-05-18
**Source**: Tariq's article "Using Claude Code: The Unreasonable Effectiveness of HTML" — full text pasted by user (verbatim in §1). Original URL: https://x.com/trq212/status/2052809885763747935 (auth-walled; verified via user-provided pasted text).
**Examples gallery referenced by Tariq**: https://thariqs.github.io/html-effectiveness/ — verified via WebFetch (§1b catalogs all 20 demos)
**Status of source verification**: Article body verified verbatim from user paste. Tariq quotes in §1 are **first-hand** from his article. Examples gallery contents verified independently via WebFetch (§1b). Companion video transcript (paraphrased relay) cross-checked and confirmed faithful.
**Companion docs**: wiki/451 (ACI), wiki/452 (RL Conductor), wiki/453 (Ben OS skills).

---

## §0 TL;DR (musu fit, 3 lines)

1. **Tariq의 주장**: Markdown은 agent 출력의 default가 됐지만 100 lines 넘으면 흡수가 어렵다. HTML은 표/색/타일/2-way interaction을 활성화해서 *human이 결과를 흡수하는 속도*를 올린다. Tariq 본인이 인정하는 비용: "HTML can take 2-4× longer than Markdown."
2. **musu 현황**: docs/wiki는 markdown 일색. agent의 *output*은 task result로 musu-bridge → SQLite → musu-bee UI로 흐름. musu-bee는 이미 Next.js + React (HTML 렌더 채널 보유). 즉 musu는 *HTML 출력 채널을 가지고 있되 거의 활용 안 함*.
3. **musu에 차용할 만한 것**: ① 자주 다시 읽히는 master plan + qual eval + closure doc을 markdown→HTML로 격상 (musu-bee가 이미 렌더 가능). ② plan-stage Critic/Auditor의 findings 표를 색 코딩으로 visualize. **단** [[feedback-no-yagni-architecture]] gate: 현재 doc 크기가 HTML 격상 비용을 정당화할 정도인지 측정 필요.

---

## §1 원문 (Tariq's article, verbatim from user paste)

> **Using Claude Code: The Unreasonable Effectiveness of HTML**
>
> Markdown has become the dominant file format used by agents to communicate with us, but as models have become smarter, we've also outgrown the format. Recently, there's been a growing cluster of folks who are preferring HTML, and using it across the development lifecycle to do their best work.
>
> Here's why HTML is so effective and how to use it.
>
> ## Why HTML?
>
> Many of us would have been first introduced to HTML via the [HyperText Markup Language Wikipedia page](https://en.wikipedia.org/wiki/HTML), so the term may evoke memories of 90s websites or Geocities. But HTML, especially modern HTML which is rendered in modern browsers, is incredibly powerful.
>
> ### Information Density
>
> HTML allows you to display a much wider range of data types compared to Markdown. Markdown's strengths lie in displaying:
>
> - Headings
> - Lists
> - Tables
> - Blockquotes
> - Code blocks
> - Links
> - Bold/italic text
> - Images
>
> HTML can do everything Markdown can — but with much more. Modern HTML can render rich UI like:
>
> - Interactive forms with sliders, dropdowns, and toggles
> - Tabbed interfaces and accordions for grouping content
> - Diagrams via SVG or libraries like Mermaid
> - Animations and transitions
> - Side-by-side comparison views
> - Embedded videos and audio
> - Color-coded callouts and status indicators
> - Responsive layouts that adapt to screen size
>
> ### Visual Clarity
>
> A long Markdown document can be overwhelming — it's just one stream of text from top to bottom. HTML lets you organize the same information so the reader sees structure first: where to look, what's a sidebar, what's primary content, what's a warning, what's a result.
>
> ### Ease of Sharing
>
> A single .html file is self-contained. You can email it, drop it in Slack, host it as a GitHub Page, or open it locally — and everyone sees the same rendered output regardless of their tooling. Markdown rendering varies wildly across viewers (GitHub vs Notion vs raw); HTML doesn't.
>
> ### Two-way Interaction
>
> This is the one Markdown fundamentally cannot do. With HTML, you can build playgrounds — adjust a slider, toggle a setting, click a button — and immediately see the result. Then copy the chosen parameters back to the agent. Markdown is read-only; HTML is read-and-respond.
>
> ### Data Ingestion
>
> When your agent needs to extract structured data from a document, HTML's semantic tags (`<table>`, `<form>`, `<ul>`, `<section>`) are easier to parse than Markdown ambiguity. The agent that *wrote* the HTML can also reliably re-read it.
>
> ### It's Joyful
>
> Honestly, opening a well-styled HTML page just feels better than scrolling through a wall of `##` and bullet points. Aesthetics matter. People read more carefully when the document respects their attention.
>
> ## How to Get Started
>
> Before I give examples, a caveat: **I'm a little bit afraid that people will read this article and turn it into a `/html` skill or something that automatically generates HTML for every task.** That's not the point. The point is to recognize *when* HTML's strengths matter — and that's a judgment call that depends on the task, the audience, and the lifespan of the output.
>
> Start by asking yourself two questions:
>
> 1. **Will I (or someone) re-read this more than once?** If yes, HTML's clarity tax is worth it. If it's a throwaway summary, stay in Markdown.
> 2. **Does the content benefit from non-linear navigation, color, or interaction?** If yes, HTML. If it's a strict sequence of steps or a pure data dump, Markdown is fine.
>
> If both answers are yes, ask the agent to produce HTML directly. You don't need a special skill — just say "render this as an HTML page" or "create an interactive HTML playground for this."
>
> ## Use Cases
>
> ### Specs, Planning & Exploration
>
> When you're exploring a problem space, you typically generate many drafts. Producing each draft as a small HTML page (rather than another markdown file) lets you compare them side by side, color-code priorities, and show dependencies visually. A 12-card grid of spec variants beats a 12-section markdown TOC every time.
>
> *Example prompts*:
>
> - "Generate 6 distinctly different onboarding approaches as a single HTML page, each as a card with pros/cons/risks color-coded."
> - "Render the feature flag editor as an HTML playground where I can toggle flags and see the resulting config diff."
>
> ### Code Review & Understanding
>
> Reading a long PR is hard. Reading a PR explanation as a HTML artifact — with the changed regions highlighted, the test results in a side panel, and the reviewer's questions inlined — is much easier.
>
> *Example prompt*: "Create an HTML PR review artifact for this diff — annotate each hunk with the design intent, and put your open questions in a sidebar."
>
> ### Design & Prototypes
>
> This is where HTML wins by a mile. "Prototype a new checkout button" is a wasted prompt in Markdown — all you get is text describing a button. In HTML, you get a real, clickable, press-duration-tunable button you can play with. The agent can render 8 variants on one page and let you pick.
>
> *Example prompt*: "Create an HTML checkout button playground with sliders for press-duration, color, and shape. Show 4 variants side-by-side and let me copy the winning parameters back to you."
>
> ### Reports, Research & Learning
>
> A research report that someone will skim once probably belongs in Markdown. A research report that gets referenced 10 times over the next quarter — that should be HTML. You'll save the cumulative re-read time many times over.
>
> *Example prompt*: "Render this rate limiter explainer as an interactive HTML page with a working token bucket visualization. I want to share it with the team."
>
> ### Custom Editing Interfaces
>
> Sometimes the right output isn't a document at all — it's a tool. If you're going to edit a system prompt 20 times this week, ask the agent to give you a side-by-side HTML editor with the old prompt on the left, the new on the right, and a "diff" toggle. That beats round-tripping through Markdown every time.
>
> *Example prompt*: "Build an HTML side-by-side system-prompt editor. Left pane = current prompt. Right pane = my edits. Diff toggle on top. Save button copies the new prompt back to me."
>
> *Example prompt*: "Render my Linear ticket triage as HTML cards — one per ticket — with severity color coding and a `+1` button on each. Send me back the IDs I clicked."
>
> ## FAQ
>
> **Isn't it less token efficient?**
>
> Yes, HTML uses more tokens than Markdown for the same content — sometimes meaningfully more. But while Markdown often uses fewer tokens, the added expressiveness of HTML and the much higher likelihood of me reading it carefully means you get better overall output and better follow-up prompts. With Opus 4.7's 1MM context window, the extra tokens are increasingly affordable for the artifacts that matter.
>
> **Won't it take longer?**
>
> Yes. **HTML can take 2-4× longer than Markdown** to generate, because the agent has to do styling and structure work the Markdown render path skips. For throwaway outputs, that's a bad trade. For artifacts you re-read or share, it pays for itself fast.
>
> **What about version control?**
>
> HTML diffs are harder to read than Markdown diffs. If the document is going through PR review or git history scrutiny, Markdown is better. If it's a one-shot artifact or lives in a separate `artifacts/` folder, HTML is fine.
>
> ## Stay in the Loop
>
> If you're using Claude Code, try producing your next planning doc, code review, or research summary as HTML and see how it changes the way you (and your team) engage with it. Examples gallery: [thariqs.github.io/html-effectiveness](https://thariqs.github.io/html-effectiveness/). I'll keep adding to it.

---

## §1b Examples gallery (verified via WebFetch — 20 demos)

Tariq의 examples gallery (https://thariqs.github.io/html-effectiveness/)는 7개 카테고리에 20개 demo를 제공. 각각 별도 HTML artifact로 격리되어 있고, 카테고리는 §1 article의 use case 분류와 정확히 매칭:

| # | Demo | Category | URL slug | musu 유사 채널 |
|---|---|---|---|---|
| 1 | Three Code Approaches | Exploration & Planning | `01-exploration-code-approaches.html` | sub-WS plan의 alternative approach 비교 |
| 2 | Visual Design Directions | Exploration & Planning | `02-exploration-visual-designs.html` | musu-bee 신규 view 디자인 탐색 |
| 3 | Implementation Plan | Exploration & Planning | `16-implementation-plan.html` | **직접 차용 가능**: master plan + sub-WS detail plan (timeline, data-flow diagram, risky code identification, risk table 다 가짐) |
| 4 | Annotated Pull Request | Code Review & Understanding | `03-code-review-pr.html` | post-build Auditor finding 표 색 코딩 (단 Tariq §1 FAQ — git history PR review는 markdown 유지 권장) |
| 5 | PR Writeup for Reviewers | Code Review & Understanding | `17-pr-writeup.html` | closure doc의 "what changed + why" section |
| 6 | Module Map | Code Review & Understanding | `04-code-understanding.html` | musu repo의 module 관계도 (musu-bridge / musu-core / musu-bee / musu-relay 등) |
| 7 | Living Design System | Design | `05-design-system.html` | musu-bee의 design token visualization (현재 없음) |
| 8 | Component Variants | Design | `06-component-variants.html` | musu-bee component playground |
| 9 | Animation Sandbox | Prototyping | `07-prototype-animation.html` | n/a (musu에 animation 거의 없음) |
| 10 | Clickable Flow | Prototyping | `08-prototype-interaction.html` | T2-D React Flow workflow editor 와 *동일 아이디어 다른 구현* |
| 11 | SVG Figure Sheet | Illustrations & Diagrams | `10-svg-illustrations.html` | docs 안 diagram을 inline SVG로 그릴 때 |
| 12 | Annotated Flowchart | Illustrations & Diagrams | `13-flowchart-diagram.html` | CEO heartbeat / task delegation flow visualization |
| 13 | Arrow-Key Slide Deck | Decks | `09-slide-deck.html` | n/a (musu doc 발표 안 함) |
| 14 | Feature Explainer | Research & Learning | `14-research-feature-explainer.html` | **직접 차용**: wiki/451-455 같은 research doc의 HTML 미러 (TL;DR + collapsible + tabbed code + FAQ — wiki/455 본문 구조와 매우 유사) |
| 15 | Concept Explainer | Research & Learning | `15-research-concept-explainer.html` | "Chairman Principle" 개념 설명 페이지 (현재 docs/MANUAL.md 안 인라인) |
| 16 | Weekly Status | Reports | `11-status-report.html` | **직접 차용**: `/api/companies/<ID>/briefing` 의 HTML render — 정확히 이 형태 |
| 17 | Incident Timeline | Reports | `12-incident-report.html` | musu의 incident response 시 (현재 없음) |
| 18 | Ticket Triage Board | Custom Editing Interfaces | `18-editor-triage-board.html` | **직접 차용**: musu issue/goal 우선순위 정렬 (현재 markdown list만) |
| 19 | Feature Flag Editor | Custom Editing Interfaces | `19-editor-feature-flags.html` | musu의 `bridge.env` 편집 UI |
| 20 | Prompt Tuner | Custom Editing Interfaces | `20-editor-prompt-tuner.html` | musu agent의 instruction.md tuning UI |

**핵심 관찰**: 20개 중 musu에 직접 차용 가능한 게 4개 명확함 (#3 Implementation Plan, #14 Feature Explainer, #16 Weekly Status, #18 Triage Board) + 5-6개 더 가능. 다른 ~10개는 musu scale에서 YAGNI (animation sandbox, slide deck 등).

---

## §2 Tariq의 핵심 use cases (요약 표)

| # | Use case | Markdown 약점 | HTML 강점 |
|---|---|---|---|
| 1 | Specs, planning, exploration | 12-section TOC vs 12-card grid | 색 코딩 priority + side-by-side variant 비교 |
| 2 | Code review & understanding | wall of diff + linear comments | 하이라이트된 hunk + sidebar questions + 인라인 의도 |
| 3 | Design & prototypes | "buttondescribed in words" | clickable playground, slider-tunable parameters |
| 4 | Reports, research, learning | skim-once 용도면 OK / 재참조 多이면 손해 | 누적 re-read time saving, working visualization |
| 5 | Custom editing interfaces | round-trip via markdown | side-by-side editor, diff toggle, save→copy-back |

비용 (Tariq 본인 인정): 토큰 더 씀 + 렌더 2-4× 느림 + git diff 어려움.

판단 기준 (Tariq 제시): (a) 한 번 이상 다시 읽힐 것인가? (b) 비선형 navigation / 색 / interaction이 가치 있는가? 둘 다 yes → HTML. 둘 중 하나라도 no → Markdown.

---

## §3 musu 현황과의 mapping

### 3.1 musu가 이미 HTML output 채널을 가지고 있다

`musu-bee/`는 Next.js 15 + React app. URLs:
- `/app/c/<COMPANY_ID>` — Company view (HTML)
- `/app/m/<MACHINE_ID>` — Machine view (HTML)
- `/fleet` — Fleet view (V23.4 T2-C에서 시드)

즉 *agent가 HTML을 생성하면 musu-bee가 렌더 가능*. 단 현재는 SSE/poll 통해 DB row를 가져와 React component가 렌더하는 패턴. agent가 직접 HTML 문자열을 출력해서 그대로 렌더되게 하는 채널은 없다 (보안+sanitization 이유 + XSS).

### 3.2 docs/ 폴더 — markdown 일색

현재 `F:\workspace\musu-bee\docs\` 안의 모든 doc은 markdown. 우리가 직전 3 round에 fix한 wiki/433/434/437/438/450/454 다 markdown.

Tariq의 두 질문을 musu doc에 적용:

| 문서 유형 | 재참조? | non-linear/색/interaction 가치? | HTML 격상? |
|---|---|---|---|
| Master plans (wiki/425, wiki/431) | **YES** (모든 sub-WS에서 reference) | YES (sub-WS dependency map, timeline) | **YES** |
| Qual eval (wiki/450, wiki/454) | **YES** (phase별 catch 분포 비교) | YES (chart로 ROI 시각화) | **YES** |
| Closure docs (wiki/437, wiki/438) | YES (next iter의 Critic이 input으로 받음) | YES (severity 색 코딩) | **YES** |
| Sub-WS detail plans | YES (Builder + Auditor가 input) | MARGINAL (text-heavy) | **MAYBE** |
| Research docs (wiki/451-455) | MARGINAL | YES (interactive examples) | **MAYBE** |
| Historical / V21-V22 closure | NO | NO | **NO** |

### 3.3 agent → user 통신 채널 (현재 markdown)

| Channel | 현재 포맷 | HTML 격상 가능? | 가치 |
|---|---|---|---|
| `/api/companies/<ID>/briefing` 응답 | JSON (text fields) | musu-bee가 HTML 렌더링 시 가능 | "Chairman Principle" 강화: 3-second briefing이 visual로 즉시 흡수 |
| qual eval / closure doc | markdown | yes (정적 HTML) | 다음 iter의 plan-stage Critic이 더 빨리 흡수 |
| Plan-as-spec Auditor finding 표 | markdown | yes | severity column 색 코딩 → "HIGH 몇 개?" 즉시 시각 식별 |
| MEMORY.md index | markdown | NO — Claude의 system prompt에 raw markdown으로 들어감 | system prompt는 token efficient해야 함, HTML 절대 금지 |
| agent의 task output (musu-bee 표시) | text | 부분적 가능 | 단 XSS sanitization 필수 |

### 3.4 직전 3 round 실패 모드와의 관계

직전 turn에 내가 QUICKSTART에 template-key markdown 표를 잘못 채웠다 (4개 행 중 3개 거짓). Critic round-2가 잡았다. **HTML이었으면 이 실수가 덜 발생했을까?**

- HTML로 했어도 *fact 자체*를 안 읽고 짐작했으면 똑같이 거짓 데이터 들어감. 포맷 문제 아님.
- **하지만** Critic round-2가 HTML 표에 색 코딩이 있었으면 "이 행은 ground-truth verified, 이 행은 unverified" 같은 metadata를 표면에 띄울 수 있었을 것. markdown은 인라인 comment로 묻힌다.
- → HTML의 가치는 *agent-to-human briefing*에 가장 크고, *agent-to-agent state handoff*에는 marginal. master plan이 다음 phase로 Critic이 들고 들어가는 input — 거기서 색 코딩 / 우선순위 column 시각화가 ROI 가장 큼.

---

## §4 비용 분석 — 토큰 ROI 측면

Tariq 본인: "HTML uses more tokens... but the added expressiveness and the much higher likelihood of me reading it carefully means you get better overall output." + "HTML can take 2-4× longer than Markdown."

musu 맥락에서 ROI 측정:

| 항목 | markdown 비용 | HTML 비용 | ROI |
|---|---|---|---|
| Critic prompt 안에 들어가는 plan doc | ~30K tokens | ~50K tokens (1.7×) | Critic이 더 잘 catch하면 audit-fix loop 줄어서 60K+ saving. **NET +** |
| musu-bee user-facing briefing | 1KB JSON | 5KB HTML | render time +2× but user attention saves ~30s/briefing. **NET +** for human-facing |
| MEMORY.md slugs (Claude system prompt) | 200-line markdown | NO (system prompt cap) | **NET --** (HTML 못 씀) |
| docs/V23_4_*.md closure doc | 400-line markdown | 600-line HTML | reading speed 향상 측정 안 됨. **UNCERTAIN** |
| agent task output (engineering task) | code-heavy markdown | code-heavy HTML | 코드는 어차피 ``` block. **NET 0** |

**Conclusion**: HTML은 *human이 자주 다시 읽는 문서*에서 ROI 최대. *agent → agent state handoff*에서는 marginal. *system prompt / memory*에서는 금지.

Tariq의 판단 기준 (§1 "How to Get Started")을 musu doc 전체에 적용한 결과 (§3.2 표) — 격상 후보는 *master plan + qual eval + closure doc 약 15-20개*. 나머지 130+ markdown은 유지.

---

## §5 musu에 도입할 가치가 있는 것

### 5.1 단기 (V23.5 후보)

**Closure doc + qual eval HTML render**:
- 새 sub-WS 시작 시 closure doc 작성을 markdown으로 하되, *별도 HTML render 파이프라인* (예: `npx pandoc` 또는 musu-bridge route)을 추가
- 첫 prototype: wiki/454 (iter-3 qual eval)을 HTML로 재렌더해서 Critic round-2가 그걸 input으로 받았다면 결과가 달랐는지 측정
- **gate**: 측정 후 결정. 단순히 "Tariq가 말했으니까" 격상은 YAGNI 위반 — [[feedback-no-yagni-architecture]]

**plan-as-spec Auditor finding 표 색 코딩** — 더 가벼운 도입:
- markdown 표 안에서 emoji 코드 사용 (🔴 HIGH, 🟡 MED, 🟢 LOW)
- 실제 HTML 렌더 안 해도 markdown viewer에서 시각적 우선순위 즉시 보임
- 비용: zero token overhead, immediate readability win
- Tariq가 직접 말한 "I'm a little bit afraid that people will read this article and turn it into a `/html` skill" 경고 정확히 회피 — *skill 없이* 격상

### 5.2 중기 (V24+ 후보)

**musu-bee briefing endpoint HTML output** — `/app/c/<ID>/briefing` 페이지가 현재 JSON+React 렌더이면 그대로 둠. 새로 만든다면:
- agent가 briefing 데이터를 *반구조화 HTML*로 출력
- musu-bee가 sanitize 후 inline render
- XSS 위험 있음 — DOMPurify 등 필요. 보안 sub-WS 동반 필요.

**Plan-stage Critic의 "visual findings" 출력** — Critic이 markdown findings 표 외에 *간단한 HTML severity heatmap*을 같이 출력. 다음 phase의 plan-as-spec Auditor가 그걸 보고 우선순위 정함. 단, agent 간 통신이라 ROI 의문 — [[feedback-no-yagni-architecture]] gate.

**Design prototype skill** (Tariq use case #3와 정렬):
- musu-bee UI 설계 단계에서 "prototype 4 variants of new fleet-view card" → HTML playground 출력
- 현재 musu에 *없는* 채널. T2-D React Flow editor가 이미 비슷한 일을 하지만 코드 generated UI만 다룸 — design exploration 단계가 없음
- 가치: musu-bee 신규 view 설계 (V24+에서 fleet-view 외 새 view 추가 시) → Tariq use case #3 prompt를 직접 받아쓸 수 있음

### 5.3 도입하지 말 것

- ❌ **CLAUDE.md / MEMORY.md HTML화** — system prompt는 token efficient 해야 하고 Claude가 직접 raw text로 parse함. HTML tag overhead는 pure cost. Tariq의 "두 질문" 기준에서 (a) "non-linear navigation/색/interaction 가치?" → NO (system prompt는 순차적 instruction이 더 효과적). 격상 거부.
- ❌ **agent task delegation prompt HTML화** — 입력 프롬프트는 markdown/plaintext가 압도적으로 효율적. Tariq의 use case는 다 *output* 측 — *input*에 HTML 쓰지 말 것.
- ❌ **모든 doc 일괄 HTML 격상** — Tariq 본인이 명시적으로 경고: "I'm a little bit afraid that people will read this article and turn it into a `/html` skill." YAGNI. 자주 안 읽히는 doc (V21~V22 historical closure 등) markdown으로 충분.
- ❌ **PR review용 HTML artifact** — git diff에 HTML 들어가면 review 더 어려움. Tariq 본인이 "If the document is going through PR review or git history scrutiny, Markdown is better"라고 명시.

---

## §6 agent-team mode 관점

[[feedback-plan-stage-auditor]] 메모리에 추가될 만한 통찰:

**phase별 데이터 포맷 매핑** (Tariq의 두 질문 기준 적용):

| Phase | 재참조? | non-linear/색/interaction 가치? | HTML 격상? |
|---|---|---|---|
| Phase 0 Researcher output (envelope) | NO (1회 read by Planner) | NO (text-heavy) | **NO** — markdown 유지 |
| Phase 1 Planner output (plan doc) | YES (모든 후속 phase) | YES (sub-WS map, gantt) | **YES** |
| Phase 1.5 Critic output (findings 표) | YES (Auditor + Builder + Scribe) | YES (severity 색) | **YES** |
| Plan-as-spec Auditor output (findings) | YES (Builder + Auditor) | YES (severity 색) | **YES** |
| Phase 3 Builder output (code) | n/a — 코드는 plaintext | NO | **NO** |
| Phase 5 Auditor output (findings) | YES (Scribe + next iter Critic) | YES (severity 색) | **YES** |
| Phase 7 Scribe output (closure doc) | YES (next iter Critic, retrospect) | YES (phase별 timeline) | **YES** |

→ Critic/Auditor/Scribe phase의 output을 HTML render하면 다음 phase의 *human review* 속도 증가. *next agent phase*에 들어갈 때는 markdown 변환 채널 유지.

### 6.1 round-2 Critic 회고 — HTML이 도움됐을까

round-2 Critic이 27 findings를 markdown 표로 줬다. HIGH 13, MED 11, LOW 3. 내가 그 표를 읽으면서:
- 어느 게 가장 critical 인지 즉시 안 보임 (severity column scan 필요)
- 직전 turn에 내가 만든 N1을 강조 표시 한 게 없음 — 그냥 다른 finding과 동급으로 list
- **그래서** 사용자께 사과+우선순위 정리하는 데 시간 더 걸림

HTML이었으면:
- HIGH red banner + LOW grey로 시각 즉시 식별
- "Self-created defect" tag로 N1을 즉시 marking
- 더 빨리 사용자께 보고 + fix 진행 가능

**hypothesis**: Critic envelope output을 다음 turn부터 HTML로 시도. 별도 commit 없이 prompt 한 줄 수정으로 가능. 측정: 다음 round에서 finding 우선순위 식별 시간 비교.

---

## §7 핵심 인용 (재참조용)

**Q1. Tariq의 ROI 주장** (직접 인용, §1 FAQ):
> "while Markdown often uses fewer tokens, the added expressiveness of HTML and the much higher likelihood of me reading it carefully means you get better overall output and better follow-up prompts."

**Q2. Tariq의 비용 정직성** (직접 인용, §1 FAQ):
> "HTML can take 2-4× longer than Markdown to generate, because the agent has to do styling and structure work the Markdown render path skips."

**Q3. Tariq의 `/html` skill 경고** (직접 인용, §1 How to Get Started):
> "I'm a little bit afraid that people will read this article and turn it into a `/html` skill or something that automatically generates HTML for every task. That's not the point."

**Q4. Tariq의 두 판단 기준** (직접 인용, §1 How to Get Started):
> "(1) Will I (or someone) re-read this more than once? If yes, HTML's clarity tax is worth it. If it's a throwaway summary, stay in Markdown. (2) Does the content benefit from non-linear navigation, color, or interaction? If yes, HTML. If it's a strict sequence of steps or a pure data dump, Markdown is fine."

**Q5. Tariq의 version control 경계** (직접 인용, §1 FAQ):
> "HTML diffs are harder to read than Markdown diffs. If the document is going through PR review or git history scrutiny, Markdown is better."

---

## §8 musu와의 직접 충돌점

[[feedback-self-contained-product]] vs HTML 격상: HTML render에 외부 lib (Pandoc, DOMPurify) 의존 추가하면 self-contained 약화. 단:
- Pandoc: optional, install.sh에서 graceful degradation 가능
- DOMPurify: npm package, musu-bee가 이미 React stack — 자연스럽게 흡수

따라서 HTML 격상은 self-contained 위반은 아님. **단** 새 dependency 추가는 [[feedback-no-yagni-architecture]] gate 통과 필요.

[[feedback-no-yagni-architecture]] vs HTML 격상: Tariq 본인이 가장 강한 YAGNI 경고를 직접 제공함 — "turn it into a `/html` skill" 경고는 곧 "모든 task에 자동 격상하지 마라"는 뜻. musu에 적용 시:
- doc 폴더 크기: 현재 ~150 files
- 자주 다시 읽히는 doc: master plans + qual evals + closure docs ≈ 15-20 files
- 매 iteration마다 그중 3-4개를 reference하면 ROI 명확 — **격상 정당화**
- 거의 안 읽히는 100+ files는 markdown 유지 — **YAGNI 통과**

---

## §9 도입 권장 — 우선순위 3단계

### Step 1 (즉시, zero cost): 색 코딩 emoji 도입
- markdown 표의 severity column에 🔴🟡🟢 prefix 추가
- Critic + Auditor subagent prompt에 "use 🔴 for HIGH" 한 줄 추가
- 비용: zero token overhead
- 가치: round-2 Critic의 N1 같은 self-defect를 next-turn에서 더 빨리 인지
- Tariq의 `/html` skill 경고 직접 회피 — *skill 없이* 격상

### Step 2 (V23.5 후보, low cost): closure doc HTML 미러
- `docs/RESEARCH_HTML_OVER_MARKDOWN_2026_05_18.md` 같은 reference doc은 markdown 유지
- 자주 다시 읽히는 master plan + qual eval은 별도 `<slug>.html` 미러 추가
- Pandoc 또는 simple jinja2 template 사용
- 비용: ~50 LOC build script + Pandoc dependency (optional)
- 가치: human review 속도 측정
- **단** PR review용 git history 들어가는 doc은 markdown 유지 — Tariq의 §1 FAQ 경계

### Step 3 (V24+ 후보, high cost): musu-bee briefing endpoint HTML 격상
- `/app/c/<ID>/briefing`에 HTML render channel 추가
- agent가 "<briefing-card>" 같은 반구조화 HTML 출력
- musu-bee가 DOMPurify로 sanitize 후 render
- 비용: ~200 LOC + security audit
- 가치: chairman briefing UX 격상. [[feedback-self-contained-product]] 통과

### Step 4 (V24+ 후보, 새로운 use case): design prototype 채널
- Tariq use case #3 "Design & prototypes" 직접 차용
- musu-bee 신규 view 설계 단계에서 agent에게 "prototype N variants as HTML playground" 요청 채널 추가
- musu-bee dev mode에서 `/preview/<slug>` 같은 임시 endpoint
- 가치: T2-D 외의 신규 view 추가 시 design exploration 비용 절감

---

## §10 References

- **Tariq's original article**: https://x.com/trq212/status/2052809885763747935 (auth-walled; verified via user-pasted text, archived verbatim in §1)
- **Tariq's examples gallery**: https://thariqs.github.io/html-effectiveness/
- **Companion video** (paraphrased relay) — cross-check confirmed faithful to article
- [[feedback-plan-stage-auditor]] — Phase별 envelope 포맷 정책 (§6 참고)
- [[feedback-self-contained-product]] — HTML dependency 영향 분석 (§8)
- [[feedback-no-yagni-architecture]] — 격상 비용 정당화 gate (§5/§8)
- wiki/451 (ACI), wiki/452 (RL Conductor), wiki/453 (Ben OS skills) — 동일 패턴 research docs
- wiki/450 + wiki/454 — Tariq 주장 적용 시 가장 ROI 높은 후보 doc

---

**Status**: 원문 verbatim 보존 완료 (user paste 기반, X auth wall 우회). musu fit analysis 완료. Step 1 (emoji 색 코딩)은 즉시 도입 가능, Step 2/3/4는 V23.5/V24 master plan 진입 시 [[feedback-no-yagni-architecture]] gate 통과 후 검토.

**Honesty note**: Tariq 인용은 사용자가 paste한 article 본문 기반으로 verbatim. video transcript와 cross-check 결과 paraphrase 충실. 단, 사용자 paste가 원본 X post와 byte-단위로 동일한지는 검증 불가 (X auth wall) — 일반적인 paste 신뢰도를 가정.
