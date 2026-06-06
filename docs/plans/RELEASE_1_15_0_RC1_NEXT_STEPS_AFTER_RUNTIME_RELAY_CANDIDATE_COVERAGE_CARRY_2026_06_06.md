# Release 1.15.0-rc.1 Next Steps After Runtime Relay Candidate Coverage Carry

Date: 2026-06-06

## Immediate Sequence

1. Rebuild and reinstall the current HEAD packaged local runtime.
2. Refresh clean single-machine smoke evidence.
3. Refresh clean packaged `desktop-open` 60s CPU evidence.
4. Refresh clean runtime CPU scenario matrix evidence.
5. Run go/no-go and confirm current-source local evidence is no longer stale.

## P2P / MUSU.PRO Sequence

1. Log the packaged runtime into MUSU.PRO with the WindowsApps alias.
2. Configure production owner-scoped relay lease/payload/route evidence stores.
3. Prove hosted P2P evidence returns owner-scoped route records.
4. Implement the release `quic_relay_tunnel` runtime path.
5. Record relay transport proof and payload delivery proof bound to the same
   session, lease, tunnel, source, and target.

## Second-PC Sequence

1. Install the same current package on the second PC.
2. Verify the second PC is reachable without relying on the developer
   localhost dashboard.
3. Run multi-device route evidence.
4. Run second-PC `desktop-open` idle CPU evidence.
5. Run second-PC runtime CPU scenario matrix evidence.

## External Gates

1. Verify `musu@musu.pro` mailbox send/receive evidence.
2. Prepare Partner Center / Store evidence.
3. Run final external gate recheck with public metadata enabled.

## Stop Conditions

Do not mark public release ready while any of these are true:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- hosted P2P evidence has no release-grade relay route proof
- second-PC route/CPU/matrix evidence is absent
- support mailbox or Store evidence is absent
- current HEAD source has not been rebuilt into fresh clean packaged evidence
