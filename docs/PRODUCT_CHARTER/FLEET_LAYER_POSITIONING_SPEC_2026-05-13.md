# MUSU Fleet Layer Positioning Spec

**Date**: 2026-05-13  
**Status**: Product positioning and implementation contract  
**Scope**: musu.pro landing, dashboard, workspace, bridge mesh/node APIs, onboarding

## 1. Position

MUSU is not primarily a replacement for Paperclip, OpenClaw, or Hermes.

MUSU is the upper fleet/control layer that lets an operator run those agent runtimes and management tools across many machines without configuring every desktop, laptop, GPU box, Raspberry Pi, or VPS by hand.

Layer model:

```text
L4 Operator / Company OS
   MUSU: companies, workspaces, budgets, approvals, templates, memory

L3 Agent management layer
   Paperclip: org structure, issues, budgets, approvals, activity

L2 Agent runtime / integration layer
   OpenClaw: channels, skills, models, sandbox
   Hermes: persistent personal agent, memory, messaging

L1 Machine fleet layer
   MUSU node: desktop, laptop, Raspberry Pi, GPU box, VPS registration,
   health, update, watchdog, routing, remote execution, install/probe

L0 Physical devices
   User-owned machines
```

## 2. Core Differentiator

Paperclip manages agents.  
OpenClaw connects agents to channels, skills, and models.  
Hermes runs a persistent agent on the user's infrastructure.  
MUSU operates the machines, routing, installation state, update state, node health, and operating memory underneath them.

The public promise:

> Run your AI stack across every machine you own.

The Korean promise:

> 내 모든 기기를 하나의 AI 작업장으로 묶어 운영하세요.

## 3. Why This Exists

One machine is easy. Ten machines are not.

If an operator has a desktop, laptop, Raspberry Pi, GPU box, home server, and VPS fleet, the real pain is not "can I run an agent?" The pain is:

- Which machine is alive?
- Which one has GPU headroom?
- Where is Paperclip/OpenClaw/Hermes installed?
- Which bridge is down?
- Which node needs an update?
- Which agent is assigned to which node?
- Can I restart/clean/update without SSHing into ten boxes?
- Can I see logs, costs, approvals, and work state in one place?

MUSU exists to answer those questions.

## 4. Product Requirements

### P0 - Fleet inventory

MUSU must show every registered node with:

- node name
- URL or connection route
- online/offline state
- machine type or role
- OS / GPU metadata when available
- last checked time
- assigned agents

### P0 - Fleet operations

From `musu.pro/dashboard`, the operator must be able to:

- select a node
- see node health
- restart bridge/watchdog where supported
- clean agent processes where supported
- trigger update where supported
- inspect recent tasks and costs for the selected node

### P0 - Routing contract

MUSU must route work by:

- explicit agent assignment when available
- node health
- fallback to another healthy node when preferred remote node fails
- local execution when no healthy remote node is available

### P1 - Runtime installation awareness

MUSU should track whether a node has:

- bridge installed
- Paperclip installed or reachable
- OpenClaw installed or reachable
- Hermes installed or reachable
- supported CLI adapters installed
- required tokens/config present

This is a product gap today. It is the difference between "node dashboard" and "fleet installer/operator."

### P1 - External runtime adapter map

MUSU should treat Paperclip/OpenClaw/Hermes as attachable runtimes:

- runtime name
- node
- health endpoint
- local install status
- configured channels/agents
- start/stop/update command
- supported capabilities

### P1 - Installer and update path

The operator should not manually repeat setup across ten machines.

MUSU needs a node bootstrap flow:

1. install bridge
2. register node
3. probe adapters
4. optionally install Paperclip/OpenClaw/Hermes
5. report capabilities
6. become routable

### P2 - Company memory over fleet

Company templates and wiki/indexer memory must be fleet-aware:

- company can declare preferred runtimes
- agents can declare node/running requirements
- repeated setup becomes reusable template
- work results and operational decisions become searchable memory

## 5. Current Implementation Evidence

Current code already supports part of this:

- `musu-bridge/mesh_router.py`
  - reads `~/.musu/nodes.toml`
  - maps agents to nodes
  - checks node health
  - supports node metadata such as GPU, OS, machine, RustDesk ID
  - forwards work to remote nodes
  - falls back to other healthy nodes or local execution

- `musu-bridge/server.py`
  - exposes `/api/nodes`
  - supports `/api/nodes/add`
  - supports `/api/nodes/assign-agent`
  - supports peer registration/token exchange
  - exposes adapter probe endpoint
  - exposes approvals, audit, costs, watchdog-related APIs

- `musu-bee/src/app/dashboard/page.tsx`
  - protects dashboard route with user auth
  - loads node list server-side
  - renders `DashboardClient`

- `musu-bee/src/components/dashboard/DashboardClient.tsx`
  - displays node grid
  - polls selected-node agents/tasks/costs
  - supports watchdog commands
  - supports node update command
  - keeps selected node in URL

- `musu-bee/src/lib/nodes-server.ts`
  - reads `~/.musu/nodes.toml`
  - probes `/health`
  - returns node status for the dashboard

## 6. Gaps

### G1 - Product docs drift

`docs/PRODUCT_CHARTER` still references canonical root files that are not present in the current checkout. The new fleet layer spec must become the live positioning anchor until those canonical files are restored or repointed.

### G2 - Runtime installation is not modeled

Nodes are modeled, but Paperclip/OpenClaw/Hermes installation state is not yet first-class.

### G3 - Fleet onboarding is not complete

The dashboard can observe and control known nodes, but the product does not yet provide a full "set up these ten machines" flow.

### G4 - Security boundary needs hardening before public claims

Current local/proxy/fleet controls are suitable for trusted dev usage, but public marketing must not overclaim managed enterprise security until per-node authorization, command allowlists, and audit review are complete.

### G5 - Landing copy still undersells the upper layer

The old phrase "multi-machine AI control plane" is accurate but too cold. The new copy should lead with fleet pain:

> Stop setting up the same AI stack on every machine by hand.

## 7. Acceptance Criteria

MUSU can publicly claim the fleet layer when:

- a new node can be registered from the UI or one command
- dashboard shows all nodes and their runtime capabilities
- Paperclip/OpenClaw/Hermes can be represented as runtimes on a node
- update/start/stop/probe actions are audited
- routing decisions explain why a node was selected or skipped
- a ten-machine setup does not require repeating manual configuration on each machine

## 8. Next Implementation Plan

1. Add `runtime_capabilities` to node metadata.
2. Add bridge endpoint: `GET /api/nodes/{name}/runtimes`.
3. Add bridge endpoint: `POST /api/nodes/{name}/runtimes/{runtime}/probe`.
4. Extend dashboard node card with runtime badges: Bridge, Paperclip, OpenClaw, Hermes, Claude, Codex, Gemini, Ollama.
5. Add one-command node bootstrap script that registers capabilities.
6. Add audit event for every fleet command.
7. Rewrite landing hero around fleet setup pain, not generic agent management.

