# 2026-05-29 10:42 KST - Final Packet Clean Git Metadata

## Change

`scripts\windows\prepare-final-operator-gate-packet.ps1` now refuses to create a
final operator packet from a dirty git worktree.

Each generated packet also includes `packet-build-metadata.json` with:

- schema `musu.final_operator_gate_packet.v1`
- packet version
- support email and verification id
- source git branch and commit
- `dirty=false` and empty `status_short`

`scripts\windows\verify-final-operator-gate-packet.ps1` requires that metadata
file, validates the source git commit shape, and fails packets whose metadata
does not record clean git state.

## Reason

The final packet is the operator handoff artifact for the remaining manual
release gates. It must be reproducible from a committed source state; otherwise
the packet can contain uncommitted script or document changes that are not tied
to a pushed commit.
