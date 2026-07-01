# PR #34 rc.22 Two-PC Proof Code Audit and Next Steps (2026-06-27)

## Scope

This document consolidates the current PR #34 state after the physical
`hugh-main` hosted `fleet-proof.ps1` run. It is the handoff point for product
spec updates, qualitative release judgment, code audit status, LLM/wiki
indexing, and next actions.

## Evidence Baseline

- Branch: `feat/v33-residual-finalize`.
- Latest pushed proof/doc commit before this document:
  `daa0fec4 docs(product): record hugh-main fleet proof`.
- Physical proof evidence:
  `docs/evidence/fleet-proof/1.15.0-rc.22/hugh-main-20260627T010201Z.fleet-proof.json`.
- `hugh-main` proof result: `schema=musu.fleet_node_proof.v1`, `ok=true`,
  `fail_count=0`, `warn_count=0`, installed package `1.15.0.22`,
  `bridge_bind_addr=0.0.0.0:4387`,
  `advertised_public_url=http://192.168.1.192:4387`, `online_nodes=2`,
  `direct_healthy_nodes=2`, expected direct peer `hugh_second`, and
  `brain_ingest_token_acl_restricted` passing.
- Follow-up `musu status --json` from `hugh_second` showed both PCs healthy via
  direct routes.
- PR #34 checks at `daa0fec4`: Deploy to Vercel, Playwright E2E, landing gate,
  SaaS gate, Web typecheck/build, Rust core tests, and test passed. Only
  `design-gate` failed, as expected, because the PR still says
  `Design: Pending`.

## Product Spec Updates

1. Current rc.22 direct fleet proof is two-PC green.
   `hugh_second` and `hugh-main` can both be represented as direct/healthy
   work-targetable nodes for the current LAN proof.
2. `fleet-proof.ps1` is now the public release-grade PC proof surface. It
   supersedes weaker post-install checks for release claims because it validates
   the public install channel, repair evidence, installed package version,
   remote-usable URL, direct peer when required, and brain token ACL when
   required.
3. The product must keep direct, relay-display, and offline separate. Current
   proof does not establish delegated-work relay transport.
4. Brain remains a hidden knowledge chip owned by product lifecycle. The current
   proof covers token presence and ACL, not full brain `/health` or real task
   source ingest evidence.
5. Store readiness is still a separate claim. MSIX package proof and public
   install-channel proof are necessary, but they do not replace Store submission
   approval/evidence.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| MED | PR #34 is intentionally blocked by design-gate. | PR body has `Design: Pending`; issue #35 has evidence-refresh comments but no explicit approval. | Merge should stay blocked until design approval is real, not inferred from proof or docs. | Get explicit CEO/design approval on issue #35, then update PR body to `Design: Approved` with the approval URL. |
| LOW | Release claim boundaries can be over-expanded if the proof is summarized too loosely. | Current proof is direct LAN fleet proof, not Store proof or delegated-work relay proof. | A final report could accidentally claim more than the system proves. | Keep final language scoped to rc.22 two-PC direct readiness; list Store and relay transport as unproven. |
| INFO | Physical two-PC direct proof is now closed for rc.22. | `hugh-main-20260627T010201Z.fleet-proof.json` is green and `hugh_second` status confirmed both direct routes. | The previous `hugh-main proof missing` blocker is no longer valid. | Rerun `fleet-proof.ps1` after package, installer, node identity, or route-contract changes. |
| INFO | Code-level false-online and stale-public-url bugs remain covered. | Existing targeted tests cover `registry_last_seen_to_heartbeat`, remote-unusable public URL rejection, unusable cache handling, and direct-only `online_nodes`. | The old runtime findings are not reintroduced by this docs/proof pass. | Keep those tests in release gates; do not weaken direct/relay wording in UI or docs. |
| INFO | LLM/wiki and local code/doc index are refreshed. | `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 3314 files and 3847 symbols. Query `hugh-main-20260627T010201Z.fleet-proof.json` returns runbook, rc.22 release next steps, evidence JSON, readiness audit, V34 thesis, and handoff. | Future agents can retrieve the current proof instead of stale `hugh-main missing` state. | Keep this file and `docs/WIKI_INDEX.md` updated after the next approval/proof change. |

## Code Audit

No source code changed in the proof-recording pass. The audited product surfaces
are still the same critical boundaries:

- `musu-rs/src/bridge/mod.rs`: registry `last_seen` is preserved as heartbeat
  evidence; loopback/wildcard/port-0 `public_url` values are rejected for remote
  route truth.
- `musu-rs/src/peer/discovery.rs`: unusable cached registry rows no longer
  suppress usable same-name peers.
- `musu-rs/src/bridge/handlers/fleet.rs`: `online_nodes` counts direct healthy
  peers only; relay freshness is display-only.
- `src/app/fleet-proof.ps1/route.ts`: public proof wrapper is release-pinned
  and version-aware.
- `src/app/download/page.tsx` and `src/app/install/page.tsx`: public UI exposes
  the release-grade proof command.
- `scripts/design-gate/evaluate.cjs`: approval token handling is fail-closed; a
  backticked or instructional `Design: Approved` mention does not satisfy the
  gate.

Audit result: no new source defect found in this pass. The only active PR
blocker is external design approval.

## Qualitative Evaluation

Current product quality for the scoped rc.22 direct fleet claim is good. The
important shift is that proof is no longer based on a local repo script or
operator interpretation; the public install/proof channel produced machine JSON
on the actual main PC. That materially reduces ambiguity around ports, package
version, stale registry rows, and brain token custody.

The product is not yet broadly release-ready in the stronger sense. Design
approval is still missing. Store readiness is not proven. Delegated-work relay
transport is not proven. Brain bonding still needs separate runtime `/health`
and actual task-ingest evidence if the release claim includes knowledge ingest.

## Updated Docs

- `docs/PRODUCT_PURPOSE_AND_IMPLEMENTATION_GATE_2026_06_27.md`
- `docs/MUSU_PRODUCT_READINESS_CODE_AUDIT_2026_06_27.md`
- `docs/FLEET_NODE_PROOF_RUNBOOK_2026_06_27.md`
- `docs/RELEASE_1_15_0_RC22_INSTALL_CHANNEL_AUDIT_NEXT_STEPS_2026_06_27.md`
- `docs/HANDOFF_2026_06_26_REINSTALL_RESILIENCE_V29_V31.md`
- `docs/V34_DISCOVERY_STALE_THESIS_2026_06_26.md`
- `docs/WIKI_INDEX.md`

## Next Steps

1. Get explicit CEO/design approval on issue #35.
2. After approval, update PR #34 from `Design: Pending` to `Design: Approved`
   and include the approval comment URL.
3. Confirm PR #34 checks pass after the approval update.
4. Keep final release language scoped: rc.22 two-PC direct readiness is proven;
   Store readiness and real relay transport are not.
5. Rerun hosted `fleet-proof.ps1` if any package, installer route, node
   identity, bridge route contract, or public proof route changes.
6. For a stronger brain bonding claim, capture packaged runtime brain `/health`
   and actual task source ingest evidence.
