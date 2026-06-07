# MUSU 1.15.0-rc.1 Public Metadata and P2P Source Blocker Recheck

Date: 2026-06-07 21:00 KST

## Scope

This recheck records the current-head public metadata gate and the current
P2P control-plane blocker shape after the idle busy-loop candidate audit.

This is not a public release pass. It closes the skipped public metadata
condition in the latest local go/no-go run and keeps the release relay byte-path
blockers explicit.

## Public Metadata

Command:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`

Result:

- `ok=true`
- `fail_count=0`
- privacy URL: `https://musu.pro/privacy`
- support URL: `https://musu.pro/support`
- expected support email: `musu@musu.pro`
- `/privacy` returned HTTP `200`
- `/support` returned HTTP `200`
- both pages contain the expected release metadata text and `musu@musu.pro`

## Current Go/No-Go

Command:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -Json`

Current generated go/no-go:

- generated at `2026-06-07T21:00:52.1567414+09:00`
- commit `f158336ac3fec3481ea4160bb1351485c6e10a63`
- git dirty `false`
- `ready_for_public_desktop_release=false`
- `public_metadata_checked=true`
- `public_metadata_ok=true`
- blocker count `6`

The prior `store-public-metadata` blocker is no longer present. Remaining
blocker areas:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

Local gates still passing:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- targeted route-attempt CPU diagnostic `1/1`
- idle busy-loop candidates `8/8`

## P2P Source Blocker Read

Command:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -SkipGithub -Json`

Source status:

- store-forward queue fallback implemented `true`
- release relay connect endpoint implemented `true`
- release relay payload endpoint implemented `false`
- release payload preflight endpoint implemented `true`
- release payload preflight only `true`
- release tunnel payload endpoint missing `true`
- release relay tunnel runtime implemented `false`
- release relay tunnel runtime source contract ready `true`
- release relay tunnel runtime not-implemented branch active `true`
- preview store-forward payload queue non-release-grade `true`
- relay transport kind `quic_relay_tunnel`
- release transport proof requirement `quic_tls_1_3`

Live evidence status:

- latest P2P evidence path:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-180311-musu.pro.evidence.json`
- live evidence error class: `p2p_runtime_not_logged_in`
- relay transport wired `false`
- relay route evidence count `0`
- relay route metadata valid count `0`
- relay route transport proof valid count `0`
- relay payload delivery proof valid count `0`

## Engineering Meaning

The release payload marker must not be flipped yet. The current source has a
release payload metadata preflight and a preview store-forward queue, but it
does not accept release tunnel payload bytes and does not prove an actual
`quic_relay_tunnel` byte path.

The release tunnel runtime marker must not be flipped yet either. The source
contract hooks are present, but the active Rust branch still reports
`release_relay_tunnel_runtime_not_implemented`. A marker flip before removing
that branch would correctly fail the P2P env status conflict guard.

Next implementation step for the P2P blocker:

1. implement the local release relay tunnel runtime byte path;
2. add a distinct release tunnel payload endpoint that can accept/transport
   payload bytes;
3. emit `musu.relay_transport_proof.v1` bound to session, lease, source,
   target, tunnel, relay URL, and payload hash;
4. emit relay payload delivery proof after bytes transit MUSU relay
   infrastructure;
5. only then set `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true` and
   `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true`.

Second-PC and external operator gates remain separate blockers.
