# Release 1.15.0-rc.1 Current Operator Handoff Pack After Target Route CPU Audit

Generated: 2026-06-07T07:48:00+09:00

## Summary

After restoring current-HEAD targeted `HUGH-MAIN` route-attempt CPU evidence,
the second-PC/operator handoff scripts were refreshed and a new current-HEAD
handoff packet was generated.

The refreshed handoff keeps the product boundary explicit:

- MUSU Desktop is the local executor.
- MUSU.PRO is remote input, project room, rendezvous/path-selection, relay
  fallback, and evidence/control plane.
- `localhost:3001` is not the packaged desktop contract.
- targeted route-attempt CPU evidence must use a real non-local peer target,
  not the local machine name, `localhost`, `127.0.0.1`, or a local bridge
  address.

## Script Changes

Updated:

- `scripts\windows\prepare-final-operator-gate-packet.ps1`
- `scripts\windows\prepare-operator-action-pack.ps1`

Behavior changes:

- final operator packets now include the current local desktop evidence report:
  `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_LOCAL_DESKTOP_EVIDENCE_AFTER_MDNS_CANCELLATION_2026_06_07.md`
- final operator packets now include the current target-route CPU audit/spec
  report:
  `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_TARGET_ROUTE_CPU_AUDIT_SPEC_REFRESH_2026_06_07.md`
- second-PC quickstart now warns operators not to use self/local route targets
  for `-RouteReachabilityTarget` or `-RuntimeCpuRouteTarget`

## Generated Handoff Artifacts

Source commit:

- `981f37ac2a03fba228a252269d1cfc761ae87777`

Final operator gate packet:

- root:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-074518`
- zip:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-074518.zip`
- latest zip:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- multi-device kit:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-074518\kits\musu-multidevice-1.15.0-rc.1-20260607-074518.zip`

Operator action pack:

- root:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-074533`
- zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-074533.zip`
- latest zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-074533\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260607-074533.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-074533\partner-center\MUSU-1.15.0-rc.1-store-submission-20260607-074533.zip`

Support mailbox:

- support email: `musu@musu.pro`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260607-074518`

## Verification

Validation:

- `git diff --check`
- final packet verifier:
  - `ok=true`
  - `fail_count=0`
  - `kit_count=1`
- action pack verifier:
  - `ok=true`
  - `fail_count=0`
- zip membership check confirmed the final packet includes:
  - `RELEASE_1_15_0_RC1_CURRENT_HEAD_LOCAL_DESKTOP_EVIDENCE_AFTER_MDNS_CANCELLATION_2026_06_07.md`
  - `RELEASE_1_15_0_RC1_CURRENT_HEAD_TARGET_ROUTE_CPU_AUDIT_SPEC_REFRESH_2026_06_07.md`

## Release Meaning

This does not close the second-PC gate by itself. It prepares the current
handoff artifact needed to run the next physical second-PC release check.

Remaining blockers:

- real second-PC multi-device route evidence
- second-PC desktop-open idle CPU evidence
- second-PC five-state runtime CPU matrix evidence
- live MUSU.PRO P2P env and relay proof
- support mailbox delivery proof
- Microsoft Store proof
