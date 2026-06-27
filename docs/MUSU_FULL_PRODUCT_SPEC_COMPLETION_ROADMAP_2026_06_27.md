# MUSU Full Product Spec Completion Roadmap (2026-06-27)

## Direct Answer

MUSU is not fully complete against the whole product spec yet.

The current `1.15.0-rc.22` package has a strong two-PC direct fleet proof:
`hugh-main` and `hugh_second` are both direct/healthy, the installed package
matches `1.15.0.22`, public install/proof routes are release-pinned, remote
public URLs are usable, and the brain ingest token ACL check passes on the
main PC proof.

That proves the direct LAN fleet health slice. A later packaged route probe
from `hugh_second` to `hugh-main` now also proves direct delegated-work
targetability for the current rc.22 package: the installed CLI selected the LAN
candidate `192.168.1.192:4387`, submitted successfully, waited for completion,
and wrote verifier-passing `musu.route_evidence.v1`.

The fresh packaged desktop now also records a passing hidden-brain product
proof for rc.22. It still does not prove the full product: design approval,
Store release/Store-signed install evidence, real relay transport, and V34
stale self-heal proof still remain.

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
- `brain_product_verified=true` after the packaged rc.22 proof at
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-proof.json`.
- `direct_route_verified=true` after packaged route evidence at
  `docs/evidence/direct-route/1.15.0-rc.22/20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json`.
- `v34_stale_self_heal_verified=false`.
- `support_operator_gate_retirement_verified=true`.
- `support_operator_evidence_verified=true`.
- `release_candidate_manifest_generated=true` after the current rc.22
  Store-reviewed artifact and submission bundle refresh.
- Current lane status from `write-release-go-no-go.ps1 -Json`:
  `install_channel_and_package=pass`, `direct_two_pc_fleet=pass`,
  `direct_delegated_work_route=pass`, `brain_product=pass`,
  `support_operator_evidence=pass`, while `design_approval=fail`,
  `relay_transport=fail`, `v34_stale_self_heal=fail`, and
  `store_distribution=fail`.

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

The same current-version rule now applies to the desktop readiness audit and
operator action pack. `scripts/windows/audit-desktop-release-readiness.ps1`
derives the local/Store MSIX filenames from `VERSION` and only accepts a Store
submission bundle that contains the expected current Store-reviewed MSIX.
`scripts/windows/prepare-operator-action-pack.ps1` also refuses to prepare
Partner Center upload instructions from a stale Store bundle. Current local
audit evidence reports the local sideload MSIX and desktop entrypoint as
passing, while the current Store-reviewed MSIX and current Store submission
bundle remain missing.

## 2026-06-28 Current Store Bundle Update

The current rc.22 Store-reviewed MSIX and Store submission bundle have now been
regenerated from the clean product sources with the brain sidecar pin updated
to the current `F:\musu_2nd_brain` HEAD
`027eec841613ff2e0b16df26f55066ab207ab4ec`.

Local artifact evidence:

- Store-reviewed MSIX:
  `.local-build\msix\output\musu_1.15.0.22_x64_store-reviewed-immediate-registration.msix`.
- Store submission bundle:
  `.local-build\msix\submission-bundles\store-reviewed-20260628-005038`.
- `verify-store-submission-bundle.ps1` reports `ok=true`, `fail_count=0`.
- `audit-desktop-release-readiness.ps1` reports `runtime_package_ready=true`
  and `msix_desktop_entrypoint_ready=true`.
- `write-release-candidate-manifest.ps1` now succeeds for
  `.local-build\release-candidates\1.15.0-rc.22\release-candidate-manifest.json`
  with artifact_count `7`.

This closes the repo-local Store packaging artifact gap. It does not close the
Store distribution lane because Partner Center product-name reservation,
Microsoft certification/restricted-capability approval, and Store-signed
install/launch proof are still external evidence requirements.

## 2026-06-28 Support Operator Gate Retirement Update

The historical support mailbox delivery proof is retired as a mandatory full
product blocker for the current desktop spec. This is a narrow retirement:
support availability, the configured `musu@musu.pro` address, the public support
page, the privacy page, and public release metadata remain required.

Replacement controls:

- `docs/SUPPORT_OPERATOR_GATE_RETIREMENT_2026_06_28.md` records the formal
  decision and scope.
- `scripts/windows/record-support-operator-gate-retirement.ps1` records current
  live `https://musu.pro` public support metadata proof.
- `scripts/windows/verify-support-operator-gate-retirement.ps1` rejects evidence
  that retires support availability, lacks a current public metadata proof, or
  does not embed verified support/privacy/public-config evidence.
- `write-release-go-no-go.ps1` now treats the support/operator lane as complete
  when either real mailbox delivery evidence is verified or the formal support
  operator gate retirement evidence is verified.

This reduces the final full-product blockers by one. Current evidence:

- Proof:
  `docs/evidence/support-operator-gate-retirement/1.15.0-rc.22/20260628-033452-support-operator-gate-retirement.support-operator-gate-retirement.json`.
- Verification:
  `docs/evidence/support-operator-gate-retirement/1.15.0-rc.22/20260628-033452-support-operator-gate-retirement.support-operator-gate-retirement-verification.json`.

The latest local go/no-go reports `support_operator_gate_retirement_verified=true`,
`support_operator_evidence_verified=true`, `complete_lane_count=4`, and
`incomplete_lane_count=4`.

## 2026-06-28 Brain Product Proof Gate Update

The brain product lane now has a dedicated release proof recorder and verifier:

- `scripts/windows/record-brain-product-proof.ps1`
- `scripts/windows/verify-brain-product-proof.ps1`

`write-release-go-no-go.ps1` no longer accepts a weak
`musu.brain_product_proof.v1` JSON that only sets `ok`, `health_ok`,
`task_ingest_ok`, and `recall_capture_ux_ok`. The lane now requires verifier
approval for the packaged hidden brain sidecar: package version coherence,
packaged `musu-brain.exe`, observed sidecar process, `~/.musu/brain` data
root, restricted ingest token ACL, loopback-only `http://127.0.0.1:8080`,
`/health`, real `/v1/sources` task ingest, `/v1/process`, `/v1/query`, real
`/v1/clips` capture ingest, and capture recall results.

This hardens the product spec gate and closes the brain product lane for the
current rc.22 fresh packaged launch.

Local diagnostic on `HUGH_SECOND` immediately after adding the recorder:
`record-brain-product-proof.ps1 -Json` wrote a non-release local artifact under
`.local-build/brain-product/20260628-013600-HUGH_SECOND.*` and failed with
`fail_count=14`. The installed package identity was correct
(`blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`), but no `musu-brain`
sidecar process was observed and `http://127.0.0.1:8080/health` was not proven.
That exposed a stale already-running desktop process, not a passing release
proof.

After stopping the stale packaged desktop processes and launching the installed
AppX fresh, `musu-desktop.exe` spawned packaged `musu-brain.exe` and the
release recorder wrote:

- Proof:
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-proof.json`.
- Verification:
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-verification.json`.

The verification reports `ok=true` and `fail_count=0`. The current local
go/no-go reports `brain_product_verified=true`. After the support operator gate
retirement evidence, the local full-product gate reports `complete_lane_count=4`
and `incomplete_lane_count=4`.

Caveat: this proves fresh packaged launch, not an upgrade-in-place self-heal for
an already-running stale desktop instance. Treat the stale-process observation
as a future hardening target if in-place upgrade behavior becomes part of the
release claim.

## 2026-06-28 V34 Self-Heal Gate, Boot Reconcile, And Recorder Update

V34 is still not complete, because the release lane requires physical two-node
evidence for stale registry/cache/manual-peer recovery. The code and gate are
now stronger:

- `musu-rs/src/peer/discovery.rs` now exposes a boot/local reconcile path that
  uses a still-valid cached registry as server truth and prunes same-name manual
  peer ghosts before the first cloud heartbeat succeeds.
- Reconcile is candidate-set aware: a same-name manual peer is kept when it
  matches any current registry route candidate, not only the primary cached
  address.
- `musu-rs/src/bridge/mod.rs` calls the boot reconcile during bridge startup,
  independent of cloud token availability.
- `scripts/windows/verify-v34-self-heal-proof.ps1` now rejects weak
  boolean-only V34 proof JSON and requires structured evidence for TTL prune,
  boot reconcile, stale-first route preflight, and exactly-one task execution.
- `scripts/windows/record-v34-self-heal-proof.ps1` is the canonical recorder
  for that physical proof. It writes `musu.v34_self_heal_proof.v1`, immediately
  runs the verifier, emits hashes and a summary, and fails closed if the proof
  does not satisfy the release gate. It also binds the selected candidate to the
  embedded route evidence candidate and requires distinct physical node names.
- `write-release-go-no-go.ps1` now invokes the V34 verifier before setting
  `v34_stale_self_heal_verified=true`, and its next action points operators at
  the recorder instead of asking them to hand-write JSON.

Regression coverage:

- Rust unit proof:
  `peer::discovery::tests::boot_reconcile_prunes_stale_manual_but_keeps_current_candidate_set`.
- Release evidence verifier proof:
  `V34 self-heal accepts release-grade physical stale proof`,
  `V34 self-heal recorder emits verifier-passing release proof`,
  `V34 self-heal rejects weak boolean-only proof`,
  `V34 self-heal rejects duplicate task execution proof`, and
  `V34 self-heal rejects unroutable selected candidate proof`.

This reduces V34 implementation risk but does not close the lane until a
current physical proof is recorded with `record-v34-self-heal-proof.ps1` under
`docs/evidence/v34-self-heal/1.15.0-rc.22/` and the resulting verification is
green.

## 2026-06-28 Direct Route Work-Targetability Token Update

The two-PC fleet proof was healthy, but the installed rc.22 package initially
did not prove delegated work targetability. On `HUGH_SECOND`, this route probe
selected `hugh-main` over the direct LAN candidate `192.168.1.192:4387` and
wrote failure evidence under
`.local-build\v34-self-heal\route-probe\20260628-035659-hugh_second-to-hugh-main.route-evidence.json`,
but the submit failed with `submit_http_status_401 Unauthorized` and
`unauthorized: invalid bearer`.

Root cause:

- The remote bridge accepts the account-wide peer bearer through the bridge
  auth path.
- The route CLI path used `get_token()`, which prefers the local per-machine
  `MUSU_BRIDGE_TOKEN` / `bridge.env` token.
- When two machines have different local bridge tokens, a remote direct route
  can look healthy in fleet status but fail delegated task submission.

Source fix:

- `musu-rs/src/install/cli_commands.rs` now selects route bearer by scope.
- Local routes keep the existing bridge token behavior.
- Remote routes prefer the shared mesh bearer via `MUSU_TOKEN` or
  `read_mesh_bearer(home)`, then fall back to the bridge token for legacy
  single-secret installs.

Verification:

- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- Targeted Rust tests passed:
  `remote_route_token_prefers_mesh_bearer_over_local_bridge_token`,
  `remote_route_token_prefers_mesh_bearer_over_env_bridge_token`, and
  `remote_route_token_accepts_musu_token_env_as_shared_bearer_override`.
- A rebuilt debug CLI route probe from `hugh_second` to `hugh-main` succeeded
  and wrote
  `.local-build\v34-self-heal\route-probe\20260628-042218-hugh_second-to-hugh-main.debug-route-evidence.json`
  with `result=success`, `route_kind=lan`, and
  `candidate_addr=192.168.1.192:4387`.
- `rustfmt --edition 2021 --check musu-rs\src\install\cli_commands.rs`
  passed.
- `git diff --check` passed.

This was the source-level fix and debug-binary route proof that preceded the
packaged proof below. The debug proof remains useful root-cause evidence, but
the current release claim should reference the later packaged
`musu.route_evidence.v1` instead. The packaged proof is still HTTP bearer
evidence with `peer_identity_verified=false`, so it does not replace the later
release-grade transport proof.

## 2026-06-28 Packaged Direct Route Proof Gate Update

The direct delegated-work route lane is now proven for the current rc.22
package on the two physical machines.

What changed:

- `F:\musu_2nd_brain` was clean at
  `027eec841613ff2e0b16df26f55066ab207ab4ec`, so
  `musu-bee/src-tauri/musu-brain.pin.json` was updated to that exact commit.
- `build-msix.ps1 -Configuration release -Architecture x64
  -StartupContract local-sideload-manual -NoBump` rebuilt the package.
- `install-and-verify-msix.ps1 -StartupContract local-sideload-manual
  -ReplaceExisting` installed and verified
  `blossompark.musu_1.15.0.22_x64__f5h38pf4yt4gc`.
- The packaged `musu.exe bridge` on `HUGH_SECOND` reported two online direct
  nodes: `hugh_second` and `hugh-main`.
- The packaged CLI ran:
  `musu route --target hugh-main --adapter echo --wait --wait-timeout-sec 60`
  and completed successfully over `route_kind=lan`,
  `candidate_addr=192.168.1.192:4387`.

Committed release evidence:

- Direct route proof:
  `docs/evidence/direct-route/1.15.0-rc.22/20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json`.
- MSIX install proof:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-050309-HUGH_SECOND.evidence.json`.
- MSIX install verification:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-050309-HUGH_SECOND.verification.json`.
- MSIX install summary:
  `docs/evidence/msix-install/1.15.0-rc.22/20260628-050309-HUGH_SECOND.summary.md`.

The new `scripts/windows/verify-direct-route-evidence.ps1` verifier rejects weak
route evidence unless the schema, version, distinct node pair, direct route
kind, remotely routable candidate address, successful result, empty failure
class, positive timing, and no MUSU-infra transit are all present. The full
product gate now has a `direct_delegated_work_route` lane, and the latest local
go/no-go reports `direct_route_verified=true` and
`direct_delegated_work_route=pass`.
`scripts/windows/test-release-evidence-verifiers.ps1 -Json` now covers the
direct-route verifier with accept/reject cases and reports `ok=true`,
`case_count=191`, `failed_case_count=0`.

Caveat: the proof is direct LAN work-targetability, not release-grade relay or
peer-identity transport. The evidence intentionally records
`peer_identity_verified=false`, `encryption=none_http_bearer`, and
`release_grade_transport=false`. Those remain covered by the separate
`relay_transport` and future release-grade transport lanes.

## 2026-06-28 Relay Runtime Source Contract Update

Relay transport is still not complete. The product cannot yet claim that
delegated work routes through relay when direct is unavailable.

The source contract is now stricter:

- `musu-rs/src/bridge/rendezvous.rs` exposes a release tunnel submit-side
  contract for `quic_relay_tunnel`, `quic_tls_1_3`, and
  `musu_quic_tls_transport`.
- The submit contract rejects non-`wss://` relay URLs, non-fingerprint peer
  public keys, non-`forwarded_task_envelope` payloads, and invalid SHA-256
  payload bindings before a release relay runtime can be enabled.
- The submit path remains fail-closed with
  `release_relay_tunnel_runtime_not_implemented`; this prevents a marker-only
  flip from turning the preview store-forward queue into a release relay claim.
- The target accept path remains in
  `musu-rs/src/bridge/handlers/relay_payload.rs` and requires release-grade
  transport proof before recording release relay route evidence.

Verification:

- Rust unit proof:
  `bridge::rendezvous::tests::release_relay_tunnel_submission_contract_is_release_grade_and_fail_closed`.
- Release evidence verifier regression now reports `ok=true`, `case_count=191`,
  and `failed_case_count=0`.

This removes the stale source-contract audit failure but does not close the
`relay_transport` lane. The lane still needs the separate relay design gate,
real runtime transport, `musu.relay_transport_proof.v1`, route evidence with the
relay proof attached, and a two-PC physical test with direct path blocked.

## Current Completion State

| Area | Status | Evidence | Completion claim allowed |
|---|---|---|---|
| PR #34 code/test/deploy checks | Mostly green | Deploy, Playwright, web build/typecheck, Rust core tests, SaaS gate, landing gate passed at current PR state | Code path is not the current blocker |
| PR #34 design approval | Not complete | PR body still uses `Design: Pending`; `design-gate` is failing by design | Cannot merge PR #34 |
| rc.22 public install/proof channel | Complete for current rc.22 package | `fleet-proof.ps1` on `hugh-main`, install-channel verifier, package `1.15.0.22` | Public install/proof channel is valid for rc.22 |
| Two-PC direct fleet health | Complete for current rc.22 proof | `hugh-main-20260627T010201Z.fleet-proof.json`, `online_nodes=2`, `direct_healthy_nodes=2` | Direct two-PC fleet health/readiness is proven, but this is not the same as delegated task proof |
| Direct delegated-work route | Complete for current rc.22 package over direct LAN | Packaged `musu route` from `hugh_second` to `hugh-main` wrote `20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json`; `verify-direct-route-evidence.ps1` reports `ok=true`, `fail_count=0`; MSIX install evidence `20260628-050309-HUGH_SECOND.*` verifies the installed package | A visible direct online node is proven work-targetable over LAN for rc.22; this does not claim relay fallback or release-grade peer identity |
| Fleet relay display | Partly complete | UI/spec keeps relay as display/freshness state only | Relay can be shown, but not claimed as delegated-work routing |
| Real delegated-work relay transport | Not complete | `musu-rs/src/bridge/router.rs` says relay is not selected because relay/tunnel transport is not implemented | Cannot claim relay task execution |
| Brain sidecar product bonding | Complete for current rc.22 packaged fresh launch | Sidecar bundle, `~/.musu/brain`, token ACL, non-shared store, task ingest hook, dedicated verifier/recorder, and `20260628-014357-HUGH_SECOND.brain-product-verification.json` with `fail_count=0` | Hidden brain chip is alive, loopback-only, version-coherent, and ingesting task/capture knowledge for rc.22 fresh launch |
| V34 discovery/stale self-heal | Partly complete | Candidate endpoints, observed-source additive candidate, route preflight, heartbeat TTL filter, boot/local reconcile source path, dedicated V34 proof recorder, and strict verifier are implemented | Needs physical stale registry/cache/manual-peer E2E proof before full self-heal claim |
| Store release readiness | Not complete | Current rc.22 Store-reviewed MSIX and submission bundle verify locally; Partner Center/MS certification/Store-signed install evidence is not present | Cannot claim Microsoft Store readiness |
| Release candidate manifest | Complete for local artifacts | Current rc.22 local sideload, Store-reviewed MSIX, Store submission bundle, Tauri MSI/NSIS, and multi-device kit are in the manifest | Manifest no longer accepts stale `1.15.0.0` artifacts or bundles |
| Support/operator evidence | Complete for current rc.22 governance | Historical mailbox delivery proof is replaced by verified public support metadata proof, scoped by `SUPPORT_OPERATOR_GATE_RETIREMENT_2026_06_28.md` and recorded in `20260628-033452-support-operator-gate-retirement.*` | Support availability remains required and verified through public metadata |

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
11. Support/operator governance is either proven by current mailbox delivery
    evidence or formally retired by current public support metadata evidence
    without retiring support availability.
12. Final go/no-go tooling reports the same state from live/package evidence and
    lists no release blockers.

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | The full product cannot be called complete today. | Direct proof, brain product proof, and support/operator governance are green, but design, Store distribution, relay transport, and V34 self-heal proof remain separate gaps. | A broad "complete" claim would overstate the evidence. | Keep the claim scoped to rc.22 two-PC direct readiness plus hidden-brain fresh-launch proof plus support gate retirement until all lanes below are closed. |
| NO-GO | PR #34 cannot merge without explicit design approval. | `Design: Pending` keeps `design-gate` failing. | The current implementation branch remains blocked even if code checks pass. | Get approval on issue #35, update PR body to `Design: Approved` with the approval URL, rerun checks. |
| HIGH | Relay is display-only, not a delegated-work transport. | `router.rs` does not return relay paths; relay proof docs still require actual transport evidence. | Yellow relay state cannot be sold as "task routes through MUSU relay". | Implement relay transport, fail-closed route evidence, and two-PC failure-injection proof. |
| INFO | Direct delegated-work over LAN is now proven for rc.22. | Packaged route evidence `20260628-050231-HUGH_SECOND-to-hugh-main.packaged-direct-route-evidence.json` verifies successfully and the go/no-go lane `direct_delegated_work_route` reports `pass`. | The previous 401/invalid-bearer blocker is closed for direct routes. | Keep the evidence committed; do not treat it as relay or release-grade transport proof. |
| INFO | Brain product proof is closed for fresh packaged launch, with one restart caveat. | Initial local recorder output failed while stale packaged desktop processes were already running; after AppX relaunch, official evidence `20260628-014357-HUGH_SECOND.brain-product-verification.json` reports `ok=true`, `fail_count=0`. | The hidden-brain spec is proven for fresh launch, but upgrade-in-place self-heal is not a separate release claim yet. | Keep the evidence committed; add an upgrade-in-place sidecar self-heal proof if that behavior becomes part of the release claim. |
| HIGH | Store readiness is still external evidence, not inferred from MSIX proof. | Current docs separate MSIX package proof from Partner Center/MS certification/Store release. | Public release through Store remains a manual/external gate. | Prepare current Store bundle, reserve product name, pass restricted capability review, record Store-signed install proof. |
| MED | V34 stale self-heal is partly implemented but not fully proven. | Candidate set, observed-source additive candidate, route preflight, heartbeat TTL, boot/local reconcile, and strict V34 proof verifier exist; physical stale-state E2E evidence is still missing. | Reinstall/multi-NIC/stale-row tails can still surprise users until physical proof exists. | Run the physical stale registry/cache/manual-peer proof and commit verifier-passing evidence. |
| INFO | Support mailbox delivery proof is now a retired historical gate once retirement evidence is current. | The replacement gate requires live support/privacy/public-config proof and rejects evidence that retires support availability. | This removes an operator-only release blocker without weakening the public support contract. | Keep public metadata verified; use mailbox proof only as an optional operational check. |

## Dependency Map

- PR #34 design approval blocks merge.
- PR #34 merge blocks a clean baseline for the next implementation lanes.
- Direct delegated-work proof is closed for the current rc.22 package over
  direct LAN.
- Store release depends on current package artifacts, Partner Center setup,
  restricted capability review, certification, and Store-signed install proof.
- Relay transport depends on router selection, transport implementation,
  fail-closed proof schema, and two-PC failure-injection evidence.
- Brain product proof is closed for the current rc.22 fresh packaged launch;
  upgrade-in-place sidecar self-heal remains a future hardening proof if needed.
- V34 self-heal depends on stale registry/cache/manual-peer cleanup,
  boot reconcile, and route-preflight E2E.
- Final go/no-go depends on all evidence sources being current and indexed.

## Main Constraint

The immediate merge constraint is PR #34 design approval because it blocks
merging the current rc.22 proof/fleet fixes.

The immediate product-evidence constraint has moved past direct delegated-work
proof. The remaining product-evidence constraints are Store release evidence,
real relay transport, and V34 stale self-heal evidence.
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
  proof, and support/operator proof or formal support gate retirement.
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
  local reachability. Source path implemented; physical proof still required.
- TTL prune evidence for stale cloud rows.
- Stale-first-candidate route-preflight physical E2E.
- No duplicate task execution while trying route candidates.

Proof:
- Two physical nodes with injected stale public URL/cache/manual peer.
- Route evidence shows reachable LAN candidate selected before stale candidate.
- Registry/current fleet excludes heartbeat-expired rows.
- `verify-v34-self-heal-proof.ps1` accepts the proof and rejects weak
  boolean-only proof, duplicate task execution, and unroutable selected
  candidates.

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

Status: complete for the current rc.22 packaged fresh launch on `HUGH_SECOND`.
Keep this phase open only for upgrade-in-place hardening or explicitly scoped
future ingest surfaces such as fleet events.

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
- `record-brain-product-proof.ps1 -OutputRoot docs\evidence\brain-product\<version> -Json`.
- `verify-brain-product-proof.ps1 -EvidencePath <BRAIN_PRODUCT_JSON> -ExpectedVersion <version> -Json`.
- Packaged sidecar health evidence.
- Task source ingest evidence under `~/.musu/brain`.
- UX smoke/e2e proof for recall/capture.
- Current rc.22 evidence:
  `docs/evidence/brain-product/1.15.0-rc.22/20260628-014357-HUGH_SECOND.brain-product-proof.json`
  and matching verification with `ok=true`, `fail_count=0`.

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
- Support/operator evidence or formal retirement; current rc.22 uses formal
  retirement evidence.
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
- rc.22 hidden brain sidecar fresh-launch readiness is proven on
  `HUGH_SECOND` with verifier-passing task ingest and capture recall evidence.
- rc.22 support/operator governance is proven through the formal mailbox
  delivery gate retirement and verified public support metadata.
- The current repo intentionally prevents relay overclaim by keeping relay out
  of selected route paths until transport exists.
- PR #34 is blocked by design approval, not by the currently observed code/test
  checks.

Medium confidence:
- The install/proof channel is correct for rc.22. It should be rerun after any
  package, route, installer, or public script change.
- Upgrade-in-place sidecar relaunch behavior should be hardened separately if
  it becomes a release claim; the current evidence proves fresh packaged launch.

Unknown or needs evidence:
- Microsoft Store certification timing and restricted capability approval.
- Relay transport design choice and self-contained risk until the separate
  relay design gate is run.
