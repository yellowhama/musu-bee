# 2026-06-06 External Gate Recheck After Public Metadata

External gates were rechecked after the post room-control CPU audit evidence.

Evidence:

- `docs\evidence\external-gates\1.15.0-rc.1\20260606-082244-HUGH_SECOND.external-gates.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-082429-musu.pro.evidence.json`

Public metadata:

- `verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`
  returned `ok=true`, `fail_count=0`.
- `/privacy` and `/support` returned HTTP `200`.
- both pages contain `musu@musu.pro`.
- go/no-go without `-SkipPublicMetadata` reports `public_metadata_ok=True`;
  `store-public-metadata` is no longer a blocker.

Remaining go/no-go blockers:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

External recheck:

- release ready `False`
- local artifacts ready `True`
- single-machine verified `True`
- runtime idle CPU valid machine count `1`
- runtime CPU matrix valid machine count `1`
- second PC `192.168.1.192:8949` TCP reachable `False`
- second PC TCP error `tcp_connect_timeout`
- P2P env ready `False`
- P2P evidence verified `False`
- relay route evidence count `0`
- relay payload transport proven `False`
- relay payload delivery proof valid count `0`

Live P2P root cause:

- packaged alias was used:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- relay status/transport/leases/route-evidence all report
  `logged_in=false`
- owner scope is not verified
- relay lease store is not configured or release-grade
- release relay transport/connect/payload endpoints are not wired

Interpretation: local CPU/hardening remains healthy on `HUGH_SECOND`; public
release is blocked by external machine/account/infrastructure evidence.
