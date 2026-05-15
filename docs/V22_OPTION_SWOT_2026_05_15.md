# v22 Option SWOT — Podman/Lite-runtime vs Monorepo K8s-shape

**Date**: 2026-05-15
**Status**: decision-prep doc, paired with `V22_K8S_GAP_ANALYSIS_2026_05_15.md`
**Question (user)**: 두 옵션 SWOT 비교 — (1) Podman 같은 더 라이트한 컨테이너 런타임을 써서 만든다, (2) 지금처럼 모노레포로 K8s-스럽게 만든다.

This document is the structured comparison. Decision is **not** made here — the v22 gap analysis §3.3 "Road A/B/C" fork still applies, and either option below can be paired with any of those roads. This SWOT is about *the substrate*, not *the topology*.

---

## 0. Framing

The two options are not "rewrite vs keep." They are:

- **Option A — Adopt a lite container runtime (Podman / containerd / firecracker / nerdctl) as musu-supervisor's backend.** Keep the rest of the monorepo. Replace the AppContainer + Job Object + future Linux user-ns / macOS sandbox-exec implementations with one well-tested container runtime.

- **Option B — Stay monorepo, finish hand-built K8s-shape per §3.1–§3.9.** Keep AppContainer/Job Object on Windows; finish Linux user-namespace and macOS sandbox-exec crates; build reconcilers/scheduler/watch/lease on the existing SQLite control plane.

Both options share **bridge, core, bee, relay, indexer, control, ai-detector, plugin** — the only piece in scope is **how agents get spawned and isolated**, and downstream of that, whether the control plane talks to containers or to plain processes.

The constraint that bounds everything: **the user runs musu-bridge on her laptop**. Multi-node cluster operation is a "maybe later" via §3.3 Road B/C, not the default deployment.

---

## 1. Option A — Lite container runtime (Podman et al.)

### A.1 What this concretely means

- Replace `musu-supervisor-isolation-{windows,linux,macos}` with a single "use Podman" code path
- Each agent runs as a container; isolation is the runtime's job, not ours
- Agent spec becomes a small wrapper around `podman create --pod=... --label company=... --memory=... --cpu-shares=... image:tag command`
- Optional: use `podman play kube` to accept K8s-style YAML directly. v21.E CEOReconciler emits a Pod manifest; supervisor applies it
- Optional: use Quadlet (systemd unit generator) for declarative agent lifecycle on Linux hosts

### A.2 Strengths

| # | Strength | Evidence |
|---|----------|----------|
| A-S1 | **Mature, hardened isolation** — 5+ years of CVE response, hardening passes, audit trails | Podman is Red Hat-maintained, ships in RHEL/Fedora default repos, used by OpenShift at scale |
| A-S2 | **Cross-platform isolation handled by upstream** — we stop maintaining 3 platform crates | Podman's own teams handle user-namespace bugs, AppArmor profiles, seccomp policies |
| A-S3 | **Daemonless = matches musu's single-binary deployment story** | Verified: Podman is *"a simple daemonless tool"* (podman.1 manpage); no extra service to run alongside musu-bridge |
| A-S4 | **Rootless-capable on Linux** — agents can spawn under user UID, no sudo required | "Most Podman commands can be run as a regular user, without requiring additional privileges" (manpage) |
| A-S5 | **K8s YAML import gives §3.7 scheduler features for free** — `podman play kube` accepts Pod specs with `nodeAffinity`, `resources`, `securityContext` | Direct K8s spec compat means we don't reinvent matchExpressions in §3.7 |
| A-S6 | **Built-in image distribution** — versioned, content-addressed, signed | musu-supervisor today has zero image story; "agent v2.3" is just a Python module path |
| A-S7 | **Better observability** — `podman stats`, `podman events`, journald integration | We get for free what §3.8 soak testing would otherwise have to instrument by hand |

### A.3 Weaknesses

| # | Weakness | Evidence / impact |
|---|----------|-------------------|
| A-W1 | **Windows/macOS require a Linux VM** — Podman has no native Win32 isolation backend | Verified: "Podman requires a Linux VM on Windows and macOS" (manpage). For laptop users on Win/Mac, this means shipping/maintaining a VM image, increasing install footprint by ~500MB-1GB |
| A-W2 | **v21.D Windows AppContainer work becomes throwaway** — 1100 lines of Rust, 27 tests | Cannot be salvaged into a Podman path; AppContainer is a different model |
| A-W3 | **Single-host orchestration only** — no built-in multi-node scheduling | Verified: README says scheduling is "out of scope." We'd still need §3.7 scheduler for cross-machine binding. So Option A doesn't actually remove the scheduler work |
| A-W4 | **Adds a heavy dependency** — Podman is ~50MB binary + dependencies (conmon, slirp4netns, fuse-overlayfs) | Breaks musu's "user installs one thing" claim. Especially painful for non-Linux users who get the VM too |
| A-W5 | **Image-based workflow imposes a build pipeline on agents** — every agent becomes a container image | Current musu spawns agents as Python processes against operator's existing env. Switching to "build an image first" is a UX regression for hobbyist users |
| A-W6 | **License/distribution friction on macOS** — `podman machine` requires QEMU; user has to install + trust a kernel-level hypervisor | App Store distribution ruled out for any musu-bee desktop bundle that depends on this |
| A-W7 | **Doesn't address the §3.5 TOCTOU / §3.6 finalizer / §3.4 spec-status gaps** — those live in the control plane, not the runtime | Option A only replaces the supervisor layer. v22's hardest 5 of 9 sections are unaffected |

### A.4 Opportunities

| # | Opportunity | Notes |
|---|-------------|-------|
| A-O1 | **Migration path to real K8s if musu ever needs it** — pods become first-class | Customers asking for "enterprise multi-tenant musu" could be answered with "deploy our Pod specs to your existing OpenShift" |
| A-O2 | **Plugin ecosystem** — third parties can ship agents as OCI images | "Install agent X" becomes `podman pull` from a registry, like Docker Hub for AI agents |
| A-O3 | **Easier compliance story for enterprise** — SOC2/HIPAA auditors recognize Podman lineage | Hand-rolled isolation requires explaining AppContainer semantics; Podman has prior audit precedent |
| A-O4 | **Image signing (cosign / sigstore) for free** — supply chain security | The §3.6 finalizer story for agent shutdown gets a clean handoff: SIGTERM, give 30s, then Podman stops the container |
| A-O5 | **`podman generate kube` round-trips** — local-dev → K8s pipeline without code rewrite | The "user runs it on laptop" and "enterprise runs it in cluster" deployments share the same agent spec |

### A.5 Threats

| # | Threat | Mitigation if pursued |
|---|--------|----------------------|
| A-T1 | **Podman upstream may break compatibility** between major versions (e.g. Podman 3 → 4 changed rootless networking defaults) | Pin to LTS version; test matrix across 2 versions |
| A-T2 | **Performance overhead** — every agent spawn is `podman create + podman start`, ~200-800ms cold start | For musu's "spin up agent for a query" workflow this may be unacceptable. Today's process spawn is ~50ms |
| A-T3 | **macOS QEMU + Apple Silicon weirdness** — `podman machine` on M-series Macs has known issues with file-sync performance | Substantial UX degradation for the ~40% of dev users on Mac |
| A-T4 | **Red Hat governance** — Podman is a Red Hat project; future direction may not align with musu's "P2P laptop control plane" story | We become a downstream consumer subject to upstream priorities |
| A-T5 | **"You're just Docker now"** brand narrative | If musu becomes "a UI for Podman", the differentiation thinned out — what's left that's musu-specific? |

---

## 2. Option B — Stay monorepo, finish K8s-shape by hand

### B.1 What this concretely means

- Keep `musu-supervisor` Rust workspace with 3 platform crates (Windows shipped, Linux scaffold, macOS scaffold)
- Finish Linux user-namespace (`clone(CLONE_NEWUSER | CLONE_NEWNS | …)`) and macOS `sandbox-exec` per the v21.D scaffold
- Build out the v22 §3.1–§3.9 plan: kine-shaped events, lease, generation, finalizers, scheduler upgrades, fault injection
- Agents stay as plain processes spawned via supervisor; no images, no VM
- Control plane stays SQLite; v22 makes it K8s-correct on that substrate

### B.2 Strengths

| # | Strength | Evidence |
|---|----------|----------|
| B-S1 | **No new external dependencies** — single binary install holds | musu-bridge + musu-supervisor binary + SQLite file. That's it. Verified across all 12 packages in `PACKAGE_INVENTORY_2026_05_15.md` |
| B-S2 | **Fast agent spawn** — direct CreateProcess/clone, no image pull, no container start | ~50ms cold start observed in v21.C scenario tests vs ~500ms for Podman |
| B-S3 | **v21.D Windows work is preserved** — 1100 lines of Rust + 27 tests stay productive | AppContainer + Job Object is real isolation, just hand-rolled |
| B-S4 | **No VM on Win/Mac** — native isolation per platform | musu install footprint stays under 100MB, no kernel hypervisor trust required |
| B-S5 | **P2P / "thin relay" model preserved** — agents on her laptop, her machine, her data | This is the core musu invariant per user constraints. Container runtime adds a layer that wants centralization |
| B-S6 | **Full control over the abstraction** — when something breaks, the bug is in code we own | Podman bugs require waiting for upstream; AppContainer bugs we can patch tomorrow |
| B-S7 | **K8s lessons applied where they help, ignored where they don't** — pick what matters | We don't ship admission webhooks because hobby users don't need RBAC; Option A would inherit the cost of those abstractions anyway |

### B.3 Weaknesses

| # | Weakness | Evidence / impact |
|---|----------|-------------------|
| B-W1 | **Isolation is hand-rolled = isolation is our security perimeter** — bugs here are CVEs we own | v21.D Windows had several near-misses during the iteration (LocalFree location, ACL inheritance flags). One missed → sandbox escape |
| B-W2 | **3 platforms × keep current = 3 isolation codebases to maintain** | Linux user-ns alone is a multi-month effort (per v21.D detail plan) before reaching v21.D Windows parity |
| B-W3 | **No image distribution story** — "install agent X" is custom packaging per agent | Plugin ecosystem stays bottlenecked through musu-plugin manifest, not OCI registry |
| B-W4 | **v22 plan is 14 weeks per the gap analysis** — and most of it is foundational work | 17 person-weeks, 4 ship gates, and §3.3 architectural decision still deferred |
| B-W5 | **No prior art for SOC2/HIPAA audit** — hand-rolled sandbox doesn't have a 5-year track record | Enterprise sales path is harder than for Podman-backed equivalent |
| B-W6 | **Observability has to be built from scratch** — §3.8 soak harness, metrics, tracing all DIY | "We need a Grafana dashboard" → write the metrics emitters in every reconciler |
| B-W7 | **Fact-check addendum §6 found 2 outright errors in §3.1+§3.2 alone** — and §3.3/§3.6/§3.7 haven't been audited yet | Self-rolled designs accumulate subtle errors. K8s/Podman code has thousands of contributors finding these |

### B.4 Opportunities

| # | Opportunity | Notes |
|---|-------------|-------|
| B-O1 | **musu becomes a differentiated thing** — not "K8s for AI agents" but "controller-runtime correctness on a laptop SQLite" | Defensible positioning if executed well |
| B-O2 | **Optimization without backward-compat** — every layer is ours to retune | E.g., the watch loop can be tuned for the actual agent count, not a generic K8s assumption |
| B-O3 | **Smallest possible attack surface** — no container daemon, no Linux VM on Win/Mac, no extra ports | Aligns with privacy-first / P2P brand narrative |
| B-O4 | **Schema evolution stays under our control** — every v37 → v42 migration is owned, deployed atomically with the binary | No "upgrade Podman first, then upgrade musu" coordination |
| B-O5 | **Easier "musu on a Raspberry Pi" story** — no VM, no container daemon, just a binary | Edge / offline deployments stay tractable |

### B.5 Threats

| # | Threat | Mitigation if pursued |
|---|--------|----------------------|
| B-T1 | **14 weeks is optimistic** (per §7.2 own grade) — could realistically slip to 20+ weeks | Cut scope: ship v22.0+v22.1 only (~7 weeks), re-evaluate. v22.2/v22.3 conditional on calibration data |
| B-T2 | **Linux user-ns is a known multi-distro minefield** — Ubuntu vs Fedora vs Alpine all differ on unprivileged user-ns | The exact §296+§303 task: "3-distro unprivileged user-ns bench." Worth doing as a §22.0 prereq |
| B-T3 | **macOS sandbox-exec is being deprecated by Apple** — replacement is Endpoint Security framework | If macOS host is required for any user segment, this is a real timeline risk |
| B-T4 | **The 3.5/10 critique grade does not improve until §3.x ships** — and ships verified | v21's "K8s-shaped" claim stays embarrassing through v22.0-v22.2 quarters |
| B-T5 | **Burnout** — a small team maintaining 3 isolation backends + a hand-rolled control plane | Real risk for solo or 2-person ops; mitigated by Option A absorbing the isolation work |

---

## 3. Side-by-side summary

| Dimension | Option A — Podman | Option B — Monorepo |
|-----------|-------------------|---------------------|
| Install footprint (Win/Mac user) | ~600MB-1GB (Podman + Linux VM) | ~50-100MB |
| Install footprint (Linux user) | ~80MB (Podman + deps) | ~50MB |
| Agent cold-start latency | 200-800ms | ~50ms |
| Isolation CVE responsibility | Upstream (Podman) | Us |
| Cross-platform isolation effort | 0 (Podman does it) | 3 crates, 2 still scaffold (#296, #298) |
| Image distribution story | OCI registry for free | None (custom per agent) |
| K8s YAML compatibility | Yes (`podman play kube`) | No (would need our own admission layer) |
| Multi-node scheduling | Still need §3.7 anyway | Still need §3.7 anyway |
| v22 control-plane fixes (§3.1–§3.6) | Still required | Still required |
| Windows v21.D work | Throwaway | Preserved |
| Brand narrative | "Pod manager for AI agents" — close to Docker | "Native control plane that respects your laptop" — differentiated |
| P2P / laptop-first story | Compromised (VM required) | Aligned |
| Audit / compliance story | Easier (prior art) | Harder (hand-rolled) |
| Time to "ship something better" | ~4 weeks integration + still need §3.x fixes | ~7 weeks for v22.0+v22.1 (most-cited gaps) |
| Vendor / upstream risk | Red Hat / Podman governance | Self-owned |

---

## 4. Hybrid option (worth naming)

**Option C — Hybrid**: Use Podman on Linux only; keep AppContainer/Job Object on Windows; consider Apple Endpoint Security on macOS.

| | Linux | Windows | macOS |
|--|--------|---------|-------|
| Isolation backend | Podman (rootless) | AppContainer + Job Object (own crate, shipped) | sandbox-exec → Endpoint Security (own crate, scaffold) |
| VM required? | No | No | No |
| Tradeoff | Get Podman's hardening on the platform that needs it most (server / Docker-like workloads) | Keep v21.D work; native Win32 | Apple's path forward; no VM |

Strengths of C:
- Preserves v21.D Windows investment
- No VM on either Win or Mac (the main user-facing pain in pure Option A)
- Linux servers / dev boxes get hardened isolation where it matters most
- Image distribution story exists for Linux (where most enterprise customers live)

Weaknesses of C:
- Three different mental models to maintain (Podman semantics, AppContainer semantics, sandbox-exec semantics)
- The unified `Isolation` trait at `musu-supervisor-isolation` has to abstract over an actual container runtime AND two OS-native sandboxes — leakier abstraction
- Doubles documentation burden ("on Linux, agents are pods; on Win/Mac, they're processes")

---

## 5. What the decision actually hinges on

Six concrete questions to answer **before** picking:

1. **What % of musu users run Linux as their primary workstation?**
   - If >70%: Option A or C strongly preferred (Podman shines on Linux)
   - If <30%: Option B preferred (VM overhead penalizes the majority)
   - Unknown today — needs telemetry from current musu-bridge installs

2. **Does any current customer / prospect ask for OCI image-based agents?**
   - If yes: Option A's "agents as images" advantage is real revenue
   - If no: it's a hypothetical advantage we pay for in install footprint

3. **What's the realistic timeline for SOC2/HIPAA compliance?**
   - If on the 12-month roadmap: Option A or C (prior art audit story)
   - If 24+ months: Option B (we have time to build the compliance docs ourselves)

4. **Is "musu runs on a Raspberry Pi / edge device" a real use case?**
   - If yes: Option B (no VM, no Podman, just a binary)
   - If no: not a tiebreaker

5. **How critical is sub-100ms agent spawn latency?**
   - For "spawn an agent per query" workflows: Option B's ~50ms beats Option A's ~500ms
   - For "agents live for hours" workflows: spawn latency doesn't matter

6. **Brand: is musu "a thing that's not Docker" or "a friendlier Docker for AI"?**
   - This is the hardest question; affects everything from naming to landing page copy

---

## 6. My recommendation (held loosely)

**Option C (hybrid) for v22.0–v22.2, with a re-evaluation gate before v22.3.**

Reasoning:
- v21.D Windows AppContainer work is real shipped code with passing tests; throwing it away is unjustified absent a clear forcing function
- Linux user-namespace from scratch (the §296 + §303 scaffold tasks) is the single largest remaining risk in v21.D. Podman absorbs that risk for free
- macOS sandbox-exec is dying; we'd have to migrate to Endpoint Security regardless, and Apple controls the timeline. Whether we use Podman or our own crate, that work is ahead
- The v22 control-plane fixes (§3.1–§3.6) are required in **all three options** — they're not avoided by any choice of substrate
- Hybrid lets us defer the brand decision while still progressing on the technical work

**The reasonable v22.0 sequence under Option C**:
1. v22.0 (4 wks): §3.1 events, §3.2 lease, §3.5 TOCTOU, partial §3.8 — same as gap-analysis plan
2. v22.1 (3 wks): Spike Podman integration on Linux; ship Linux backend as Podman-based; finalize §3.6 finalizers
3. v22.2 (3 wks): §3.7 scheduler upgrades; Windows AppContainer stays as-is; macOS sandbox-exec kept on scaffold pending Apple guidance
4. v22.3 (4 wks): Soak, decide §3.3 Road A/B/C, decide macOS path (Endpoint Security vs Podman-via-Linux-VM-on-Mac)

This is a **decision-deferral with substrate diversification**, not a clean answer. The clean answer requires the 6 questions in §5 to be answered first, and most of those need data we don't have.

---

## 7. What I am NOT confident about

- Podman's ~500ms cold-start number is from memory of Red Hat blog benchmarks; not measured against musu's workload directly
- "30% / 70% Mac/Linux split" is industry-typical for dev tools but I have no musu-specific telemetry
- The Apple Endpoint Security migration timeline is real (sandbox-exec is officially deprecated since macOS 10.15, ~2019) but the actual removal date is unannounced
- The §1's claim that "Option A doesn't remove the scheduler work" assumes musu wants cross-machine binding. If we re-scope to single-host only, Option A's scheduler argument collapses entirely

Each of these would benefit from a real measurement before the SWOT becomes a decision.

---

## 8. Cross-references

- `docs/V22_K8S_GAP_ANALYSIS_2026_05_15.md` — the full 9-section v22 plan
- `docs/V22_K8S_GAP_ANALYSIS_2026_05_15.md` §6 — fact-check addendum (kine, leases, SQLite AUTOINCREMENT)
- `docs/V22_K8S_GAP_ANALYSIS_2026_05_15.md` §7 — honest self-assessment
- `docs/PACKAGE_INVENTORY_2026_05_15.md` — current 12-package roster this decision affects
- `docs/V21D_WINDOWS_IMPL_2026_05_15.md` — the Windows isolation work potentially at risk

---

## 9. Lighter alternatives below Podman — landscape map

User raised the follow-up: *"Podman보다 더 가볍고 단순한 것은?"* and clarified the
target use case as **"로컬 PC에서 학습/개발용 K8s + 웹 브라우저 대시보드 + 하이브리드(원격) 접속."**

This section catalogs the candidates and maps them to that use case. Sources: external recommendations + Podman/containerd manpages + K3s/k0s official READMEs.

### 9.1 Three layers of "lighter than Podman"

Podman is a **container engine** (CLI + image management + pod orchestration in one binary). Lighter alternatives exist at three distinct layers:

#### Layer 1 — Container runtime only (under K8s)

| Tool | What it is | Lighter than Podman because |
|------|------------|-----------------------------|
| **containerd** | The execution core Docker uses, extracted as a daemon | No CLI, no image-build, no pod abstraction. De facto K8s standard runtime |
| **CRI-O** | K8s-only runtime built by the Podman team | Stripped to **only** what K8s CRI needs — even smaller than containerd |

These are not user-facing tools. They sit *under* K8s and Podman picks containerd or CRI-O as its execution backend.

#### Layer 2 — Lighter container CLI

| Tool | What it is | Lighter than Podman because |
|------|------------|-----------------------------|
| **nerdctl** | Docker/Podman-style CLI for containerd | Skips Podman's pod/quadlet/systemd integration; just `nerdctl run` |

#### Layer 3 — Lighter Kubernetes distribution (the user's target)

| Tool | Single binary? | Memory | Web UI built-in | Notable trait |
|------|----------------|--------|------------------|----------------|
| **K3s** | ~50MB binary | ~250MB RAM idle | No (pair with Portainer/Lens) | Rancher-made; runs on Raspberry Pi; production-grade in edge |
| **k0s** | ~70MB binary | ~300MB RAM idle | No (pair with Portainer/Lens) | Mirantis-made; **zero OS dependencies**; cleanest single-binary story |
| **MicroK8s** | snap-installed | ~400MB RAM idle | **Yes** (`microk8s enable dashboard`) | Canonical-made; Ubuntu's preferred; add-ons system |
| **K3d** | K3s-in-Docker | Docker overhead + K3s | No (pair externally) | Multi-node testing on one laptop; cleanest install/teardown |
| **Kind** | Kubernetes-in-Docker | Docker overhead + K8s | No (pair externally) | Closest to upstream K8s for conformance testing |
| **Minikube** | VM-based | High (1-2GB) | Yes (`minikube dashboard`) | Original local-K8s; heaviest of the lot |

### 9.2 Web dashboards (the "웹 브라우저로 본다" part)

| Tool | Form factor | Strengths | Trade-offs |
|------|-------------|-----------|------------|
| **Portainer** | Web app (deployed in-cluster, accessed at `localhost:9000`) | One-stop multi-cluster UI; pod/service/log click-through; free Community Edition | Adds ~150MB cluster overhead |
| **Lens** | Desktop app (Mac/Win/Linux) | Most powerful K8s GUI; multi-cluster; built-in metrics | Not web-accessible; freemium model |
| **K8s Dashboard** (built into MicroK8s) | Web app, official | No third-party trust, ships with K8s | Less polished UX than Portainer |
| **Headlamp** | Web app + desktop, CNCF-incubated | Open-source, plugin architecture | Newer, smaller community |

For the user's "웹사이트에서 보고싶다" requirement, **Portainer** is the safest first pick — most mature web UI, runs in-cluster, accessible at `localhost:9000` after `helm install portainer`.

### 9.3 Remote / hybrid access ("외부에서도 웹으로")

To expose the local dashboard to a remote browser without port-forwarding:

| Tool | How it works | Best for |
|------|--------------|----------|
| **Cloudflare Tunnel** | Outbound-only tunnel from laptop → Cloudflare edge → public URL with auth | Public-facing dashboards; integrates with Cloudflare Access SSO |
| **Tailscale** | Mesh VPN over WireGuard; assigns 100.x.y.z IP to every device | Private dashboards across your own devices; matches musu's existing P2P story |
| **ngrok** | Pioneering tunnel-as-a-service | Quick demos; less polished for permanent setups |
| **Bore / Frp / SSH -R** | Self-hosted tunnels | When external SaaS is off the table |

**Tailscale is the natural match for musu** — `musu-relay` already plays a similar mesh role for bridge↔musu.pro traffic. Adding the K8s dashboard to the same Tailnet means the dashboard is reachable from any of the operator's devices without exposing it to the internet.

### 9.4 Recommended local-K8s + Web UI + Hybrid stack

For the user's exact stated goal:

| Layer | Pick | Rationale |
|-------|------|-----------|
| K8s distribution | **K3s** | Single 50MB binary; production-grade; works on every OS that runs Linux (Win/Mac via WSL2 or k3d) |
| Container runtime (inside K3s) | **containerd** (K3s default) | No extra choice needed |
| Web dashboard | **Portainer Community Edition** | Web-based, easiest install, multi-cluster ready if musu grows |
| Remote access | **Tailscale** | Matches musu's mesh model; no public URL exposure unless explicitly chosen |
| Alternative if Tailscale ruled out | **Cloudflare Tunnel** | Public URL + Access SSO for browsers without Tailscale client |

**One-line install sketch** (Linux host):
```
curl -sfL https://get.k3s.io | sh -
kubectl apply -f https://downloads.portainer.io/ce2-21/portainer-agent-k8s-lb.yaml
tailscale up
# Portainer now reachable at https://<tailnet-ip>:9443
```

### 9.5 What this means for musu specifically

If we ever want to demonstrate "musu running on K8s" — for enterprise prospects, conformance tests, or as the §3.3 Road C trial — the recommended dev/test stack is **K3s + Portainer + Tailscale**, not full kubeadm. This is also the cheapest way to run an integration test against real K8s primitives without standing up a cloud cluster.

For Option A in §1 of this doc, the substrate would shift from "Podman directly" to "K3s with containerd". Trade-off summary:

| Pick | Pros vs Podman | Cons vs Podman |
|------|----------------|----------------|
| K3s + containerd | Multi-node scheduling included; K8s YAML native; smaller per-node footprint | Adds a full K8s control plane (etcd or sqlite-backed); learning curve |
| Plain containerd + nerdctl | Smallest single-host footprint | No scheduling at all; same single-host limit as Podman |
| CRI-O + K3s | Most K8s-native pairing | CRI-O alone outside K8s isn't useful for musu |

**Net**: if Option A or C in §1 is pursued, **K3s + containerd** is the right concrete substrate to evaluate next, not Podman bare. Podman remains the better pick **only** if we want pod-style spawn without a K8s control plane (single-host, no scheduling).

### 9.6 Updated recommendation (replaces §6's first paragraph for the "K3s available" world)

If the user's stated goal is **"로컬 PC + 학습/개발 + 웹 대시보드 + 외부 접속"**, the v22.1 spike should pivot from "integrate Podman as the supervisor backend" to **"integrate K3s as an optional Linux substrate; expose musu's controllers as K8s CRDs"**.

This is a bigger change but unlocks:
- Free K8s YAML compatibility for agent specs
- Portainer dashboard for free (no need to build musu's own admin UI for cluster ops)
- Tailscale-bridged hybrid access aligned with existing musu-relay story
- A real path toward §3.3 Road C without rewriting the topology question

The cost: K3s adds a real control plane alongside (or replacing) musu-bridge's SQLite. This is exactly the §3.3 Road A vs Road C fork the v22 gap analysis already named — and choosing K3s **answers Road C** definitively if we go that direction.

### 9.7 Sources for this section

- Podman daemonless / single-host: `podman.1` manpage (verified via WebFetch)
- containerd / CRI-O / nerdctl architecture: external recommendation + CNCF runtime landscape
- K3s 50MB binary / single-file: Rancher K3s README
- k0s zero-dependency: Mirantis k0s README
- MicroK8s `enable dashboard` add-on: Canonical MicroK8s docs
- Portainer install path: portainer.io official Helm chart docs
- Tailscale mesh model: tailscale.com architecture page
- Cloudflare Tunnel auth model: cloudflare.com Zero Trust docs

These are not all primary-source verified at this writing — the §9 catalog leans on external summary plus Podman primary check. A §6-style fact-check pass over §9 should run before any v22.1 substrate spike begins.

---

## 10. Multi-tenant PaaS scenario — "혼자 쓸 게 아니라 여러 명이 쓰는 제품이라면?"

**Scenario shift**: §9 assumed single-operator local-dev. The user clarified:
*"내가 혼자 쓸 게 아니고, 약간 제품처럼 여러 명이 사용할 거라면?"*
This is a **categorically different problem**. SWOT logic from §1–§8
doesn't transfer cleanly.

### 10.1 What changes when you go multi-tenant

| Single-operator (§1–§9 assumption) | Multi-tenant PaaS |
|------------------------------------|--------------------|
| One person's laptop, one trust boundary | N users, N trust boundaries, RBAC required |
| `localhost:9000` dashboard fine | SSO login, account management, password reset |
| `~/musu.toml` config file | Per-tenant config + isolation between tenants |
| Operator's data on operator's device | Tenant data isolation, encryption-at-rest, backup story |
| "User installs binary" | "Someone operates the platform, users sign up" |
| musu-bridge per device | Central control plane(s) + per-user agents |
| P2P / "data stays on device" invariant | **Conflicts** — see §10.5 |

Substrate alone (§1 Option A/B/C) is not enough; PaaS adds a whole
platform layer above.

### 10.2 Candidate platform stacks (engineer-facing)

| Stack | What it adds on top of K3s | Best for |
|-------|---------------------------|----------|
| **K3s + Rancher** | Multi-cluster mgmt, AD/LDAP/GitHub SSO, namespace-scoped RBAC, Helm-as-app-store | Cloud-product feel; standard enterprise K8s PaaS |
| **K3s + KubeSphere** | Workspace abstraction, built-in CI/CD, polished UI, multi-tenant first-class | Internal dev-team platform; CI/CD-heavy workflows |
| **K3s + Portainer Business Edition** | Team grouping + RBAC, K8s complexity hidden, lightest | Engineers who don't want to learn K8s primitives |

All three sit on K3s; they differ on **how much K8s they expose vs hide**.

### 10.3 Matrix vs §1 options

| Dimension | Option A (Podman bare) | Option B (monorepo hand-rolled) | Option C (hybrid) | **Option D — K3s + Rancher** | **Option E — K3s + KubeSphere** | **Option F — K3s + Portainer BE** |
|-----------|----------------------|--------------------------------|-------------------|------------------------------|--------------------------------|----------------------------------|
| Multi-tenancy | None | DIY (§3.6 + RBAC + admission) | Same as B | **Built-in** | **Built-in** | **Built-in** |
| Web admin UI | None | musu-bee (partial) | musu-bee | **Rancher** | **KubeSphere** | **Portainer** |
| SSO/Auth | None | DIY | DIY | **AD/LDAP/GitHub/Google** | **GitHub/OIDC** | **LDAP/OAuth (BE only)** |
| RBAC | None | DIY | DIY | **Namespace-level** | **Workspace-level** | **Team-level** |
| App catalog | None | DIY | DIY | **Helm chart catalog** | **Helm + OperatorHub** | **Stacks/templates** |
| Cost to musu eng (build) | High | Highest | High | **Low (reuse)** | **Low (reuse)** | **Low (reuse)** |
| Cost to ops (operate) | Low | Low | Med | Med-high | High | Low-med |
| musu brand differentiation | Some | Strongest ("not Docker") | Strong | **Weak — "Rancher skin"** | Weak — "KubeSphere skin" | Weak — "Portainer for AI" |
| Time to market | 4-6 wks | 14 wks | 14 wks | **4-8 wks** | 6-10 wks | 3-5 wks |

### 10.4 What stays musu vs what becomes generic K8s

| musu-specific value | Survives D/E/F? |
|---------------------|-----------------|
| Agent-aware scheduling (per-company quotas) | ✅ Survives as custom controller / CRD |
| musu-ai-detector MCP | ✅ Orthogonal |
| musu-indexer MCP | ✅ Orthogonal |
| musu-relay cross-machine relay | ⚠️ Partly obsolete (service mesh covers some) |
| musu-bee axis-view UI | ❌ Largely redundant (Rancher/KubeSphere has its own) |
| musu-bridge as a control plane | ❌ Largely redundant (K3s + Rancher is the control plane) |
| musu-supervisor isolation | ❌ Largely redundant (Pods + securityContext is the K8s way) |
| Hand-rolled v22 §3.1–§3.9 plan | ❌ Largely redundant (K8s has events/leases/generation/finalizers/scheduler/preemption) |

**The blunt observation**: adopting K3s + Rancher/KubeSphere collapses
50–70% of the current monorepo into something the platform already
provides. That's either relief (less code) or identity crisis (what
is musu without its control plane?), depending on perspective.

### 10.5 Conflict with musu's P2P invariant

From `CLAUDE.md` session memory:
> *"유저 데이타를 다 저장할 수는 업잔냐. 그게 임마. 몇 기가가 될 줄 알고. 그니까 무수pro에서는 각 기기에서 처리한 걸 relay해 주면 되는 거 아니냐?"*

Original musu invariant: **musu.pro is a thin relay; user data stays
on her device.** PaaS multi-tenancy assumes the opposite — central
operator stores tenant data. **Incompatible**, unless:

**Resolution 1 — "PaaS for the platform, not for the data"**:
- Multi-tenant PaaS hosts only the *control plane* + *agent specs*
- Actual agent execution + user data stays on user device
- Rancher manages "who can spawn what kind of agent where"
- musu-relay continues as data path; PaaS is **directory / catalog /
  orchestrator** only
- **Compatible with original P2P invariant** (same model as Tailscale
  the company: coordination plane centralized, data plane P2P)

**Resolution 2 — "Pivot away from P2P, become a normal SaaS"**:
- Tenant data flows to central platform like every other SaaS
- Multi-tenant K8s platform stores it; musu-relay role shrinks to legacy
- **Brand pivot**, not a substrate decision

Pick one before picking a stack.

### 10.6 Two sub-recommendations

**If Resolution 1 (preserve P2P)**: K3s + Rancher as the control-plane
operator console. musu-bridge per user-device continues. Rancher does
fleet management — *"operator runs Rancher; users run musu-bridge on
their devices; Rancher tracks agent specs / catalog / who-pays-for-what;
data never enters Rancher."* Effort ~8 weeks.

**If Resolution 2 (centralized SaaS)**: K3s + KubeSphere for the
cloud-native PaaS look. Or go directly to managed EKS/GKE. musu-bridge
collapses to a regular K8s deployment; musu-relay becomes ingress.
Effort ~12 weeks of refactor + the entire "operate a cloud service"
overhead.

### 10.7 What I don't know that should drive the choice

| Question | Why it matters |
|----------|---------------|
| Are the "multiple users" engineers or end-users? | Engineers tolerate Rancher; end-users can't (see §11) |
| Will users bring their own compute, or use musu's? | Determines whether P2P holds |
| How many tenants in year 1? | <10 = no real PaaS; 100+ = real PaaS needed |
| Self-hosted enterprise or musu.pro SaaS? | Self-hosted ↔ Option D; SaaS ↔ managed K8s |
| Where does payment happen? | musu-bee Paddle covers some of this already |

### 10.8 Honest summary

The user's question exposed that v22 gap analysis (§3.x) and the §1
Option A/B/C framing were built for the wrong scale. **Single-operator
hardening (v22)** and **multi-tenant productization (this section)**
are two different 14-week projects, not one project with two views.

The order of decisions that matters:

1. **Resolution 1 vs 2** (P2P invariant — keep or pivot?) — strategic, not technical
2. **If Resolution 1**: spike K3s + Rancher above existing fleet; v22 §3.x continues underneath
3. **If Resolution 2**: stop v22 §3.x mid-stream; pivot to "we're building on K8s/Rancher"; throw away ~50% of monorepo over 12 weeks

**Do not pick a stack before resolving #1.** The wrong substrate
locked in now is more expensive than waiting two weeks for the
strategic call.

---

## 11. End-user scenario — "인프라 지식이 없는 일반 사용자"

**Scenario shift again**: user clarified the multi-tenant audience is
**non-engineers**. Rancher / KubeSphere / Portainer all show "Pod /
Volume / Port-Forward" terminology somewhere. To a non-engineer, that
is foreign language.

The product they want is **app-store UX over a container substrate** —
user clicks an app, it launches, no K8s vocabulary anywhere.

### 11.1 The right reference class is NOT enterprise K8s UI

It is **personal-server / homelab dashboards** + **PaaS-for-non-devs**.
Three primary candidates from the external recommendation:

| Stack | Form factor | What user sees | What's hidden |
|-------|-------------|----------------|---------------|
| **CasaOS** | Web "desktop" — looks like a phone/PC desktop in the browser | App Store icon → 1-click install of WordPress, Nextcloud, Plex, Minecraft, etc. + file manager | All K8s / Docker / Pod / Volume vocabulary |
| **Coolify** | Modern PaaS UI (Vercel/Heroku clone, open source) | "Connect GitHub repo → click Deploy → get a URL" | Container build, orchestration, networking |
| **Portainer App Templates** (curated mode) | Admin curates templates; users see only those | "Pick template → name it → click Deploy" | Everything else of Portainer's surface |

Source: external recommendation (not yet primary-source verified per
§6 method; flagged for fact-check before any spike).

### 11.2 Mapping to musu

The original musu pitch — "users run agents on their own machines" — is
**closer to CasaOS than to Rancher**. Both target operators who want
to host things themselves without learning ops. The differences:

| | CasaOS pitch | musu pitch |
|--|---|---|
| Hosts | Apps (WordPress, Nextcloud, …) | AI agents (Claude, Codex, Gemini, custom) |
| User mental model | "Bookmark of apps I run" | "Workspace of agents I dispatch" |
| Output | Web apps with URLs | Code edits, files, chat sessions |
| Multi-user? | Single-host typically | musu wants multi-user from day 1 |

CasaOS is the **closest UX reference** for the multi-tenant
non-engineer audience. KubeSphere/Rancher are wrong genre.

### 11.3 New options to add to the §1 matrix

| Option | Substrate | User-facing UI | Audience |
|--------|-----------|----------------|----------|
| **Option G — CasaOS-style musu** | Docker/Podman per device + curated "agent store" | Web desktop with agent icons, 1-click install, no K8s words | Non-engineers, homelab tier |
| **Option H — Coolify-style musu** | K3s + Coolify-clone admin UI | "Connect repo / pick template → deploy" framing for agents | Prosumer / indie devs who deploy customers' agents |
| **Option I — Portainer + curated templates** | K3s + Portainer locked to App Templates mode | Even narrower template list curated by musu admins | Enterprises whose end-users should never touch K8s |

These are not engineer-focused PaaS like D/E/F — they're **product
shells** that wrap the substrate.

### 11.4 What this collapses in the monorepo

If we adopt **Option G** (CasaOS-shape):

| musu component | Fate under G |
|---------------|--------------|
| musu-bee web UI | ⚠️ Repurposed → "agent store" home screen (looks like CasaOS) |
| musu-bridge control plane | ✅ Survives — backs the store |
| musu-supervisor isolation | ✅ Survives — Docker/Podman per host |
| musu-relay | ✅ Survives — cross-device relay |
| musu-port | ✅ Survives — agent ingress |
| Hand-rolled v22 §3.x | ⚠️ Partly redundant — Docker compose-like semantics replace some of §3.6/§3.7 |
| Agent-as-image story | ✅ Natural fit (1-click install = `docker pull`) |

The interesting note: **Option G preserves more of the existing
monorepo than Options D/E/F do**, because it doesn't import K8s.
The cost is rewriting musu-bee from "axis view dashboard" to
"app-store-style launcher."

### 11.5 What musu-bee already has vs needs (under Option G)

Current musu-bee:
- v21.F axis views `/c/:company_id`, `/m/:machine_id`
- Paddle billing
- SSE subscription
- Playwright E2E

Needed for app-store UX:
- **Agent catalog** (icons, categories, "install" button) — new
- **Per-tenant home screen** — new (multi-user is partly there for billing only)
- **One-click install flow** — new (today: agent setup is engineering)
- **Agent lifecycle UI** (start/stop/restart/uninstall) — partial
- **File manager** for agent outputs — new (or skip, let agent write to web URL)
- **App-store search / categories** — new

Effort: ~6 weeks of musu-bee UI work + ~3 weeks of musu-bridge "agent
spec catalog" backend.

### 11.6 The right question to ask before any of this

User asked at the end:
> *"일반 사용자들이 이 웹사이트에 접속해서 구체적으로 어떤 작업(예: 개인 블로그
> 만들기, 팀용 파일 공유 드라이브 생성, 혹은 단순한 프로그램 실행 등)을 하기를
> 원하시나요?"*

This is **the right question** — it pins down which Option (D/E/F vs
G/H/I) fits.

Three plausible answers and their consequences:

| Answer | Fitting option | Why |
|--------|---------------|-----|
| "Run AI agents that produce text/code/chat outputs" | **Option G — CasaOS-style** | App-store of agents matches the mental model |
| "Deploy our own apps to the cloud, with AI assistance" | **Option H — Coolify-style** | Repo → deploy is the right framing |
| "Centrally managed enterprise AI usage with team policies" | **Option F or I — Portainer (curated)** | Admin controls + simple template UI |

Until this is answered, the architecture choice is a guess.

### 11.7 Decision tree (revised, incorporating §10 + §11)

```
Q1: 혼자 쓰는가, 여러 명?
 │
 ├─ 혼자 → §1 Options A / B / C (substrate choice)
 │
 └─ 여러 명
      │
      Q2: 사용자가 엔지니어인가, 일반인인가?
      │
      ├─ 엔지니어 → §10 Options D / E / F
      │           (Rancher / KubeSphere / Portainer)
      │
      └─ 일반인
           │
           Q3: 무엇을 하려고 들어오는가?
           │
           ├─ AI 에이전트 실행 → §11 Option G (CasaOS-shape)
           ├─ 코드 → 배포    → §11 Option H (Coolify-shape)
           └─ 관리된 카탈로그 → §11 Option I (Portainer curated)
```

Three questions, eight terminal options. Until Q1/Q2/Q3 are answered
the SWOT is informational, not prescriptive.

### 11.8 Honest recommendation for "non-engineer multi-tenant"

If Q1=many, Q2=non-engineer, and Q3=AI agents (the most likely musu
case): **Option G — CasaOS-shape**.

Concrete next step: spike a CasaOS-style home screen as a new musu-bee
view. Don't replace the existing axis views; add the new view as
`/store` and let it coexist. Two weeks of frontend work tells us
whether the framing works before committing to the architectural
rebuild.

### 11.9 Cross-references

- musu-bee current scope: `musu-bee/README.md`
- Paddle billing already wired (multi-tenant pricing partly solved): `musu-bee/README.md`
- CasaOS / Coolify / Portainer App Templates: external recommendation, **not yet primary-source verified** — required §6-style pass before any v22.x spike
- This document supersedes §1's recommendation when audience is non-engineer multi-tenant

---

## 12. What this whole SWOT actually says

After §1–§11, the honest summary:

1. **No technical option is wrong**. They all fit *some* user. The wrong move is picking one before knowing the user.
2. **Three orthogonal axes**:
   - **Substrate**: hand-rolled / Podman / containerd / K3s
   - **Multi-tenancy**: none / engineer PaaS / consumer PaaS
   - **Brand**: differentiated control plane / K8s skin / app store
3. **The P2P invariant from `CLAUDE.md`** is the highest-priority filter. Resolutions 1 and 2 in §10.5 are the strategic fork — every other decision flows from this.
4. **The current v22 plan is single-operator-tuned**. If musu pivots to multi-tenant or consumer audience, large parts of v22 §3.x are mooted before they ship.
5. **Two weeks of strategic discussion** beats two months of code on the wrong substrate. The right next step is the user-research conversation, not a v22.1 spike.

This SWOT is dated 2026-05-15. Re-read it after the strategic fork is
decided and discard sections that no longer apply.

---

## 13. Killer features — what musu actually is

User declared the three killer features that define the product:

> 1. **여러 대의 PC를 하나의 워크스페이스처럼 묶어서 사용한다** (cluster local PCs as a single workspace)
> 2. **Paperclip 같이 이 여러 대의 PC에서 agentic company, 즉 다중 에이전트 자동화를 돌린다** (run multi-agent automation across the PC fleet)
> 3. **로컬에서 돌아가고, 외부에서 접속해서 컨트롤이 가능하다** (runs locally, remotely controllable)

This is the **product north star**. The §1–§12 SWOT was meandering
because it lacked this anchor. Re-evaluating everything against these
three features below.

### 13.1 What each killer feature implies architecturally

| Killer feature | Architecture implication | Already in musu? |
|---|---|---|
| **F1 — multi-PC workspace** | Need a fleet abstraction: master node + worker nodes joining a single resource pool. Visible to user as "내 워크스페이스에 PC N대 = M코어 / K GB RAM" | Partial: musu-bridge per device exists; cross-device pool is what v21.C scheduler started; no "join my workspace" UX |
| **F2 — multi-agent company automation** | Spawn N agents that have roles + dependencies + a workflow graph. Each agent runs as a process/container on whichever PC has capacity. Output of one feeds next | Partial: paperclip exists as a separate experiment; musu-bridge has companies/agents tables; no workflow DAG runtime |
| **F3 — local execution + remote control** | Agents run on user's PCs (data + compute stay local); operator's *control surface* reachable from any device (phone, laptop, browser from cafe). Tunnel through NAT without user touching firewall | Partial: musu-relay is the data-plane tunnel; musu-bee is the remote UI; F3 is closest to done already |

All three are **partially built**. None are **product-ready**.

### 13.2 The three features map to exactly three system layers

| Layer | Killer feature served | Today in musu | Best off-the-shelf substrate |
|-------|----------------------|----------------|-----------------------------|
| **Infrastructure** (cluster local PCs) | F1 | scheduler/binder + heartbeat in musu-bridge | **K3s** — single-binary K8s, master/worker join is `curl \| sh`, runs on Pi |
| **Agent orchestration** (workflows + dispatch) | F2 | controllers + reconcilers (v21.A/E) | **K8s Jobs/CronJobs** + agent workflow tool (Dify / Flowise / n8n / LangGraph) |
| **Remote access** (NAT-pierce + UI) | F3 | musu-relay + musu-bee | **Cloudflare Tunnel** or **Tailscale**; Next.js stays for UI |

This map gives a **concrete option not yet named** in §10/§11:

### 13.3 Option J — K3s under the hood, custom musu UI on top

| | Details |
|--|--|
| Infrastructure | K3s master on user's primary PC; sub-PCs join via auto-generated token in the desktop installer (.exe / .dmg / .deb). No CLI for end user. |
| Agent runtime | K3s Jobs spawn agent containers; one PC chosen by K3s scheduler with capacity. Workflow DAG defined by musu (custom CRDs), executed by a workflow controller (built or wrapping Dify/Flowise/LangGraph). |
| Remote access | Cloudflare Tunnel installed alongside K3s; assigns `user1.musu.pro` URL automatically. User never sees a port number or firewall rule. |
| User-facing UI | **Custom musu-bee frontend** — looks like "Agentic Company" not like K8s. Rancher/Portainer hidden entirely. Per the external advice: *"K3s는 철저히 뒷단에서 'PC들을 묶고 에이전트 컨테이너를 분산 배치하는 뇌' 역할로만 은닉시켜야 합니다."* |
| What stays from monorepo | musu-bee (heavy rewrite for store/workflow UX), musu-relay (maybe absorbed by Cloudflare Tunnel), musu-ai-detector / musu-indexer (orthogonal MCPs survive), musu-bridge (becomes a thin shim above K3s API), musu-supervisor (replaced by K3s + container images) |
| What goes | Hand-rolled isolation (v21.D Windows AppContainer becomes throwaway), hand-rolled scheduler/lease/watch (§3.x mostly redundant), per-device musu-bridge as a control plane (replaced by K3s) |

**Effort estimate** (rough, calibrate later):
- K3s integration + auto-join installer per OS: 4 weeks
- Workflow controller / DAG runtime: 4 weeks
- Custom musu-bee frontend (Agentic Company UI): 6 weeks
- Cloudflare Tunnel auto-provisioning: 2 weeks
- Multi-tenant account + billing wiring (extend Paddle): 2 weeks
- **Total ~18 weeks** for the new product; less code lines than v22 §3.x because most heavy lifting is delegated.

### 13.4 Option J vs every prior option, by killer feature

| | F1 (multi-PC pool) | F2 (multi-agent workflow) | F3 (remote control) |
|--|---|---|---|
| Option A (Podman bare) | ❌ single-host | ❌ no workflow runtime | ⚠️ needs hand-built tunnel |
| Option B (monorepo hand-roll) | ✅ v22 §3.7 would build it | ✅ v22 §3.7 would build it | ✅ musu-relay |
| Option C (hybrid) | Same as B | Same as B | Same as B |
| Option D (K3s + Rancher) | ✅ K3s clustering | ⚠️ need workflow tool on top | ✅ Cloudflare Tunnel / Tailscale add-on |
| Option E (KubeSphere) | ✅ K3s | ⚠️ KubeSphere CI/CD ≠ agent workflow | ✅ same |
| Option F (Portainer BE) | ✅ K3s | ❌ Portainer is container mgmt, not workflow | ✅ same |
| Option G (CasaOS-shape) | ❌ CasaOS is single-host | ❌ App-store is install, not workflow | ⚠️ needs add-on |
| Option H (Coolify-shape) | ⚠️ Coolify is multi-server but not laptop-fleet oriented | ❌ Coolify is deploy-from-git, not agent DAG | ✅ Coolify has tunnel support |
| Option I (Portainer curated) | ✅ via K3s | ❌ same as F | ✅ same |
| **Option J (K3s + custom UI, hidden)** | **✅** | **✅** | **✅** |

**Option J is the only option that hits all three killer features.**
Every other option fails on at least one.

### 13.5 Resolution 1 vs Resolution 2 re-applied to Option J

§10.5 asked: P2P invariant (data stays on user device) — keep or pivot?

Option J **preserves P2P** by construction:
- K3s cluster nodes are the user's own PCs (her laptop is master, her old desktop and family PC are workers)
- Agent containers run on her PCs, not on musu.pro
- musu.pro provides the workflow catalog + the Cloudflare Tunnel coordination + account / billing — **not** the data plane
- This is **Resolution 1 (preserve P2P)** with a stronger fleet abstraction than musu has today

Resolution 2 (pivot to centralized SaaS) is **not** what J describes —
Option J keeps the original musu invariant intact.

### 13.6 What changes in the v22 plan if Option J is picked

| v22 §3.x section | Fate under J |
|------------------|--------------|
| §3.1 kine-shaped events | ❌ Redundant — K3s uses real etcd / sqlite-backed kine |
| §3.2 lease / fencing | ❌ Redundant — K3s leases coordination.k8s.io built-in |
| §3.3 API server consensus | ❌ Redundant — K3s has it |
| §3.4 spec/status separation | ❌ Redundant — every K8s object has it |
| §3.5 CEO TOCTOU | ⚠️ Becomes "ensure musu's workflow controller is idempotent" — much smaller scope |
| §3.6 finalizers + owner refs | ❌ Redundant — K8s has both |
| §3.7 scheduler upgrades | ❌ Redundant — kube-scheduler has all of this |
| §3.8 fault injection + multi-process race | ✅ Still useful — but applied to *our* workflow controller, not the K3s primitives |
| §3.9 migration roadmap | Reframe to "migrate from v21 to Option J" |

**About 70% of the v22 plan becomes moot under Option J.** The
remaining 30% is the musu-specific business logic that sits *above*
K3s: the workflow controller, the agent catalog, the per-tenant
isolation, the billing.

This is exactly the §10.4 / §11.4 observation, but sharpened by F1+F2+F3:
**when we let K3s do the K8s job, the hand-rolled K8s-shape is no
longer the product; the agentic-company workflow IS.**

### 13.7 Risks of Option J

| Risk | Notes |
|------|-------|
| K3s on Windows hosts | K3s upstream supports Linux primarily. Windows worker nodes need WSL2 or are limited. This is the same problem v21.D solved for AppContainer — but Option J doesn't reuse v21.D. May need a per-host Linux-VM-like install. Real ops cost on Windows |
| Auto-join installer on 3 OSes | The "user clicks installer, PC joins cluster" UX is non-trivial. Per-OS code signing, firewall whitelisting, K3s install scripts, agent enrollment. Easily 4 weeks alone |
| Cloudflare Tunnel dependency | Single vendor; if Cloudflare changes pricing or T&C, musu's external-access story breaks. Mitigation: Tailscale or self-hosted reverse-tunnel as fallback |
| Workflow DAG runtime is its own product | Building Dify/Flowise/n8n-equivalent is a real project. Wrapping one is faster but accepts upstream constraints |
| v21.D Windows isolation work is throwaway | 1100 lines of Rust + 27 tests don't carry over. Real sunk cost |
| Multi-tenant billing on per-user K3s clusters | Each user has their own cluster; "per-tenant" means "per-cluster". Billing is then "how much compute did this user's cluster do?" — Cloudflare Tunnel egress / control-plane API call counting, not standard K8s metering |

### 13.8 Three concrete near-term decisions

To make Option J real, three things need to be answered in the next two weeks:

1. **DAG runtime: build or wrap?**
   - Wrap Dify / Flowise / LangGraph: faster, but accepts their data model
   - Build musu-native: slower, but agentic-company is the differentiator and may need a custom data model
   - **Recommendation**: spike Dify integration for 1 week; decide based on what doesn't fit

2. **K3s on Windows: WSL2 install, or native-Windows hack, or "Windows is read-only worker"?**
   - WSL2: works today, adds 1GB install
   - Native: massive engineering investment
   - Read-only: Windows PCs join as control-plane-only (can dispatch but not host agent containers)
   - **Recommendation**: WSL2 for now; revisit only if user base proves to be Windows-heavy enough to justify

3. **Cloudflare Tunnel vs Tailscale**:
   - Cloudflare: public URLs (`user1.musu.pro`), SSO via Cloudflare Access, single-vendor risk
   - Tailscale: private mesh, no public URLs by default, matches musu's existing relay model better
   - **Recommendation**: Tailscale primary, Cloudflare optional for public sharing — this is exactly the §9.3 split

### 13.9 Honest comparison: hand-rolled v22 vs Option J

| | v22 (Option B/C, hand-rolled) | Option J (K3s + custom UI) |
|--|---|---|
| Time to "fleet that runs multi-agent workflow with remote UI" | 14 wks + (workflow runtime not in v22) ~6 wks = **~20 wks** | ~18 wks |
| Lines of code we maintain | High (own scheduler, watch, lease, isolation, ...) | Lower (musu-bee UI + workflow controller + installer) |
| Bug responsibility | Ours, all of it | Ours for musu code; K3s/CNCF for substrate |
| Killer features served | F1 ✓ F2 ✓ F3 ✓ (after 20 wks of new work on top of v22) | F1 ✓ F2 ✓ F3 ✓ (after 18 wks total) |
| Brand differentiation | "We built the K8s alternative for AI" | "We're the Agentic Company on top of K3s" |
| musu's identity post-v22 | Control-plane vendor | Workflow + UX vendor |

The brand framing matters. **"Control-plane vendor"** is selling
infrastructure to engineers. **"Agentic Company vendor"** is selling
a product to operators. The killer features (F1+F2+F3) are the latter.
v22 §3.x was building toward the former.

### 13.10 Final recommendation under killer-feature framing

**Pivot to Option J. Stop v22 §3.x after v22.0 ships (§3.5 TOCTOU
fixes + §3.8 partial fault injection — both still useful for the
workflow controller). Start the K3s + custom-UI spike in parallel.**

Concrete sequence:
1. **Week 1–2**: User research — confirm F1+F2+F3 are the killer features, not aspirational
2. **Week 3–4**: K3s auto-join installer spike on Linux + macOS; WSL2 path for Windows
3. **Week 5–8**: Workflow DAG runtime (Dify wrap spike → build-or-wrap decision)
4. **Week 9–14**: Custom musu-bee Agentic Company UI rewrite
5. **Week 15–16**: Cloudflare Tunnel / Tailscale integration + onboarding flow
6. **Week 17–18**: Multi-tenant billing wiring + closed beta

**~18 weeks to product**, vs ~20 weeks of v22 §3.x + additional work
to add workflow + remote-control layers afterward. Option J is **both
faster AND aligned with the killer features**.

### 13.11 What I am still not sure about

- Whether the "audience is non-engineer multi-tenant" assumption from
  §11 is the right audience for musu. The killer features F1+F2+F3
  could equally be sold to engineers as "the K8s-native agentic
  platform you don't have to build."
- Whether Dify / Flowise / LangGraph really cover the agentic-company
  workflow shape, or whether musu needs its own DAG model. Until a
  Dify spike is done, this is speculation.
- Whether K3s on consumer Windows machines is operationally viable at
  scale. The "join your home PC to your workspace" promise is brittle
  if WSL2 doesn't install cleanly.
- Whether "remote control via Cloudflare Tunnel" can be done without
  a custom domain per user (musu.pro/u/userN paths vs userN.musu.pro
  subdomains have different DNS/SSL cost profiles).

These should each be a small (≤1 day) investigation before locking in
the 18-week plan.

### 13.12 Cross-references

- Killer features source: user message 2026-05-15 ("이 제품의 킬러기능 1./2./3.")
- Original P2P invariant (preserved by Option J): `CLAUDE.md` session memory
- musu-bee Paddle billing (extends naturally to per-tenant): `musu-bee/README.md`
- musu-relay role under Option J: redundant if Cloudflare Tunnel covers F3
- §10/§11 still valuable as background on why other options were considered and rejected against the killer features

---

## 14. Product model lock — P2P default + musu.pro paid SaaS + unified UI

User declared the product model (2026-05-15):

> **"P2P가 기본, 유저의 기기끼리 p2p. 외부에서 자신의 시스템에 접속하고 싶으면 그때 musu.pro(유료) — 이게 SaaS. 내부에서 로컬호스트나 데스크탑 앱의 형태랑 웹 SaaS가 같은 UI/UX."**

**Important relation to §13**: §14 does NOT overturn §13. It is the
**business / UX spec-out of F3** ("로컬에서 돌아가고, 외부에서 접속해서
컨트롤이 가능하다") from §13's killer features list. §13 named F1/F2/F3
as the three product north stars; §14 makes F3 precise:

| §13 killer feature | §14 spec-out |
|---|---|
| F1 — 여러 PC를 하나의 워크스페이스로 묶는다 | The mechanism is **P2P between user's own devices**. F1 unchanged |
| F2 — agentic company 다중 에이전트 자동화 | (§14 doesn't restate; F2 unchanged) |
| F3 — 로컬에서 돌고, 외부에서 컨트롤 가능 | **Free tier = LAN-only. Paid tier (musu.pro SaaS) = external access. Same UI/UX both paths.** |

In other words: §13 = "what musu does." §14 = "how musu is priced and
how the UI is structured." Both stand. Re-reading §13 alongside §14
shows F1/F2/F3 are preserved; §14 adds the free/paid line and the UI
parity constraint.

This is the **product-model decision** that §10.5 was forking on.
Resolution 1 (preserve P2P) won, with one critical refinement: **musu.pro is the paid SaaS for external access only**, and **the local UI and the remote SaaS UI must be the same surface**.

### 14.1 What this locks down

| Aspect | Decision |
|--------|----------|
| Default deploy | **P2P** — user's devices talk peer-to-peer; data + compute stay on user's machines |
| Data plane | Never enters musu.pro. relay only mediates control / NAT-pierce |
| musu.pro role | **Paid SaaS for external access**: NAT-pierce + identity + per-tenant URL + billing |
| Local UI | Desktop app or `http://localhost:<port>` web UI on user's primary device |
| Remote UI | `https://<user>.musu.pro` (or equivalent) — **same UI/UX as local** |
| Free tier | Local-only mode. User runs musu, accesses from her own LAN. No musu.pro account needed |
| Paid tier | Adds external access via musu.pro. Same UI, just reachable from anywhere |
| Multi-tenancy on musu.pro | **One tenant = one user's fleet**. Not a multi-tenant cluster; users don't share compute. musu.pro is N parallel single-tenant tunnels |

### 14.2 Architectural consequences

**Local + Remote UI parity** is the load-bearing UX constraint. It rules out architectures where:
- The local view shows one set of features and the SaaS view shows another (Rancher → musu would diverge UI here)
- The remote view is a thin admin console and the local view is the "real" app (Tailscale's pattern — won't match musu)
- Authentication shape differs between local and remote (cookie+session locally vs OIDC remotely → divergent code)

It requires:
- **One Next.js / web app** that runs identically over `localhost:8070` and `<user>.musu.pro`
- **Same auth backend** — local uses local-token bypass, remote uses musu.pro identity proxy; the React app doesn't care
- **Same WebSocket / SSE channel** abstraction — local hits `ws://localhost`, remote hits `wss://<user>.musu.pro/ws` which proxies to the user's bridge

This is **already partially how musu-bee is built** — it talks to musu-bridge via HTTP/SSE. The remote path just needs musu-relay (or Cloudflare Tunnel) to expose the same endpoints under a public URL.

### 14.3 musu.pro = thin relay, NOT a control plane

Critical clarification per the original P2P invariant:

| Thing on musu.pro | Purpose | Stores user data? |
|-------------------|---------|-------------------|
| User account / billing | Identity for SaaS subscription | Email + payment token. Not workspace data |
| Tunnel registration | Maps `<user>.musu.pro` → user's musu-bridge IP via relay | Connection metadata only |
| musu-relay broker | Forwards encrypted WS frames between user's browser and user's bridge | **Passthrough only**; cannot decrypt |
| Optional: agent catalog | "Install marketing-agent" templates | Public catalog; no per-user state |
| Optional: TURN/STUN | NAT-pierce fallback if direct P2P fails | Connection metadata only |

What musu.pro **must NOT** become:
- A central database of user agent state
- A central storage of conversation/chat history
- A control-plane that decides what runs where (the user's bridge does that)
- A cluster operator that owns the K3s/scheduling layer

If musu.pro starts storing workspace state, it has violated the P2P invariant and become a regular SaaS.

### 14.4 How the killer features (§13) survive this lock

| Feature | How it works under §14 model |
|---------|------------------------------|
| **F1 — multi-PC workspace** | User's devices form a P2P mesh (e.g., via Tailscale or direct LAN). One device is the "controller" running musu-bridge + master scheduler. Others join as workers. **musu.pro is not involved in the fleet** — the fleet is the user's own LAN/Tailnet |
| **F2 — multi-agent automation** | Workflow controller + agent dispatch run on user's controller device. Agents execute on workers per F1. Data + outputs stay on user's machines |
| **F3 — remote control** | Free: user accesses controller via `http://localhost` on the controller device, or LAN IP from other devices on her network. **Paid (musu.pro)**: same UI accessed via `https://<user>.musu.pro` from anywhere. The browser opens the same SPA in both cases |

Everything user-facing is **identical**. The only difference between free and paid is **whether you can reach it from outside your network**.

### 14.5 How this changes Option J from §13

Option J said "K3s + custom UI + Cloudflare Tunnel/Tailscale + Paddle billing." Under §14's lock, this refines to:

| Layer | Option J generic | Option J under §14 |
|-------|------------------|-------------------|
| Fleet | K3s clusters user's PCs | Same — K3s under the hood on user's PCs |
| Tunnel | Cloudflare Tunnel OR Tailscale | **musu.pro relay** (existing musu-relay, hardened) for paid users; nothing for free users (LAN-only) |
| UI | Custom musu-bee Agentic Company UI | Same UI accessed via `localhost` (free) or `<user>.musu.pro` (paid) |
| Auth | OAuth/SSO via Rancher etc | Local token (free) + musu.pro identity (paid). React app branches on env, not on path |
| Billing | Paddle on musu-bee | **Paddle for musu.pro subscription only**. Local is free forever |
| Multi-tenancy | Multi-tenant K3s with Rancher | **Per-user single-tenant K3s** on the user's own devices. musu.pro hosts N parallel tunnels, not one shared cluster |

This is a **substantial simplification** of Option J. The K8s multi-tenancy / RBAC / namespace gymnastics from §10 dissolves because **each user has their own private cluster**. musu.pro never needs to do RBAC across user fleets — it only authenticates "is this you, accessing your own fleet?"

### 14.6 Pricing & value-proposition implications

| Tier | Price | What you get | Why it's a fair line |
|------|-------|--------------|----------------------|
| **Free (local)** | $0 | Full product. F1 multi-PC fleet, F2 multi-agent automation. Access via LAN only | User runs entirely on her hardware. musu.pro spends nothing on this user |
| **Paid (musu.pro)** | $X/mo | Same product + external access via `<user>.musu.pro` + identity + (optional: catalog sync, backup, support) | musu.pro carries relay traffic + DNS + SSL + support burden. Real marginal cost per user |

This is **the right product line**. The user pays for what costs musu.pro money (external access infrastructure). The product itself is free because it runs on her hardware and her electricity.

This is also the **right marketing line**: "musu is free forever for your own LAN. Pay only when you want to reach it from outside." That's a story that converts hobbyists into evangelists.

### 14.7 What this means for v22 plan

Re-evaluating v22 §3.x once more under the locked product model:

| §3.x section | Status under §14 |
|--------------|------------------|
| §3.1 events / watch | ⚠️ Useful for local SQLite even without K3s — keep IF Option J is delayed. **If Option J ships in v22.1, this is redundant** |
| §3.2 lease | Same as §3.1 |
| §3.3 API server consensus | ❌ Not needed — single-tenant per user means single-writer per fleet by definition |
| §3.4 spec/status | ⚠️ Useful for musu's own workflow controller (above K3s) — keep |
| §3.5 CEO TOCTOU + generation CAS | ✅ Useful even on top of K3s — workflow controller idempotency |
| §3.6 finalizers + owner refs | ❌ K8s has these |
| §3.7 scheduler upgrades | ❌ kube-scheduler has these (priority, affinity, topology) |
| §3.8 fault injection / soak | ✅ Always useful, applied to workflow controller + musu-bee + relay |
| §3.9 migration roadmap | Rewrite as "v21 monorepo → Option J K3s + relay" |

**Net**: under §14, v22 contracts to §3.5 + §3.8 (plus §3.4 partial). The other 60% transfers to "K3s does that for us."

### 14.8 musu-relay's revised role

§14 makes musu-relay's role precise:

| Today (v21) | Under §14 |
|-------------|-----------|
| Cloud relay broker between bridge and musu.pro | **Identity-aware tunnel terminator on musu.pro** |
| Generic WS forwarder | **Per-user subdomain router** (`<user>.musu.pro` → user's bridge) |
| Lives on Railway | Stays on Railway, but with tighter scope — one job: route `<user>.*` to the right user's tunnel |
| Stateless | Stateless still, but now also authenticates the incoming user before routing |

If Cloudflare Tunnel is adopted instead of/alongside musu-relay, the same role is filled by Cloudflare. Trade-off:

| | musu-relay (own) | Cloudflare Tunnel |
|--|---|---|
| Cost per user | Railway bandwidth | Free up to 50 users, then paid |
| Auth integration | Wire to musu.pro identity ourselves | Cloudflare Access SSO out-of-box |
| Vendor lock-in | None | Cloudflare |
| Custom domains | `<user>.musu.pro` natural | Same — Cloudflare supports custom domains |
| Latency | Single Railway region | Cloudflare's global edge |
| Maintenance | Our code | Their code |

**Honest call**: at MVP scale, musu-relay (existing code) is fine. At >100 paid users, Cloudflare Tunnel becomes operationally cheaper. Plan to dual-support both; let users opt in.

### 14.9 The "same UI local + SaaS" constraint — engineering reality check

This is the most subtle constraint and easy to violate. Common ways to break it:

| Drift cause | Why it happens | How to prevent |
|-------------|----------------|----------------|
| Local has admin features remote shouldn't | "Reset all" button on local; security risk on SaaS | Feature flag by env, but **same UI shell** — the button just doesn't render remotely. Don't ship a separate "admin" build |
| Auth UX divergence | Local has no login; remote needs login | Local has a **trivial auto-login** ("Welcome back, owner of this device") so the page below the auth shell is identical |
| URL shape divergence | Local: `/c/[id]`; remote: `/c/[id]?tenant=<user>` | **Same routes**. Tenant context comes from the host (`<user>.musu.pro`), not the path |
| Real-time channel differs | Local: WebSocket to `ws://localhost:8070/ws`; remote: HTTP-poll because tunnel doesn't support WS | **Make sure tunnel supports WS** (musu-relay does; Cloudflare Tunnel does) |
| State persistence differs | Local: SQLite on disk; remote: SQLite via tunnel feels slow | The bridge is **always** the source of truth. SaaS only adds a network hop |

To enforce parity, the v22.1+ engineering rule: **musu-bee makes no decision based on whether it's on localhost or saas.musu.pro**. All such decisions live in the bridge.

### 14.10 What changes about the existing monorepo

Comparing the 12 packages from `PACKAGE_INVENTORY_2026_05_15.md` against §14:

| Package | Fate under §14 |
|---------|----------------|
| musu-bridge | ✅ Survives — but maybe shrinks once K3s handles scheduling/watch/lease. Becomes the "workflow controller + tenant-of-one API server" |
| musu-core | ✅ Survives — shared lib still useful |
| musu-bee | ✅ Survives — becomes the unified UI for local + SaaS. **Most-impacted package** — needs the "Agentic Company" UX rewrite |
| musu-relay | ✅ Survives with tighter scope — per-user subdomain router + auth proxy |
| musu-control (MCP) | ✅ Survives — Claude Code → bridge stays |
| musu-indexer (MCP) | ✅ Survives — orthogonal |
| musu-ai-detector (MCP) | ✅ Survives — orthogonal |
| musu-worker | ⚠️ Possibly replaced by K3s worker nodes. Today's `/execute/process` RCE endpoint becomes "K3s job spec" |
| musu-supervisor | ⚠️ Possibly replaced by K3s + container images. v21.D Windows AppContainer becomes throwaway IF Option J ships |
| musu-port | ⚠️ K3s services + ingress controller may absorb this. Reevaluate after Option J spike |
| musu-plugin | ✅ Survives — Claude Code packaging |
| musu-writer | ✅ Survives — off the critical path |

**Net**: 8 packages survive intact, 3 partially absorbed by K3s, 1 strongly impacted (musu-bee gets a UX rewrite). The v21.D Windows isolation work has the most exposure to becoming throwaway under Option J.

### 14.11 Concrete v22 plan revision under §14

**Strikethrough = deprecated under §14. Bold = newly added.**

```
v22.0 (4 wks) — "Honest core" (still useful regardless of substrate)
  ✅ §3.5 CEO TOCTOU + generation CAS
  ✅ §3.4 (reduced) generation/observed_generation columns
  ⚠️ §3.1 events table — defer pending Option J decision
  ⚠️ §3.2 lease — defer pending Option J decision

v22.1 (4 wks) — "Option J spike + product-model implementation"
  NEW K3s auto-join installer spike (Linux + macOS first; Windows = WSL2)
  NEW musu-relay rewrite: per-user subdomain routing + auth proxy
  NEW musu-bee local+SaaS parity audit + URL/auth refactor
  ⚠️ §3.6 finalizers — defer pending Option J decision (K8s has them)

v22.2 (4 wks) — "Workflow controller + Agentic Company UI"
  NEW Workflow DAG runtime spike (Dify wrap vs build)
  NEW musu-bee Agentic Company UI rewrite (catalog + workflow + fleet view)
  ✅ §3.8 (reduced) — multi-process race tests + fault injection
                     applied to workflow controller

v22.3 (4 wks) — "Closed beta"
  NEW musu.pro paid-tier wiring (Paddle extension)
  NEW External access via musu-relay or Cloudflare Tunnel
  NEW Onboarding flow: "install desktop app → free local mode → upgrade to paid for remote"
  ⚠️ §3.3 deferred indefinitely — Option J = K3s answers Road C
```

**~16 weeks to closed beta**, lighter than original 14-week §3.x plan + downstream work, and the killer features F1/F2/F3 are all served end-to-end.

### 14.12 What §14 settles vs leaves open

**Settled**:
- ✅ Product model — P2P default, paid SaaS for external access, unified UI
- ✅ musu.pro is a thin tunnel + identity service, NOT a data hub
- ✅ Multi-tenancy is "N parallel single-tenant clusters", NOT one shared cluster
- ✅ §10.5 Resolution 1 (preserve P2P) wins. Resolution 2 (SaaS pivot) rejected
- ✅ Free vs paid line is "LAN only" vs "external access"

**Still open**:
- ⚠️ Whether to adopt K3s (Option J) or stay monorepo (Option B). §14 doesn't pick one. §13.10 leans toward J; §14 makes either viable
- ⚠️ DAG runtime build vs wrap (§13.8)
- ⚠️ Windows host story under K3s (WSL2 vs alternative)
- ⚠️ musu-relay vs Cloudflare Tunnel (§14.8 — supports both, defer choice)

Make the open calls one at a time, with data, not in this doc.

### 14.13 Cross-references

- Product model source: user message 2026-05-15 (this section's epigraph)
- P2P invariant origin: `CLAUDE.md` session memory
- Existing relay: `musu-relay/README.md`
- Existing local UI: `musu-bee/` (Next.js)
- Existing billing: musu-bee's Paddle wiring
- Conflict resolved: §10.5 Resolution 1 vs 2 — definitively Resolution 1

### 14.14 One-line summary

> **musu = local-first agentic-company OS. musu.pro = paid tunnel + identity for reaching your own OS from outside. Same UI either way. Built on K3s (probably) under the hood; user never sees K8s.**

This is the elevator pitch the rest of this SWOT was searching for.

