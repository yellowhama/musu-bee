# V23.4 Phase 4 Master Plan (wiki/431)

**Date**: 2026-05-18
**Wiki ID**: `wiki/431`
**Branch**: `v23/phase4` (NEW; cut off `main` after V23.3+V23.4-Tier-1 main-merge)
**Predecessor**: V23.4 Tier-1 SHIPPED at `08b0c1a` on `v22/gap-analysis` (wiki/429); main-merge OPERATOR-PENDING
**Scope**: V23 master §V23.4 Phase 4 entire body (Fleet view + React Flow editor + AgentWorkflow CRD + Operator + Argo install) + Tier-1 residual cleanup (17 forward-pointers + F-B2-1-FOLLOW-1)
**Successor**: V23.5 closed beta (5 users running multi-PC workflows)

---

## §1 Scope + main-merge precondition

### 1.1 Scope reframing

**V23.4 "Tier-2" in conversation = V23 master §V23.4 Phase 4 ENTIRELY.** V23.4 Tier-1 (wiki/425 → wiki/430) was a 76-LOC security carry from V23.3 Auditor MEDIUMs — NOT a down-payment on Phase 4. Phase 4 is green-field across three dimensions:

1. **Backend control plane**: Argo Workflows install in K3s + AgentWorkflow CRD schema + Go operator (controller-runtime) that watches CRD and translates to Argo Workflow specs.
2. **Frontend user-facing**: Fleet view (list of user's PCs, K8s vocabulary fully hidden) + React Flow workflow editor (drag-connect DAG → POST CRD).
3. **Parity**: same SPA works on `localhost:8070` (local install) AND `<user>.musu.pro` (SaaS).

V23.5 closed beta (V23 master §V23.5) is **fully blocked** on Phase 4 completion — there's no closed beta until users can design + run multi-PC workflows in a UI.

### 1.2 Branch strategy (per user decision OQ-RES-1)

V23.3 + V23.4 Tier-1 (currently stacked on `v22/gap-analysis` HEAD `08b0c1a`) **main-merges FIRST** as a single operator-driven bundle. Then `v23/phase4` is cut off `main`. Rationale: Phase 4 is 6-8 weeks / ~4400 LOC across 3 packages — a clean baseline gives revert-ability per sub-WS; rebasing onto a moving `v22/gap-analysis` over 6 weeks is brittle.

### 1.3 Operator language decision (per user decision OQ-RES-2)

**Go + controller-runtime** for the AgentWorkflow operator. musu-bridge stays Python FastAPI for HTTP/SSE/CRUD; the Go operator runs as a SEPARATE process inside the musu-bridge Pod (or a sibling Pod — T2-B decides). Architectural blast radius noted in §7 R1.

### 1.4 V23.4 Tier-1 precondition status

- V23.4 Tier-1 SHIPPED on `v22/gap-analysis` HEAD `08b0c1a` (wiki/429 final closure)
- 228/228 jest green, tsc clean, pwsh AST clean
- 3 MEDIUMs from V23.3 wiki/391 §4 NEW-MED-1/2/3 closed
- 2 NEW forward-pointers added: F-B2-1-FOLLOW-1 (LOW hatch observability), F-B2-1-FIRST-RUN (INFO operator runbook)
- 17 V23.3 wiki/396 §5 forward-pointers + F-B2-1-FOLLOW-1 = **18 residual items** for T2-Z cleanup
- main-merge OPERATOR-PENDING — gates Phase 4 start

---

## §2 Sub-workstreams

| ID | Scope | File paths | LOC est. | Parallel-with | Const-gates | agent-team | Audit type |
|---|---|---|---|---|---|---|---|
| **T2-A** | Argo Workflows K3s install + AgentWorkflow CRD schema (Group `musu.pro`, Version `v1`, Kind `AgentWorkflow`) + musu-bridge `/api/workflows` CRUD endpoint (Python FastAPI, validates spec + creates CRD via kubernetes client) | `musu-relay/installer/k3s/argo-*.yaml` (Argo manifests, ~5 YAMLs); `musu-bridge/crds/agentworkflow_v1.yaml` (CRD schema); `musu-bridge/workflow_routes.py` (new FastAPI module); `musu-bridge/tests/test_workflow_routes.py` | ~600 (mostly YAML + ~200 Python) | T2-C, T2-Z | **III** (first prod CRD apply); **VI** (Argo install changes K3s baseline); **VII** | YES (cross-domain) | **DUAL**: security-engineer (CRD blast radius + K8s RBAC) + quality-engineer (schema correctness) |
| **T2-B** | Go operator alongside Python musu-bridge: controller-runtime watcher for AgentWorkflow CRD; translates to Argo Workflow spec via `github.com/argoproj/argo-workflows/v3` Go client; status writeback with generation+observedGeneration idempotency; fake K8s client tests; Docker image baked into musu-backend.tar | `musu-operator/` (NEW package — Go module); `musu-operator/main.go`, `musu-operator/controllers/agentworkflow_controller.go`, `musu-operator/api/v1/agentworkflow_types.go`, `musu-operator/Dockerfile`; `musu-relay/installer/k3s/musu-operator-deployment.yaml`; `scripts/build-musu-backend.sh` (add musu-operator image to tar) | ~1200 Go | T2-C, T2-Z (after T2-A ships CRD) | **III** (operator writes CRD status); **VII** | YES (control-plane criticality) | **DUAL**: security-engineer (RBAC + K8s API surface) + quality-engineer (reconcile-loop correctness) |
| **T2-C** | musu-bee Fleet view: new `/fleet` route — list-of-PCs with capacity heat-map; "Add new PC" wizard calls musu-bridge `/api/nodes/pair` (mints join token, QR + copy-paste); replaces `/dashboard` as default landing (`/` → `/fleet`); real-time SSE updates from existing `/api/watch/subscribe`; K8s-vocabulary hiding audit per V23 master :786-799 (Namespace→Company, Pod→Agent, Deployment→Agent group, Node→PC) | `musu-bee/src/app/fleet/page.tsx`, `fleet/FleetClient.tsx`, `fleet/AddPcWizard.tsx`, `fleet/PcCapacityCard.tsx`; `musu-bee/src/app/page.tsx` (redirect to /fleet); `musu-bridge/axis_routes.py` (extend with /api/nodes/pair endpoint if missing); `musu-bee/src/lib/vocabulary-audit.ts` (CI-checkable string lint) | ~800 TS/React | T2-A, T2-B, T2-D, T2-Z | **VII** only (read-mostly) | YES (UI + auth + onboarding) | **Single quality-engineer** (no new auth surface beyond existing token-mint) |
| **T2-D** | musu-bee React Flow workflow editor: add `@xyflow/react` dependency; `/workflows` list + `/workflows/[id]` edit routes; node palette from `/api/agents`; drag-connect edge → POST AgentWorkflow CRD via `/api/workflows`; run/pause/view live execution graph reading Argo workflow status (poll or SSE); **Local+SaaS parity verification** (same SPA on localhost:8070 AND `<user>.musu.pro`) | `musu-bee/package.json` (+@xyflow/react); `musu-bee/src/app/workflows/page.tsx`, `workflows/[id]/page.tsx`, `workflows/[id]/EditorClient.tsx`, `workflows/[id]/NodePalette.tsx`, `workflows/[id]/AgentNode.tsx`, `workflows/[id]/RunPanel.tsx`; `musu-bee/src/lib/workflow-crd.ts` (CRD encode/decode for the editor) | ~1500 TS/React | T2-C, T2-Z (after T2-A + T2-B ship CRD + operator) | **VII** only | YES (cross-domain: UI + API + parity) | **Single quality-engineer** + explicit parity audit (localhost vs SaaS smoke test) |
| **T2-Z** | Tier-1 residual cleanup — 18 items grouped into **6 micro-batches** (Z1-Z6); each batch own wiki ID + closure. Z1: F-B2-1-FOLLOW-1 hatch observability + FO-A1a-1 GIT_SHA OCI label (cheap pair); Z2: F-A1c-1..4 bench tool ergonomics; Z3: F-A1c-5..8 bench schema; Z4: F-A1c-9/10 bridge-bench.sh full §5.6 schema + bench-windows.ps1; Z5: FO-A1a-3 distroless pivot; Z6: FO-A1a-4/5 image trim + FO-A1a-6 plan template post-mortem | per-batch — see §5.Z | ~300 total | parallel with T2-A/B/C/D (orthogonal) | **VII** only per batch | NO per batch (one-page closure precedent from V23.3 B7/B8 + V23.4 F-B2-2) | one-page closure per batch |

Total: ~4400 LOC across 5 sub-WS over ~6-8 weeks.

### 2.1 Architectural decisions to lock at plan time

- **Namespace model (OQ-CRIT-1)**: **1 K8s namespace = 1 musu company**. Created on company-create by musu-bridge (existing `accept_pair` flow extended) — namespace name = `musu-c-{company_id_short}`. Operator (T2-B) gets `Role` per company namespace (NOT `ClusterRole`) — minimal blast radius. Fleet view (T2-C) shows PCs across user's all companies; AgentWorkflow editor (T2-D) is company-scoped at `/c/[company]/workflows/[id]`. AgentWorkflow CRD `metadata.namespace` = company namespace; user picks company before creating workflow.
- **Go operator deployment topology**: musu-operator runs as a SEPARATE K3s Deployment, NOT a sidecar in musu-bridge Pod. Reason: independent restart/rollback; separate ServiceAccount/RBAC; smaller blast radius if operator crashes. (T2-B detail plan locks Pod spec.)
- **CRD API group**: `musu.pro/v1` (matches V23 master §V23.4 :806 "AgentWorkflow CRD").
- **CRD schema location**: `musu-bridge/crds/agentworkflow_v1.yaml` is the source of truth; Go operator generates Go types FROM this YAML via `controller-gen` (NOT the other way around — keeps Python and Go in sync from a single artifact).
- **Argo Workflows version**: **`v3.7.14`** (locked by T2-A Phase 0 Researcher 2026-05-18). v3.5.13 working assumption REJECTED — v3.5 line EOL'd 2025-07-23 per endoflife.date, unpatched against 5+ 2026 High-severity CVEs (GHSA-jcc8-g2q4-9fxq DoS CVSS 8.2; GHSA-3775-99mw-8rp4 strict-mode bypass 8.1; GHSA-3wf5-g532-rcrr podSpecPatch bypass 8.9). v3.7.14 patches all known 2026 advisories. v4.0.5 also viable but requires `--server-side` apply changes to airgap installer; deferred to Q3 2026 backlog upgrade. Criterion (c) 6-month support: borderline — Argo's "2 most recent minors" policy means a v4.1 cut in late 2026 could EOL v3.7; document as RISK and plan v4.0 upgrade workstream.
- **musu-bee routing**: `/` → `/fleet` (default), `/c/[company]/workflows` (list), `/c/[company]/workflows/[id]` (edit). `/dashboard` 301-REDIRECT to `/fleet` for 1 release cycle (per OQ-CRIT-4). `/c/[id]` + `/m/[id]` KEPT (V21.F two-axis views remain for power-user drill-down). nested `/dashboard/company/[id]/chat` MIGRATES to `/c/[id]/chat`.
- **Validation responsibility (OQ-CRIT-3)**: T2-A ships AdmissionWebhook (Python — stays in musu-bridge process). Webhook validates AgentWorkflow spec on `CREATE`/`UPDATE` admission. T2-B operator assumes valid spec; NO defensive validation duty in reconcile loop.
- **musu-pro coordination**: NOT in Phase 4 scope. musu-pro stays at current state for V23.4. V23.5 will add Paddle + `<user>.musu.pro` provisioning.

---

## §3 Sequence + parallelization map

### 3.1 Strict sequence (dependencies)

```
T2-A (CRD schema + Argo install + Python /api/workflows)
  ├─→ T2-B (Go operator — needs CRD schema)
  └─→ T2-D (React Flow editor — needs /api/workflows endpoint)

T2-C (Fleet view) ── independent — uses existing axis_routes + /api/nodes/pair
T2-Z (residual cleanup) ── independent — orthogonal to Phase 4 surface
```

T2-B and T2-D both depend on T2-A. They can run in parallel AFTER T2-A ships (different builders, no shared file surface).

### 3.2 Recommended commit ordering

1. wiki/431 (this master plan) + Critic resolution — single commit on `v23/phase4`
2. **T2-A** Researcher → Planner → Critic → Builder → DUAL-Auditor → audit-fix → Scribe (wiki/432 detail + wiki/436 closure)
3. **Parallel**: T2-B (Researcher → … → Scribe wiki/433 + wiki/437) AND T2-C (Researcher → … → Scribe wiki/434 + wiki/438) — different repos/files, no merge conflict
4. **T2-D** Researcher → … → Scribe (wiki/435 + wiki/439) — depends on T2-A + T2-B both shipped
5. **T2-Z micro-batches** Z1-Z6 — parallel with any of T2-A/B/C/D; ship as time permits
6. V23.4 Phase 4 final closure (wiki/447) + qual eval (wiki/448) + CHANGELOG 1.12.0 + V23 master §V23.4 SHIPPED hook

### 3.3 No parallel Builders within a single sub-WS

Per MODE_Agent_Team.md token-budget guardrails: 1 Builder per sub-WS sequence. Cross-sub-WS parallelism (T2-B Builder + T2-C Builder simultaneously) is allowed because they touch different repos.

### 3.4 Estimated timeline (revised per C-10 — main-merge ≠ Critic resolution week)

| Week | Activity |
|---|---|
| W1 | Operator main-merge (fly secrets + deploy + smoke + A1.c bench EXECUTION + 진행해 + git merge); 2-PC gate test rig confirmation (§9.A) |
| W2 | wiki/431 Critic resolution (this doc's §11 finalization); `v23/phase4` branch cut; T2-A Researcher + Planner |
| W3 | T2-A Critic + Builder start |
| W4 | T2-A DUAL-audit + audit-fix + Scribe → SHIP (Const III + VI gates) |
| W5-6 | T2-B (Go operator) Builder + DUAL-audit — IN PARALLEL with T2-C (Fleet view) Builder + audit |
| W7 | T2-B + T2-C both ship; T2-D Builder start (T2-A+B both shipped, dependency satisfied) |
| W8 | T2-D Builder + audit + parity verification |
| W9 | T2-Z micro-batches Z1-Z5 finalize (Z1-Z2 may have shipped earlier in parallel through W3-W8); V23.4 Phase 4 final closure + qual eval; CHANGELOG 1.12.0; main-merge gate |

Buffer: W10-W11 for audit-fix cascades. Total: 9 weeks core + 2 buffer = 11 weeks max. Matches V23 master §3 :957 +30% slip acknowledgment.

---

## §4 Constitution gates predicted

| Gate | Prediction | Reasoning + mitigation |
|---|---|---|
| **Const III** (schema apply) | **TRIGGERED on T2-A** | First AgentWorkflow CRD apply to production K3s = schema-shape event. Requires explicit operator "진행해" per Const III. T2-A detail plan documents the apply workflow (dry-run first, then `kubectl apply -f agentworkflow_v1.yaml`). T2-B operator status writes (`UPDATE status.observedGeneration`) are normal CRD operations, NOT schema events — III not re-triggered. |
| **Const VI** (experiment) | **TRIGGERED on T2-A** | Argo Workflows install changes K3s startup time + memory baseline. V23.3 A1.c bench harness (`installer/bridge-bench.sh` + `installer/bench-pod.yaml`) is the load-bearing measurement tool here — re-run with/without Argo install and compare. If regression >30% on any of (Pod cold-start time, in-cluster bridge req latency p95, K3s memory baseline), block ship and reconsider. |
| **Const VII** (push) | **Per-push ACTIVE**; **main-merge gate at Phase 4 close** | Every commit push on `v23/phase4` satisfies per-push. Main-merge at Phase 4 close = single operator "진행해" event with the whole bundle. T2-D parity verification is a hard gate for main-merge (no parity = no main-merge). |
| **Pre-Phase 4** | Operator main-merge of V23.3 + V23.4 Tier-1 to `main` (gates Phase 4 start) | (a) `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1`, (b) `fly deploy`, (c) curl smoke 204/400/429, (d) A1.c bench EXECUTION on Windows (captures Const VI baseline numbers per §4.1), (e) confirm 2-PC gate test rig exists per §9.A (deferred check before T2-D Builder spawn but operator may pre-confirm here), (f) Const VII "진행해", (g) `git merge v22/gap-analysis → main` |

### §4.1 Const VI baseline + threshold (resolves C-05)

V23.3 wiki/396 / wiki/385 documented the A1.c bench harness but **did not capture absolute baseline numbers** (only the pre-cutover infrastructure). Phase 4 Const VI gate requires concrete numbers. Resolution:

- **T2-A pre-flight (BEFORE Argo install)**: operator runs `installer/bridge-bench.sh 3` against current `main`-HEAD K3s + musu-bridge. Captures: (1) Pod cold-start time (s), (2) in-cluster bridge req latency p95 (ms), (3) K3s memory baseline (MiB). Numbers logged to `wiki/432` (T2-A detail plan) §"Pre-flight baseline".
- **T2-A post-Argo install**: same bench re-run after Argo Workflows install. Logged to wiki/436 closure §"Const VI bench".
- **Threshold**: post-Argo numbers MUST be ≤ baseline × 1.30 on each of the three metrics. Violations → operator-gated decision: (a) accept regression with explicit "진행해", (b) downgrade to "Argo minimal" (T2-A detail plan defines = ArgoWorkflow controller without Argo Server UI, ~40% smaller install), or (c) block T2-A close and re-architect.
- **Recovery path documented in T2-A detail plan** wiki/432 §"Const VI rollback" — `kubectl delete -f argo-*.yaml` is fully reversible at T2-A close; subsequent T2-B/C/D depend on Argo so block until Const VI passes.

---

## §5 Sub-WS specs (concise)

### §5.A T2-A: Argo install + CRD schema + /api/workflows CRUD

**Files touched**:
- `musu-relay/installer/k3s/argo-workflows-install.yaml` (NEW — Argo install manifest, includes ServiceAccount + ClusterRole + Workflow CRD itself)
- `musu-relay/installer/k3s/argo-controller-deployment.yaml` (NEW)
- `musu-bridge/crds/agentworkflow_v1.yaml` (NEW — `musu.pro/v1` AgentWorkflow CRD definition; spec = `agents: [{id, image, command, resources}]`, `edges: [{from, to, condition}]`)
- `musu-bridge/workflow_routes.py` (NEW FastAPI module — POST/GET/DELETE /api/workflows; uses `kubernetes` Python client to create AgentWorkflow CRDs)
- `musu-bridge/server.py` (1-line `app.include_router(workflow_routes.router)`)
- `musu-bridge/tests/test_workflow_routes.py` (NEW — 6-10 cases: create / list / get / 404 / invalid spec / RBAC fail)
- `musu-bridge/pyproject.toml` (add `kubernetes-asyncio>=32.0.0` — async client, NOT sync `kubernetes` which would block FastAPI event loop; T2-A Researcher 2026-05-18 verified musu-bridge has no kubernetes lib today)
- `musu-bridge/workflow_routes.py` + lifespan integration in `server.py` (CustomObjectsApi initialized once at startup, reused per-request — per Researcher R3b pattern)

**Argo Workflows version**: pin **v3.5.13** (latest stable at 2026-05-18). Detail plan re-verifies at Builder time.

**CRD schema sketch — v1 FULL per OQ-CRIT-2** (detail plan wiki/432 expands):
```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: agentworkflows.musu.pro
spec:
  group: musu.pro
  scope: Namespaced
  names:
    plural: agentworkflows
    singular: agentworkflow
    kind: AgentWorkflow
    shortNames: [aw]
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          required: [spec]
          properties:
            spec:
              type: object
              required: [agents, edges]
              additionalProperties: false
              properties:
                agents:
                  type: array
                  minItems: 1
                  items:
                    type: object
                    required: [id, image]
                    additionalProperties: false
                    properties:
                      id: {type: string, pattern: "^[a-z][a-z0-9-]{0,62}$"}
                      image: {type: string}
                      command: {type: array, items: {type: string}}
                      nodeSelector:
                        type: object
                        additionalProperties: {type: string}
                        description: "Which PC runs this agent. e.g. {musu.pro/pc: laptop-1}"
                      timeoutSeconds: {type: integer, minimum: 1, maximum: 86400, default: 3600}
                      retry:
                        type: object
                        additionalProperties: false
                        properties:
                          limit: {type: integer, minimum: 0, maximum: 10, default: 0}
                          backoffSeconds: {type: integer, minimum: 1, default: 30}
                      resources:
                        type: object
                        additionalProperties: false
                        properties:
                          cpu: {type: string, description: "K8s CPU request, e.g. 500m"}
                          memory: {type: string, description: "K8s memory request, e.g. 512Mi"}
                      inputs:
                        type: array
                        items:
                          type: object
                          required: [name, from]
                          properties:
                            name: {type: string}
                            from: {type: string, description: "Source agent id"}
                      outputs:
                        type: array
                        items:
                          type: object
                          required: [name]
                          properties:
                            name: {type: string}
                edges:
                  type: array
                  items:
                    type: object
                    required: [from, to]
                    additionalProperties: false
                    properties:
                      from: {type: string}
                      to: {type: string}
                      condition: {type: string, enum: [succeeded, failed, always], default: succeeded}
            status:
              type: object
              properties:
                observedGeneration: {type: integer}
                phase: {type: string, enum: [Pending, Running, Succeeded, Failed]}
                argoWorkflowRef: {type: string}
                conditions:
                  type: array
                  items:
                    type: object
                    required: [type, status]
                    properties:
                      type: {type: string}
                      status: {type: string, enum: ["True", "False", "Unknown"]}
                      lastTransitionTime: {type: string, format: date-time}
                      reason: {type: string}
                      message: {type: string}
                agentStatuses:
                  type: array
                  description: "Per-agent execution status (mirror Argo task statuses)"
                  items:
                    type: object
                    properties:
                      id: {type: string}
                      phase: {type: string}
                      startedAt: {type: string, format: date-time}
                      finishedAt: {type: string, format: date-time}
                      message: {type: string}
      subresources:
        status: {}
```

`metadata.finalizers` is K8s built-in (no schema declaration needed). T2-B operator adds `musu.pro/agentworkflow-finalizer` on CREATE so it can clean up Argo Workflow on DELETE before allowing GC.

**AdmissionWebhook (per OQ-CRIT-3)**:
- Endpoint: `https://musu-bridge.musu-system.svc:443/admit/agentworkflows`
- Validates: (1) `agents[].id` uniqueness within spec, (2) `edges[].from`/`.to` reference existing agent ids, (3) no edge cycles (topological sort succeeds), (4) `inputs[].from` references valid agent id with matching `outputs[].name`, (5) nodeSelector keys conform to musu label namespace (`musu.pro/*`).
- Failure → `denied: true` with human-readable `message`; React Flow editor surfaces.

**Const III workflow** (operator-gated): T2-A detail plan provides 5-step apply checklist (dry-run kubectl → review diff → apply → verify CRD presence → smoke POST via /api/workflows).

**Const VI bench**: run A1.c harness (`installer/bridge-bench.sh 3`) BEFORE + AFTER Argo install; document delta in wiki/436 closure §"Const VI bench".

**Dual-audit seeds**:
- security-engineer: CRD validation rules (preventing privilege escalation via crafted spec), Argo ServiceAccount permission scope, /api/workflows authentication (must reject anon).
- quality-engineer: schema correctness (round-trip via kubernetes client), error handling on malformed spec, /api/workflows idempotency (POST same name → 409 not 500).

**Wiki**: wiki/432 detail + wiki/436 closure.

**Phase 0 Researcher findings carried into T2-A detail plan (2026-05-18)**:
- Argo `v3.7.14` PIN (NOT v3.5.13 per master plan §2.1 update). 5+ 2026-High CVEs unpatched in v3.5; v3.7.14 patches all. v4.0.5 viable but requires `--server-side` apply rework — deferred.
- `kubernetes-asyncio>=32.0.0` (NOT sync `kubernetes`) — bridge is FastAPI async, sync client blocks event loop. CustomObjectsApi initialized in lifespan, reused.
- **CRD YAML = source of truth**; T2-B Go types mirror via `controller-gen` markers; `make verify-crd` CI guard catches drift. T2-A Builder MUST run `kubectl apply --dry-run=server -f crd.yaml` against real K3s before commit.
- **AdmissionWebhook TLS**: `kube-webhook-certgen` one-shot Job (NOT cert-manager — adds ~200MB to airgap). Dual-port uvicorn: 8070 HTTP (existing, Bearer-auth) + 8443 HTTPS (webhook only, mTLS from kube-apiserver). `/admit/agentworkflows` added to `bypass_path_prefixes` at `server.py:1035` (mTLS is the auth, NOT Bearer).
- `failurePolicy: Fail` (block CRD apply if webhook is down — safer; documented in runbook).
- Route convention: `/api/workflows` (NOT `/api/admin/workflows` — workflows are user-facing not admin-only).
- CRD schema gotchas avoided in Researcher's R3a draft: no `default` on `required` fields, no root-level `additionalProperties: false` (blocks kubectl labels), `enum` only on simple scalars, `subresources.status: {}` declared for finalizer-aware status updates.

### §5.B T2-B: Go operator (AgentWorkflow → Argo translation)

**New package**: `musu-operator/` at repo root (NEW Go module).

**Files**:
- `musu-operator/go.mod` + `go.sum`
- `musu-operator/main.go` (NEW — manager bootstrap)
- `musu-operator/api/v1/agentworkflow_types.go` (NEW — Go struct generated from CRD YAML via `controller-gen`)
- `musu-operator/api/v1/zz_generated_deepcopy.go` (generated)
- `musu-operator/controllers/agentworkflow_controller.go` (NEW — reconcile loop: read CRD spec → build Argo Workflow → apply → write status)
- `musu-operator/controllers/agentworkflow_controller_test.go` (NEW — controller-runtime fake client tests; ~10 cases)
- `musu-operator/Dockerfile` (NEW)
- `musu-operator/Makefile` (NEW — generate, build, test, docker-build)
- `musu-relay/installer/k3s/musu-operator-deployment.yaml` (NEW — K3s Deployment for operator with ServiceAccount + **per-namespace Role** for AgentWorkflow + Argo Workflow CRUD per OQ-CRIT-1; ClusterRole NOT used)
- `musu-relay/installer/k3s/musu-operator-rbac-template.yaml` (NEW — Role + RoleBinding template; one applied per company namespace at company-create time)
- `scripts/build-musu-backend.sh` (EDIT — add musu-operator OCI image to tar bundle)
- `installer/validate-import.ps1` (EDIT per C-07 — expect 2 OCI images in tar bundle now: musu-bridge + musu-operator)
- `.github/workflows/musu-operator-ci.yml` (NEW per C-16 — Go test + `golangci-lint` + envtest CI stage; ~100 LOC bootstrap)
- `musu-operator/.golangci.yml` (NEW — lint config)
- `musu-operator/hack/envtest-setup.sh` (NEW — installs `setup-envtest` for controller integration tests)

Revised LOC: ~1300 Go (was ~1200; +100 for CI bootstrap per C-16).

**Key reconcile flow** (expanded per C-03 — handles CREATE/UPDATE/DELETE/crash-recovery):
```
Finalizer name: musu.pro/agentworkflow-finalizer

On AgentWorkflow reconcile event:
  1. If metadata.deletionTimestamp NOT set (CREATE or UPDATE path):
       a. If finalizer NOT in metadata.finalizers → add it, requeue (single PATCH)
       b. Check status.observedGeneration vs metadata.generation
          - if equal → nothing changed, return (idempotent no-op)
       c. Build Argo Workflow from spec (DAG template, one task per agent,
          dependencies from edges, container image/command/resources,
          nodeSelector mapped to k8s node affinity, timeout/retry as
          Argo activeDeadlineSeconds/retryStrategy)
       d. Apply Argo Workflow with ownerReferences pointing to AgentWorkflow
          (so K8s GC cascade works) AND metadata.name derived from
          AgentWorkflow.metadata.{namespace,name,generation} (deterministic)
       e. Patch AgentWorkflow status:
          - argoWorkflowRef = <Argo workflow name>
          - phase = "Pending"
          - observedGeneration = metadata.generation
       f. Return (no requeue — next reconcile triggers from Argo status change)

  2. If metadata.deletionTimestamp IS set (DELETE path):
       a. If finalizer NOT in metadata.finalizers → already cleaned, return
       b. Look up Argo Workflow by status.argoWorkflowRef
          - if found → delete it (kubectl delete; idempotent)
          - if not found → already gone (operator crashed mid-delete in
            prior reconcile; treat as success)
       c. Wait for Argo Workflow deletion (poll up to 30s) OR proceed
          immediately if K8s GC handles cascade (preferred — Argo Workflow
          has ownerReference, K8s removes it on AgentWorkflow delete)
       d. Remove finalizer from AgentWorkflow.metadata.finalizers (PATCH)
       e. K8s GC then removes the AgentWorkflow object itself

On Argo Workflow status change (triggered by controller-runtime watch):
  1. Find owning AgentWorkflow via Argo Workflow ownerReferences
  2. Map Argo phase → AgentWorkflow.status.phase:
       Argo Pending/Running → AgentWorkflow Pending/Running
       Argo Succeeded → AgentWorkflow Succeeded
       Argo Failed/Error → AgentWorkflow Failed
  3. Populate status.agentStatuses[] from Argo task statuses
  4. Patch AgentWorkflow status (SSA — server-side apply, no conflict)

Error handling:
  - Transient K8s API errors → exponential backoff (controller-runtime
    default rate limiter: 5ms → 1000s, max retries unbounded)
  - Argo unavailable (CRD missing or namespace gone) → exponential backoff
    + log error; never deadlock
  - Spec invalid (should not happen post-AdmissionWebhook) → set
    status.phase = "Failed" + status.conditions[].reason = "InvalidSpec"
    + return without requeue
```

**Idempotency invariants**:
- Reconcile MUST be idempotent given ANY partial prior state (post-crash recovery property).
- generation+observedGeneration is the CAS handle per v22 §3.5.
- Argo Workflow name is deterministic from AgentWorkflow {namespace,name,generation} — re-apply is no-op.
- Finalizer add/remove is single-PATCH atomic.

**RBAC (Role per company namespace, NOT ClusterRole — per OQ-CRIT-1 namespace model)**:
- `agentworkflows.musu.pro` get/list/watch/update/patch (in company namespace)
- `agentworkflows.musu.pro/status` patch (subresource)
- `agentworkflows.musu.pro/finalizers` update (for finalizer add/remove)
- `workflows.argoproj.io` get/list/watch/create/update/delete (in company namespace)
- `pods` + `events` get/list/watch (for status enrichment)
- NO secrets access. NO cross-namespace access. NO cluster-scoped resources.

**Dual-audit seeds**:
- security-engineer: ClusterRole scope (operator should NOT have cluster-admin; minimum needed = AgentWorkflow CRUD + Argo Workflow CRUD + read pods/events); container image vulnerability scan.
- quality-engineer: reconcile-loop correctness (test create, update, delete, recover-from-crash, argo-status-propagation); race conditions on concurrent updates.

**Wiki**: wiki/433 detail + wiki/437 closure.

### §5.C T2-C: Fleet view UI

**Files** (revised per OQ-CRIT-4 — retire dashboard with 301 redirect, NOT delete):
- `musu-bee/src/app/fleet/page.tsx` (NEW — Next.js page, SSR shell)
- `musu-bee/src/app/fleet/FleetClient.tsx` (NEW — client component, useEffect + SSE)
- `musu-bee/src/app/fleet/AddPcWizard.tsx` (NEW — modal wizard, calls `POST /api/admin/pair/accept` via musu-bee `/api/bridge/[...path]` proxy; T2-A Researcher confirmed actual mounted URL at `musu-bridge/system_routes.py:94` — NOT `/api/nodes/pair` as master plan originally said. Request body: `{name, url, agents, version}`; response: `{success, node_name}`)
- `musu-bee/src/app/fleet/PcCapacityCard.tsx` (NEW — per-PC card with capacity heat-map)
- `musu-bee/src/app/page.tsx` (EDIT — redirect `/` → `/fleet`)
- `musu-bee/src/middleware.ts` (EDIT — add `/dashboard*` → `/fleet*` 301 redirect rule; preserves deep-link mapping `/dashboard/company/[id]/chat` → `/c/[id]/chat`)
- `musu-bee/src/app/dashboard/` (KEEP for 1 release cycle as 301 stub — Next.js automatically 308s via middleware; actual page.tsx becomes `redirect("/fleet")`)
- `musu-bee/src/app/app/dashboard/` (SAME treatment — second dashboard tree)
- **10-file reference audit** (per C-04 evidence): update `middleware.ts`, `DashboardClient.tsx`, `ConsoleSidebar.tsx`, `CommandPalette.tsx`, `dashboard/company/[id]/chat/page.tsx`, + 5 other importers (T2-C Researcher enumerates in wiki/434 §"Dashboard reference audit"). Sidebar nav swap (Dashboard → Fleet); CommandPalette entry swap; deep-link migration.
- `musu-bridge/system_routes.py:94` (existing `accept_pair` mount at `POST /api/admin/pair/accept` — NO change needed; wizard reuses existing endpoint)
- `musu-bee/src/lib/vocabulary-audit.ts` (NEW — CI lint: grep user-facing strings for `Pod|Deployment|Namespace|kubectl|ClusterRole|Helm`; CI fails on match)
- `musu-bee/__tests__/vocabulary-audit.test.ts` (NEW — Jest test that fails if banned vocabulary appears in `app/` strings)

LOC delta revised: ~1000 (was ~800; +200 for retire-with-redirect migration of 10 files).

**Fleet view UX** (per V23 master §Phase 4 :803-810):
- Top: "Your PCs" header + "Add new PC" button
- List of `PcCapacityCard`s:
  - PC name (user-given) + OS icon + status dot (online/offline)
  - "8 cores · 16 GB · 3 agents running" capacity strip
  - "View →" link to `/m/[machine_id]` (existing V21.F page)
- Empty state: "No PCs yet" + prominent "Add new PC" CTA
- "Add new PC" wizard:
  1. Step 1: "Name this PC" (text input)
  2. Step 2: Mint join token via `/api/nodes/pair` → display QR code + copy-paste install command
  3. Step 3: "Waiting for PC to connect..." with SSE poll on `/api/watch/subscribe?table=machines`
  4. Step 4: Success → return to Fleet view with new PC card

**K8s-vocabulary audit table** (per V23 master :786-799):
| K8s term | musu term | Surface |
|---|---|---|
| Pod | Agent | UI strings, route params |
| Deployment | Agent group | UI strings (if used) |
| Namespace | Company | UI strings, route params |
| Node | PC | UI strings |
| kubectl | (hidden, never user-facing) | CLI references removed |
| ClusterRole | (hidden) | Settings page if any |

**Wiki**: wiki/434 detail + wiki/438 closure.

### §5.D T2-D: React Flow workflow editor

**Files**:
- `musu-bee/package.json` (EDIT — add `@xyflow/react ^12.x`)
- `musu-bee/src/app/workflows/page.tsx` (NEW — list of user's AgentWorkflows)
- `musu-bee/src/app/workflows/[id]/page.tsx` (NEW — editor SSR shell)
- `musu-bee/src/app/workflows/[id]/EditorClient.tsx` (NEW — React Flow canvas)
- `musu-bee/src/app/workflows/[id]/NodePalette.tsx` (NEW — left sidebar with agent templates)
- `musu-bee/src/app/workflows/[id]/AgentNode.tsx` (NEW — custom React Flow node component)
- `musu-bee/src/app/workflows/[id]/RunPanel.tsx` (NEW — right sidebar with Run/Pause/Logs)
- `musu-bee/src/lib/workflow-crd.ts` (NEW — encode React Flow graph → AgentWorkflow CRD spec; decode CRD → graph)
- `musu-bee/src/app/api/workflows/route.ts` (NEW — proxies to musu-bridge `/api/workflows`)
- `musu-bee/__tests__/workflow-crd.test.ts` (NEW — encode/decode round-trip)
- `musu-bee/__tests__/workflows-editor.spec.ts` (NEW — Playwright: drag node, connect edge, save, run)

**Editor UX**:
- Left sidebar: NodePalette (agent templates from `/api/agents`)
- Center: React Flow canvas (nodes = agents, edges = data flow)
- Right sidebar (collapsed by default): RunPanel showing live execution status (poll Argo Workflow status via musu-bridge)
- Top toolbar: Save, Run, Pause, Delete

**Run flow**:
1. User clicks "Save" → frontend encodes React Flow graph to CRD spec → POST `/api/workflows` → musu-bridge creates AgentWorkflow CRD → T2-B operator picks up and creates Argo Workflow
2. User clicks "Run" → frontend sets `spec.action: "run"` or POSTs `/api/workflows/[id]/run` → operator triggers Argo
3. RunPanel polls `/api/workflows/[id]/status` every 2s (or SSE) → updates node colors (pending=gray, running=blue, success=green, failed=red)

**Parity verification** (hard gate per V23 master §Phase 4 :810 "Local + SaaS UI parity"):
- Same SPA bundle on `localhost:8070` (local install) AND `<user>.musu.pro` (musu-pro production)
- Detail plan provides smoke checklist: create same workflow on both → verify same CRD spec generated → verify both run via respective K3s clusters
- Documented in wiki/439 closure §"Parity verification"

**Wiki**: wiki/435 detail + wiki/439 closure.

### §5.Z T2-Z: Tier-1 residual cleanup (6 micro-batches)

18 items (17 from wiki/396 §5 + F-B2-1-FOLLOW-1 from wiki/426). Grouped:

| Batch | Items | LOC est. | Wiki | Audit |
|---|---|---|---|---|
| **Z1** | F-B2-1-FOLLOW-1 (sweeper hatch observability `console.log` on short-circuit + `/health` flag) + FO-A1a-1 (GIT_SHA OCI label derivation move) | ~20 | wiki/440 detail+closure | one-page |
| **Z2** | F-A1c-1, F-A1c-2, F-A1c-3, F-A1c-4 (bench tool ergonomics: arg parsing, output dir, color, retry) | ~50 | wiki/441 | one-page |
| **Z3** | F-A1c-5, F-A1c-6, F-A1c-7, F-A1c-8 (bench schema: JSON output, summary stats, comparison mode, sampling) | ~70 | wiki/442 | one-page |
| **Z4** | F-A1c-9 (bridge-bench.sh full §5.6 schema) + F-A1c-10 (bench-windows.ps1 peer) | ~80 | wiki/443 | one-page |
| **Z5** | FO-A1a-3 (distroless chainguard/python pivot) | ~30 | wiki/444 | one-page |
| **Z6** | FO-A1a-4 (K3s airgap-images trim) + FO-A1a-5 (Alpine runtime trim) + FO-A1a-6 (plan template post-mortem write-up) | ~40 | wiki/445 (single — see §6) | one-page |

**F-B2-4 (conditional per-IP rate-limit) — reactivation criteria** (resolves C-17):
Excluded from T2-Z. Re-evaluate when any of:
- (a) ≥3 abuse incidents observed in Fly logs in any 30-day window, OR
- (b) closed-beta cohort exceeds 5 users (V23.5+ trigger), OR
- (c) explicit operator request.

Z batches are orthogonal to T2-A/B/C/D; parallel-eligible throughout Phase 4. Sequence priority: Z1 → Z2 → Z3 → Z4 (bench schema dependency: Z4 reuses Z3 schema, sequenced after); Z5 → Z6 sequenced (distroless pivot precedes image trim).

---

## §6 Wiki-ID reservations

| Wiki | Purpose |
|---|---|
| wiki/431 | This master plan |
| wiki/432 / 436 | T2-A detail / closure |
| wiki/433 / 437 | T2-B detail / closure |
| wiki/434 / 438 | T2-C detail / closure |
| wiki/435 / 439 | T2-D detail / closure |
| wiki/440 | T2-Z Z1 (hatch obs + GIT_SHA) |
| wiki/441 | T2-Z Z2 (bench ergonomics) |
| wiki/442 | T2-Z Z3 (bench schema) |
| wiki/443 | T2-Z Z4 (bench-windows.ps1 + full §5.6) |
| wiki/444 | T2-Z Z5 (distroless pivot) |
| wiki/445 | T2-Z Z6 (image trim + plan template post-mortem; single doc with sub-headings — collapsed per C-09) |
| wiki/446 | reserved for V23.5 prep (freed by Z6 consolidation) |
| wiki/447 | V23.4 Phase 4 final closure |
| wiki/448 | V23.4 Phase 4 qualitative evaluation |
| wiki/449+ | reserved for V23.5 prep |

---

## §7 Risks + mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| **R1** | **Go + Python two-language maintenance burden** — musu-bridge stays Python FastAPI while musu-operator is new Go service. Two build chains, two test suites, two deploy pipelines. | HIGH | (a) musu-operator surface area kept MINIMAL (reconcile loop only; no HTTP API); (b) CRD schema YAML is single source of truth, Python and Go both read it; (c) musu-operator Dockerfile follows musu-bridge Dockerfile pattern for ops consistency; (d) Go is industry-standard for K8s operators — `controller-runtime` ecosystem is mature, fewer surprises than Python+pykube custom loop |
| **R2** | **Argo Workflows install changes K3s baseline** — startup time + memory + readiness. Could regress prior V23.3 A1.b/A1.c benchmarks. | MED | Const VI bench gate at T2-A close (re-run `bridge-bench.sh 3` with Argo installed; document delta in wiki/436 §"Const VI bench"). If regression >30%, block ship and reconsider (downgrade to Argo "lite" or smaller install). |
| **R3** | **6-8 week long-running branch → main divergence** | MED | Each sub-WS close: rebase `v23/phase4` onto `main` + run smoke. If main has nothing new (likely — main is quiet during Phase 4), rebase is no-op. If main has hotfix, resolve at sub-WS-close cadence not at Phase 4 close. |
| **R4** | **tldraw vs React Flow co-existence on musu-bee** — both libraries in package.json, two mental models for users | LOW | Boundary documentation in wiki/435 §"Editor scope": tldraw stays for `/c/[id]` company canvas (freeform whiteboard); React Flow exclusive to `/workflows/[id]` (DAG editor). T2-D detail plan explicitly disallows migrating tldraw routes to React Flow. |
| **R5** | **Local + SaaS UI parity drift** — same SPA bundle, but env-specific config could diverge silently | MED | T2-D mitigation (rewritten per C-08): (a) **CI lint** forbids hostname literals (`musu.pro`, `localhost`, IP literals) in `musu-bee/src/app/**` — fails CI on match; (b) **Parity smoke** = automated Playwright scenario `workflows-editor.spec.ts` runs same flow on both targets, byte-compares emitted CRD JSON via fixture; (c) **Runtime config endpoint** `/api/config` returns env-specific values (bridge URL, signaling URL, feature flags) — bundle MUST NOT import `process.env.NEXT_PUBLIC_*` directly for runtime decisions; (d) wiki/439 closure §"Parity verification" records both smoke run outputs verbatim. |
| **R6** | **K8s-vocabulary leakage detection** — UI strings could leak "Pod" or "kubectl" | MED | CI grep rule on `musu-bee/src/app/**/*.tsx` for banned vocabulary (`musu-bee/src/lib/vocabulary-audit.ts` + Jest test). Fails CI if `Pod`, `Namespace`, `Deployment`, `ClusterRole`, `kubectl`, `Helm` appears in user-facing strings. T2-C delivers this lint. |
| **R7** | **CRD schema breakage from Argo version updates** — pinning Argo v3.5.13 today; what about Argo v3.6+? | LOW | AgentWorkflow CRD is OUR schema, decoupled from Argo's Workflow CRD. T2-B operator translates between them. If Argo schema changes, only the translator updates — AgentWorkflow stays stable. V23.5+ Argo upgrade has its own plan. |
| **R8** | **Operator RBAC over-privilege** — controller-runtime default Role can be too broad | HIGH (security) | Dual-audit security-engineer seed mandates ClusterRole inspection. Operator gets MINIMUM perms: AgentWorkflow CRUD in user namespaces only + Argo Workflow CRUD in user namespaces only + read pods/events. NO cluster-admin, NO secrets access. |
| **R9** | **Phase 4 timeline slip** (V23 master :957 acknowledges +30% likely) | MED | Each sub-WS closure tracks actual vs estimate; Phase 4 final closure (wiki/447) records cumulative slip with reasoning. If W8 hit without T2-D shipping, slip W9-W10 buffer. If still not shipped at W10, escalate scope-cut decision (e.g., defer parity audit to V23.5). |

---

## §8 Scope NOT included

- **V23.5 closed beta items**: Paddle plan + `<user>.musu.pro` provisioning + signaling control plane DNS routing — entire V23.5 master plan (TBD wiki/449+).
- **musu-pro side changes** (F:\Aisaak\Projects\musu-pro): NOT in Phase 4 scope. musu-pro stays at current Next.js 16 state. V23.5 will coordinate musu-pro changes via cross-repo planning.
- **musu-worker / musu-supervisor / musu-port retirement**: V23 master §2 marks these for retirement at Phase 4 close. Plan: single "package retirement" commit at Phase 4 final close (wiki/447), removing the directories. NOT a separate sub-WS.
- **V21.A controller-pattern branch fold-in**: Researcher recommendation (R2.3) — treat as throwaway. Phase 4 uses Go controller-runtime fresh, NOT a port of V21.A Python ABC.
- **Spike-demo cleanup** (`src/app/spike-demo/`): V23.2 demo page; not user-facing; can stay or be removed at Phase 4 close (decision deferred).
- **V23.1-V23.3 operator-pending items beyond main-merge**: should have been resolved at main-merge time (per §4 row 4). If anything residual, Phase 4 inherits at start.
- **Offline-PC display in Fleet view (per C-15)**: V23.5 scope (requires signaling control plane integration). T2-C Fleet view shows ONLINE PCs only (PCs with active SSE connection on `/api/watch/subscribe`); offline PCs appear after grace period in V23.5.

---

## §9 Acceptance criteria for V23.4 Phase 4 closure

1. ✅ T2-A SHIP-OK with dual-audit (wiki/436 closure exists; CRD applied to prod via Const III gate)
2. ✅ T2-B SHIP-OK with dual-audit (wiki/437 closure exists; Go operator running in K3s, status writeback verified end-to-end)
3. ✅ T2-C SHIP-OK with single quality-engineer audit (wiki/438 closure exists; Fleet view live at `/fleet`; K8s-vocabulary lint passing)
4. ✅ T2-D SHIP-OK with single quality-engineer audit + parity verification (wiki/439 closure exists with §"Parity verification" populated)
5. ✅ T2-Z Z1-Z6 all SHIP-OK (wiki/440-446 closures exist)
6. ✅ `npx jest` green in musu-bee + musu-bridge (Python pytest) + musu-relay
7. ✅ `npx tsc --noEmit` clean across all 3 TS packages
8. ✅ `go test ./...` + `go vet ./...` clean in musu-operator
9. ✅ **End-to-end gate test** (matches V23 master §V23.3 :929-933 phrasing): user creates 3-step DAG in musu-bee `/workflows` editor → workflow runs across 2 PCs (research on PC1, write on PC2, review on either) → results visible in RunPanel
10. ✅ Const III gate satisfied for first AgentWorkflow CRD prod apply (operator "진행해")
11. ✅ Const VI gate satisfied: A1.c bench harness shows no regression >30% after Argo install (or, if regression, accepted by operator with explicit "진행해")
12. ✅ Const VII main-merge gate satisfied: operator "진행해" + `git merge v23/phase4 → main`
13. ✅ wiki/447 final closure + wiki/448 qual eval written
14. ✅ V23 master plan §V23.4 status hook updated to "SHIPPED"
15. ✅ CHANGELOG 1.12.0 entry added

### §9.A Gate test environment (resolves C-06)

End-to-end gate test §9 #9 requires 2 PCs. To avoid circularity with the wizard-under-test:

- **Rig**: 2 physical PCs OR 2 VMs (operator decides at T2-A start; documented in wiki/432). Recommended for first run: operator's existing dev rig (2 physical PCs available per V23 master §V23.3 :923 "two of the user's PCs forming a K3s cluster").
- **2nd PC provisioning timing**: BEFORE gate test, via known-good path (operator runs `installer/install-wsl2.ps1 -PairToken <existing-bridge-mint>` manually). NOT via T2-C wizard the first time.
- **T2-C wizard tested SEPARATELY**: T2-C audit exercises wizard against a 3rd test PC (or VM) — wizard correctness validated independently of gate test.
- **Gate test scope**: load existing 2-PC cluster, create 3-step DAG in `/c/[company]/workflows/new`, click Run, observe execution across PCs in RunPanel, verify success status.
- **Gate test environment provisioning is a PRE-T2-D-BUILDER dependency** — operator must confirm rig exists before T2-D Builder spawns. Tracked as wiki/431 §4 row 4 pre-Phase 4 operator action (added to checklist).

---

## §10 V23.5 horizon items (post-Phase 4)

V23.5 closed beta scope, per V23 master §V23.5:
- Paddle subscription plan integration (per-user pricing)
- `<user>.musu.pro` DNS provisioning (musu-pro side)
- Onboarding wizard (musu-bee + musu-pro)
- 5 closed-beta users handpicked and onboarded
- Signaling control plane <-> Fleet view integration (so SaaS users see their PCs even when offline)

These are EXPLICITLY out of Phase 4 scope. V23.5 master plan to be opened post-Phase 4-close.

---

## §11 Critic Findings (resolved)

Phase 1.5 Critic = `system-architect`, run 2026-05-18. 17 findings total (6 HIGH, 6 MED, 3 LOW, 2 INFO). 6 OPEN QUESTIONS — 4 of which were operator decisions (locked below); remaining 2 are master-plan fixes.

### §11.1 Operator decisions (locked)

| OQ | Topic | Decision | Cascade |
|---|---|---|---|
| **OQ-CRIT-1** | Namespace model (C-02) | **1 namespace = 1 company** | K8s namespace ↔ musu company. Matches V23 master vocabulary table (:786-799). Cascades to T2-A (namespace lifecycle owned by musu-bridge company-create), T2-B (operator gets Role-per-namespace, NOT ClusterRole), T2-C (Fleet view shows PCs across all user's companies; AddPC wizard scoped to selected company), T2-D (workflow editor URL `/c/[company]/workflows/[id]` not `/workflows/[id]`). |
| **OQ-CRIT-2** | CRD v1 completeness (C-01) | **v1 full schema** | T2-A delivers `agents[].nodeSelector + .timeout + .retry {limit, backoffSeconds} + .resources {cpu, memory} + .inputs[]/.outputs[]` and `edges[].condition {grammar: succeeded\|failed\|always}`. v2 migration NOT needed. LOC budget T2-A +200. |
| **OQ-CRIT-3** | Validation responsibility (C-12) | **Validating webhook in T2-A** | T2-A ships AdmissionWebhook (Python or Go — T2-A detail plan decides; recommend Python to stay in musu-bridge process). T2-B operator assumes valid spec, no defensive validation duty. Security best practice. T2-A LOC +150. |
| **OQ-CRIT-4** | /dashboard retirement (C-04) | **Retire with 301 redirect + 10-reference audit** | T2-C delivers: `/dashboard` → `/fleet` 301 redirect (via Next.js middleware), 1 release cycle retention. middleware/sidebar/CommandPalette updated. nested `/dashboard/company/[id]/chat` MOVES under `/c/[company]/chat`. T2-C LOC +200 (revised total ~1000). |

### §11.2 Critic findings — full table

| ID | Sev | Claim | Resolution |
|---|---|---|---|
| **C-01** | HIGH | CRD v1 schema under-specified for 3-step DAG gate (no timeout/retry/nodeSelector/data-flow) | RESOLVED via OQ-CRIT-2 → §5.A schema expanded below. T2-A v1 ships full schema. |
| **C-02** | HIGH | Namespace model undefined | RESOLVED via OQ-CRIT-1 → §2.1 architectural decision added: "1 K8s namespace = 1 company". |
| **C-03** | HIGH | T2-B reconcile flow missing DELETE/finalizer/crash-recovery/backoff | RESOLVED in plan via §5.B expansion: finalizer name `musu.pro/agentworkflow-finalizer`, DELETE flow documented, exponential backoff mandatory. T2-B detail plan (wiki/433) MUST expand further; T2-A Critic gate confirms CRD includes `.metadata.finalizers` path. |
| **C-04** | HIGH | /dashboard delete blast radius mis-stated (2 route trees + 10 refs) | RESOLVED via OQ-CRIT-4 → §5.C rescoped to retire-with-redirect, LOC revised. |
| **C-05** | HIGH | Const VI 30% threshold unanchored to V23.3 baseline | RESOLVED in plan: §4.1 added — T2-A pre-flight MUST capture A1.c baseline (Pod cold-start, bridge req p95, K3s memory) BEFORE Argo install. Threshold = baseline × 1.30. wiki/436 closure records baseline+post-Argo numbers + delta. |
| **C-06** | HIGH | End-to-end gate test §9 #9 circular (needs 2 PCs but wizard provisions them) | RESOLVED in plan: §9.A added — gate test rig = 2 physical PCs OR 2 VMs (operator decides at T2-A start); 2nd PC pre-provisioned via known-good path BEFORE gate test runs; wizard tested SEPARATELY at T2-C audit. |
| **C-07** | MED | Build pipeline 2-image bundle complexity | Acknowledged in §7 R1 mitigation update. T2-Z Z5/Z6 (distroless + image trim) sequenced AFTER T2-B ships to take advantage of 2-image bundle. `validate-import.ps1` update assigned to T2-B closure. |
| **C-08** | MED | R5 parity mitigation tautological | RESOLVED in §7 R5 rewrite: CI lint on hostname literals; parity smoke = byte-compare CRD JSON via Playwright on both targets; runtime config via `/api/config` endpoint not bundled env. T2-D detail plan owns. |
| **C-09** | MED | T2-Z micro-batch grouping inconsistent | RESOLVED in §5.Z + §6: Z1 split rationale documented; Z3+Z4 sequenced (Z3 → Z4); Z6 collapsed to single wiki/445 (wiki/446 freed up — re-allocated to V23.5 prep). |
| **C-10** | MED | Timeline W1 squeeze (main-merge + Critic + branch cut) | RESOLVED in §3.4: W1 = main-merge + bench + git merge; W2 = Critic resolution + T2-A Researcher/Planner; everything shifted +1 week. Buffer extended to W10-W11. |
| **C-11** | MED | Argo v3.5.13 pin without justification | DEFERRED to T2-A Researcher (§5.A footnote added): 4 criteria — no Critical/High CVEs, K3s compat, ≥6mo support, v3.6 upgrade path. Failing any → re-pick BEFORE Builder. |
| **C-12** | MED | Validating webhook vs operator defensive validation undecided | RESOLVED via OQ-CRIT-3 → webhook in T2-A. |
| **C-13** | LOW | tldraw + React Flow co-existence bundle size | DEFERRED to T2-D acceptance: `next/dynamic` code-split mandatory; bundle delta recorded in wiki/439. |
| **C-14** | LOW | "/api/nodes/pair if needed" hedge — accept_pair handler exists, route unclear | DEFERRED to T2-C Researcher: confirm exact mounted URL for `accept_pair` handler before wizard codes against it. |
| **C-15** | LOW | Offline-PC handling in Fleet view not in scope-not-included | RESOLVED in §8: added "Offline-PC display = V23.5 scope; T2-C shows ONLINE PCs only (active SSE)". |
| **C-16** | INFO | Go test infra bootstrap cost (envtest + golangci-lint + CI Go stage) | RESOLVED in §5.B: explicit subtask "+~100 LOC CI/lint config" added to T2-B LOC estimate (revised ~1300). |
| **C-17** | INFO | F-B2-4 deferral criterion vague | RESOLVED in §5.Z: F-B2-4 reactivation triggers pinned — (a) ≥3 abuse incidents/30d OR (b) closed-beta >5 users OR (c) operator request. |

Critic adjudication: 6 HIGH all addressed (4 via operator decision, 2 via plan rewrite). 6 MED all addressed (3 via operator decision/plan, 3 deferred to sub-WS detail plans with concrete acceptance criteria). LOW/INFO either resolved or noted in sub-WS scope. **Plan unblocks T2-A Builder spawn after the master-plan edits §11.1 mandate are applied (below in §2.1, §4.1, §5.A, §5.B, §5.C, §5.Z, §7, §8, §9.A — all updated in this commit).**

---

## §12 References

- `F:\workspace\musu-bee\docs\V23_MASTER_PLAN_2026_05_15.md` (V23 master — §V23.4 Phase 4 spec :803-822, K8s-vocabulary table :786-799, V23.5 gate :949-957)
- `F:\workspace\musu-bee\docs\V23_4_TIER1_FINAL_CLOSURE_2026_05_17.md` (wiki/429 — predecessor; what is NOT in main yet)
- `F:\workspace\musu-bee\docs\V23_4_TIER1_QUAL_EVAL_2026_05_17.md` (wiki/430 — cadence + dual-audit lessons)
- `F:\workspace\musu-bee\docs\V23_4_MASTER_PLAN_2026_05_17.md` (wiki/425 — 12-section template followed here)
- `F:\workspace\musu-bee\docs\V23_3_FINAL_CLOSURE_2026_05_17.md` (wiki/396 — §5 17 forward-pointers original; main-merge precondition items)
- `F:\workspace\musu-bee\CHANGELOG.md` (1.10.0 V23.3 + 1.11.0 V23.4 Tier-1; 1.12.0 reserved for Phase 4)
- `F:\workspace\musu-bee\musu-bee\package.json` (current dependencies — tldraw 5 present, `@xyflow/react` absent)
- `F:\workspace\musu-bee\musu-bee\src\app\c\[id]\page.tsx` + `m\[id]\page.tsx` (V21.F two-axis surface — V21.F kept, T2-C adds new `/fleet` route)
- `F:\workspace\musu-bee\musu-bridge\server.py` (~2200 LOC Python FastAPI — T2-A extends with workflow_routes)
- `F:\workspace\musu-bee\musu-relay\installer\k3s\` (existing K3s manifest dir — T2-A adds Argo + AgentWorkflow CRD; T2-B adds musu-operator Deployment)
- MODE_Agent_Team.md (Phase 0-7 + dual-audit triggers + envelope contract)
- Researcher findings from prior turn (Phase 0 envelope — incorporated inline above)
