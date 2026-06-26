# MUSU Product Readiness Code Audit (2026-06-27)

## Scope

This audit follows the pasted runtime findings and the product purpose gate:
MUSU should make the user's own computers behave like one trustworthy work
surface. A node is useful only when it can actually receive work, not merely
when a registry row looks fresh.

## Findings

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| HIGH | Two-machine readiness is still unproven because physical `hugh-main` proof is missing. | Current proof is from `hugh_second`; `docs/PRODUCT_PURPOSE_AND_IMPLEMENTATION_GATE_2026_06_27.md` and `docs/FLEET_NODE_PROOF_RUNBOOK_2026_06_27.md` both require `fleet-proof.ps1` on `hugh-main`. | We can claim the second machine path is fixed, but not the full two-PC product loop. | Run hosted install/proof on `hugh-main` and attach the `musu.fleet_node_proof.v1` JSON. |
| MED | PR #34 cannot honestly pass design-gate yet. | PR body says `Design: Pending`; issue #35 says approval requested but not approved; `scripts/design-gate/evaluate.cjs` requires `Design: Approved`, a design issue URL, and an artifact URL when UI files change. | The branch is mergeable at Git level, but CI correctly blocks the PR until explicit design approval exists. | Get an explicit CEO/design approval comment on issue #35, then update the PR body to `Design: Approved` with the approval URL. |
| INFO | The pasted HIGH runtime defects are fixed in current code. | `musu-rs/src/bridge/mod.rs` writes registry `last_seen` through `registry_last_seen_to_heartbeat`, and rejects loopback/wildcard/port-0 public URLs through `public_url_to_remote_addr`. `musu-rs/src/peer/discovery.rs` ignores unusable cached registry peers. | The old false-fresh relay/online bug is covered at the source of fleet truth. | Keep `registry_last_seen`, `public_url`, and unusable-cache tests in the release gate. |
| INFO | Relay-display is now separated from direct work readiness. | `musu-rs/src/bridge/handlers/fleet.rs` documents relay as display-only and `tally_fleet()` counts only direct healthy peers in `online_nodes`. Hosted `fleet-proof.ps1` checks `online_nodes_direct_only`. | Users should no longer see a relay/display-only peer as a work-targetable online node. | Preserve this wording in CLI, web fleet UI, and release reports. |
| INFO | Install-channel proof is now version-aware instead of HTTP-200-only. | `musu-bee/src/app/fleet-proof.ps1/route.ts` checks `installed_package_version_matches_release`; `scripts/windows/verify-musu-pro-install-channel.ps1` verifies live `/fleet-proof.ps1` schema, expected package version, and proof gates. | A stale package can no longer masquerade as a successful install-channel proof. | Keep cache-busted release URLs and live install-channel verification before giving the one-line command to another PC. |
| LOW | Local operator workflow was slower than necessary. | A broad `rg` over `docs/vendor` and evidence JSON produced hundreds of thousands of tokens before being stopped. | This does not affect MUSU runtime, but it slows audits and increases context noise. | Use targeted paths and exclude `docs/vendor/**`, `docs/evidence/**`, `target/**`, and `node_modules/**` by default. |

## Code Audit Notes

- `musu-rs/src/bridge/mod.rs`
  - Good: registry cache heartbeat now comes from registry `last_seen`, not local fetch time.
  - Good: remote `public_url` conversion rejects local-only addresses, wildcard hosts, and port `0`.
  - Risk left: this proves source code behavior, not that `hugh-main` has installed and run the fixed package.

- `musu-rs/src/peer/discovery.rs`
  - Good: unusable cached registry rows no longer suppress a usable same-name peer.
  - Risk left: stale cloud rows should still be cleaned or hidden by live server behavior, not only tolerated by clients.

- `musu-rs/src/bridge/handlers/fleet.rs`
  - Good: `online_nodes` is direct/healthy only; relay freshness is a separate display verdict.
  - Risk left: every user-facing surface must keep the same vocabulary: direct, relay-display, offline.

- `scripts/windows/verify-fleet-audit-contract.ps1`
  - Good: packaged proof now checks installed package version, remote-usable URL, direct-only online count, and secret ACLs.
  - Risk left: it must be run on each physical machine that is part of the release claim.

- `musu-bee/src/app/fleet-proof.ps1/route.ts`
  - Good: the hosted proof wrapper makes the main-PC evidence path repo-free.
  - Risk left: the wrapper is only a proof surface; it does not replace physical execution on `hugh-main`.

## Dependency Map

- `hugh-main` physical install and first launch blocks two-machine readiness.
- `fleet-proof.ps1` JSON from `hugh-main` blocks final release evidence.
- Issue #35 approval blocks PR #34 design-gate.
- Design-gate blocks honest merge, even though code/test/deploy checks are green.
- Broad repository searches slow the audit loop but do not block product readiness.

## Next Action Packet

Run on `hugh-main`:

```powershell
irm https://musu.pro/install.ps1 | iex
```

Launch MUSU once, then run:

```powershell
& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName hugh-main -ExpectedDirectPeerName hugh_second -RequireBrainToken -Json
```

Accept only this result shape for two-machine readiness:

- `schema=musu.fleet_node_proof.v1`
- `ok=true`
- `fail_count=0`
- `installed_package_version=1.15.0.22`
- `expected_package_version=1.15.0.22`
- `advertised_public_url` is remote-usable, not loopback or wildcard
- `online_nodes` equals direct healthy peers
- `expected_direct_peer` passes for `hugh_second`
- `brain_ingest_token_acl_restricted` passes

After that:

1. Add the `hugh-main` proof JSON to the release/handoff notes.
2. Get explicit CEO/design approval on issue #35.
3. Change PR #34 body from `Design: Pending` to `Design: Approved` with the approval URL.
4. Re-run PR checks and merge only if design-gate and the product proof both pass.

## Confidence

High confidence: the pasted audit's code-level false-freshness and false-online
defects are fixed in the current branch and covered by targeted tests.

Medium confidence: the public install/proof channel is shaped correctly because
the live verifier has passed, but that is not a substitute for `hugh-main`
physical proof.

Not proven: full two-machine product readiness, design approval, Store
readiness, and real relay transport for delegated work.
