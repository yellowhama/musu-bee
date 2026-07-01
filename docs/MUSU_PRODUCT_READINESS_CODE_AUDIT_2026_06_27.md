# MUSU Product Readiness Code Audit (2026-06-27)

## Scope

This audit follows the pasted runtime findings and the product purpose gate:
MUSU should make the user's own computers behave like one trustworthy work
surface. A node is useful only when it can actually receive work, not merely
when a registry row looks fresh.

## Findings

| Severity | Finding | Evidence | Impact | Next |
|---|---|---|---|---|
| MED | PR #34 cannot honestly pass design-gate yet. | PR body says `Design: Pending`; issue #35 says approval requested but not approved; `scripts/design-gate/evaluate.cjs` requires `Design: Approved`, a design issue URL, and an artifact URL when UI files change. | The branch is mergeable at Git level, but CI correctly blocks the PR until explicit design approval exists. | Get an explicit CEO/design approval comment on issue #35, then update the PR body to `Design: Approved` with the approval URL. |
| MED | Design-gate accepted approval-token mentions inside instructions. | After the PR body was corrected to say approval was pending, the phrase `` `Design: Approved` `` inside an instruction made `design-gate` pass. | A pending approval could look green without real approval evidence. | `scripts/design-gate/evaluate.cjs` now requires `Design: Approved` as a standalone status line; regression test added. |
| LOW | Design-gate evaluator regression tests were not wired into the design-gate workflow. | `scripts/design-gate/evaluate.test.cjs` existed, but `.github/workflows/design-gate.yml` only ran the evaluator through the PR event. | Future evaluator regressions could be caught only indirectly. | The workflow now runs `node --test scripts/design-gate/*.test.cjs` before evaluating PR evidence. |
| LOW | Local operator workflow was slower than necessary. | A broad `rg` over `docs/vendor` and evidence JSON produced hundreds of thousands of tokens before being stopped. | This does not affect MUSU runtime, but it slows audits and increases context noise. | Use targeted paths and exclude `docs/vendor/**`, `docs/evidence/**`, `target/**`, and `node_modules/**` by default. |
| INFO | Two-machine direct readiness for rc.22 is now proven on both physical PCs. | `docs/evidence/fleet-proof/1.15.0-rc.22/hugh-main-20260627T010201Z.fleet-proof.json` is `ok=true`, `fail_count=0`, `warn_count=0`, package `1.15.0.22`, `advertised_public_url=http://192.168.1.192:4387`, `online_nodes=2`, `direct_healthy_nodes=2`, expected peer `hugh_second`, and brain token ACL restricted. A follow-up `musu status --json` on `hugh_second` shows `hugh-main` healthy over direct route. | We can claim current direct LAN two-PC proof for rc.22. This still does not prove Store readiness or relay transport for delegated work. | Keep the JSON attached to release evidence; rerun the proof after any package, route, node, or installer change. |
| INFO | The pasted HIGH runtime defects are fixed in current code. | `musu-rs/src/bridge/mod.rs` writes registry `last_seen` through `registry_last_seen_to_heartbeat`, and rejects loopback/wildcard/port-0 public URLs through `public_url_to_remote_addr`. `musu-rs/src/peer/discovery.rs` ignores unusable cached registry peers. | The old false-fresh relay/online bug is covered at the source of fleet truth. | Keep `registry_last_seen`, `public_url`, and unusable-cache tests in the release gate. |
| INFO | Relay-display is now separated from direct work readiness. | `musu-rs/src/bridge/handlers/fleet.rs` documents relay as display-only and `tally_fleet()` counts only direct healthy peers in `online_nodes`. Hosted `fleet-proof.ps1` checks `online_nodes_direct_only`. | Users should no longer see a relay/display-only peer as a work-targetable online node. | Preserve this wording in CLI, web fleet UI, and release reports. |
| INFO | Install-channel proof is now version-aware instead of HTTP-200-only. | `musu-bee/src/app/fleet-proof.ps1/route.ts` checks `installed_package_version_matches_release`; `scripts/windows/verify-musu-pro-install-channel.ps1` verifies live `/fleet-proof.ps1` schema, expected package version, and proof gates. | A stale package can no longer masquerade as a successful install-channel proof. | Keep cache-busted release URLs and live install-channel verification before giving the one-line command to another PC. |
| INFO | Public install pages now lead to release-grade proof, not only weak post-install checks. | `/download` and `/install` expose the hosted `fleet-proof.ps1` command; `src/app/public-metadata-contract.test.ts` asserts both public pages keep that command visible. `hugh-main` used that path to emit the accepted `musu.fleet_node_proof.v1` evidence. | The public path now reaches the same release-grade JSON evidence this audit requires. | Keep the proof command on public install surfaces for future PC/package proof refreshes. |

## Code Audit Notes

- `musu-rs/src/bridge/mod.rs`
  - Good: registry cache heartbeat now comes from registry `last_seen`, not local fetch time.
  - Good: remote `public_url` conversion rejects local-only addresses, wildcard hosts, and port `0`.
  - Risk left: this proves direct-route truth only; real relay transport and Store readiness remain separate claims.

- `musu-rs/src/peer/discovery.rs`
  - Good: unusable cached registry rows no longer suppress a usable same-name peer.
  - Risk left: stale cloud rows should still be cleaned or hidden by live server behavior, not only tolerated by clients.

- `musu-rs/src/bridge/handlers/fleet.rs`
  - Good: `online_nodes` is direct/healthy only; relay freshness is a separate display verdict.
  - Risk left: every user-facing surface must keep the same vocabulary: direct, relay-display, offline.

- `scripts/windows/verify-fleet-audit-contract.ps1`
  - Good: packaged proof now checks installed package version, remote-usable URL, direct-only online count, and secret ACLs.
  - Risk left: it must be rerun on each physical machine whenever the package, installer, or route contract changes.

- `musu-bee/src/app/fleet-proof.ps1/route.ts`
  - Good: the hosted proof wrapper makes the main-PC evidence path repo-free.
  - Good: the wrapper produced accepted physical `hugh-main` proof for rc.22.
  - Risk left: the wrapper is a proof surface; it must stay version-pinned and live-verified.

- `musu-bee/src/app/download/page.tsx` and `musu-bee/src/app/install/page.tsx`
  - Good: the public install surfaces now show `fleet-proof.ps1`, so the user path
    reaches release-grade JSON evidence instead of stopping at `package-status`.
  - Risk left: design approval is still pending for the changed public UI surface.

## Dependency Map

- `hugh-main` physical install, first launch, and hosted proof are complete for
  current rc.22 evidence.
- `fleet-proof.ps1` JSON from `hugh-main` is saved under
  `docs/evidence/fleet-proof/1.15.0-rc.22/`.
- Issue #35 approval blocks PR #34 design-gate.
- Design-gate blocks honest merge, even though code/test/deploy checks are green.
- Design-gate must treat `Design: Approved` only as a standalone approval
  status line, not as prose or a backticked instruction.
- Design-gate must run its evaluator regression tests in CI before evaluating
  PR evidence.
- Any new package, node identity, installer, or route contract change invalidates
  the current physical proof and requires rerunning `fleet-proof.ps1`.
- Broad repository searches slow the audit loop but do not block product readiness.

## Next Action Packet

Accepted two-machine readiness result for rc.22:

- `schema=musu.fleet_node_proof.v1`
- `ok=true`
- `fail_count=0`
- `installed_package_version=1.15.0.22`
- `expected_package_version=1.15.0.22`
- `advertised_public_url` is remote-usable, not loopback or wildcard
- `online_nodes` equals direct healthy peers
- `expected_direct_peer` passes for `hugh_second`
- `brain_ingest_token_acl_restricted` passes

Current evidence file:

`docs/evidence/fleet-proof/1.15.0-rc.22/hugh-main-20260627T010201Z.fleet-proof.json`

Next:

1. Get explicit CEO/design approval on issue #35.
2. Change PR #34 body from `Design: Pending` to `Design: Approved` with the approval URL.
3. Re-run PR checks and merge only if design-gate and the product proof both pass.
4. Do not expand the release claim to Store readiness or relay transport until those paths have their own evidence.

## Confidence

High confidence: the pasted audit's code-level false-freshness and false-online
defects are fixed in the current branch and covered by targeted tests. The
current two-machine direct readiness claim is backed by physical `hugh-main`
proof and `hugh_second` peer status.

Medium confidence: the public install/proof channel is shaped correctly because
the live verifier and hosted physical proof both passed for rc.22.

Not proven: PR #34 design approval, Store readiness, and real relay transport
for delegated work.
