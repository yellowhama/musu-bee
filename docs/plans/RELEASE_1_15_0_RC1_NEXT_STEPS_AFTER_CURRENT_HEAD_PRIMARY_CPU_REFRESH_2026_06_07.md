# MUSU 1.15.0-rc.1 Next Steps After Current HEAD Primary CPU Refresh

**Generated**: 2026-06-07 03:05 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_PRIMARY_CPU_REFRESH_AFTER_PROCESS_OWNERSHIP_CLI_HARDENING_2026_06_07.md`

## Current Position

Primary-machine packaged MUSU Desktop CPU is quiet after process ownership CLI
hardening. Clean 60s `desktop-open` idle CPU evidence and a clean five-scenario
runtime CPU matrix both pass CPU/resource budgets on `HUGH_SECOND`.

The current blocker is not local execution. `HUGH-MAIN` remains registered at
`192.168.1.192:8949`, but route attempts time out. This means the next useful
release step is second-machine installation/reachability, not another
`localhost:3001` check.

## Execution Order

1. Commit and push the current primary CPU refresh documentation and evidence.
2. Run a clean go/no-go after commit and confirm no temporary git blocker.
3. Keep using default `.local-build` output for multi-scenario CPU matrix
   captures; copy verified summaries to `docs\evidence` only after verifier
   pass.
4. Use `-RoutePrompt "Return exactly {TOKEN}"` for route-probe matrix runs.
5. Install or start the same current MUSU Desktop build on `HUGH-MAIN` or a
   different second Windows PC.
6. Confirm the second machine reports a healthy packaged bridge and reachable
   non-local endpoint.
7. Run the second-PC release wrapper with both
   `-RouteReachabilityTarget <PRIMARY_PEER_NAME>` and
   `-RuntimeCpuRouteTarget <PRIMARY_PEER_NAME>`.
8. Import the returned second-PC zip with
   `import-second-pc-return.ps1 -RequireReleaseGateEvidence -Json`.
9. If reachability fails, fix install state, peer registry, firewall, port,
   address, or identity before retrying.
10. After reachability is healthy, capture successful release-grade
    `musu.route_evidence.v1`.
11. Capture clean two-machine desktop-open idle CPU and full runtime CPU matrix
    evidence.
12. Record hosted MUSU.PRO P2P/relay proof with owner-scoped storage, route
    metadata, route transport proof, and payload delivery proof.
13. Record support mailbox proof and Store/Partner Center proof.
14. Run final clean go/no-go and final operator packet verification.

## Acceptance Criteria

- Current primary evidence remains clean and below CPU/resource budgets.
- Route-probe matrix runs bind the expected token in both command string and
  argument array.
- Failed route attempts remain diagnostic unless `musu.route_evidence.v1`
  records success with release-grade identity/encryption/payload truth.
- Public release remains blocked until second-PC, hosted P2P/relay, support,
  and Store gates pass.

## Audit Notes

No high or medium code issue was found. No source code changed in this refresh.

The main process lesson is evidence hygiene: multi-scenario CPU matrix output
must start in ignored `.local-build`, not tracked `docs\evidence`, otherwise
the generated first scenario dirties later samples.
