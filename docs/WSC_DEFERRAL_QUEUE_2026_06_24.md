# WS-C — Deferred Follow-ups Queue (2026-06-24)

Classification doc for master `cosmic-honking-cake.md` WS-C. These are NOT
implemented here — each is queued as its own future sub-WS with its gate noted.
Implementation starts only on explicit user approval (several need production
deploy = Const VII / separate sign-off).

## P1 — should land next

### W-7 — server-side `source_node_id` auth binding (relay defense-in-depth)
- **What**: the relay server should bind a forwarded task's `source_node_id` to
  the authenticated mesh identity, so a compromised/forged node cannot spoof
  another node as the task origin.
- **Where**: relay server code (cloud/relay), NOT musu-rs client.
- **Gate**: 🔴 production deploy (relay server is live). Needs its own master/plan
  + Const VII. Likely a small security-engineer Critic + dual-audit (auth/one-way
  blast). Carried from W-series.
- **Status**: deferred; relay round-trip already works without it (W-1 callback +
  C-1 token). This is hardening, not a functional blocker.

### B-7 — login env / 안내 정합 (task #28)
- **What**: align login environment-variable docs + in-app guidance with the
  current device-flow/register reality (server device-flow shipped cb7011b7).
- **Where**: musu-bee onboarding copy + env docs.
- **Gate**: 🟢 docs/UI copy; design-gate applies if it touches `src/app|components`.
- **Status**: deferred; functional login works, this is guidance accuracy.

## P2 — hardening, lower urgency

### U-C item-b — persist `node_name` at join + name cross-check
- **What**: on node join, persist `node_name` and cross-check it on the
  fallback-to-persisted-IP path so a renamed/re-IP'd node can't be mismatched.
  Residual from U-C (cross-account already impossible; this is intra-account
  robustness).
- **Where**: musu-rs join + private_mesh fallback path.
- **Gate**: 🟡 client-only; cargo test. No production deploy.
- **Status**: deferred; low blast radius.

### B-3b — separate SaaS route gate (task #31, Auditor-found)
- **What**: a CI gate that flags new SaaS-dependent routes in product code
  (enforces the self-contained-product invariant: no required paid SaaS baked in).
- **Where**: `.github/workflows` + a `scripts/` evaluator (mirror design-gate shape).
- **Gate**: 🟢 CI-only; no runtime change.
- **Status**: deferred; the invariant is currently enforced by review, not CI.

## Also tracked (hardware-gated, not WS-C but related)

- **W-4 / fleet 3-state E2E** — 2-machine real-hardware E2E (overlaps the F-3 E2E
  in `docs/E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`). Do both together. User env.
- **Uninstall lifecycle E2E** — packaged MSIX install→uninstall→reinstall. User env.

## How to pick up a deferral
Each item → its own detail plan (`docs/WS<id>_..._PLAN.md`), agent-team flow
(Critic → Builder → Auditor), gate per the table above. W-7 + B-3b touch
CI/server → confirm Const VII / production sign-off before Builder.
