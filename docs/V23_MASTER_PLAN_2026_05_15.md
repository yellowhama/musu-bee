# V23 — musu Master Plan (True P2P + K3s + Argo + React Flow)

**Status**: DRAFT — strategic plan, not yet authorized for implementation
**Date**: 2026-05-15
**Branch**: TBD (v23/master-plan when authorized)
**Supersedes**: `V22_K8S_GAP_ANALYSIS_2026_05_15.md` (wrong-frame, see its header)
**Authority**: derived from user product-model lock + external CTO recommendation, both received 2026-05-15

---

## 0. Read this first — what this plan is and isn't

V22 spent six /loop iterations building a single-host K8s control-plane.
That was the wrong frame: musu's actual product model is **one user
owns N devices, peer-to-peer meshed**. K3s already solves the
control-plane problem; the work musu needs to do sits *above* K3s
(workflow, UI, P2P signaling), not *as* K3s.

This document is the corrected master plan. It is built on four locked
facts and seven open questions. The locked facts are not negotiable;
the open questions need data before they're decided. The plan
sequences only the work that can begin under the locked facts and
defers the rest until each open question is answered.

### 0.1 Locked facts (user-confirmed 2026-05-15)

| # | Fact | Source |
|---|------|--------|
| L1 | **P2P-default**: one user's devices form a peer-to-peer mesh; data + compute stay on the user's hardware | user message |
| L2 | **musu.pro = stateless signaling + DNS + identity**; never a data relay, never a control plane. Operates on a tiny cloud footprint (domain + signaling server, ~$수십/월) | user message |
| L3 | **Free tier = LAN-only / Paid tier = external access via `<user>.musu.pro` signaling**; same UI/UX both paths | user message |
| L4 | **K3s is the substrate**; users never see K8s vocabulary in the UI | user confirmation + external CTO |
| L5 | **Killer features**: F1 multi-PC workspace, F2 multi-agent automation (agentic company), F3 local + remote control | user message |
| L6 | **Argo Workflows** as the hidden DAG backend; **React Flow** as the visual DAG editor in musu-bee | external CTO recommendation, accepted by user |
| L7 | **True P2P / Cloud-evasion**: Cloudflare Tunnel and Tailscale Funnel are **rejected** — both relay traffic through their edge, violating L1+L2. WebRTC / STUN-TURN-ICE / QUIC hole-punching is the path | user clarification 2026-05-15 |

### 0.2 Open questions (data needed before deciding)

| # | Question | Blocks |
|---|----------|--------|
| O1 | Frontend headcount + React Flow experience available? | Phase 4 timeline |
| O2 | K3s on Windows worker nodes — WSL2 viable for users, or Windows = control-plane-only? | Phase 2 installer scope |
| O3 | macOS sandbox-exec deprecation — does Phase 2 need Apple Endpoint Security work? | Phase 2 risk register |
| O4 | musu.pro signaling: build from scratch (Node + WebRTC signaling) vs adopt existing (LiveKit signaling, simple-peer-server)? | Phase 1 scope |
| O5 | Are "the multiple users" engineers or non-engineers? Affects how much abstraction the UI does | Phase 4 UX scope |
| O6 | First paid-tier price point + Paddle plan configuration | Phase 5 billing |
| O7 | v22 §3.5 generation-CAS work — apply to the Argo-wrapping Operator? Or skip and rely on Argo's idempotency? | Phase 3 scope |

These are **investigation tasks** in the plan, not assumed answers.

---

## 1. Four-phase architecture (per external CTO)

The external CTO answered "이 기획을 어떻게 구현해야 되느냐" with four
phases. They map cleanly to musu's existing 12-package monorepo. This
section restates the architecture; §2 maps it to existing packages.

### Phase 1 — Networking & external access (True P2P + signaling)

The hardest layer; differentiates musu from "K8s + Cloudflare Tunnel"
me-too products and is what the paid SaaS sells.

| Component | Location | Role |
|-----------|----------|------|
| **Signaling Server** (musu.pro) | Cloud (single small VM is enough — Fly.io / Hetzner / DO droplet, ~$5–20/mo) | DNS + user auth + WebRTC signaling broker. **Stateless. Traffic never passes through.** Exchanges SDP / ICE candidates between external visitor and user's PC |
| **Local Gateway** (musu-relay) | **User's PC**, running alongside K3s | Receives signaling from musu.pro, negotiates direct WebRTC / QUIC data channel to the external visitor, then forwards the tunneled traffic into K3s Services / Ingress |

**Free tier**: musu-relay is reachable only over LAN — direct
`http://<lan-ip>:8070` access. No musu.pro signaling needed.

**Paid tier**: musu.pro registers `<user>.musu.pro` → user's PC.
External browser opens that URL → musu.pro signals → musu-relay
WebRTC-tunnels to the browser → browser sees the same UI as LAN.

**Cost model**:
- musu.pro = $30–100/mo for signaling VM regardless of user count
- Bandwidth = 0 for musu.pro (P2P direct)
- Bandwidth + compute = user's ISP + user's PC (already paid for by user)
- Marginal cost per paid user ≈ 0 — only the signaling VM scales (linearly very slowly, since signaling messages are tiny)

This is the cloud-evasion architecture. It's why the paid tier can
be cheap and still profitable.

### Phase 2 — Core infra (K3s as hidden engine)

K3s does multi-PC pooling, container scheduling, container isolation,
process supervision, and event/watch/lease. **All four of these are
work musu would otherwise have to build in v22 §3.x.** K3s eliminates
them by being upstream-maintained.

| Capability | Provided by K3s | musu does not build |
|-----------|-----------------|---------------------|
| Multi-PC compute pool | K3s master + workers | ✗ no custom cluster code |
| Container isolation | containerd + cgroups + namespaces | ✗ supervisor crate retires |
| Process supervision | Deployment / Pod controllers | ✗ no custom watchdog |
| Cross-host scheduling | kube-scheduler | ✗ no v21.C scheduler/binder |
| Event watch + lease | kine + coordination.k8s.io | ✗ no v21.B watch / v22 §3.1/§3.2 |
| Resource quotas | ResourceQuota | ✗ no custom budget enforcement |
| Self-healing | Pod restart, Node controller | ✗ no v21.E reconciler complexity |

**Zero-config install**: per-OS installer (`.exe` / `.dmg` / `.AppImage`)
that drops K3s + musu binaries, no terminal commands required.

**Join flow**: install on second PC → enter username + password (or
scan QR from first PC) → installer auto-joins as K3s worker node.

**Concrete K3s install snippet** (Linux master):
```
curl -sfL https://get.k3s.io | sh -s - --disable=traefik \
  --tls-san <user>.musu.pro
```
We disable Traefik (K3s default) because musu-relay provides ingress.

### Phase 3 — Agent workflow control (CRD + Argo Workflows hidden)

This layer carries musu's actual differentiation: the agentic-company
workflow model. K3s doesn't provide it. We build it on top of K3s
using Custom Resource Definitions + a wrapping Operator.

**Custom Resources** (musu-specific schemas):
```yaml
apiVersion: musu.pro/v1
kind: Company
metadata:
  name: acme
spec:
  display_name: "Acme Corp"
  budget_usd_monthly: 100
status:
  spend_usd: 17.42
  active_agent_count: 3

apiVersion: musu.pro/v1
kind: Agent
metadata:
  name: researcher
  namespace: company-acme       # = K8s namespace (hidden as "company" in UI)
spec:
  role: research
  adapter: claude_local
  budget_usd_monthly: 30
  schedule_pref:                # → translates to nodeAffinity
    prefers_gpu: true
    avoid_nodes_below_gb_ram: 4
status:
  phase: Running
  bound_node: laptop-2
  spend_usd: 4.13

apiVersion: musu.pro/v1
kind: AgentWorkflow
metadata:
  name: monthly-report
  namespace: company-acme
spec:
  trigger: schedule "0 9 1 * *"
  graph:
    - id: collect
      agent: researcher
    - id: write
      agent: writer
      depends_on: [collect]
    - id: review
      agent: editor
      depends_on: [write]
status:
  last_run_at: "2026-05-01T09:00:00Z"
  last_run_status: succeeded
```

**The Operator** (musu workflow controller, K8s-style) watches these
CRDs and translates `AgentWorkflow` → **Argo Workflows** spec:
```yaml
# What the user submits (AgentWorkflow above)
#         ↓ musu Operator translates ↓
# What runs inside K3s:
apiVersion: argoproj.io/v1alpha1
kind: Workflow
metadata:
  generateName: acme-monthly-report-
spec:
  entrypoint: pipeline
  templates:
    - name: pipeline
      dag:
        tasks:
          - name: collect
            template: agent-pod
            arguments: {parameters: [{name: agent, value: researcher}]}
          - name: write
            template: agent-pod
            dependencies: [collect]
            arguments: {parameters: [{name: agent, value: writer}]}
          - name: review
            template: agent-pod
            dependencies: [write]
            arguments: {parameters: [{name: agent, value: editor}]}
    - name: agent-pod
      inputs: {parameters: [{name: agent}]}
      container:
        image: ghcr.io/musu/agent:latest
        env: [{name: AGENT_NAME, value: "{{inputs.parameters.agent}}"}]
        # … resource limits derived from Agent.spec.budget_usd_monthly
```

**Why Argo, not self-built**: K8s-native DAG scheduling, parallel
execution, retry-on-failure, cross-Pod artifact passing, dashboard if
needed. Building this from scratch is the "reinventing the wheel"
the external CTO flagged. Argo is hidden behind the `AgentWorkflow`
CRD — the user never types `argoproj.io/v1alpha1`.

**Why CRDs + Operator**: musu's domain language (Company / Agent /
AgentWorkflow) is preserved. The user thinks "marketing company has
a content-generation workflow." K8s thinks "namespace `company-acme`
has an Argo Workflow named `monthly-report`." The Operator translates.

### Phase 4 — UX & UI (musu-bee, full K8s hiding)

The Next.js app already exists (`musu-bee`). Phase 4 reshapes it as
the user-facing surface that hides everything below.

**Terminology hiding rules** (engineering invariant):

| K8s reality | UI label |
|-------------|----------|
| Namespace | Company / Workspace |
| Pod | Agent (running) |
| Deployment | Agent (configured) |
| Node | "My PC" / device name |
| Service / Ingress | (never shown — UI clicks handle it) |
| CRD | (never shown) |
| Argo Workflow | "Workflow" or "Routine" |
| ResourceQuota | "Monthly budget ($X)" |
| nodeAffinity | "Run on PC: ☑ Laptop ☑ Desktop ☐ Family-PC" |
| kubectl apply | "Save" button |
| Pod restart count | "Retried N times" |
| Pod evicted | "Moved to <other PC>" |

**Two main UI surfaces**:

1. **Fleet view** ("내 워크스페이스") — shows user's PCs and their
   load:
   - "Laptop: 8 cores, 16 GB, 3 agents running"
   - "Desktop: 12 cores, 32 GB, 5 agents running"
   - "Family-PC: 4 cores, 8 GB, idle"
   - Adding a PC = "Add new PC" wizard → generates join token → user
     runs installer on that PC

2. **Workflow editor** — **React Flow visual DAG**:
   - Drag agents from a palette
   - Connect outputs to next agent's inputs
   - Save → musu-bee POSTs `AgentWorkflow` CRD → Operator → Argo
   - Run / pause / view execution graph live

**Local + SaaS UI parity** (per L3): the React app makes **zero
decisions** based on hostname. Same SPA renders identically on
`http://localhost:8070` (LAN) and `https://<user>.musu.pro` (paid).
Authentication is the only thing that differs, and it's invisible at
the React layer — local has an auto-token, SaaS uses musu.pro
identity.

### Phase 5 — Billing + onboarding + closed beta

Not in the external CTO's four phases, but required for the paid
tier to exist as a product.

- Paddle plan extension (musu-bee already has it for v21 — extends
  for per-user `<user>.musu.pro` subscription)
- Onboarding: "download installer → install on primary PC → free
  LAN-only by default → upgrade to add external access"
- Closed-beta gate with invite codes

---

## 2. How this maps to existing 12 packages

Verified against `docs/PACKAGE_INVENTORY_2026_05_15.md` (filesystem-
measured as of 2026-05-15).

| Package | V23 fate | Reason |
|---------|----------|--------|
| **musu-bridge** | **Shrinks dramatically** → becomes the musu Operator (watches `Company` / `Agent` / `AgentWorkflow` CRDs, translates to Argo). Loses scheduler, watch, lease, isolation, supervisor adapters. ~70% LOC reduction projected | K3s + Argo cover the heavy lifting |
| **musu-core** | Survives | Shared lib still useful for the Operator |
| **musu-bee** | **Survives with heavy rewrite** | Becomes the K8s-hiding fleet view + React Flow workflow editor. Single biggest UI work item |
| **musu-relay** | **Survives, repurposed** | From "cloud relay broker" to **local WebRTC gateway**. Runs on user's PC alongside K3s. Handles musu.pro signaling + NAT-pierce. Major rewrite of role, not all code |
| **musu-control** (MCP) | Survives | Claude Code → musu API still useful |
| **musu-indexer** (MCP) | Survives | Orthogonal |
| **musu-ai-detector** (MCP) | Survives | Orthogonal |
| **musu-worker** | **Retired** | K3s Pod = the worker. `/execute/process` RCE endpoint becomes a security liability we no longer need |
| **musu-supervisor** | **Retired** | K3s containerd handles isolation. v21.D Windows AppContainer (1100 lines Rust, 27 tests) becomes throwaway — honest cost of the V22 wrong frame |
| **musu-port** | **Retired** | K8s Service + Ingress handles port abstraction |
| **musu-plugin** | Survives | Claude Code packaging |
| **musu-writer** | Survives | Off-path |

**Net**: 7 packages survive intact or with role-shift; 1 package
(musu-bee) gets a major rewrite; 1 package (musu-bridge) shrinks
heavily; 3 packages (worker / supervisor / port) retire. v21.D Windows
work + v21.A controllers + v21.C scheduler + v21.B watch are **largely
absorbed into K3s** — they were the work the V22 plan was trying to
preserve, and V23 acknowledges they're redundant.

### 2.1 What survives from v22 work

Per V22 §7 self-grade, two pieces of v22 work transfer cleanly to V23:

- **§3.5 generation CAS + TOCTOU fixes** — applies to the musu
  Operator's idempotency. Apply to AgentWorkflow CRD writes.
  Deferred to O7 decision.
- **§3.8 multi-process race + fault injection harness** — applies
  to the musu Operator + WebRTC signaling. Patterns transfer, even
  if specific test cases need rewriting against K3s primitives.

Everything else in V22 §3.1–§3.7 is redundant under K3s.

---

## 3. Sequenced plan (gated on user "진행해" per Constitution III/VII)

This is **draft sequencing**, not authorized work. Each phase needs
explicit "진행해" before code lands on `main`.

### V23.0 — Strategic confirmation (1 week)

No code. Three deliverables:

1. **Answer O1–O7** (the open-questions list above) with the user.
   Some need data (engineering headcount, billing plan); some need
   short investigation (signaling library evaluation, K3s Windows
   viability check).
2. **Confirm V22 deprecation** with the user. The wrong-frame box
   is in place; do we also want to git-tag v22 as a final checkpoint?
3. **Decide branch strategy**: cut `v23/master-plan` off main now,
   or wait until V23.1 starts?

**Gate**: user "진행해" on the four-phase architecture as written.

### V23.1 — Phase 1 spike (3 weeks)

- musu-relay rewrite: local WebRTC gateway. Replace the current
  Express+ws broker code with a peer that accepts musu.pro signaling
  and tunnels to local K3s services.
- musu.pro signaling server skeleton (Node + simple-peer-server or
  LiveKit signaling — decision per O4).
- One end-to-end test: external browser → musu.pro → musu-relay on
  laptop → "hello world" served from K3s pod on the laptop.

**Gate**: working external-browser-to-LAN-pod handshake demo.

### V23.2 — Phase 2 spike (3 weeks)

- K3s zero-config installer for one OS (Linux first; Mac and Windows
  per O2/O3 follow).
- musu-bridge slim Operator: register `Company` / `Agent` CRDs;
  Pod-spawn an agent on the local K3s.
- Two-PC join flow: install on PC2 → joins PC1's K3s as worker →
  visible in K3s `nodes` API.

**Gate**: two of the user's PCs forming a K3s cluster with one
agent running across them.

### V23.3 — Phase 3 spike (4 weeks)

- `AgentWorkflow` CRD + Operator translation to Argo Workflows.
- Argo Workflows installed inside K3s (hidden).
- One end-to-end test: 3-step DAG (research → write → review) runs
  to completion across two PCs.
- v22 §3.5 generation CAS applied to Operator writes (per O7).

**Gate**: a hard-coded multi-agent workflow producing real output.

### V23.4 — Phase 4 rewrite (6 weeks)

- musu-bee Fleet view (React, K8s vocabulary fully hidden).
- musu-bee React Flow workflow editor that emits `AgentWorkflow`
  CRD via musu-bridge API.
- Local + SaaS UI parity audit — single SPA, both hosts.

**Gate**: user-facing UI that lets a non-engineer build and run a
multi-agent workflow.

### V23.5 — Phase 5 closed beta (4 weeks)

- Paddle plan + `<user>.musu.pro` provisioning flow.
- Onboarding wizard.
- 5 closed-beta users (handpicked).

**Gate**: 5 users actually running multi-PC workflows.

**Total: ~21 weeks** from V23.0 to closed beta. About 30% more than
the V22 18-week estimate, but with three crucial differences:
1. The 21 weeks build something that hits all three killer features.
2. It rests on K3s + Argo, not on hand-rolled K8s primitives.
3. The V22 plan ended at "v22.3 soak data; then decide Road A/B/C"
   — i.e., it never actually shipped a product.

---

## 4. Risks (honest enumeration)

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | True P2P / WebRTC NAT-pierce fails for some users (CGNAT, strict firewall) | High | Fallback: TURN server on musu.pro (degrades to relay; costs more but works). User opt-in |
| R2 | K3s on Windows worker is brittle (O2) | Medium-high | WSL2 path first; investigate native-Windows K3s alternative if WSL2 install friction is too high |
| R3 | macOS sandbox-exec deprecation hits during V23 (O3) | Medium | K3s on macOS via Lima or native; track Apple announcements |
| R4 | Argo Workflows is over-spec for AI agent workflows; users feel slow | Low-medium | Argo is hidden; if it's slow we can swap to LangGraph wrap later without UI change |
| R5 | musu-bee rewrite slips past 6 weeks (O1: frontend headcount unknown) | High | Phase 4 starts last; if headcount is low, ship Phase 1-3 to a dev-only audience and delay Phase 4 |
| R6 | Signaling server (musu.pro) becomes a denial-of-service magnet | Medium | Rate-limit; require auth before signaling; CDN-front the static parts |
| R7 | "Hidden K8s" abstraction leaks (user hits an error message containing the word "Pod") | Medium | Engineering rule: all user-facing errors translated; lint check for K8s-vocabulary leakage |
| R8 | v21.D Windows AppContainer work was 1100 lines of Rust; throwing it away is real sunk cost | Low (already paid) | Document in retrospective; lesson for future "build vs adopt" decisions |
| R9 | The 21-week estimate is calibrated on intuition, not data | High | V23.0 strategic confirmation week recalibrates with the user; gate each phase on actual delivery |

---

## 5. Decision points that must NOT be made in this document

The plan above leaves the following deliberately open. Making any of
these unilaterally would repeat the V22 mistake of building on
unverified assumptions.

| Decision | Who decides | When |
|----------|-------------|------|
| Frontend headcount allocation | User | V23.0 |
| WSL2 vs alternative for Windows K3s | User + spike data | V23.2 |
| Signaling library choice | User + 1-week eval | V23.1 |
| First Paddle price point | User | V23.5 |
| Closed-beta user list | User | V23.5 |
| Whether to keep v21.D Windows work as a fallback "ultra-paranoid no-K3s" mode | User | V23.0 |

---

## 6. What this document does NOT say

To be explicit (per V22 §7 self-grade lessons):

- **No code is written.** This is a sequencing plan.
- **No primary-source fact-check** has been done on Argo Workflows DAG capability claims, React Flow performance claims, WebRTC NAT-pierce success rates, or K3s join-token UX. These are taken on the external CTO's authority + brief WebFetch verification. Full §6-style audit due before V23.1 begins.
- **No git branch is created.** That's V23.0 deliverable #3.
- **No commit is pushed.** Constitution VII still applies.
- **No promise that V22 work is *all* throwaway.** §3.5 + §3.8 transfer; v21.A-F closure-doc honest record stays.
- **Cost estimates are intuitive**, not data-driven. The 21-week total is plus-or-minus 30% until V23.0 calibration.

---

## 7. Cross-references

- V22 wrong-frame analysis (deprecated): `docs/V22_K8S_GAP_ANALYSIS_2026_05_15.md`
- V22 option SWOT (the document where the locked facts L1–L7 emerged): `docs/V22_OPTION_SWOT_2026_05_15.md` §13–§14
- Package inventory (used in §2 mapping): `docs/PACKAGE_INVENTORY_2026_05_15.md`
- v21.D Windows isolation (work being retired): `docs/V21D_WINDOWS_IMPL_2026_05_15.md`
- musu CLAUDE.md / session memory: P2P invariant origin

---

## 8. One-line summary

> **V23 builds the musu product by gluing K3s (multi-PC engine), Argo Workflows (DAG runtime), and WebRTC P2P (cloud-evasion) under a Next.js + React Flow UI that never says "Kubernetes." musu.pro is a $30/mo signaling VM. Everything else runs on the user's hardware.**

This is the elevator pitch. The rest of this document is how we get there.
