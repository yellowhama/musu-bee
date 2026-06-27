# MUSU Full Product Spec Completion Roadmap (2026-06-27)

## Direct Answer

MUSU is not fully complete against the whole product spec yet.

The current `1.15.0-rc.22` package has a strong two-PC direct fleet proof:
`hugh-main` and `hugh_second` are both direct/healthy, the installed package
matches `1.15.0.22`, public install/proof routes are release-pinned, remote
public URLs are usable, and the brain ingest token ACL check passes on the
main PC proof.

That proves the direct LAN fleet slice. It does not prove the full product:
design approval, Store release, real relay transport, full brain product
bonding, V34 stale self-heal proof, and final operator evidence still remain.

## 2026-06-27 Gate Implementation Update

Phase 1 is now implemented in tooling, but the full product is still not
complete. `scripts/windows/write-release-go-no-go.ps1` emits
`full_product_spec_ready` plus a `musu.full_product_spec_readiness.v1` object
with explicit lanes for design approval, install/package proof, direct two-PC
fleet proof, relay transport, brain product proof, V34 stale self-heal, Store
distribution, and support/operator evidence.

The gate fails closed: missing lanes become blockers instead of warnings, and a
direct fleet proof alone cannot produce a full-product completion claim. The
same script now reports release candidate manifest generation failures as
structured blockers instead of crashing before the go/no-go JSON is written.

Current local gate shape on this branch:

- `full_product_spec_ready=false`.
- `fleet_node_proof_verified=true`.
- `fleet_install_channel_proof_verified=true`.
- `fleet_brain_token_acl_verified=true`.
- `design_approval_verified=false`.
- `relay_transport_product_verified=false`.
- `brain_product_verified=false`.
- `v34_stale_self_heal_verified=false`.
- `release_candidate_manifest_generated=false` until the missing current
  `musu_1.15.0.22_x64_store-reviewed-immediate-registration.msix` artifact is
  produced and verified.

## 2026-06-28 Manifest Version Gate Update

The current multi-device kit for `1.15.0-rc.22` has been regenerated, but the
release candidate manifest found a stricter blocker: the manifest writer was
mapping rc versions to `1.15.0.0` package artifacts instead of the current
`1.15.0.22` package version.

That is now fixed in `scripts/windows/write-release-candidate-manifest.ps1`.
The manifest maps `1.15.0-rc.22` to `1.15.0.22`, so stale `1.15.0.0`
Store-reviewed artifacts cannot satisfy the current release manifest. The local
go/no-go therefore remains `full_product_spec_ready=false` and
`release_candidate_manifest_generated=false` until the current rc.22
Store-reviewed MSIX exists.

## Current Completion State

| Area | Status | Evidence | Completion claim allowed |
|---|---|---|---|
| PR #34 code/test/deploy checks | Mostly green | Deploy, Playwright, web build/typecheck, Rust core tests, SaaS gate, landing gate passed at current PR state | Code path is not the current blocker |
| PR #34 design approval | Not complete | PR body still uses `Design: Pending`; `design-gate` is failing by design | Cannot merge PR #34 |
| rc.22 public install/proof channel | Complete for current rc.22 package | `fleet-proof.ps1` on `hugh-main`, install-channel verifier, package `1.15.0.22` | Public install/proof channel is valid for rc.22 |
| Two-PC direct fleet | Complete for current rc.22 proof | `hugh-main-20260627T010201Z.fleet-proof.json`, `online_nodes=2`, `direct_healthy_nodes=2` | Direct two-PC fleet readiness is proven |
| Fleet relay display | Partly complete | UI/spec keeps relay as display/freshness state only | Relay can be shown, but not claimed as delegated-work routing |
| Real delegated-work relay transport | Not complete | `musu-rs/src/bridge/router.rs` says relay is not selected because relay/tunnel transport is not implemented | Cannot claim relay task execution |
| Brain sidecar product bonding | Partly complete | Sidecar bundle, `~/.musu/brain`, token ACL, non-shared store, task ingest hook exist | Brain is bonded as a hidden chip, but full release-grade health/ingest/UX proof is missing |
| V34 discovery/stale self-heal | Partly complete | Candidate endpoints, observed-source additive candidate, route preflight, heartbeat TTL filter are documented/implemented | Needs boot reconcile and stale-candidate E2E proof before full self-heal claim |
| Store release readiness | Not complete | MSIX proof exists, but Partner Center/MS certification/Store-signed install evidence is not present | Cannot claim Microsoft Store readiness |
| Release candidate manifest | Not complete | Current rc.22 local sideload and multi-device kit exist, but the current rc.22 Store-reviewed MSIX is missing | Cannot use stale `1.15.0.0` artifacts for current release evidence |
| Support mailbox / external operator evidence | Unknown for current final spec, historically open | Older release gates require `musu@musu.pro` delivery evidence | Treat as final release-governance lane until explicitly retired |

## Full Product Definition Of Done

MUSU is fully complete only when all of these are true at the same time:

1. A visible online node is work-targetable from the current machine.
2. Direct, relay-display, and offline states are separate and never overclaim
   routing.
3. `last_seen` and fleet freshness are evidence-backed, never fabricated from
   registry fetch time.
4. Remote `public_url` values are usable by another PC; loopback, localhost,
   wildcard, IPv4-mapped loopback/wildcard, and port 0 are rejected.
5. The install channel proves the installed package version, not only HTTP 200.
6. Brain is hidden, sidecar-owned, IPC-only, and stores data under
   `~/.musu/brain`; MUSU and brain never share SQLite writes.
7. Brain has packaged runtime evidence: token ACL, `/health`, real source
   ingest, recall/capture UX, and no exposed raw `:8080` user surface.
8. Delegated work works over direct routes and, if relay is presented as a work
   route, over a proven relay transport with route evidence.
9. V34 discovery/stale behavior has proof for stale registry rows, stale local
   cache/manual peers, boot reconcile, and route-preflight candidate selection.
10. Store or EV distribution has release evidence: current bundle, signing,
    certification or trusted-signing path, install/launch proof, and rollback.
11. Final go/no-go tooling reports the same state from live/package evidence and
    lists no release blockers.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | The full product cannot be called complete today. | Direct proof is green, but design, Store, relay transport, full brain proof, and V34 self-heal proof remain separate gaps. | A broad "complete" claim would overstate the evidence. | Keep the claim scoped to rc.22 two-PC direct readiness until all lanes below are closed. |
| NO-GO | PR #34 cannot merge without explicit design approval. | `Design: Pending` keeps `design-gate` failing. | The current implementation branch remains blocked even if code checks pass. | Get approval on issue #35, update PR body to `Design: Approved` with the approval URL, rerun checks. |
| HIGH | Relay is display-only, not a delegated-work transport. | `router.rs` does not return relay paths; relay proof docs still require actual transport evidence. | Yellow relay state cannot be sold as "task routes through MUSU relay". | Implement relay transport, fail-closed route evidence, and two-PC failure-injection proof. |
| HIGH | Brain is bonded but not fully product-proven. | Token ACL proof exists; full `/health`, real task source ingest, recall/capture cockpit UX, fleet event ingest, and native version surface are not all proven. | The "one product with hidden brain" spec is not finished. | Capture packaged first-run brain evidence and finish UX/event/version lanes. |
| HIGH | Store readiness is still external evidence, not inferred from MSIX proof. | Current docs separate MSIX package proof from Partner Center/MS certification/Store release. | Public release through Store remains a manual/external gate. | Prepare current Store bundle, reserve product name, pass restricted capability review, record Store-signed install proof. |
| MED | V34 stale self-heal is partly implemented but not fully proven. | Candidate set, observed-source additive candidate, route preflight, and heartbeat TTL exist; boot reconcile and stale-candidate E2E remain. | Reinstall/multi-NIC/stale-row tails can still surprise users until the proof exists. | Finish boot/local reconcile and stale-first-candidate physical E2E. |
| MED | Support mailbox evidence is historically a release blocker. | Older release gates and wiki entries require `musu@musu.pro` proof. | Final readiness may be blocked by operator evidence even if code is green. | Either record support mailbox evidence for the current version or formally retire the gate in docs/tooling. |

## Dependency Map

- PR #34 design approval blocks merge.
- PR #34 merge blocks a clean baseline for the next implementation lanes.
- Store release depends on current package artifacts, Partner Center setup,
  restricted capability review, certification, and Store-signed install proof.
- Relay transport depends on router selection, transport implementation,
  fail-closed proof schema, and two-PC failure-injection evidence.
- Brain product proof depends on packaged sidecar startup, token custody,
  loopback health, real ingest, cockpit UX, and version coherence.
- V34 self-heal depends on stale registry/cache/manual-peer cleanup,
  boot reconcile, and route-preflight E2E.
- Final go/no-go depends on all evidence sources being current and indexed.

## Main Constraint

The immediate constraint is PR #34 design approval because it blocks merging the
current rc.22 proof/fleet fixes.

The largest product constraints after merge are Store release evidence, real
relay transport, full brain product proof, and V34 stale self-heal evidence.
These are independent enough to run as parallel lanes, but the completion claim
must stay scoped until every lane has machine evidence.

## Roadmap

### Phase 0 - Close PR #34

Deliverables:
- Issue #35 explicit design approval comment.
- PR body updated to `Design: Approved` with approval URL.
- Checks rerun and green except no expected blockers.
- Merge PR #34 after approval.

Proof:
- GitHub PR checks.
- Design-gate log.
- Merged commit SHA.

Exit criteria:
- No `Design: Pending` status remains on PR #34.

### Phase 1 - Freeze The Product Readiness Gate

Status: implemented in `write-release-go-no-go.ps1`; the evidence lanes still
correctly report No-Go.

Deliverables:
- One canonical release readiness command or run card for the current product
  spec.
- It must distinguish direct proof, relay transport proof, brain proof, Store
  proof, and support/operator proof.
- It must fail closed when evidence is missing or stale.

Proof:
- `write-release-go-no-go.ps1` or successor JSON shows each lane explicitly.
- Missing lanes are blockers, not warnings.

Exit criteria:
- Operators and agents cannot accidentally report "complete" from only direct
  fleet proof.

### Phase 2 - Store Or EV Distribution

Deliverables:
- Current Store submission bundle for rc.22 or successor.
- Partner Center product-name reservation evidence.
- Restricted capability review package.
- Microsoft certification or Store-signed release evidence.
- Store-signed install/launch proof on a physical machine.

Proof:
- `prepare-store-submission-bundle.ps1`.
- `verify-store-submission-bundle.ps1`.
- `record-store-release-verification.ps1`.
- Store-signed installed package identity and launch evidence.

Exit criteria:
- Store readiness changes from "not proven" to "proven by Microsoft-reviewed
  package evidence".

### Phase 3 - V34 Discovery And Stale Self-Heal

Deliverables:
- Boot-time reconcile for local cache/manual peers against server truth and
  local reachability.
- TTL prune evidence for stale cloud rows.
- Stale-first-candidate route-preflight physical E2E.
- No duplicate task execution while trying route candidates.

Proof:
- Two physical nodes with injected stale public URL/cache/manual peer.
- Route evidence shows reachable LAN candidate selected before stale candidate.
- Registry/current fleet excludes heartbeat-expired rows.

Exit criteria:
- Reinstall, port changes, stale rows, and multi-NIC address drift self-heal
  without manual cleanup.

### Phase 4 - Real Relay Transport

Deliverables:
- Relay transport strategy approved by a separate design gate.
- Router direct failure to relay fallback.
- Release-grade relay transport proof bound to the source node, target node,
  transport kind, peer identity, and route evidence.
- Failure-injection playbook: direct blocked -> relay task succeeds -> heartbeat
  expiry/offline still behaves correctly.

Proof:
- `musu.relay_transport_proof.v1`.
- `musu.route_evidence.v1` with relay proof attached.
- Two-PC physical test with direct path blocked.

Exit criteria:
- The product can honestly say delegated work routes through relay when direct
  is unavailable.

### Phase 5 - Brain Product Completion

Deliverables:
- Packaged first-run creates `~/.musu/brain`.
- Token file exists, ACL is restricted, token value is never logged.
- Brain `/health` is proven against the expected service, not merely any process
  on port 8080.
- Real task completion creates a source through `POST /v1/sources`.
- Cockpit recall/capture UX exists inside MUSU.
- Fleet event ingest is either implemented or explicitly scoped out.
- Brain version surface is native or release metadata is strong enough to gate
  package coherence.

Proof:
- `verify-fleet-audit-contract.ps1 -RequireBrainToken -Json`.
- Packaged sidecar health evidence.
- Task source ingest evidence under `~/.musu/brain`.
- UX smoke/e2e proof for recall/capture.

Exit criteria:
- The user never needs to know the brain exists, and the product can prove the
  hidden chip is alive, version-coherent, and receiving knowledge.

### Phase 6 - Final Release Evidence Packet

Deliverables:
- Current package install proof.
- Direct two-PC proof.
- Relay transport proof if relay is part of the release claim.
- Brain product proof.
- Store/EV distribution proof.
- Support/operator evidence or formal retirement.
- Rollback/cleanup path.
- LLM/wiki/index refresh.

Proof:
- Final go/no-go JSON has `ok=true` or equivalent, no blockers.
- Evidence files are committed or archived according to the release run card.
- `musu indexer sync` and recall queries return the final roadmap, evidence,
  and handoff docs.

Exit criteria:
- "MUSU product spec complete" becomes an evidence-backed release claim, not a
  summary judgment.

## Confidence

High confidence:
- rc.22 two-PC direct fleet readiness is proven for `hugh-main` and
  `hugh_second`.
- The current repo intentionally prevents relay overclaim by keeping relay out
  of selected route paths until transport exists.
- PR #34 is blocked by design approval, not by the currently observed code/test
  checks.

Medium confidence:
- The install/proof channel is correct for rc.22. It should be rerun after any
  package, route, installer, or public script change.
- Brain sidecar bonding is on the right architecture, but the final product
  proof still needs runtime evidence.

Unknown or needs evidence:
- Whether support mailbox proof remains mandatory for the current product
  release line or should be formally retired.
- Microsoft Store certification timing and restricted capability approval.
- Relay transport design choice and self-contained risk until the separate
  relay design gate is run.
