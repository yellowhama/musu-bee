# Research note: ACI (Agent Computer Interface) — musu fit analysis

**Date**: 2026-05-18
**Wiki**: 451
**Source**: video transcript provided by user 2026-05-18 (no public URL given; archived inline below for posterity)
**Purpose**: capture the ACI framing as durable musu context. The video describes the current state of agent-controls-computer research and concludes with "agent-native interfaces" as the end-game. The framing aligns with musu's existing thesis (WebRTC mesh + workflow API + bridge as machine-semantic environment) so closely that it serves as external validation of V23's direction.

---

## §1 Summary in 5 bullets

1. **The core problem**: agents that operate GUIs must convert pixels → semantics → actions. Pixels and actions speak different languages; the missing piece is semantic understanding of what's on screen and what can be done.
2. **Four current approaches**: (a) pure vision (VLM looks at screenshots, fragile to layout changes), (b) DOM grounding (browser exposes HTML structure, much more reliable), (c) accessibility tree (OS-native desktop equivalent of DOM), (d) hybrid world model (fuse vision + DOM + a11y + history + task state).
3. **Why it's hard**: humans rely on decades of UI convention intuition. Agents must reconstruct this from raw signals. UI state is partially hidden (hover menus, lazy-load, virtualized lists). Affordances are ambiguous. Animations and modals create temporal instability. State is fragmented across tabs/windows/notifications.
4. **Claude Code as case study**: sidesteps the entire GUI problem by operating through file system + shell + structured tool calls. File paths are already semantic; shell commands are already structured; tool calls are already typed. Reliability gap vs desktop GUI agents = mostly the absence of the pixel-to-semantics conversion.
5. **End game**: agent-native interfaces. Not "agents adapting to human GUIs forever" but "software ecosystems redesigned to expose what agents need natively." MCP servers, tool APIs, declarative workflows, intent-based interfaces. GUI control is a transitional bridge; the destination is semantic environments designed from the start for machine operation.

The video frames this with a self-driving-cars analogy: early autonomous vehicles adapted to infrastructure built for human drivers (stop signs sized for human vision, lane markings for human perception). Over time, infrastructure itself is redesigned around machine needs. ACI is in the same place — currently adapting to GUIs built for humans, eventually replaced by machine-optimized environments.

---

## §2 Why this is highly relevant to musu

musu's architecture decisions over V21-V23 have been steadily moving toward the "agent-native interface" end-state the video describes. Three specific overlaps:

### §2.1 musu-bridge is a tool-API substrate, not a GUI proxy

V23.4 T2-A' (just shipped, wiki/432 + wiki/436) added `POST /api/workflows` + `GET /api/workflows/{id}/status` + `POST /api/workflows/{id}/retry`. Each is a typed FastAPI endpoint with Pydantic-v2-validated request/response bodies. Workflow specs are structured JSON, not UI form fields. Agent invocations dispatch via `enqueue_wake` + `execute_wake` primitives — symbolic actions on a transactional substrate.

This is **exactly the shape** the video describes as the end-game:
- *Symbolic actions* — `POST /api/workflows` with a typed body, not "click submit at coordinates (1242, 381)"
- *Machine-readable state* — `GET /api/workflows/{id}/status` returns enumerated state, not a screenshot
- *Declarative workflows* — `WorkflowSpec` Pydantic model defines DAG of agents + edges + nodeSelector matches; not "navigate to screen X, click Y, fill field Z"
- *Intent APIs* — `POST /api/workflows/{id}/retry` expresses operator intent ("retry crash-failed steps"), not a button-click sequence

V23.4 Phase 4 master plan §0 Strategic Gate explicitly rejected the v1 K3s+Argo+CRD+Go-operator path because it imported industry standards designed for 100-engineer scale rather than tooling shapes appropriate for musu's actual scale. The replacement (asyncio + SQLite + Python) IS an agent-native interface — the very pattern the video predicts wins long-term.

### §2.2 musu-relay-gateway uses WebRTC DataChannels, not browser automation

The video calls out browser automation (Playwright, Puppeteer with DOM grounding) as "years ahead of desktop ACI." musu didn't go that route. Instead, V23.1 + V23.2 shipped **musu-relay-gateway**: a Rust crate using `@roamhq/wrtc` that talks to a local musu-bridge via DataChannel, then exposes the bridge's typed API to remote visitors over WebRTC. The visitor doesn't see musu-bridge's UI; they see a structured API surface tunneled through the mesh.

This is the **third-rail option the video doesn't enumerate**: instead of either "adapt to human GUIs" (pure vision + DOM grounding) or "wait for software to expose agent-native APIs," musu builds **a peer-to-peer transport that exposes machine-native APIs across users' devices directly**. WebRTC DataChannel is the transport; the API itself is the semantic environment. No pixels involved in the agent-to-agent layer at all.

When a visitor's musu-bee instance calls `bridge.workflows.create({spec})`, the call goes browser → WebRTC DataChannel → musu-relay-gateway → musu-bridge over local HTTP → workflow_executor. Every hop is typed. Zero pixels-to-semantics conversion.

### §2.3 musu-bee UI is a thin window, not the source of truth

V21.F shipped Company view (`/c/[company_id]`) and Machine view (`/m/[machine_id]`) as thin client components polling the bridge API + subscribing to SSE for change events. V23.4 T2-C (currently in plan-revision) adds `/fleet` following the same pattern. The bridge is the source of truth; the UI is a rendering of bridge state.

This matters because: *future agents controlling musu can skip the UI entirely and operate directly on the bridge API.* No need for an agent to learn musu-bee's React component tree, no need for accessibility-tree extraction, no need for screenshot interpretation. The bridge IS the interface.

The video frames Claude Code as a special case because it sidesteps the GUI problem via file system + shell + tool calls. **musu-bridge is the same pattern at the application layer**: any agent that speaks HTTP + JSON can drive musu. The musu-bee UI is for humans; the bridge is for everything that isn't a human eye.

---

## §3 What the video would predict for musu's roadmap

If the video's "agent-native interfaces are the end game" thesis is correct, then musu's roadmap items should be evaluated through that lens:

| Roadmap item | ACI-end-game alignment |
|---|---|
| T2-A' workflow API (shipped) | ✅ Perfect alignment. Typed API + structured DAG specs + machine-readable status. |
| T2-F fly retirement (in revision) | ✅ Removes a SaaS abstraction that obscures the underlying mesh. User PCs become the substrate directly. |
| T2-C `/fleet` UI (in revision) | ⚠️ UI for humans; agent-equivalent path is `GET /api/machines` which already exists. UI is necessary for human users in V23.5 closed beta but not on the agent-native path. |
| T2-D React Flow workflow editor (pending) | ⚠️ Same as T2-C. Editor is a human-facing visual builder; agents can already construct `WorkflowSpec` JSON directly via API. |
| V23.5 closed beta (5 users running multi-PC workflows) | ✅ Validates that the bridge API is usable end-to-end. The 5 users will operate it via musu-bee UI, but each underlying action is an API call that an agent could equally perform. |
| Future: MCP server exposing musu-bridge to Claude Code (no concrete plan yet) | 🎯 This is the natural next step the video implies. musu-bridge already has the right shape; wrapping it as an MCP server makes it directly usable by Claude Code + other MCP-aware agents without any pixel-to-semantics work. |

The last row is worth highlighting. **musu-bridge + MCP wrapper = musu becomes a first-class agent-native environment.** Not Phase 4 scope, but the V23.5 or V23.6 horizon. Master plan §V23.4 already mentions "true P2P + K3s + React Flow + user PC = substrate" — substrate is the right framing. The MCP server layer is the substrate's outward-facing agent API.

---

## §4 Distinct insights worth capturing

Three points from the video that aren't already canonical in musu thinking but are worth flagging:

### §4.1 "UI world model" as a maintenance problem

The video distinguishes the perception model (what's on screen NOW) from the semantic world model (what state the application is in, including history). It argues building and maintaining the world model is the hard part, more than perception. For musu, the equivalent is `workflows.spec_json + workflow_steps.status + workflows.updated_at` — the bridge maintains the world model and serves it via API. Agents don't reconstruct it; they query it. This is a structural advantage over GUI-agent approaches.

### §4.2 "Self-healing interaction loops" as a research direction

The video lists self-healing as one of four current frontiers — agents that detect failure, recover gracefully, and continue rather than failing catastrophically. musu's `workflow_executor` already does a primitive version: `_crash_recovery` on startup marks stale 'running' steps as 'failed' with reason='executor_crash'; `_peer_crash_sweep_once` times out steps from offline peers; `POST /api/workflows/{id}/retry` is the operator-recovery endpoint. The graceful-degradation primitives are already there. As musu scales, these become the foundation for higher-level "self-healing workflow" features.

### §4.3 The agent-vs-human-interface trade-off is itself a product decision

The video frames the current state as "agents adapting to interfaces built for humans" — implicitly framing the cost as paid by agents, not by interface designers. musu inverts this: musu-bee's UI is built for humans, but the underlying bridge is built so agents don't need to adapt at all. The cost of "support agents directly" is paid upfront in API design, not at runtime by every agent that tries to operate the system. This is a deliberate architectural stance — and it's worth surfacing in product positioning. "musu doesn't make agents fight a UI" could be a closed-beta talking point.

---

## §5 What this should NOT change in V23.4 Phase 4

This is a research note, not a plan revision. The video's framing **validates** the direction V23.4 Phase 4 is already going; it does not require changing anything currently in flight:

- T2-A' is shipped; no change.
- T2-F + T2-C plan revisions queued per Critic findings; no ACI-driven re-scope.
- T2-D React Flow editor stays in scope as a human-facing visual builder; the existence of an agent-native API doesn't remove the need for human-facing UI in V23.5 closed beta.
- T2-Z residual cleanup unchanged.
- Phase 4 close gate unchanged.

The ACI framing is most useful for **V23.5+ horizon planning** — specifically, when considering whether to expose musu-bridge as an MCP server for first-class Claude Code integration. That's a master plan-level decision that warrants its own Phase -1 Strategic Gate at the appropriate time.

---

## §6 Original transcript (archived verbatim)

> AI agents can write code, browse the web, book your flights, but there's a wall they keep running into, and it's not about intelligence. It's about the interface. Getting an AI to reliably operate a computer, to actually click the right thing, fill in the right form, navigate the right screen, turns out to be one of the hardest unsolved problems in AI right now.
>
> This is the field of agent computer interface, or ACI, and it's where the real battle for practical AI automation is happening. To understand why ACI is hard, you need to understand the gap between two worlds. On one side, you have CLI tools, command line interfaces, APIs, structured tools. These are great for agents.
>
> Actions are symbolic. State is explicit. Interfaces are deterministic. You call get commit, and you get a predictable result. On the other side, you have GUI systems, graphical user interfaces, the visual software that most humans use every day. Here, state is visual. Affordances, meaning what you can do, are implicit.
>
> Layouts change constantly, and everything is designed for human eyes and human intuition, not machine parsing. The problem isn't that GUIs are bad software. The problem is that they're fundamentally built for a different kind of intelligence. So, here's the core challenge that ACI research is trying to solve. Every GUI interaction starts with pixels, a raw grid of color values on a screen.
>
> What the agent needs to produce is reliable actions. Click this button, type this text, navigate here. But, pixels and actions speak completely different languages. The missing piece in the middle is semantic understanding. The agent needs to figure out what is actually on screen, what it means, and what can be done.
>
> Converting pixels to semantics to actions is where most current ACI research is focused. It sounds straightforward. It is not. Modern computer use agents typically run through a loop that looks like this. At the top, there's the raw environment, the screen, the DOM tree, the accessibility tree, whatever the agent can perceive.
>
> That gets fed into a perception model, which extracts what's visible. Then comes the semantic world model, which is where the agent builds an internal understanding of what state the application is in. From there, a planner and reasoner figures out what to do next. An action generator produces the specific action, and then the agent executes mouse clicks, keystrokes, API calls. The loop repeats.
>
> Now, here's the thing. The perception model part is actually getting pretty good. The hard part, the part researchers are really wrestling with, is building and maintaining that semantic world model over time. Knowing not just what's on screen right now, but what state the entire task is in. So, how are researchers actually tackling this? There are currently four major approaches to giving agents the ability to control GUI systems.
>
> Each one represents a different bet on the best way to bridge the gap between pixels and semantic understanding. Let's walk through all four. The first approach is pure vision. The agent literally looks at screenshots. You take a screenshot, feed it to a vision language model, the VLM describes what it sees in natural language, and then the agent produces a pixel coordinate to click.
>
> This is what the earliest computer use systems did. And honestly, it works surprisingly well in many cases. Modern VLMs have been trained on internet-scale data that includes enormous amounts of UI screenshots. They're genuinely good at reading layouts, identifying buttons, and understanding visual hierarchy. But, and this is a big but, it also fails in ways that are deeply frustrating.
>
> The coordinate-based output is incredibly fragile. Here's why pure pixel agents feel fragile. First, tiny UI changes break coordinates. If a button moves four pixels due to a font change or reflow, the agent clicks empty space. Second, scrolling changes everything. After one scroll event, every coordinate the agent memorized is wrong.
>
> Third, hidden state is invisible. Hover menus, lazy-loaded content, and drop-down options don't exist in the screenshot until you interact with them. And fourth, latency is brutal. Every single step requires a full screenshot capture, plus a VLM inference pass. The result is an agent that looks impressive in demos, but fails constantly in production.
>
> This is why the field moved on. The second approach is DOM grounding, and this is where things get genuinely better. Instead of only looking at pixels, the agent accesses the browser's underlying structure, the DOM tree, and the accessibility tree. The DOM contains the actual HTML elements with their labels, roles, and semantic metadata.
>
> So, instead of the agent guessing from visual pixels, it gets structured information like a button with the aria-label "Submit payment." The flow becomes browser exposes DOM, agent extracts semantic meaning, LLM reasons about it, and produces a DOM-targeted action. The result is an enormous improvement in reliability.
>
> And here's something important to know about the industry. Even when companies market their AI as visually controlling your computer, most production systems heavily leverage DOM and accessibility APIs internally. Pixels alone are just too unreliable. The difference between pixel-based targeting and DOM-based targeting is night and day.
>
> With pixels, you're calling click at coordinates like 1242, 381. This breaks the moment the layout changes, the page scrolls, or the UI is updated. With DOM grounding, you're calling click on the button named checkout. That reference survives scrolling, resizing, and most UI updates. It carries semantic meaning.
>
> The agent knows what it's clicking and why. This is a gigantic improvement in both reliability and debuggability. If you're building a web automation agent today, DOM grounding should be your default. The third approach extends this idea to desktop applications. Modern operating systems, macOS, Windows, Linux, expose something called an accessibility tree.
>
> These are structured representations of every UI element in every native application. macOS has the accessibility API. Windows has UI automation. Linux has ATSPI. These were originally designed to help screen readers and assistive technologies navigate applications. But they turn out to be incredibly useful for agents, too.
>
> Instead of vision guessing that something looks like a save button, the agent receives structured data. Role is button, label is save, enabled is true. Now actions become symbolic. This is essentially DOM for desktop apps. And the insight is that accessibility systems accidentally became one of the best substrates for ACI research.
>
> They already do the hard work of translating visual GUI state into semantic structure. The fourth approach, and this is the current frontier, combines everything. State-of-the-art systems don't pick just one signal. They fuse vision, DOM, accessibility data, long-term memory, task state, and interaction history into a unified internal representation.
>
> The agent tracks not just what it currently sees, but what it has done, what workflows it's in the middle of, and what UI states it has encountered before. This hybrid approach produces a much richer world model. The agent can answer questions like, "What page am I on? What modal is blocking me? What fields are still unfilled? What's my navigation history?"
>
> Now, here's the deep problem that all four approaches are wrestling with. Human interfaces are built on a layer of shared intuition that we never had to make explicit. When you see a slightly raised rectangle with a shadow, you know it's a button. When a darkened overlay appears, you know you're in a modal.
>
> When content is grayed out, you know it's disabled. These inferences happen instantly and unconsciously for humans because we've internalized decades of UI conventions. Agents have to reconstruct all of this artificially from pixels, DOM structure, accessibility metadata, and learned patterns.
>
> This is why ACI research is starting to look more like embodied AI and robotics than traditional software engineering. The agent needs to build a model of a world it can't fully observe and act reliably in that world. This is why one of the most important concepts in ACI is what's called a UI world model. The agent maintains something like an internal map of the application state.
>
> At any moment, it's tracking what page or context it's currently in, what modal or overlay is active, what fields are editable, and what data is pending, and what the navigation stack looks like, where it came from, and where it can go next. This is directly analogous to what a robot does when it builds a spatial map of its environment, or what a game AI does when it tracks the current game state.
>
> The difference is that the UI world is much messier and changes more unpredictably than a physics simulation. Building agents that maintain this world model coherently across long multi-step tasks is one of the hardest open problems in the field. One of the clearest patterns in ACI research is that web-based automation is dramatically ahead of desktop automation.
>
> And it's not surprising when you think about it. Web apps expose HTML and DOM natively. They use aria labels and semantic markup. They have structured layouts that browsers know how to parse. Automation frameworks like Playwright and Puppeteer were built specifically to interact with this structure. Desktop apps, on the other hand, are all over the place.
>
> Inconsistent accessibility metadata, custom rendering engines, canvas-based UIs that don't expose any DOM at all. The bottom line is, if you're building an AI agent today and you have any choice about which environment it operates in, pick the browser. Browser-based ACI is years ahead of desktop ACI. Even with DOM grounding and accessibility APIs, agents still fail regularly, and understanding why helps you build better systems.
>
> Problem one is hidden state. A lot of UI state simply doesn't exist until you trigger it. Hover menus appear on hover. Infinite scroll loads content only when you scroll down. Virtualized lists only render the items currently visible. The agent can't see what isn't rendered. Problem two is ambiguous affordances.
>
> Humans instantly recognize drag handles and active regions through visual conventions, but agents don't have that intuition. Problem three is temporal instability. Animations, toast notifications, loading spinners, and modal pop-ups all introduce timing uncertainty that breaks deterministic execution. And problem four is context fragmentation.
>
> State is spread across multiple tabs, windows, dialogues, and even notifications. Keeping track of all of that coherently is genuinely hard. So, where is this all going? The long-term direction is what people are calling agent-native interfaces. Instead of agents endlessly adapting to software built for humans, we redesign software to expose what agents actually need.
>
> Semantic actions instead of pixel-based clicks, machine-readable state instead of visual rendering. Declarative workflows instead of imperative step-by-step navigation. This is exactly why protocols like MCP, the model context protocol, matter. And why tool APIs matter. These are the building blocks of software that was designed from the start to be used by AI agents, not just by humans who click through menus.
>
> We're still early, but the direction is clear. Here's the framing that I find most useful for thinking about all of this. GUI-based agent control is a transitional technology. Think about self-driving cars. Early self-driving systems adapted to infrastructure built entirely for human drivers. Stop signs designed for human vision, lane markings sized for human perception, traffic signals timed for human reaction speeds.
>
> Over time, the infrastructure itself will be redesigned around machine needs. ACI is in the same position. Right now, agents are adapting to GUIs built for humans. But long-term, the environments themselves will become machine optimized. Fewer pixels, more semantics. Fewer clicks, more intent APIs. GUI control is the bridge that gets us from here to there.
>
> Claude Code is an interesting case study because it sidesteps the entire GUI problem. Desktop GUI agents have to do the hard work of converting pixels into semantic understanding. Screenshot, VLM inference, coordinate guessing, fragile execution. Claude Code doesn't do any of that. It operates through the file system, the shell, and structured tool calls.
>
> These interfaces are already semantic. A file path is already meaningful. A shell command is already structured. A tool call is already typed. That's why Claude Code feels dramatically more reliable than desktop agents. It never has to bridge the pixel to semantics gap at all. It's operating in the kind of environment that agents actually work well in.
>
> As of 2026, here are the four research directions that are getting the most attention. First, persistent UI world models. Agents that remember application layouts, workflow patterns, and user habits across sessions so they don't have to rediscover everything from scratch each time. Second, hierarchical planning.
>
> Separating strategic task planning from low-level UI execution. A high-level agent decides what to do. A specialized UI agent figures out how to do it in the interface. Third, learned affordance prediction, training models to predict what UI elements can be interacted with and in what ways, similar to how robots learn to predict object affordances.
>
> And fourth, self-healing interaction loops, agents that detect when something went wrong, recover gracefully, and continue the task rather than failing catastrophically. This last one is becoming essential for any real-world deployment. Let's put it all together. The modern ACI stack looks like this. At the top, you have the human GUI, the visual interface that wasn't designed for machines.
>
> Below that, semantic extraction using vision, DOM parsing, and accessibility APIs to pull out meaning from that visual chaos. Then the agent world model, the internal representation the agent builds and maintains across steps. Then planning and reasoning, figuring out what the next action should be given the task goal, then action synthesis, generating the specific action, and finally, execution and recovery, actually doing the thing and handling failures when they occur.
>
> And here's the big picture conclusion the industry is slowly arriving at. Pure GUI imitation is not the end game. It's a necessary step, but not the destination. The real end game is semantic environments, software designed to be operated by agents, not just observed by them. The end game for ACI isn't perfect pixel recognition, it isn't flawless screenshot interpretation.
>
> It's semantic environments, structured interfaces, and software ecosystems designed natively for AI agents. MCP, tool APIs, declarative workflows, intent-based interfaces, these are the building blocks of that world. GUI control is the bridge we need right now, while most software is still built for human eyes. But every improvement in structured interfaces, every new tool API, every MCP server, those are steps toward a future where agents don't have to fight the interface at all.

---

## §7 References

- `docs/V23_MASTER_PLAN_2026_05_15.md` (V23 master plan §16 V23.4-through-Phase-4 status — captures architectural decisions ACI-aligned)
- `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` (wiki/431-v2 §0 Strategic Gate — explicit Phase -1 RED against industry-import K8s/Argo path)
- `docs/V23_4_F_T2A_PRIME_PLAN_2026_05_18.md` (wiki/432 — typed FastAPI + Pydantic workflow API, the canonical agent-native interface in musu)
- `docs/V23_4_PHASE4_T2A_PRIME_CLOSURE_2026_05_18.md` (wiki/436 — workflow API shipped)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-self-contained-product.md` (no SaaS dep — keeps the substrate sovereign)
- `C:\Users\empty\.claude\projects\C--Users-empty\memory\feedback-no-yagni-architecture.md` (rejected K8s/CRD over-engineering — the same rejection the video predicts will win long-term)
