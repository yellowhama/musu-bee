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

### 0.2 Resolved decisions (user + external CTO, 2026-05-15)

The seven open questions are answered. Several gained sub-decisions
from the external CTO's deeper analysis; those are recorded too
because they shape implementation.

| # | Decision | External CTO sub-decision (where applicable) |
|---|----------|---------------------------------------------|
| O1 | **Solo frontend (user + Claude Code)** — same person handles musu-bee Next.js + React Flow integration | Phase 4 budget extends to 8–10 weeks instead of CTO-recommended 6 weeks; no outsourcing, no second engineer assumed |
| O2 | **Windows = WSL2-bundled installer** | **Sub-decision (O2-b)**: V23.2 spike measures install failure rate. Threshold = **30% total failure**, BUT pivot to macOS/Linux-only immediately if the dominant failure cause is "Hard Blocker" (BIOS virtualization disabled — user must enter UEFI/BIOS, which is unfixable in script). Failure quality > raw failure rate. **Sub-decision (O2-c)**: Alternatives to K3s+WSL2 (Nomad, Rancher Desktop, Windows Native Containers) **explicitly rejected** — see §0.3 below |
| O3 | **Windows first, macOS deferred to V24** | No macOS spike during V23 |
| O4 | **Build signaling from scratch** — Node + `ws` + simple-peer pattern (~300 lines). LiveKit explicitly rejected (it's an SFU, would relay traffic and violate True P2P). simple-peer-server rejected (limited extensibility for paid-tier auth gates) | **Sub-decision (O4-b)**: **STUN-only MVP**; TURN servers explicitly excluded from initial architecture. Re-evaluate TURN at V23.5 closed-beta based on actual hole-punching failure telemetry. If failure rate justifies it AND business model can absorb the cost, introduce TURN as paid-tier perk with strict traffic caps to prevent egress-cost runaway |
| O5 | **Target user = AI-agent prosumer** (Zapier / n8n / Make.com user level — can't code, can model workflows) | UI shows agent / company / workflow language; K8s vocabulary 0% exposed; React Flow workflow editor is appropriate complexity |
| O6 | **$5/mo Hobbyist tier** (Tailscale-personal-pro pricing) | Viral-growth pricing. musu.pro signaling VM ($30–100/mo) breaks even at ~10–20 paid users |
| O7 | **K8s-native idempotency only** — rely fully on `resourceVersion`, deterministic naming, and client-go leader election. No custom CAS in Operator | **Sub-decision (O7-a, b, c)**: Implementation must use **all three** patterns explicitly: (a) **Deterministic naming** for child resources (e.g. Argo Workflow name = `<workflow-name>-gen<metadata.generation>`) — etcd returns `409 AlreadyExists` on dup-spawn attempts as native fencing. (b) **Optimistic concurrency** via `resourceVersion` on every Operator status update; on conflict, requeue + re-read. (c) **client-go leader election** enabled so only one Operator Pod is active even if multiple replicas run. v22 §3.5 custom CAS pattern stays in the freezer as fallback for V23.3+ if race conditions slip through native primitives |

**Bridging requirement** (also surfaced by CTO): the V23.2 WSL2 spike
and the V23.5 STUN-only TURN-decision both require **telemetry from
day 1** of installer/relay shipping. Add to Phase 2 + Phase 5 scope:
crash reports, install-failure cause classification, NAT-pierce
success rate. Tool TBD (Sentry, PostHog, self-hosted), but the
*requirement* is now locked.

### 0.3 Why not Nomad / Rancher Desktop / Windows Native Containers

User asked "is there a K3s alternative for Windows that avoids
virtualization?" External CTO answer (2026-05-15): **no such thing
exists**. The constraint isn't tooling — it's OS kernel architecture.
Linux containers use Linux kernel features (cgroups, namespaces) that
Windows kernel doesn't provide. Anything that runs Linux containers
on Windows must run a Linux kernel somewhere; WSL2 is the lightest
form of that.

Three alternatives were evaluated and rejected:

| Alternative | Why rejected |
|-------------|--------------|
| **HashiCorp Nomad** | Native Windows binary, can schedule plain processes (not just containers). **Would solve Windows problem but** forces abandoning entire K8s ecosystem: no kube-scheduler, no CRDs, no Argo Workflows, no `kubectl`, no Operator pattern. Phase 3 (Custom CRD + Argo) and Phase 4 (K8s-language hiding) are built around K8s — Nomad invalidates both. The K8s ecosystem advantages (Argo, Operators, mature tooling) outweigh the Windows portability gain |
| **Rancher Desktop / Podman Desktop** | These already bundle K3s + WSL2 into one installer. **Would solve UX for K3s install but** ships as a 1–2 GB application, way too heavy to silently bundle inside musu installer. Also: still requires WSL2 or Hyper-V underneath — doesn't actually escape the kernel limitation |
| **Windows Native Containers** | Microsoft's `windowscontainers` run Windows Server Core / Nano Server images on Windows kernel directly. **Sounds like it solves the problem but** images are GB-scale, the entire AI/Python/Node.js ecosystem doesn't ship Windows-container variants, and the technology is effectively abandoned outside .NET shops. Dead end for AI workloads |

**Conclusion**: WSL2 is unavoidable for Windows. The engineering work
is making WSL2 install painless, not finding a way around it. This is
why §0.2 O2 + O2-b focus on installer quality + telemetry-driven
pivot criteria rather than on substrate choice.

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

**NAT-pierce policy (per O4-b)** — explicit:

| Layer | V23 decision |
|-------|--------------|
| STUN server (public IP discovery) | Use free public STUN servers (Google: `stun.l.google.com:19302`) or run a tiny one on musu.pro. Cost: $0 |
| TURN server (relay fallback when P2P fails) | **NOT included in MVP**. Users in extreme NAT environments (CGNAT, corporate firewall) fail external access at V23 launch; signaling tells them to use LAN-only mode |
| Telemetry | musu-relay reports each NAT-pierce attempt outcome (success / fail / fail-cause) to musu.pro signaling. Required from V23.1 ship day |
| TURN re-evaluation gate | V23.5 closed-beta data — if more than ~10% of paid users hit hole-punch failure, introduce TURN as paid-tier perk with strict per-user traffic cap (e.g., 5 GB/mo) to prevent egress-cost runaway |

Industry baseline: STUN-only hole-punch success is typically 80–85%
globally; expected to be 90%+ for musu's home-PC-heavy target. The
~10–20% loss is borne by free-tier users (LAN-only is still the
free product), so the commercial pain is limited to paid users in
the worst NAT environments — quantified at V23.5.

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

**Operator idempotency — three K8s-native patterns** (per §0.2 O7 +
external CTO 2026-05-15). Custom CAS / fencing tokens explicitly
rejected as anti-pattern; all three patterns below must be applied:

1. **Deterministic child-resource naming**. When the Operator
   translates `AgentWorkflow` → Argo `Workflow`, the Argo resource's
   `metadata.name` is **derived from the parent**, not random:
   ```
   argo_workflow.metadata.name = f"{agent_workflow.name}-gen{agent_workflow.metadata.generation}"
   ```
   If the Operator retries (network blip, requeue) and tries to
   create the same Argo Workflow twice, etcd returns
   `409 Conflict (AlreadyExists)`. The second attempt is silently
   absorbed — etcd is doing the fencing for us. This eliminates the
   double-spawn class of bugs that V22 §3.5 partial-unique-index
   was trying to fix at the SQL level.

2. **Optimistic concurrency via `resourceVersion`**. Every Operator
   status write includes the `resourceVersion` it read at decision
   time. If anyone (another Operator replica, a manual `kubectl`
   edit) modified the object between read and write, the K8s API
   server returns `409 Conflict` and the Operator requeues —
   re-read, re-decide, re-write. This is the K8s equivalent of
   V22 §3.5's generation-CAS, but provided natively.

3. **Leader election via client-go**. Even if Helm chart deploys
   the Operator with `replicas: 2` for HA, the client-go leader-
   election helper ensures **only one replica processes events at
   a time**. The standby replica waits for lease expiry. No
   double-Reconcile possible. One config flag, no custom code.

If V23.3 implementation reveals race conditions that these three
patterns miss, v22 §3.5 generation-CAS pattern is the documented
fallback (kept on ice, not deleted). External CTO assessment: such
fallback is unlikely to be needed; Argo, KubeSphere, and most CNCF
operators rely entirely on these three patterns.

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
