# WS-C — Deferred Follow-ups Queue (2026-06-24)

Classification doc for master `cosmic-honking-cake.md` WS-C. Most items are
not implemented here and remain queued as their own future sub-WS with gates
noted. W-7 now has source-level implementation, but still needs production
deploy/configuration evidence before it can be treated as live.

## P1 — should land next

### W-7 — server-side `source_node_id` auth binding (relay defense-in-depth)
- **What**: the relay server should bind a forwarded task's `source_node_id` to
  the authenticated mesh identity, so a compromised/forged node cannot spoof
  another node as the task origin.
- **Where**: relay server code (cloud/relay), NOT musu-rs client.
- **Gate**: 🔴 production deploy (relay server is live). Needs its own master/plan
  + Const VII. Likely a small security-engineer Critic + dual-audit (auth/one-way
  blast). Carried from W-series.
- **Status**: source implemented on 2026-06-28:
  `MUSU_P2P_CONTROL_TOKEN_NODE_BINDINGS` maps token SHA-256 values to allowed
  `source_node_id` values, and rendezvous, relay lease, relay payload, relay
  transport proof, and route evidence writes return
  `source_node_id_auth_mismatch` on mismatch. Production deploy/configuration
  and live evidence remain pending. Canonical report:
  `docs/RELAY_SOURCE_NODE_AUTH_BINDING_HARDENING_2026_06_28.md`.

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
Each remaining item → its own detail plan (`docs/WS<id>_..._PLAN.md`),
agent-team flow (Critic → Builder → Auditor), gate per the table above. W-7
still needs Const VII / production sign-off before live deploy/configuration;
B-3b touches CI/server and needs the same confirmation before Builder.
