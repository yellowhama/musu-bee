# 2026-06-02 16:30 KST Release Status Fast Path

## Decision

Default release handoff status must be a quick operator status path, not a full
packet/action-pack checksum verifier run.

## What Changed

- `scripts/windows/show-final-release-handoff-status.ps1` now defaults packet
  and action-pack verification to quick archive metadata/required-entry checks.
- It exposes `-PacketVerificationMode quick|deep|skip` and
  `-ActionPackVerificationMode quick|deep|skip`.
- Existing `-SkipPacketVerification` and `-SkipActionPackVerification` switches
  still map to `skip`.
- Deep mode still invokes `verify-final-operator-gate-packet.ps1` and
  `verify-operator-action-pack.ps1`.
- `scripts/windows/write-release-go-no-go.ps1` now selects latest evidence
  candidates per machine before child verifier execution and reports
  `available_candidate_count` plus `candidate_selection=latest-per-machine`.

## Validation

- Go/no-go with `-SkipPublicMetadata` completed in 41.733s, selecting runtime
  idle CPU `4/59`, runtime CPU matrix `3/38`, and process ownership `3/36`.
- Default handoff status with `-SkipPublicMetadata` completed in 44.050s with
  quick packet/action pack `fail_count=0`.
- Deep handoff status completed in 50.663s with packet/action pack
  `fail_count=0`.
- Default handoff status with public metadata enabled completed in 47.182s and
  reported `public_metadata_ok=true`.
- `scripts/windows/test-release-evidence-verifiers.ps1` passed 13/13.

## Current Gate Meaning

This fixes the status timeout/operator UX problem only. Public release remains
No-Go until second-PC CPU/matrix/route evidence, live `musu.pro` P2P owner-scope
evidence, `musu@musu.pro` mailbox evidence, and Store evidence are complete.

## Index Refresh

`musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
1364 files and 2240 symbols after this change set. Search terms include
`GOAL v315`, `GOAL v316`, `wiki/556`, `PacketVerificationMode`,
`ActionPackVerificationMode`, `latest-per-machine`,
`available_candidate_count`, `runtime idle 4/59`, `runtime matrix 3/38`,
`process ownership 3/36`, and `test-release-evidence-verifiers.ps1 13/13`.
