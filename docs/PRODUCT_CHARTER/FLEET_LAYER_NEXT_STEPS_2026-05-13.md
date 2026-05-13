# Fleet Layer Next Steps

**Date**: 2026-05-13  
**Purpose**: Convert MUSU's upper-layer fleet positioning into executable work.

## Current Judgment

MUSU already has the beginnings of a real fleet layer:

- node registry via `nodes.toml`
- mesh routing and fallback
- node health checks
- dashboard node grid
- watchdog/update controls
- company/workspace/agent surfaces

But it does not yet model external runtimes such as Paperclip, OpenClaw, and Hermes as first-class installable/routable capabilities.

## P0 - Spec and Message Lock

- [x] Document MUSU as the upper layer above Paperclip/OpenClaw/Hermes.
- [x] Define layer model L0-L4.
- [x] Record current implementation evidence.
- [ ] Rewrite public landing hero around fleet pain.
- [ ] Add product copy that says "attach Paperclip/OpenClaw/Hermes when useful."

## P1 - Runtime Capability Model

- [ ] Define `runtime_capabilities` schema.
- [ ] Store per-node runtime states:
  - bridge
  - paperclip
  - openclaw
  - hermes
  - claude_cli
  - codex_cli
  - gemini_cli
  - ollama
- [ ] Add tests for runtime detection and serialization.

## P2 - Bridge Runtime APIs

- [ ] `GET /api/nodes/{name}/runtimes`
- [ ] `POST /api/nodes/{name}/runtimes/{runtime}/probe`
- [ ] `POST /api/nodes/{name}/runtimes/{runtime}/install` behind explicit confirmation
- [ ] `POST /api/nodes/{name}/runtimes/{runtime}/update` behind explicit confirmation
- [ ] Audit all runtime operations.

## P3 - Dashboard

- [ ] Add runtime badges to node cards.
- [ ] Add "missing setup" callouts per node.
- [ ] Add fleet readiness summary:
  - nodes online
  - runtimes installed
  - nodes needing update
  - nodes missing bridge
  - nodes missing token/config
- [ ] Add route explanation for selected task.

## P4 - Onboarding

- [ ] One-command bootstrap for a new node.
- [ ] QR/copy token flow for joining a node.
- [ ] Raspberry Pi path tested.
- [ ] Windows laptop path tested.
- [ ] GPU desktop path tested.

## P5 - Marketing Landing

- [ ] Replace "Agent Runtime for Vibe Coders" with fleet-layer copy.
- [ ] Show "10 machines" problem visually.
- [ ] Add attachable runtime section:
  - "Use Paperclip for agent management."
  - "Use OpenClaw for channels and skills."
  - "Use Hermes for persistent personal agents."
  - "Use MUSU to install, observe, route, and operate them across your fleet."
- [ ] Add proof block from actual code:
  - node health
  - watchdog
  - update
  - mesh route
  - adapter probe

## P6 - Code Audit Follow-ups

- [ ] Fix or repoint stale Product Charter canonical links.
- [ ] Replace ad-hoc `nodes.toml` parsing in `musu-bee/src/lib/nodes-server.ts` with a real TOML parser or bridge-backed node API.
- [ ] Add auth/token forwarding to `/api/nodes` proxy if exposed beyond localhost.
- [ ] Review dangerous fleet commands (`update`, `restart`, `cleanup`) for explicit allowlists and audit events.

