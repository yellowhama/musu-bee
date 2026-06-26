# Fleet Node Proof Runbook (2026-06-27)

Scope: repo-free proof path for a physical Windows PC such as `hugh-main` after
installing MUSU from the public `musu.pro` channel.

## Purpose

`repair-fleet.ps1` proves that the local packaged bridge can restart and publish
a LAN-usable URL. That is necessary but not enough for the current release
audit. The release proof also needs the public install channel, installed MSIX
version, brain token custody, and two-PC direct fleet state.

`https://musu.pro/fleet-proof.ps1` is the wrapper for that full proof. It does
not replace the installer. It validates the hosted installer, runs the hosted
repair/check script, then collects local package, doctor, fleet, node registry,
and brain token ACL evidence.

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

## Remaining External Evidence

This runbook cannot produce physical `hugh-main` evidence from `hugh_second`.
The command above must be run on `hugh-main`, and the resulting JSON should be
attached to the release/handoff notes.
