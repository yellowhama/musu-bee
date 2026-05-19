# Reference — Terax AI Terminal (crynta/terax-ai)

**Wiki ID**: wiki/489
**Category**: External reference (adjacent product, AI dev tooling space)
**Date**: 2026-05-19
**Source**: YouTube transcript shared by user 2026-05-19 (creator's launch video for Terax v1)
**Project**: https://github.com/crynta/terax-ai · https://terax.app
**License**: Apache 2.0
**Status**: doc-only; may inform musu UX/tooling decisions later

---

## §1 Original transcript (verbatim)

> This is Terex, my open-source AI terminal. I spent the last 3 weeks building it, working 12 hours a day. But the most ridiculous part about it is this. Terex is 7 MB. Warp, which if you haven't heard of it, is basically the most popular AI terminal right now, is over 400, more than 50-something times bigger.
>
> But why did I even build this? There's Claude Code, there's Warp, regular terminals, a dozen AI terminal experiments. So what's the gap? Basically, Claude Code is a coding agent, not really a terminal. I spend most of my day in a terminal anyway, and I wanted the AI to just live there with me, not in a separate app I have to switch to.
>
> So closer in spirit to Warp, but actually lighter, cleaner, and just more terminal feeling. Most of the AI terminals I've tried felt heavy, both visually and technically. Like the AI was bolted on, not built in. I tried most of them, took what I liked, dropped what felt bloated, and built the one I actually want to use every day.
>
> And half of why I built it is just I love this stuff. Systems programming, AI engineering, and modern app development. This project is all three in one. Okay, so let's walk through it. The layout is designed to keep you in the flow. On the left, we have the file explorer with fast search, keyboard navigation, and capybara icons, for sure.
>
> Up top, you've got your tabs, where you can switch between terminal, code editor, and web preview tabs. Which one is auto detects when the local dev server comes up, so you don't have to keep jumping back to your browser. Now, if I open a file, it doesn't just show text. Terex has a built-in code editor with Vim mode, pre-built themes, and real-time fast AI auto-completion.
>
> And here's the part I care about most, the AI panel. I didn't want a separate AI chat eating half my screen. So I took bits I liked from Warp, bits from Notion, and ended up with this. A small input panel that lives at the bottom and mini window to see the details, which you can pop it out when you want, hide it when you don't.
>
> Underneath, it's a powerful agent with sub-agents, project memory, tasks, skills, snippets, and much more. Voice input when you don't feel like typing. Supports all the major providers and local models through LM Studio. By the way, Gemma 4 from Google is the one I'd actually recommend trying as a local model.
>
> Here, I gave to the agent a command to initialize the tarics.md file. And now we can ask to make some changes. It reads what it needs, plans, proposes changes directly in the editor, and then you can review and approve it. Here's the tech stack behind it. It's built with Rust on the back end and Tauri instead of Electron for the show.
>
> By using the native system web view instead of bundling a whole Chromium instance, we basically cut 90% of the usual bloat right there. And on the front end, I'm using React with its modern ecosystem. The terminal itself runs on xterm.js with the WebGL renderer. Same library VS Code uses for its terminal, by the way.
>
> But for the code editor, I went with CodeMirror 6. Unlike Monaco, the editor behind VS Code, which by itself can already be larger than 7 MB, CodeMirror is modular and more than 10 times lighter. And there's a lot of other stuff under the hood, which you can check out on the GitHub. The final result is a binary that's practically invisible to your system.
>
> You can download the app from the website or directly from GitHub repo. All links in the description. Project is fully open source with Apache 2.0 license. You can read it, contribute, and even ship your own version. Right now, it runs on macOS and Linux. Supports all the major distros and Windows version is coming soon as well.
>
> I'm going to keep working on it pretty heavily, mostly because I'm going to be using it every day. It goes on my main Mac and goes on my Arch laptop. Yeah. Issues, PRs, roasting in the issues, all welcome.

---

## §2 Key data points

| Aspect | Value |
|---|---|
| Binary size | 7 MB |
| Comparison: Warp | 400+ MB (~50× larger) |
| Backend | Rust |
| App shell | Tauri (native system WebView, NOT Electron) |
| Frontend | React |
| Terminal renderer | xterm.js with WebGL renderer (same as VS Code's terminal) |
| Code editor | CodeMirror 6 (modular; ~10× lighter than Monaco) |
| AI providers | All major (Anthropic, OpenAI, Google, etc.) + local via LM Studio |
| Recommended local model | Gemma 4 (Google) |
| Platforms | macOS, Linux (Arch + major distros); Windows coming |
| License | Apache 2.0 |
| Build time claim | 3 weeks, 12hr/day |

### Feature surface (from transcript)
- File explorer (fast search, keyboard nav, capybara icons)
- Tabbed workspace: terminal / code editor / web preview
- Web preview auto-detect on local dev server up
- Code editor: Vim mode + themes + real-time AI autocompletion
- AI panel: small input bottom + pop-out mini-window (Warp + Notion influence)
- Agent layer: sub-agents, project memory, tasks, skills, snippets
- Voice input
- Apply-and-review flow: AI proposes edits directly in editor, user reviews/approves

---

## §3 musu fit-gap

Terax is a **single-machine personal AI terminal**. musu is a **multi-machine AI control plane**. Different product, but several patterns are transferable.

| Aspect | Terax | musu | Transferable lesson |
|---|---|---|---|
| **Binary size discipline** | 7 MB via Tauri + CodeMirror | musu-bridge Python + musu-bee Next.js + musu-relay Node (much larger) | Tauri pattern noted but musu deliberately chose K3s/WSL2 path (V23.0 substrate SWOT); different scale assumption. Lesson: **single-binary delivery** is achievable when the surface is narrow. musu's surface is wider (cross-machine mesh + 4-layer arch). |
| **AI panel UX (small input + pop-out)** | Bottom input bar, pop-out detail window — Warp + Notion influence | musu-bee CoS briefing UI (V23.5 C-2) sits in `ProjectBriefing.tsx` as a section, not a global bar | **Real candidate**: a bottom-bar AI input pattern across all musu-bee pages would unify CoS briefing surface. V23.7+ UX exploration. |
| **Local model via LM Studio** | First-class support; Gemma 4 recommended | V23.5 C-3 supports any provider via `MUSU_USER_LLM_API_KEY` (anthropic SDK) — no local-model adapter wired | musu has adapter framework (Claude/Gemini/Codex/Hermes per seed_agents.py) but no LM Studio integration. Real V23.7+ candidate if user wants offline operation. Aligns with [[feedback-self-contained-product]]. |
| **Project memory** | Mentioned as agent feature, undefined depth | musu has structured memory: SSOT_1PAGE 4-layer + CoS Layer 0 + 18 instruction files + `.claude/projects/.../memory/` (8 typed feedback memories) + `~/llm-wiki/` (HTML wiki render via W-3) + briefing `recent_wiki_pages` (C-1) | musu's memory is more developed; could be lifted to Terax-style "project memory" facade for single-project consumers. Not a near-term cycle goal. |
| **Sub-agents** | Mentioned as feature | musu has full agent-team chain (Phase −1 strategic gate + Phase 1.5 Critic + Phase 5 Auditor + Scribe) via MODE_Agent_Team.md + `business-panel-experts` 4-framework debate | Different concept: Terax sub-agents = parallel task workers; musu sub-agents = role-specialized phases. Not directly comparable. |
| **Apply-and-review flow** | AI proposes edits in editor, user reviews/approves | musu V23.4 T2-D-mini workflow builder is form-based (deferred React Flow visual to V23.6); V23.5 C-2 briefing shows recent wiki updates with link-out | musu doesn't have "AI proposes diff in editor" surface — different product shape (multi-machine ops, not single-file editing). |
| **Tauri vs Electron** | Tauri chosen — 90% bloat cut | musu-bee = Next.js webapp, no native shell decision yet | If musu ever ships native operator GUI, Tauri pattern relevant. Not current cycle. |
| **CodeMirror 6 vs Monaco** | CodeMirror chosen — ~10× lighter than Monaco | musu-bee uses no code editor today (form builder only) | Same — relevant only if musu adds in-app code editing. Firewall item per wiki/469 §2 #1 (wiki page editing UI deferred). |
| **Voice input** | First-class | None | Far-future candidate; not on any V23.X roadmap. |

---

## §4 V23.6+ candidate hooks (low priority, optional)

Terax is **not** a direct competitor or input to musu's current cycle. But two patterns are worth tracking:

| Pattern | Candidate ID (if pursued) | When relevant |
|---|---|---|
| **LM Studio local-model adapter** | V23.7+ candidate #8 (new) | If user wants offline operation OR if anthropic SDK dep becomes friction. Aligns with [[feedback-self-contained-product]] (local model = zero external dep). Not currently blocking; C-3 4 hard constraints already cover the "no bundled key" angle. |
| **Bottom-bar global AI input UI** | V23.7+ UX exploration | Unifies CoS briefing surface across musu-bee pages. Would replace per-page `ProjectBriefing.tsx` section with global bar + pop-out detail (Warp+Notion pattern). UX experiment, not priority. |
| **TinyFish CLI adapter (search/fetch/agent/browser)** | V24+ Paperclip observer adapter candidate | Web-automation CLI suite (`@tiny-fish/cli`, npm-installed; auth via `TINYFISH_API_KEY` against `agent.tinyfish.ai`). 4 tools: `search` (web search), `fetch` (clean URL→markdown/json), `agent` (NL browser automation with SSE result stream), `browser` (raw CDP WebSocket). Escalation pattern: fetch → agent when JS-heavy / bot-protected. **Hosted SaaS, cloud-only** — direct conflict with [[feedback-self-contained-product]]; harder firewall than Terax LM Studio (which has local fallback). Only viable musu use: Paperclip observer adapter (deferred V24+ per wiki/477-482) IF a workstream emerges that needs scraping external runtime metadata or competitor agent surfaces. Not on V23.6/V23.7 roadmap. Operator-side use (e.g., harvesting reference video transcripts like this doc or wiki/484) is a personal-tool choice, not a product decision. |

All three are **firewalled to V23.7+ or V24+**, NOT V23.6. V23.6 scope already pinned per wiki/484 + GOAL.md §A.

---

## §5 References

- Terax repo: https://github.com/crynta/terax-ai
- Terax website: https://terax.app
- Tauri framework: https://tauri.app (alternative to Electron)
- xterm.js: https://xtermjs.org
- CodeMirror 6: https://codemirror.net
- LM Studio: https://lmstudio.ai (local model runtime)
- TinyFish CLI skill spec: https://github.com/tinyfish-io/tinyfish-cookbook/blob/main/skills/use-tinyfish/SKILL.md
- TinyFish package: `@tiny-fish/cli` (npm) — API keys at https://agent.tinyfish.ai/api-keys
- wiki/484: agentic 5-step + AutoAgent candidates (sibling reference doc)
- wiki/450: V23.4 Phase 4 iter-2 qual eval (unrelated, same numeric prefix)
- [[feedback-self-contained-product]]: relevant to LM Studio adapter AND TinyFish adapter consideration
- [[feedback-no-yagni-architecture]]: relevant — most Terax patterns are NOT musu cycle inputs, just noted

---

## §Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-05-19 v1 | Initial reference doc, wiki/489 assigned | User request "이거 위키에 저장해" — preserve transcript verbatim for future-Claude reference, surface 2 V23.7+ candidate hooks |
| 2026-05-19 v2 | §4 third candidate row: TinyFish CLI adapter; §5 references + feedback memory link extended | User shared https://github.com/tinyfish-io/tinyfish-cookbook/blob/main/skills/use-tinyfish/SKILL.md — same "external-tool adapter, firewalled by self-contained-product" shape as Terax LM Studio; consolidated here per "Option 3 — add to wiki/489 §4" decision (cheaper than a new doc, same value) |
