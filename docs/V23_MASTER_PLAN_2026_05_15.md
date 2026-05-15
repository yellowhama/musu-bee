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
| O2 | **Windows = WSL2-bundled installer** | **Sub-decision (O2-b)**: V23.2 spike measures install failure rate. Threshold = **30% total failure**, BUT pivot to macOS/Linux-only immediately if the dominant failure cause is "Hard Blocker" (BIOS virtualization disabled — user must enter UEFI/BIOS, which is unfixable in script). Failure quality > raw failure rate. **Sub-decision (O2-c)**: Alternatives to K3s+WSL2 (Nomad, Rancher Desktop, Windows Native Containers, Docker Desktop + Enable K8s) **explicitly rejected** — see §0.3. **Sub-decision (O2-d)**: WSL2 install is **NOT the Microsoft Store Ubuntu path**. Use **Alpine Linux (5MB base) + K3s, packed as a `musu-backend.tar` and silently injected via `wsl --import`**. Full architecture in §0.5. V23.2 spike goal: "single .exe runs → custom Alpine+K3s lands in background WSL2 in 100% automation, zero terminal window shown to user" |
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
| **Docker Desktop + "Enable Kubernetes"** | Docker Desktop has a built-in K8s toggle in Settings. **Looks like the answer but is the same problem wrapped uglier**. Three reasons it's worse than direct WSL2: (1) Docker Desktop **uses WSL2 under the hood anyway** — it doesn't escape virtualization, just hides it. (2) Install + idle cost is brutal for prosumer audience: 600MB download + reboot + license-acceptance UI + manual "Enable Kubernetes" toggle, then 2–4 GB RAM consumed *idling*. (3) **Commercial license: Docker Desktop is not free for businesses past a certain size** — Docker Inc. shifted to paid subscription for commercial use. If musu ships with "requires Docker Desktop," users in companies face license compliance issues we never asked them to think about |

**The real lesson from Docker Desktop**: Docker Desktop also bundles
WSL2 silently behind a polished installer. That's the pattern we need
to replicate — **musu's own installer hides WSL2 setup** the way
Docker Desktop hides it, without making the user install Docker
Desktop itself. The "global-class B2C infrastructure app" answer is
self-bundled WSL2 automation, not "go install Docker Desktop first."

**Conclusion**: WSL2 is unavoidable for Windows. The engineering work
is making WSL2 install painless **inside our own installer**, not
finding a way around it. This is why §0.2 O2 + O2-b focus on installer
quality + telemetry-driven pivot criteria rather than on substrate
choice.

---

### 0.4 Substrate SWOT — WSL2-K3s vs container-less

User question (2026-05-15): *"Windows에서는 WSL2를 안 쓰면 못 돌리는
프로그램이다? 이거지?"* — confirmed: under the current V23 plan, yes.
This section formally records the two paths and SWOT-compares them
before V23.0 begins. The current plan is **Option α**; user is
explicitly considering **Option β** as an alternative.

#### Option α — K3s + WSL2 on Windows (current V23 plan)

> Accept virtualization. Containers everywhere. K3s as the substrate.
> Windows users install WSL2 via the musu installer; agents run as
> Pods on user's PCs (Linux containers inside WSL2 on Windows; native
> containers on Linux; macOS deferred to V24).

##### α — Strengths

| # | Strength | Why |
|---|----------|-----|
| α-S1 | **Real isolation, upstream-maintained** | containerd + cgroups + namespaces is the most battle-tested process isolation on Linux. CVE response is Red Hat / CNCF, not us |
| α-S2 | **Multi-PC distribution is K3s's job** | kube-scheduler / kubelet / Node controller all upstream. F1 (multi-PC workspace) implementation cost ≈ 0 — just install K3s on each PC and let it cluster |
| α-S3 | **Phase 3 architecture flows naturally** | CRDs + Operator + Argo Workflows is K8s-native; no porting required |
| α-S4 | **OCI image distribution for free** | Agents ship as container images; updates = `docker pull`. Plugin ecosystem path is obvious |
| α-S5 | **K8s ecosystem leverage** | Helm charts, Argo, Prometheus, dozens of upstream tools "just work" |
| α-S6 | **Cross-platform unified runtime** | Same Pod spec runs on Linux native, Windows (via WSL2), macOS (via Lima, V24+). One mental model |
| α-S7 | **v22 critique's distributed-correctness fixes come free** | kine / leases / generation / finalizers all built into K8s |

##### α — Weaknesses

| # | Weakness | Why |
|---|----------|-----|
| α-W1 | **WSL2 install UX is the entire Windows experience** | If install fails (BIOS virtualization disabled, Windows version mismatch, corp policy), the user can't use musu at all. v23.2 spike measures this risk |
| α-W2 | **+1GB install footprint on Windows** | WSL2 base image + K3s + containerd. For a "$5/mo hobbyist" product, install size is a conversion-rate variable |
| α-W3 | **v21.D Windows AppContainer becomes throwaway** | 1100 lines Rust + 27 tests; replaced by containerd's Linux isolation. Real sunk cost |
| α-W4 | **Agent cold-start latency higher than native processes** | Container pull + create + start ≈ 500ms-2s vs native process ≈ 50ms. Matters for "spin up agent per query" workflows |
| α-W5 | **Windows-host UX feels like a Linux app pretending to be Windows** | File paths, shell semantics, network stack — all Linux inside WSL2. Some users notice |
| α-W6 | **BIOS-virtualization gate is unfixable** | If user's PC has CPU virtualization disabled in UEFI, no script can fix it. User has to reboot, enter BIOS, change setting. ~99% of non-technical users will drop off here |
| α-W7 | **Phase 4 K8s vocabulary hiding is non-trivial** | Every error path, every status display, every log must be translated. Linting for vocabulary leakage is real work |

##### α — Opportunities

| # | Opportunity | Why |
|---|-------------|-----|
| α-O1 | **Open path to enterprise / cloud deployment** | Same agent specs can deploy to managed EKS / GKE / on-prem K8s if a customer asks |
| α-O2 | **OCI image marketplace** | Third parties ship agents as signed images. `<user>.musu.pro/marketplace` |
| α-O3 | **SOC2/HIPAA story is easier** | K8s has audit precedent; AppContainer / hand-rolled does not |
| α-O4 | **Lima/colima path opens macOS in V24+ cheaply** | macOS-via-Lima is the same WSL2 pattern, well-trodden |

##### α — Threats

| # | Threat | Why |
|---|--------|-----|
| α-T1 | **WSL2 install success rate below 70% → product dead on Windows** | User churn before they even see the UI. v23.2 spike is the make-or-break gate |
| α-T2 | **Microsoft changes WSL2 licensing or distribution** | We're a downstream consumer of Microsoft's choices |
| α-T3 | **K3s upstream incompatibility between versions** | Pin to LTS; test matrix needed |
| α-T4 | **Container cold-start latency turns out to be a UX dealbreaker** | "Click run → wait 2s before agent starts" feels slow |
| α-T5 | **Marketing: "you need WSL2" is a complex sentence for prosumer audience** | Versus competitors whose install is "double-click .exe and go" |

#### Option β — Container-less, native processes per OS

> Drop containers entirely. Agents run as **native OS processes** on
> whichever PC they're scheduled to. v21.D Windows AppContainer
> revived as the Windows isolation backend. Linux uses user namespaces
> directly. macOS uses sandbox-exec or Endpoint Security. Multi-PC
> distribution is **built in-house** (no K3s scheduler upstream).

##### β — Strengths

| # | Strength | Why |
|---|----------|-----|
| β-S1 | **No virtualization required on any OS** | Windows runs native processes. macOS runs native processes. Linux runs native processes. No VM, no Hyper-V, no Lima |
| β-S2 | **Install footprint stays under 50MB** | musu binary + native OS sandboxing only. Best-in-class for "$5/mo install size" metric |
| β-S3 | **v21.D AppContainer work is salvaged** | 1100 lines Rust + 27 tests stay productive. No sunk cost |
| β-S4 | **Agent spawn latency ~50ms** | Native CreateProcess / clone is 10–40× faster than container create+start |
| β-S5 | **Marketing simplicity** | "Double-click installer → done." No "what's WSL2?" questions |
| β-S6 | **No BIOS-virtualization gate** | Works on every Windows PC made in the last 15 years regardless of UEFI settings |
| β-S7 | **Differentiated brand** | "Not Docker for AI" — defensible against Coolify/Dify clones |
| β-S8 | **Edge deployments stay tractable** | Raspberry Pi / NAS / family-PC with 4GB RAM — no spare RAM for a VM |

##### β — Weaknesses

| # | Weakness | Why |
|---|----------|-----|
| β-W1 | **Multi-PC scheduling is now ours to build** | F1 needs a real scheduler. v21.C scheduler from the monorepo is a starting point but was scored 6/10 in v22 critique. v22 §3.7 (preemption / affinity / topology) all come back into scope |
| β-W2 | **Phase 3 architecture must be rebuilt** | Argo Workflows is K8s-only. Either we adopt Nomad (which the CTO rejected earlier because of K8s ecosystem loss — but β puts that decision back on the table), or build a workflow engine ourselves, or wrap LangGraph |
| β-W3 | **Three OS-specific isolation backends to maintain** | Windows (AppContainer + Job Object), Linux (user-namespace via clone), macOS (sandbox-exec → Endpoint Security migration). v21.D shipped 1 of 3; 2 remain |
| β-W4 | **No image distribution standard** | Agent packaging is ours to invent. No OCI registry to lean on |
| β-W5 | **Phase 4 still hides "K8s-style" concepts even though no K8s underneath** | We'd be inventing our own pod/namespace/deployment vocabulary — and have to teach users without an existing analogy |
| β-W6 | **v22 critique 3.5/10 grade is back in play** | All the distributed-correctness gaps (kine / leases / generation / finalizers) need hand-rolled solutions again. ~14 weeks of v22 §3.x work is suddenly relevant |
| β-W7 | **Cross-PC process supervision is hard** | "Agent on PC2 died" → who notices? K3s does this for free; β builds it |
| β-W8 | **macOS sandbox-exec deprecation timeline still applies** | Same problem α has, only now we're maintaining the code ourselves |

##### β — Opportunities

| # | Opportunity | Why |
|---|-------------|-----|
| β-O1 | **Smallest-possible-install brand** | "musu installs in 8 seconds and uses 50MB" beats any K8s-based competitor |
| β-O2 | **True home-PC / NAS / Pi compatibility** | A family Synology NAS with 2GB RAM can be a worker. Not possible under α |
| β-O3 | **Native OS GUI integration on Windows / macOS** | Agents can use OS notifications, file pickers, native dialogs — hard to do from inside a container |
| β-O4 | **Independence from CNCF / Microsoft / Red Hat** | musu owns its substrate end-to-end. No upstream surprises |

##### β — Threats

| # | Threat | Why |
|---|--------|-----|
| β-T1 | **Re-litigates the v22 wrong-frame** | β resurrects exactly the work v22 spent 6 /loop iterations on — and the 3.5/10 critique that triggered V23 |
| β-T2 | **3-platform isolation code maintenance burns small team** | v21.D Windows took multiple /loop iterations to ship; Linux + macOS each at least the same. ~6+ months of platform work before parity |
| β-T3 | **No K8s ecosystem leverage** | Every problem K8s already solved (Service mesh, ingress, secrets, network policy, etc.) is something we build or skip |
| β-T4 | **Phase 3 (workflow runtime) becomes much harder** | Argo Workflows ruled out; Nomad ruled out earlier; LangGraph wrap is possible but ships less |
| β-T5 | **"musu is a single-host product that pretends to scale"** | Without K3s, multi-PC clustering is hand-rolled and brittle. Risk of becoming "the v22 wrong-frame project" again |

#### Side-by-side dimension table

| Dimension | Option α (WSL2-K3s) | Option β (container-less) |
|-----------|--------------------|--------------------------|
| Install footprint (Windows) | ~1GB | ~50MB |
| Install footprint (Linux) | ~80MB | ~50MB |
| Install footprint (macOS) | V24 (Lima ~500MB) | V24 (native) |
| Virtualization required (Windows) | Yes (WSL2) | No |
| BIOS gate (Windows) | Yes — unfixable in script | No |
| Agent cold-start latency | 500–2000ms | ~50ms |
| Multi-PC distribution | K3s does it | Build ourselves |
| Container isolation | containerd, upstream | Hand-rolled per OS |
| Workflow runtime | Argo Workflows (hidden) | Build / wrap LangGraph |
| Phase 3 plan (CRD + Operator) | Works as written | Must be redesigned |
| v21.D Windows AppContainer work | Throwaway | Salvaged |
| v22 §3.x distributed-correctness work | Mostly redundant under K3s | Mostly relevant again |
| OCI image marketplace path | Natural | Must invent |
| Brand narrative | "K8s for AI, but hidden" | "Smallest agentic platform" |
| Enterprise / SOC2 story | Easier | Harder |
| 3-platform maintenance burden | 0 (K3s upstream) | 3 isolation crates |
| Time to V23.5 closed beta | ~21 weeks (current plan) | ~28+ weeks (estimate) |
| Risk of re-encountering v22 wrong-frame | Low | High |

#### Option γ — macOS-first MVP (skip Windows entirely)

> External CTO suggestion (2026-05-15): drop Windows from V23 scope
> entirely. Ship macOS-only MVP first. Windows joins in V24 or later
> once macOS market validates the product. Lima or colima handles
> macOS K3s with mature tooling; mac dev/prosumer audience is
> homogeneous; install UX gets one OS to perfect.

##### γ — Strengths

| # | Strength | Why |
|---|----------|-----|
| γ-S1 | **One OS to ship; one OS to support** | All install UX, all docs, all CS, all telemetry tuned for one platform. Engineering team of 1 (user + Claude Code) can actually finish |
| γ-S2 | **Lima/colima is mature** | macOS K3s install via brew + Lima is well-trodden. Less novel risk than WSL2 automation |
| γ-S3 | **Apple Silicon performance is real** | Mac M-series users have GPUs + lots of RAM idle. F1 multi-PC pooling shines if all 3 PCs are M-series |
| γ-S4 | **Mac users skew prosumer-AI** | Target audience O5 (AI-agent prosumer) overlaps heavily with Mac install base — Figma users, indie SaaS builders, AI tinkerers |
| γ-S5 | **No BIOS-virtualization gate** | macOS hardware always has virtualization enabled (no UEFI choice) |
| γ-S6 | **App Store distribution path optional** | Notarized .dmg or Mac App Store reach. Don't have to maintain 3 platform installers |
| γ-S7 | **Time-to-MVP shortest** | Skip WSL2 automation work entirely. V23.2 simplifies from "Linux + Windows-via-WSL2" to just "Mac + Linux." Realistic ~15 weeks instead of α's ~21 |
| γ-S8 | **Brand momentum precedent** | Linear, Raycast, Notion all launched Mac-first. Prosumer software ships Mac first by default |

##### γ — Weaknesses

| # | Weakness | Why |
|---|----------|-----|
| γ-W1 | **Cuts addressable market by ~70%** | Global desktop OS share: Windows ~70%, macOS ~15%, Linux ~5%. Even AI-prosumer skew doesn't fully compensate |
| γ-W2 | **Windows users with multi-PC setups (gamers, prosumers) excluded** | The "spare gaming PC as worker node" pitch — gone until V24 |
| γ-W3 | **v21.D Windows AppContainer is still throwaway** | Same as α: K3s on macOS uses Linux containers via Lima, AppContainer dies anyway. Sunk cost unchanged |
| γ-W4 | **Mac users tend to have ONE expensive Mac** | Multi-PC fleet (F1 killer feature) is harder to demo if your audience has one $3000 Mac + maybe an old MacBook. Windows users frequently have 2-3 PCs (gaming + work + family) |
| γ-W5 | **macOS sandbox-exec deprecation timeline still applies** | If α defers macOS to V24 to dodge this, γ pulls it forward |
| γ-W6 | **Lima/colima can be flaky** | Reports of file-sync slowness on Apple Silicon; resource leaks; less hardened than Docker Desktop's tooling |
| γ-W7 | **Locks musu into "Mac-only AI tool" perception** | Hard to expand later — Mac-first apps that try to add Windows often feel like ports forever |

##### γ — Opportunities

| # | Opportunity | Why |
|---|-------------|-----|
| γ-O1 | **Fastest path to "did anyone pay $5"** | 15 weeks not 21+. Real market data sooner. If MVP flops, less sunk |
| γ-O2 | **Notarization + Sparkle auto-updater** | Mac update story is solved-best on macOS via Sparkle/SUFeedURL. Faster iteration loop than Windows MSI |
| γ-O3 | **AI tools target Mac first culturally** | LLMs run faster on M-series unified memory; Apple AI ecosystem is hot. Marketing tailwind |
| γ-O4 | **Defer the entire α-vs-β WSL2 decision** | If MVP works on Mac, we'll have revenue to fund proper Windows engineering. If it doesn't, Windows was the wrong battle anyway |

##### γ — Threats

| # | Threat | Why |
|---|--------|-----|
| γ-T1 | **70% of "fleet" prospects bounce at install** | Windows users see "Mac-only" and leave. F1 killer feature can't even be demoed to them |
| γ-T2 | **"V24 Windows support" promise becomes a 2-year debt** | Engineering team of 1 — Windows port keeps slipping. Real risk |
| γ-T3 | **Lima upstream churn** | Smaller community than WSL2; less Microsoft-funded stability |
| γ-T4 | **Multi-PC fleet metaphor weakens on Mac-only** | Most Mac users don't have 3 Macs. F1 pitch becomes "use your old MacBook as a worker" — true but small audience |
| γ-T5 | **Mac App Store sandboxing might not allow K3s/Lima** | If MAS distribution is the goal, K3s containers may not pass review. Notarized .dmg outside MAS is fine but reach is lower |

#### Decision framing — three-way

The honest summary:

- **α bets on** WSL2 install automation being achievable + K8s ecosystem leverage outweighing virtualization cost
- **β bets on** smallest-install + native-process latency outweighing the multi-PC scheduling work we'd inherit
- **γ bets on** Mac-first market validation outweighing the loss of ~70% of the desktop OS market

| | α — K3s + WSL2 (Win + Linux) | β — Container-less (3 OS) | γ — macOS-first MVP |
|---|---|---|---|
| Time to closed beta | ~21 weeks | ~28+ weeks | **~15 weeks** |
| Install UX risk | High (WSL2) | Low | **Lowest** |
| Addressable OS share | ~75% (Win + Linux) | ~90% (all 3 if all crates ship) | **~15%** (macOS) |
| F1 multi-PC story | Strong | Strong | Weak (Mac users rarely own 3 Macs) |
| Engineering scope | 1 substrate (K3s) + WSL2 installer | 3 isolation crates + scheduler rebuild | 1 substrate (K3s on Lima) |
| v21.D Windows work fate | Throwaway | Salvaged | Throwaway |
| v22 §3.x work fate | Mostly redundant | Mostly relevant again | Mostly redundant |
| Brand narrative | "Hidden K8s for AI" | "Smallest agentic platform" | "Linear / Raycast for agentic AI" |
| Risk of V24 Windows debt | None | None | High |
| Match for "prosumer with multi-PC fleet" | Strong | Strong | Weak |
| Match for "indie AI tinkerer" | OK | OK | **Strongest** |

#### Two hybrid paths worth naming

**α-with-β-fallback** — ship α first, telemeter Windows WSL2 install
success at V23.2, fork to β only if WSL2 success rate is below the
30% threshold from O2-b. SWOT becomes "α with measured exit ramp."

**γ-then-α** (CTO's actual suggestion read carefully) — ship γ first
to validate market with mac users. Once revenue exists / market is
confirmed, fund the WSL2 automation work to bring α to Windows in
V24. SWOT becomes "γ for validation, α for scale."

The two hybrids point at different bets:
- **α-with-β-fallback** says "we believe Windows install is achievable, but plan our retreat"
- **γ-then-α** says "we don't know if anyone wants this yet — find out cheaply, then scale to Windows"

The second is more honest if MVP validation is the real concern.
The first is more honest if F1's multi-PC story is the real
differentiator we need to protect.

---

### 0.5 Lightweight WSL2 architecture — the actual Option α implementation

User confirmed (2026-05-15) that the path forward is Option α (current
plan: K3s + WSL2). External CTO provided the **technical spec** for
how Docker Desktop / Rancher Desktop / etc. actually hide WSL2 from
end users. This section records that spec; it is the *core engineering
secret* of how to make α work for non-technical users.

#### The "normal user WSL2" is not what we ship

| | Default user WSL2 path (avoid) | musu's "stealth WSL2" path (ship) |
|---|---|---|
| Distro | Ubuntu (or similar) | **Alpine Linux** |
| Base image size | ~500 MB – 1 GB | **~5 MB** |
| Install source | Microsoft Store | **`wsl --import`** with our own tarball |
| Visible to user | "Install Ubuntu" page, terminal, EULA | **Nothing** — happens silently behind musu's GUI |
| User installs | Many tools they don't need | Only K3s + musu-relay |
| Window shown | bash terminal | Just musu-bee Next.js UI |

Three concrete techniques:

**(1) Alpine Linux base** instead of Ubuntu.
Alpine is the smallest viable Linux distro — ~5 MB base, used everywhere in container land for the same reason. We strip it further to the libraries K3s actually needs.

**(2) `wsl --import` for silent injection.**
Windows ships `wsl --import` as a built-in command. It accepts a `.tar` file and registers it as a WSL distro without ever touching the Microsoft Store. Our installer flow:
- Bundle a precompiled `musu-backend.tar` (Alpine + K3s + musu-relay) ≈ 50 MB
- On `musu.exe` first run, execute (no user-visible terminal):
  ```
  wsl --import musu-workspace %LOCALAPPDATA%\musu\wsl musu-backend.tar
  ```
- 3 seconds later, a WSL2 distro named `musu-workspace` exists containing exactly K3s and nothing else
- The user has never seen a command prompt, never opened the Microsoft Store, never agreed to a Linux EULA

**(3) Never show a terminal.**
musu-bee (Windows native window) is the only window the user sees. Every K3s API call goes through musu-relay → musu-bridge → K3s API server. When code paths need to invoke `kubectl` (mostly never; we use K8s Python/Go clients), wrap them in:
```
wsl -d musu-workspace -e kubectl apply -f <spec>
```
No window, no prompt, no user awareness.

#### What this changes in the plan

- **No Ubuntu, no Microsoft Store dependency** — V23.2 spike scope tightens to "our tar gets imported and K3s starts inside it"
- **WSL2 base feature must still be present on Windows** (Windows 10 2004+ / Windows 11) — that's the BIOS-virtualization + Windows-version gate from O2-b
- **`musu-backend.tar` build pipeline** is a new artifact:
  - Alpine base + apk-installed K3s binary + musu-relay binary + minimal init scripts
  - CI builds a versioned tarball per release; users get the latest on installer download
  - Size target: ≤ 80 MB compressed (Alpine ~5 MB + K3s ~50 MB + musu-relay ~5 MB + room)
- **Auto-update path**: replace `musu-backend.tar` on update; `wsl --unregister musu-workspace && wsl --import …` is fast
- **No Python on Windows host** — agent code runs inside the K3s pods inside the WSL2 distro. Windows host runs only the small `musu.exe` (Tauri / Electron / native shell) and musu-bee web view

#### V23.2 spike confirmed goal (revised from §0.2 O2-b)

> **"Single `musu.exe` execution causes Alpine + K3s custom WSL2 distro to land silently in the background, with zero terminal window shown to the user, in 100% of supported Windows configurations."**

Measurement plan (V23.2):
- Test matrix: Win10 21H2 / Win10 22H2 / Win11 23H2 / Win11 24H2, with WSL feature enabled vs disabled at start
- For each: install succeeds without user intervention? Time to K3s API ready?
- Telemetry per O2-b: which fail-cause dominates if any do
- Decision gate stays: if dominant fail-cause is BIOS-virtualization (Hard Blocker), pivot to γ (macOS-first); if it's recoverable scripting issues, iterate the installer

#### 3-tier virtualization handling — what we can and cannot automate

External CTO clarification (2026-05-15): the install pipeline must
handle three distinct layers of virtualization, two of which are
automatable and one of which is not.

| Tier | Layer | Automatable from `musu.exe`? | Failure rate baseline |
|------|-------|-----------------------------|----------------------|
| T1 | **BIOS/UEFI hardware virtualization** (Intel VT-x / AMD-V) — physical CPU flag | **NO** — locked at the hardware level before Windows boots | Low (~5-10%) — most PCs from last 5-7 years ship with this **enabled by default** |
| T2 | **Windows OS virtualization features** (WSL + Virtual Machine Platform) — DISM toggles | **YES — 100%** via elevated PowerShell `dism.exe` | Medium — most users have these OFF by default, but it's a script call away |
| T3 | **WSL2 distro setup** (Alpine + K3s injection via `wsl --import`) — our own backend.tar | **YES — 100%** | Low — fully controlled by us, V23.2 measures the residual |

**Key insight**: the "B급 실패" (BIOS lock) the §0.4 SWOT worried about
is **statistically rare on modern PCs**. The failure rate we're
actually fighting is **T2 (Windows OS features off by default)** — and
that one we can automate completely.

#### Install flow — 3-tier pipeline

```
musu.exe (double-click)
   │
   ▼
[1] Elevation prompt (one-time, Windows UAC)
   │
   ▼
[2] T2 auto-enable (no user interaction):
       dism.exe /online /enable-feature \
            /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
       dism.exe /online /enable-feature \
            /featurename:VirtualMachinePlatform /all /norestart
   │
   ▼
[3] Friendly reboot prompt: "musu needs to restart your PC once. OK?"
       (graceful — no command prompt visible; one button)
   │
   ▼ (after reboot)
[4] musu.exe resumes via Run-Once registry key
   │
   ▼
[5] T1 detection: `systeminfo | findstr Hyper-V` for the "Yes"/"No"
       on hardware virtualization
   │
   ├─ T1 = "Yes" → continue to [6]
   │
   └─ T1 = "No" → GRACEFUL DEGRADE (see below)
   │
   ▼
[6] T3 inject: `wsl --import musu-workspace %LOCALAPPDATA%\musu\wsl musu-backend.tar`
       (3 seconds, no terminal shown — the Alpine + K3s distro from §0.5)
   │
   ▼
[7] Start K3s + musu-relay inside the distro
       wsl -d musu-workspace -e /usr/local/bin/musu-init
   │
   ▼
[8] musu-bee UI opens → user sees "Welcome to your workspace"
```

#### T1 graceful degradation (the "B급 실패" 5-10% of users)

If `systeminfo` reports BIOS virtualization is OFF, the user **cannot
run K3s on this PC**, period. No software can fix it. But we don't
crash or show terminal errors — instead:

**Tier-1-locked UI flow**:

```
┌────────────────────────────────────────────────────────┐
│  🔓 Your PC has more potential than it's using         │
│                                                        │
│  This computer's hardware acceleration is currently   │
│  locked. We can unlock it with a 2-minute setting    │
│  change (no apps to install).                         │
│                                                        │
│  [ Show me how (with my phone) ]                      │
│      ↑ opens QR code → musu.pro/unlock                │
│                                                        │
│  Or, use this PC just as a remote control:           │
│  [ Continue as remote-only ]                          │
└────────────────────────────────────────────────────────┘
```

The two paths:

1. **"Show me how"** — opens a QR pointing at `musu.pro/unlock/<motherboard-brand>` with brand-specific BIOS guides (ASUS / MSI / Gigabyte / Dell / HP / Lenovo / etc.). User scans with phone, follows along, reboots once more, retries musu install. Successful path for users willing to enter BIOS.

2. **"Continue as remote-only"** — graceful product strategy: this PC becomes a **musu.pro paid-tier client only**. It can connect to other PCs in the user's fleet via `<user>.musu.pro` but cannot host agent workloads itself. Users with one BIOS-locked PC and one normal PC still get full F1 multi-PC value; users with only the locked PC are politely informed they need either to unlock BIOS or run musu on another device.

This converts T1 failure from "product death" into "feature
degradation" — and aligns perfectly with §14's free/paid line: even
the BIOS-locked user becomes a paid-tier candidate because their only
way to use musu now is via `<user>.musu.pro` to another device.

#### Revised O2-b "Hard Blocker" definition

The pre-CTO version of O2-b said: *"pivot to γ if dominant fail-cause
is BIOS-virtualization."* That was correct in spirit but the
**actual telemetry-driven gate** is now refined:

- **T2 failures** (Windows OS feature toggle didn't take, reboot loop, DISM error) — these are **fixable in the installer**. High count here = iterate the script, not pivot
- **T3 failures** (`wsl --import` failed, K3s didn't start) — these are **fixable in our backend.tar**. High count = fix the tar
- **T1 failures** (BIOS locked AND user did not complete the unlock guide) — these are the real Hard Blocker, BUT they have a **graceful degradation path** now (remote-only mode)

The β fork (§9.2) triggers only if **T1 unrecoverable rate AND T1
graceful-degrade rejection rate combine to leave > 30% of Windows
installs unable to use musu in any capacity**. Per CTO statistic, this
is unlikely — modern PCs ship with BIOS virtualization on, and the
graceful path captures the rest as paid-tier candidates.

#### What §0.5 still does NOT verify by direct measurement

These claims need V23.2 spike empirical data:
- Exact size of `musu-backend.tar` post-build (target ≤ 80 MB)
- Time for `wsl --import` to complete on typical SSD (target < 5s)
- Memory consumed by Alpine + K3s + musu-relay idle (target < 500 MB)
- BIOS virtualization "ON by default" rate on Win10/11 PCs from last 5 years (CTO baseline: most; we'll quantify)

These are V23.2 deliverables, not V23.0 claims.

#### What this section does NOT decide

- Whether the Windows shell is Tauri, Electron, or native Win32+WebView2 — that's a V23.4 musu-bee scoping question
- Whether the `musu-backend.tar` is built per-OS-architecture (x64 vs ARM64) — yes, but downloaded conditionally; not a planning issue
- Whether to also ship a "Microsoft Store" wrapper for distribution — V24+ concern

#### Cross-references for §0.5

- WSL2 import command: [Microsoft `wsl --import` docs](https://learn.microsoft.com/en-us/windows/wsl/basic-commands#import-a-distribution)
- Alpine Linux base: [alpinelinux.org](https://alpinelinux.org/)
- K3s install on Alpine: K3s docs cover "minimal Linux" targets including Alpine
- Prior art: Docker Desktop + Rancher Desktop both use this `wsl --import` + minimal distro pattern; we're not inventing anything, just owning the choice of distro and contents
- This pattern is **not yet primary-source-verified by me** for the exact size and install times quoted — must be verified in V23.2 spike

#### What this section does NOT decide

The choice between α / β / hybrid is **strategic**, not engineering.
This document records the trade-offs honestly; the call is the user's.
V23.0 strategic-confirmation week is where this gets decided with
the user.

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

---

## 9. V23.0 strategic confirmation — stance lock (2026-05-15)

V23.0 is **strategic confirmation week**, not an implementation week.
Code = 0 lines. Deliverables = decisions locked + retreat structure
defined + telemetry tool chosen + Const VII push gate. User confirmed
the three decisions below on 2026-05-15; this section records them as
binding for V23.1+.

### 9.1 Stance locked: **α-with-β-fallback**

Per §0.4 SWOT, three substrate options (α / β / γ) and two hybrids
(α-with-β-fallback / γ-then-α) were compared. User selected:

> **α-with-β-fallback** — start with Option α (K3s + WSL2 with the
> stealth Alpine + `wsl --import` architecture from §0.5). At V23.2
> WSL2 spike, measure install success telemetry. If WSL2 install
> success rate falls below the O2-b 30% threshold OR if the
> dominant failure cause is BIOS-virtualization (Hard Blocker),
> fork the plan to Option β (container-less, native processes per
> OS, v21.D Windows AppContainer revived).

What this commits to:
- **V23.1 + V23.2 build α exclusively** (musu.pro signaling + WSL2 installer + K3s integration)
- **V23.2 spike has a defined exit ramp** — not "we'll figure out what to do if it fails"
- **F1 (multi-PC fleet) is the protected differentiator** — γ was rejected because Mac users rarely own 3 Macs and F1 weakens

What this does **NOT** commit to:
- Pre-emptive β code. β remains documented but not implemented unless V23.2 telemetry triggers fork
- macOS support in V23 — still V24+ per O3
- Any specific Windows installer technology (NSIS / Wix / Tauri-bundle / Inno Setup) — to be picked at V23.2 spike start

### 9.2 β fallback transition structure

If V23.2 telemetry triggers β fork, the transition is:

| Step | Action | Owner |
|------|--------|-------|
| 1 | V23.2 spike completes, telemetry reviewed | user + Claude Code |
| 2 | If WSL2 install success < 70% (i.e., failure rate ≥ 30% per O2-b) → halt α branch | user gate |
| 3 | If dominant fail-cause is BIOS-virtualization Hard Blocker → halt α branch regardless of % | user gate |
| 4 | Branch `v23/master-plan` archives current α state; new branch `v23/beta-plan` cuts | user gate |
| 5 | β-spec section (§0.4 Option β content) becomes the active plan | Claude Code |
| 6 | v21.D Windows AppContainer revives + Linux user-ns crate + macOS sandbox-exec restart | Claude Code |
| 7 | Phase 3 redesigned without Argo (LangGraph wrap or self-built workflow controller — separate decision when β triggers) | user gate |
| 8 | V23 timeline extends from ~21 wks to ~28+ wks (β estimate) | user + Claude Code |
| 9 | Communications: closed-beta users informed of substrate change before further onboarding | user |

The "fork to β" is a **strategic redirect**, not an emergency.
~5 weeks of α work (V23.1 + half of V23.2) carry over (musu.pro
signaling, telemetry, partial musu-bee UI). The other ~16 weeks
worth of β-specific work begins from V23.2 fork point.

**β-pivot probability estimate (revised post-CTO 2026-05-15)**: 10–15%.
The original 15-25% range assumed BIOS-virtualization failures would
be a binary "product dead" outcome. The §0.5 3-tier handling + graceful
degradation (T1-locked users become paid-tier remote-only) **converts
most of the worst-case BIOS-lock failure cohort into a remote-only
product mode**, not a fork trigger. The β fork now triggers only if
T2 (OS features) + T3 (our backend.tar) failures combined exceed 30%
AND graceful T1 degradation rejection rate is high. The actual gate
condition is in §0.5 "Revised O2-b" subsection.

### 9.3 Telemetry tool: **self-built**

User selected (over Sentry / PostHog / phased migration):

> **Self-built telemetry** — install / connection / agent-spawn
> events POSTed from musu-relay to musu.pro. Data stored in
> musu.pro's own SQLite. Zero third-party server dependency.

Rationale matches L2 (musu.pro stays minimal) and L1 (True P2P) —
adding Sentry would mean user telemetry traffic goes through Sentry
servers, partial violation of the cloud-evasion philosophy.

#### Telemetry data model (V23.1 implementation scope)

```json
// POST musu.pro/v1/telemetry/install
{
  "musu_install_id": "uuid",            // ephemeral, never tied to identity
  "os": "windows|linux|macos",
  "os_version": "11.24H2",
  "musu_version": "0.23.1",
  "wsl2_present_at_start": true|false,
  "wsl2_feature_enabled": true|false,
  "bios_virtualization_detected": true|false|"unknown",
  "step_failed": null|"wsl_feature"|"wsl_import"|"k3s_start"|"musu_relay_start",
  "step_error_class": null|"hard_blocker_bios"|"timeout"|"permission"|"network"|...,
  "elapsed_ms": 4523
}

// POST musu.pro/v1/telemetry/nat_pierce
{
  "musu_install_id": "uuid",
  "attempt_outcome": "success"|"fail",
  "fail_cause": null|"cgnat_detected"|"symmetric_nat"|"firewall"|"timeout",
  "ice_candidate_count": 4,
  "elapsed_ms": 287
}

// POST musu.pro/v1/telemetry/agent_spawn  (optional, debug-mode only)
{
  "musu_install_id": "uuid",
  "spawn_outcome": "success"|"fail",
  "cold_start_ms": 521,
  "node_count_in_cluster": 2
}
```

What we explicitly **DO NOT** collect:
- User identity (email, IP beyond what's already in TCP transport)
- Workspace contents (agent names, workflow specs, agent outputs)
- File paths, document contents, code, chat history
- Any agent-execution data

The contract for users: "musu.pro sees the *plumbing health* of the
installer + the tunnel, never your work."

Storage: musu.pro's SQLite database. Retention: 90 days for raw
events, aggregated metrics retained indefinitely. Query via SQL for
V23.2 spike review + V23.5 NAT-pierce / TURN-decision data.

### 9.4 Const VII push gate — V22 + V23 unified merge to main

User confirmed: **everything on `v22/gap-analysis` branch merges to
main as one unit**. That includes:

- `docs/V22_K8S_GAP_ANALYSIS_2026_05_15.md` (DEPRECATED but preserved per §0)
- `docs/V22_OPTION_SWOT_2026_05_15.md` (the decision context)
- `docs/V23_MASTER_PLAN_2026_05_15.md` (this document — the active plan)
- `docs/PACKAGE_INVENTORY_2026_05_15.md` (as-measured baseline)

Rationale (user): "v22 내용 포함 전체를 main에 붙이고 V22+V23
한꺼번에 머지." The honest historical record of v22's wrong-frame
iteration belongs on main alongside the V23 redirect. Future readers
get the full reasoning trail, not a sanitized version.

Per Constitution VII, push to main requires explicit "진행해" from
user. This section records that gate is **pending** at V23.0 sign-off
time. No push yet.

### 9.5 V23.0 deliverables checklist

- [x] §0.4 SWOT (α / β / γ + 2 hybrids) authored
- [x] §0.5 lightweight WSL2 architecture (Alpine + `wsl --import`)
- [x] §0.3 Docker Desktop + Nomad + Rancher Desktop + Windows Native Containers rejection reasons recorded
- [x] §9.1 stance locked: **α-with-β-fallback**
- [x] §9.2 β fallback transition structure defined (9-step process)
- [x] §9.3 telemetry tool: **self-built** + data model defined + privacy contract written
- [ ] §9.4 Const VII push gate — pending user "진행해"
- [ ] Branch strategy: continue on `v22/gap-analysis` through final V22+V23 merge

### 9.6 What V23.1 needs as preconditions

Before V23.1 spike begins (the first code week), the following must be true:

1. ✅ Stance locked (§9.1)
2. ✅ Telemetry tool decided (§9.3)
3. ⏳ Const VII push of V22+V23 docs to main complete (§9.4)
4. ⏳ `v23/spike-phase-1` branch cut from main with merged V23 docs as reference
5. ⏳ V23.1 task list created (musu.pro signaling skeleton, musu-relay WebRTC rewrite, end-to-end "hello world" handshake test)
6. ⏳ Primary-source fact-check on §0.5 size/timing claims (Alpine ~5MB, K3s import time, wsl --import elapsed) — verify before V23.2 spike depends on them
7. ⏳ Decide signaling library: stay with self-built simple-peer-pattern (per O4) or 1-week eval bake-off

Once these 7 preconditions are green, V23.1 starts.

### 9.7 Open items deliberately not decided at V23.0

These deferred to V23.1+ with date / gate:

| Open item | Decided at | Gate |
|-----------|-----------|------|
| Windows installer technology (NSIS / Wix / Tauri / Inno Setup) | V23.2 spike start | "shall be picked by V23.2 day 3" |
| musu-backend.tar build pipeline location (GitHub Actions / self-hosted CI) | V23.2 spike start | "shall be picked by V23.2 day 5" |
| Argo Workflows version pin | V23.3 spike start | "use latest stable at V23.3 start" |
| React Flow version pin | V23.4 spike start | same |
| Paddle Hobbyist plan SKU configuration | V23.5 start | user input required |
| TURN server inclusion (per O4-b) | V23.5 closed beta | data-gated |
| β fork decision (per §9.2) | V23.2 spike end | data-gated |

### 9.8 What V23.0 explicitly does NOT include

- No code commits (this is by definition V23.0's promise)
- No primary-source fact-check of Alpine / wsl --import / K3s claims — that's a V23.1 precondition
- No outreach to closed-beta users yet (V23.5 milestone)
- No Paddle SKU creation
- No telemetry server deployed (V23.1 day 1 task)
- No final decision on which CI provider hosts the tar-build pipeline
