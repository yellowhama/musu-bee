# Chief of Staff Memory: Bridge Readiness Idle Candidate Gate

Date: 2026-06-05T04:10+09:00

Decision:

- Split `bridge readiness wait loop` out of the combined
  `health/readiness retry` idle busy-loop candidate.
- Keep auto-update health polling as `health check retry loop`.
- Keep CLI bridge readiness wait mapped to the existing Rust background-loop
  checks for initial backoff, max backoff, caller deadline, and backoff sleep.

Current status:

- This is gate/source visibility only, not runtime behavior change.
- `write-release-go-no-go.ps1` should now report eight idle candidates.
- Public release remains No-Go on two-machine CPU/matrix, multi-device route,
  hosted P2P, support mailbox, and Store evidence.
