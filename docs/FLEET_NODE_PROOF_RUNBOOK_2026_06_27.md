# Fleet Node Proof Runbook (2026-06-27)

Scope: repo-free proof path for a physical Windows PC such as `hugh-main` after
installing MUSU from the public `musu.pro` channel.

## Purpose

`repair-fleet.ps1` proves that the local packaged bridge can restart and publish
a LAN-usable URL. That is necessary but not enough for the current release
audit. The release proof also needs the public install channel, installed MSIX
version, brain token custody, and two-PC direct fleet state.

`https://musu.pro/fleet-proof.ps1` is the wrapper for that fleet-node proof. It
does not replace the installer. It validates the hosted installer, runs the
hosted repair/check script, then collects local package, doctor, fleet, node
registry, and brain token ACL evidence.

By default this proves install/package/direct fleet health. It does **not**
prove the release-grade delegated-work transport. Add
`-RequireReleaseGradeRoute` only when you want the proof script to execute a
targeted `musu route --adapter echo --wait` task and require
`musu.route_evidence.v1` with verified peer identity,
`encryption=quic_tls_1_3`, and
`transport_verified_by=musu_quic_tls_transport`.

## Main PC Command

On `hugh-main`:

```powershell
irm https://musu.pro/install.ps1 | iex
```

Launch MUSU once so the packaged first-run path can create the brain runtime
token, then run:

```powershell
& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName hugh-main -ExpectedDirectPeerName hugh_second -RequireBrainToken -Json
```

If the goal is only to prove the main PC itself and the second PC is not
available, omit `-ExpectedDirectPeerName hugh_second`. That is not a two-machine
direct-route proof.

For strict release-grade route proof, run:

```powershell
& ([scriptblock]::Create((irm https://musu.pro/fleet-proof.ps1))) -ExpectedNodeName hugh-main -ExpectedDirectPeerName hugh_second -RequireBrainToken -RequireReleaseGradeRoute -Json
```

Current rc.22 installed HTTP bearer routes are expected to fail this strict
mode until the hardened transport path emits verified peer identity and
`quic_tls_1_3` evidence.

## Acceptance Criteria

- `schema=musu.fleet_node_proof.v1`
- `ok=true`, `fail_count=0`
- `expected_package_version=1.15.0.22`
- `installed_package_version=1.15.0.22`
- `package_full_name` starts with `blossompark.musu_1.15.0.22_`
- `bridge_bind_addr` is LAN-capable, usually `0.0.0.0:<port>`
- `advertised_public_url` and repair evidence URLs are not loopback/wildcard
- `brain_token_required=true`
- `brain_token_present=true`
- `brain_ingest_token_acl_restricted` passes
- If `-ExpectedDirectPeerName hugh_second` is supplied, `expected_direct_peer`
  passes and `online_nodes` remains direct-only.
- If `-RequireReleaseGradeRoute` is supplied, `release_grade_route_verified`
  must be true and the embedded `release_grade_route_evidence` must summarize
  `musu.route_evidence.v1`, the expected release version, `result=success`,
  verified peer identity, a present peer public key,
  `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`.

## System Design Notes

- The public install channel is a release dependency, so the proof runs the
  hosted `Install-MUSU.ps1 -ValidateReleaseOnly` path in a child PowerShell
  process before trusting local evidence.
- The route is served by the current `musu.pro` site and pinned to the current
  public package version. `verify-musu-pro-install-channel.ps1` verifies the
  live `/fleet-proof.ps1` route so an old or incomplete production site cannot
  pass the install-channel gate.
- The proof does not write the brain store and does not touch brain SQLite. The
  brain chip remains the store owner; MUSU verifies only token presence and ACL.
- The repair sub-step may restart the packaged bridge unless `-NoRestart` is
  supplied. That is intentional for post-install proof because stale bridge
  process state was one of the audit findings.

## Current Evidence

The command above was run on `hugh-main` for rc.22 and the resulting JSON is
saved at:

`docs/evidence/fleet-proof/1.15.0-rc.22/hugh-main-20260627T010201Z.fleet-proof.json`

That proof is `ok=true`, `fail_count=0`, `warn_count=0`, package
`1.15.0.22`, `advertised_public_url=http://192.168.1.192:4387`,
`online_nodes=2`, `direct_healthy_nodes=2`, expected direct peer
`hugh_second`, and `brain_ingest_token_acl_restricted` passing.

This evidence is valid for the current rc.22 physical direct fleet-health
claim. It is not release-grade delegated-work transport proof. Rerun the proof
for any new package, node identity, installer route, or release claim, and use
`-RequireReleaseGradeRoute` when the release claim includes hardened task
routing.
