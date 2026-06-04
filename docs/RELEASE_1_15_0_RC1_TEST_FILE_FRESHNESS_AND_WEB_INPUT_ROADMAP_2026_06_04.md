# MUSU 1.15.0-rc.1 Test File Freshness and Web Input Roadmap

Date: 2026-06-04

## Summary

Release freshness classifiers now treat TypeScript test/spec source files as
status-only changes:

- `*.test.ts`
- `*.test.tsx`
- `*.spec.ts`
- `*.spec.tsx`

This fixes the false stale-evidence result caused by adding a hosted
route-evidence regression test. The test file changed the release gate coverage,
but it did not change the packaged runtime.

## Roadmap Lock

The product split is explicit:

- `localhost` / `127.0.0.1` dashboards are local-only operator and development
  surfaces.
- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs perform the actual work on each device.
- A remote user can enter an order through `musu.pro`; the authenticated local
  MUSU program receives the work order and executes it locally.
- Multiple MUSU programs can use `musu.pro` for identity, presence, project
  context, meeting-room coordination, and initial connection/rendezvous, then
  prefer direct P2P mesh routes after the connection is established.
- Relay remains a Connect/Pro fallback path and must not become the default data
  path.

Current validation is still one-machine validation. True multi-device proof
requires installing the same current MUSU build on a second Windows PC and
capturing second-PC route, CPU, matrix, and relay evidence.

## Change

Updated the release freshness status-only classifier in:

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

Updated verifier regression coverage in:

- `scripts\windows\test-release-evidence-verifiers.ps1`

The regression now includes static classifier contract cases for all three
freshness users, proving the test/spec source-file patterns are present.

## Validation

- PowerShell parser check passed for the four modified scripts
- `test-release-evidence-verifiers.ps1 -Json` passed with `ok=true`,
  `case_count=28`, and `failed_case_count=0`

## Release Impact

This is release tooling and roadmap documentation only. It does not change the
packaged runtime and does not implement release-grade relay/tunnel payload
transport.

The expected clean release interpretation after commit is that current primary
MSIX/smoke/CPU/matrix evidence remains usable because the only intervening
source change is test-only.

Public release remains blocked on:

- second-PC multi-device route evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted `musu.pro` KV/Upstash relay storage
- owner-scoped release-grade relay route evidence
- relay payload transport proof and delivery proof
- support mailbox evidence
- Store/Partner Center evidence
