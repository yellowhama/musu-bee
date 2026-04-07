# NanoClaw Work Automation Research

Date: 2026-04-02
Repo analyzed: `/home/hugh51/references_AI/nanoclaw-main`

## Executive Summary

NanoClaw does not automate work primarily through a big internal job framework or a UI automation layer. Its real automation model is a stack of small, composable control planes:

1. Claude Code skills act as the operator interface.
2. Git merges act as the feature installation primitive.
3. A typed setup step runner handles environment bootstrap and service installation.
4. A single orchestrator process polls messages, tasks, and IPC.
5. Per-group queues serialize work and enforce global concurrency.
6. Containerized Claude agents do the actual work in isolated filesystems.
7. Filesystem IPC gives containers a narrow control surface back to the host.
8. A scheduler turns recurring prompts into queued agent work.

The important design choice is that NanoClaw treats "automation" as repository mutation plus queued agent execution, not as a stable plugin ABI. The user customizes their fork, and the automation system keeps that fork operational.

## Core Automation Thesis

The repo is explicit about being "AI-native", "small enough to understand", and "customization = code changes", not config sprawl. See `README.md:48-65`, `README.md:96-107`, and `README.md:131-149`.

This matters because NanoClaw automates work in two separate layers:

- Installation-time automation:
  - skills modify the repo and service setup
  - setup scripts install runtime dependencies and register services
- Runtime automation:
  - the host orchestrator receives channel events
  - a queue decides when a group gets a container
  - the containerized agent can emit IPC messages or schedule tasks

That split is the reason the system stays small while still being flexible.

## 1. Skills Are the Automation Interface

The user-facing automation interface is Claude Code skills, not a web UI or admin panel.

- `README.md:44-46` says `/setup` and `/add-telegram` are Claude Code skills.
- `CLAUDE.md:28-45` classifies skills into feature, utility, operational, and container skills.
- `.claude/skills/setup/SKILL.md:6-10` instructs Claude to run setup automatically and only stop when user action is truly required.

This is deeper than "there are some helper prompts". Skills are the repo's actual control plane:

- `/setup` installs dependencies, configures runtime, chooses container runtime, handles service setup, and delegates channel setup.
- `/customize` and `/update-*` are operational workflows.
- `/add-*` skills are feature installers that mutate the codebase and then complete interactive setup.

The practical consequence is that NanoClaw automates operations by teaching Claude how to edit the repo and run commands safely, not by embedding every workflow into one monolithic CLI.

## 2. Git Merge Is the Feature Installation Primitive

The highest-leverage pattern in NanoClaw is that feature installation is mostly just git operations.

`docs/skills-as-branches.md:18-21` states the model directly:

- feature skills are distributed as git branches
- applying a skill is a `git merge`
- updating core is also a `git merge`

The intended model is:

- upstream `main` is the minimal core
- `skill/*` branches contain full feature diffs
- Claude merges them and resolves conflicts

Examples in `docs/skills-as-branches.md:112-170`:

- `git fetch upstream skill/discord`
- `git merge upstream/skill/discord`

This is how NanoClaw avoids building a complicated extension runtime:

- no dynamic plugin API for core behavior
- no manifest-driven code patch engine
- no special migration format
- just standard git history plus Claude-mediated conflict resolution

### Important Reality Check

The current repo snapshot does not fully match the idealized documentation.

Observed mismatches:

- `docs/skills-as-branches.md:73-86` says `.claude/settings.json` registers the official marketplace, but the actual file at `.claude/settings.json` is just `{}`.
- `docs/skills-as-branches.md` describes `upstream/skill/*` as the main install path, but several real feature skills still use dedicated remotes:
  - `.claude/skills/add-telegram/SKILL.md:26-47` merges `telegram/main`
  - `.claude/skills/add-discord/SKILL.md` uses a `discord` remote
  - `.claude/skills/add-whatsapp/SKILL.md` uses a `whatsapp` remote

So the real model is mixed:

- some skills follow the `upstream/skill/*` branch pattern
- some feature installs still come from per-feature repos

That is not fatal, but it is important. The repo's automation philosophy is ahead of its fully consolidated implementation.

## 3. Setup Is a Step Runner, Not a Shell Blob

NanoClaw's setup automation is unusually disciplined for a small repo.

`setup/index.ts:8-19` defines explicit setup steps:

- `timezone`
- `environment`
- `container`
- `groups`
- `register`
- `mounts`
- `service`
- `verify`

The step runner:

- dynamically loads each module
- runs a narrow step
- emits structured status on failure

That is a better automation surface than a single giant shell script because Claude can:

- rerun only the broken phase
- inspect structured output
- recover from partial failure

The setup skill leans into this. `.claude/skills/setup/SKILL.md:8` explicitly says bootstrap is `bash setup.sh`, and everything else should run through `npx tsx setup/index.ts --step <name>`.

This is one of the strongest patterns worth copying. It makes AI-guided setup resumable and debuggable.

## 4. Service Installation Is Automated With OS-Aware Fallbacks

`setup/service.ts` is where NanoClaw turns a codebase into a continuously running assistant.

Key behaviors:

- builds the project first: `setup/service.ts:31-50`
- emits service status blocks on success/failure
- supports:
  - launchd on macOS: `setup/service.ts:71-145`
  - systemd on Linux: `setup/service.ts:147-159`, `setup/service.ts:204-320`
  - nohup fallback for Linux without working systemd: `setup/service.ts:154-159`, `setup/service.ts:223-228`
- kills orphaned prior processes before service start: `setup/service.ts:162-175`
- detects stale Docker group membership in the systemd session: `setup/service.ts:177-202`
- enables linger for user services so SSH logout does not kill them: `setup/service.ts:269-281`

This is real operations automation, not just "write a systemd unit".

The important insight is that NanoClaw expects broken environments and bakes repair logic into setup:

- wrong systemd scope
- Docker works in shell but not systemd
- WSL without stable systemd
- lingering disabled

That is the correct mindset for AI-driven installation.

## 5. Runtime Work Is Serialized Through a Per-Group Queue

The actual work executor is `src/group-queue.ts`.

This queue is the core runtime automation surface:

- one logical queue per group: `group-queue.ts:30-56`
- global container concurrency limit: `group-queue.ts:31-35`, `group-queue.ts:73-82`
- separate handling for queued message work and queued task work
- task dedupe before execution: `group-queue.ts:95-103`
- exponential backoff retry for failed message processing: `group-queue.ts:263-284`
- active idle container can receive follow-up messages over IPC without respawn: `group-queue.ts:156-178`
- idle containers are nudged to close via `_close` sentinel: `group-queue.ts:180-194`

This is how NanoClaw automates conversation continuity without keeping a giant always-hot worker pool:

- spawn container when needed
- reuse it briefly via IPC
- drain pending work in deterministic order
- close it when idle

The design is small, but it solves a real orchestration problem cleanly.

## 6. Containerized Agents Are the Actual Worker Runtime

`src/container-runner.ts` is the boundary between orchestration and execution.

Its automation responsibilities are broader than just `docker run`:

- computes per-group mounts: `container-runner.ts:61-224`
- gives main group read-only project access while protecting host source files: `container-runner.ts:69-97`
- shadows `.env` with `/dev/null` so containers cannot read host secrets: `container-runner.ts:81-90`
- gives non-main groups isolated writable group folders and read-only global memory: `container-runner.ts:98-116`
- creates per-group `.claude` homes: `container-runner.ts:118-149`
- syncs `container/skills` into each group's runtime skill directory: `container-runner.ts:151-161`
- mounts a per-group IPC namespace: `container-runner.ts:168-178`
- copies agent-runner source into a writable per-group location so agents can customize their own runner: `container-runner.ts:180-211`
- validates extra mounts against an allowlist: `container-runner.ts:213-221`
- uses OneCLI to inject credentials indirectly: `container-runner.ts:236-249`

This is the real automation engine:

- setup and skills decide what capabilities exist
- the queue decides when a group gets execution
- the container runner materializes that execution with bounded mounts and tool context

The key lesson is that NanoClaw automates work by automating safe execution environments, not by directly scripting every task.

## 7. Filesystem IPC Is the Host-Container Control Plane

`src/ipc.ts` is one of the most important files in the repo.

Why it matters:

- it gives containers a narrow, file-based way to ask the host to do privileged things
- it avoids exposing the host database or host process APIs directly
- it scopes all IPC by group directory

Behavior:

- starts a per-group IPC watcher under `DATA_DIR/ipc`: `ipc.ts:30-39`
- polls message and task directories: `ipc.ts:62-150`
- authorizes whether a group can send to a target chat: `ipc.ts:77-95`
- routes bad IPC payloads into an `errors` folder instead of silently dropping them: `ipc.ts:97-107`, `ipc.ts:132-141`

Task IPC adds a full host-side scheduling surface:

- create scheduled task: `ipc.ts:183-277`
- pause/resume/cancel based on source group authorization: `ipc.ts:280-319` and following cases

Authorization rule:

- main group can act broadly
- non-main groups can only affect their own registered folder/jid

That is a strong design. It gives containers controlled leverage over the host without collapsing isolation.

## 8. Scheduled Tasks Turn Prompts Into Persistent Automation

`src/task-scheduler.ts` is where NanoClaw crosses from reactive assistant into real background worker.

What it automates:

- computes next runs for cron and interval tasks without drift: `task-scheduler.ts:24-63`
- periodically finds due tasks: `task-scheduler.ts:245-279`
- enqueues each due task through the same per-group queue used for live message handling: `task-scheduler.ts:255-269`
- snapshots visible tasks for the container before execution: `task-scheduler.ts:132-149`
- invokes `runContainerAgent()` with scheduled-task context: `task-scheduler.ts:172-201`
- streams results back to the user chat: `task-scheduler.ts:188-197`
- closes containers quickly after single-turn task completion: `task-scheduler.ts:158-170`
- logs task runs and updates `next_run`: `task-scheduler.ts:223-240`

This is a strong architecture choice because scheduled work is not a separate subsystem. It reuses:

- the same queue
- the same container runner
- the same group isolation
- the same outbound messaging path

That keeps automation coherent.

## 9. Remote Control Is an Operator Automation Surface

`src/remote-control.ts` is effectively an operator tunnel.

It can:

- start `claude remote-control` detached: `remote-control.ts:89-117`
- auto-accept the initial confirmation prompt: `remote-control.ts:123-127`
- scrape the generated URL from stdout: `remote-control.ts:141-177`
- persist PID and URL to disk and restore them on restart: `remote-control.ts:21-27`, `remote-control.ts:47-73`
- stop the session later: `remote-control.ts:205-224`

This is notable because NanoClaw does not rely only on passive logs. It builds a lightweight operator control path directly into the runtime.

If you want AI-native operations without a full dashboard, this is one viable pattern:

- persist a recoverable control session
- make the session restart-safe
- keep it outside the main message loop

## 10. Channel Installation Uses Self-Registration

The runtime assumes channels are added by code merge, then discovered automatically at startup.

Core pieces:

- registry map in `src/channels/registry.ts:16-27`
- barrel import in `src/channels/index.ts:1-10`
- orchestrator imports the barrel at startup: `src/index.ts:17`

The spec explains the intended pattern well in `docs/SPEC.md:135-235`:

- a skill adds `src/channels/<name>.ts`
- that module calls `registerChannel()`
- the skill adds an import to `src/channels/index.ts`
- the orchestrator loops registered factories and connects channels

This is not runtime plugin loading. It is compile-time extension through code mutation.

That choice is consistent with the overall philosophy:

- keep core small
- let features become real source code
- use Claude and git to compose them

## 11. End-to-End Automation Flow

If you compress the repo to its actual work automation pipeline, it looks like this:

1. User starts in Claude Code and runs `/setup`.
2. Setup skill runs bootstrap and typed setup steps.
3. Service setup installs launchd/systemd/nohup.
4. User adds capabilities with `/add-*` skills.
5. Those skills merge code into the repo, install deps, build, and register chats/groups.
6. Host process starts:
   - loads state
   - self-registers channels
   - starts message loop
   - starts scheduler loop
   - starts IPC watcher
   - restores remote control if present
7. New messages or due tasks enter the `GroupQueue`.
8. Queue spawns containerized Claude execution for the target group.
9. Container can:
   - answer the user
   - schedule host tasks
   - send outbound host messages
   - use container-scoped skills
10. Host persists state, updates sessions, and recycles containers.

This is a coherent automation system. It is not generic, but it is strong.

## 12. Why This Works

NanoClaw's automation works because it makes a few sharp choices:

- one orchestrator process, not many services
- real filesystem/container isolation, not policy-only isolation
- git as the feature composition engine
- Claude skills as the operator UX
- filesystem IPC as the trust boundary
- queue + scheduler reuse the same execution substrate

These choices reduce surface area. That is the main reason the project can automate a lot without becoming operationally huge.

## 13. Weak Points and Risks

The strongest risks are structural, not cosmetic.

### 1. Docs and implementation are drifting

The repo documents a clean branch-marketplace model, but current skills are mixed between:

- `upstream/skill/*`
- dedicated feature remotes such as `telegram/main` and `discord/main`

Also, `.claude/settings.json` is currently empty even though the docs describe marketplace registration.

This matters because automation quality depends on documentation matching the actual operator path.

### 2. The system assumes Claude is available as the control plane

Many workflows only work smoothly if Claude can:

- interpret SKILL.md correctly
- run git merges
- fix conflicts
- continue after partial failure

That is powerful, but it also means the human operator is not the primary interface. Without Claude, many workflows are awkward.

### 3. Filesystem polling IPC is simple but not especially scalable

The watcher loops over directories and JSON files. That is robust enough for a personal assistant, but it is not a high-throughput event bus.

### 4. Source-code customization as the main extension path increases drift risk

The benefit is bespoke control. The cost is merge pressure and docs pressure. NanoClaw accepts that trade explicitly.

### 5. Some operational issues are still tracked as known problems

`docs/DEBUG_CHECKLIST.md:3-40` documents real runtime defects and environmental pitfalls, including:

- stale transcript resume
- timeout policy mismatch
- cursor advancement before success
- container image garbage collection

That is good operational honesty, but it also means the automation layer is not "finished". It is still evolving.

## 14. What Is Most Worth Copying

If the goal is to borrow ideas rather than reproduce NanoClaw exactly, these are the best patterns:

### A. Typed setup step runner

Copy this almost directly:

- `setup/index.ts`
- step modules
- structured status emission

This is ideal for AI-guided installation and repair.

### B. Queue + scheduler sharing the same executor

Do not build separate workers for "live" and "scheduled" actions if they can share one queue/execution model.

### C. Filesystem IPC with per-tenant namespaces

For local agent-container orchestration, this is a good compromise:

- simple
- inspectable
- easy to debug
- narrow trust boundary

### D. Self-registration by code merge

If the system is meant to be user-forked and AI-modified, compile-time self-registration is often better than trying to maintain a generic runtime plugin ABI.

### E. Runbook-first operations

`docs/DEBUG_CHECKLIST.md` is not an afterthought. It is part of why the system is operable.

## 15. Bottom Line

NanoClaw automates work through a layered, AI-native repo workflow:

- Claude skill instructions drive the operator flow
- git merges deliver features
- typed setup steps make installation resumable
- a single orchestrator process runs message loop, scheduler, and IPC watcher
- a per-group queue and container runner handle actual work execution
- filesystem IPC gives containers bounded access to host capabilities

The most important insight is not "they use containers" or "they use Claude". It is that they reduced automation to a few strong primitives and then reused them everywhere:

- git
- skills
- queue
- containers
- IPC
- scheduler

That is why the repo stays understandable while still doing real automation work.
