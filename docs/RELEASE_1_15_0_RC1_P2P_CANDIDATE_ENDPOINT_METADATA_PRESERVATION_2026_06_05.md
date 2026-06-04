# RC1 P2P Candidate Endpoint Metadata Preservation

Date: 2026-06-05 08:16 KST

## Summary

The `musu.pro` web control plane now preserves the endpoint metadata needed to
bootstrap better P2P path selection between local MUSU programs.

Candidate endpoints now carry:

- `public_addr`
- `nat_type`
- `nat_observed_by`
- `relay_url`
- `relay_protocol`

This keeps the product boundary intact: `musu.pro` can accept remote user input,
host project rooms, record presence, coordinate rendezvous, and help pick a
route, while the installed local MUSU programs execute the work and prefer P2P
after web-assisted discovery.

## Root Cause Note

`ERR_CONNECTION_REFUSED` for `http://127.0.0.1:3001/app` is not an internet
failure and not proof that MUSU is a web-only app. Port `3001` is an optional
workspace dashboard. The installed packaged runtime can be healthy without it.

The current local check showed:

- `127.0.0.1:3001` had no listener and refused the browser request.
- `127.0.0.1:8186/health` returned `200 OK` from the packaged MUSU local
  bridge.

So the product direction remains local-program-first. `localhost:3001` must not
be required for packaged runtime health or release CPU evidence.

## Implementation

- `p2pRendezvousStore.ts` now defines `P2pNatType` and `P2pRelayProtocol`.
- Candidate endpoint normalization is centralized in
  `normalizeCandidateEndpoint` and `normalizeCandidateEndpoints`.
- Room presence now reuses the shared rendezvous candidate normalizer instead
  of preserving only `kind`, `addr`, `observed_at`, and `scheme`.
- `POST /api/v1/p2p/rendezvous/[id]/candidates` accepts public endpoint, NAT,
  and relay descriptor fields.
- `POST /api/rooms/[roomId]/presence` accepts the same fields and seeds the
  rendezvous candidate cache with them.
- Room-scoped rendezvous tests now prove seeded candidate metadata survives
  through `musu.pro` room presence and rendezvous creation.
- `audit-p2p-store-forward-relay-contract.ps1` now gates this with
  `candidate endpoint metadata is preserved through web control plane`.

## Validation

- `npm run test:p2p` passed `79/79`.
- `npm run typecheck` passed.
- `audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem` passed
  with `ok=true` and `fail_count=0`.
- `git diff --check` passed.

## Release Status

This is web control-plane and P2P metadata hardening. It does not close the
remaining public release gates:

- second-PC current-build install, route, CPU, and matrix evidence
- hosted `musu.pro` production KV/Upstash and release-grade relay proof
- support mailbox evidence
- Store/Microsoft approval evidence

Current validation is still one-machine only until the same current build is
installed on a second Windows PC.
