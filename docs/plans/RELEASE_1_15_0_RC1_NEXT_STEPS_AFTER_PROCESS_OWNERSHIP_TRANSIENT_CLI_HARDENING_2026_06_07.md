# MUSU 1.15.0-rc.1 Next Steps After Process Ownership Transient CLI Hardening

**Generated**: 2026-06-07 02:35 KST
**Related report**:
`docs\RELEASE_1_15_0_RC1_PROCESS_OWNERSHIP_TRANSIENT_CLI_HARDENING_2026_06_07.md`

## Current Position

The local process ownership audit no longer mistakes short-lived `musu.exe`
operator commands for an extra bridge runtime. Runtime count now means the
long-lived bridge root only.

This hardens 1-machine verification and release diagnostics. It does not close
any external release blocker by itself.

## Execution Order

1. Commit and push the process ownership CLI attribution hardening.
2. Run clean go/no-go after the commit and confirm there is no temporary git
   blocker.
3. Keep current 1-machine local runtime evidence as diagnostic context, but do
   not promote the dirty-tree 60s CPU sample to release evidence.
4. Install or start the current MUSU Desktop build on `HUGH-MAIN` or another
   second Windows PC.
5. Run the second-PC release wrapper with both route reachability and runtime
   CPU route target supplied:
   `-RouteReachabilityTarget <PRIMARY_PEER_NAME>` and
   `-RuntimeCpuRouteTarget <PRIMARY_PEER_NAME>`.
6. Import the returned second-PC zip with
   `import-second-pc-return.ps1 -RequireReleaseGateEvidence -Json`.
7. If peer reachability fails, fix installed package state, peer registry,
   firewall, port, address, or identity before retrying.
8. After reachability is healthy, capture successful release-grade
   `musu.route_evidence.v1`.
9. Capture clean two-machine desktop-open idle CPU and full runtime CPU matrix
   evidence.
10. Record hosted MUSU.PRO P2P/relay proof with owner-scoped lease storage,
    route metadata, relay transport proof, and payload delivery proof.
11. Record support mailbox proof and Store/Partner Center proof.
12. Run final clean go/no-go and final operator packet verification.

## Acceptance Criteria

- Process ownership reports one bridge runtime per machine unless an actual
  long-lived duplicate bridge exists.
- `musu_cli` may be non-zero during operator commands without causing
  `musu_runtime` to fail.
- Bridge registry PID, packaged path, ownership tree, and `/health` still pass.
- Release CPU samples used for gates have `git_dirty=false`.
- Public release remains blocked until the second-PC, hosted P2P, support, and
  Store gates all pass.

## Audit Notes

No high or medium issue was found in the scoped diff.

The useful next move is no longer another local `localhost` check. The next
release-risk reducer is installing/running the same MUSU Desktop build on the
second machine and returning route reachability plus CPU/matrix evidence.
