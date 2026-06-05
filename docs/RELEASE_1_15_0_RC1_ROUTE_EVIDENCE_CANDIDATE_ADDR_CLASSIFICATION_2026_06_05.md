# MUSU 1.15.0-rc.1 Route Evidence Candidate Address Classification

Date: 2026-06-05

## Decision

The roadmap remains the local-executor / web-control split:

- the installed local MUSU program does the work on each device
- `musu.pro` accepts remote user input, hosts rooms, coordinates presence and
  rendezvous, and records route evidence
- `localhost:3001/app` is an optional workspace dashboard, not the packaged
  local program
- web-assisted discovery can improve P2P setup, but direct P2P remains the
  preferred data path and relay remains fallback-only

## Hardening

Root cause: the web route-evidence API accepted a claimed direct `route_kind`
without verifying that `candidate_addr` classified to the same path kind. That
left a gap where a record could claim `lan`, `tailscale`, or `direct_quic` while
the address described a different path class.

Commit `7048cd8f869d1a14be3a4809f18f53af89e0d7e1` fixes this by classifying
direct route evidence addresses before release-grade evaluation:

- loopback, private, and link-local addresses classify as `lan`
- `100.64.0.0/10` addresses classify as `tailscale`
- public IPs and hostnames classify as `direct_quic`
- mismatches add `route_kind_candidate_addr_mismatch`

Changed files:

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
- `docs/P2P_CONTROL_PLANE.md`

Validation:

- `npm exec -- tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`
  passed `27/27`
- `npm run test:p2p` passed `84/84`
- `npm run typecheck` passed
- `git diff --check` passed

## Current Gate

Clean go/no-go after this commit reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `multi_device_verified=false`
- runtime idle CPU evidence valid machines: `1/2`
- runtime CPU scenario matrix valid machines: `1/2`
- `p2p_control_plane_verified=false`
- `manifest_git_dirty=false`

`show-musu-pro-p2p-env-status.ps1 -Json` still reports No-Go:

- `queue_fallback=true`
- release relay connect endpoint is not implemented
- release relay payload endpoint is not implemented
- production KV/Upstash storage is not configured
- live relay transport is not wired
- live relay route proof is missing
- live relay payload delivery proof is missing

This is intentional. The current source supports owner-scoped store-forward
queue fallback evidence, but it still does not claim a release-grade QUIC/TLS
relay tunnel. Env flags alone cannot close the P2P gate.

## Next Steps

1. Install the current build on the second Windows PC and record current-build
   multi-device, idle CPU, and CPU matrix evidence.
2. Provision production KV/Upstash for `musu.pro`, deploy, and rerun hosted P2P
   evidence.
3. Replace the fail-closed release relay connect/payload placeholders with real
   QUIC/TLS fallback transport.
4. Record owner-scoped relay route evidence with transport and payload delivery
   proof.
5. Record support mailbox and Store release evidence.
