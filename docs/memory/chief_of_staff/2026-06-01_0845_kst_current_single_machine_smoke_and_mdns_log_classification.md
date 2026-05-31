# CoS Memory - Current Single-Machine Smoke and mDNS Log Classification

Date: 2026-06-01 08:45 KST

Current single-machine smoke evidence was refreshed after the relay lease and
primary desktop-open CPU evidence commits. Recorded evidence:

- `docs\evidence\single-machine\1.15.0-rc.1\20260601-084028-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-084028-HUGH_SECOND.verification.json`
- source commit:
  `a1ee33fa0c8e3b68e85dc4b48077134ec5dd99ac`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_084005`
- CLI output: `MUSU_CLI_ROUTE_OK_20260601_084005`
- dashboard task: `5ac5baa6-471f-4633-9a57-9e3a87a20c7a`
- bridge: `http://127.0.0.1:13167`

Go/no-go now has current single-machine evidence again, but public release is
still No-Go. Remaining blockers are real second-PC multi-device route evidence,
second-PC desktop-open CPU evidence, `musu@musu.pro` inbox delivery evidence,
and Partner Center/Microsoft Store evidence.

The operator re-supplied the Windows/Tailscale IPv6 mDNS log showing repeated
`ff02::fb%9:5353` failures with `os error 10065` followed by `closed channel`.
This is the same classified idle CPU/log-spam risk already addressed in current
source defaults: bridge mDNS requires `MUSU_ENABLE_MDNS=1`, IPv6 mDNS requires
`MUSU_MDNS_ENABLE_IPV6=1`, and Tailscale mDNS interfaces require
`MUSU_MDNS_ENABLE_TAILSCALE=1`. If an installed desktop still emits this log in
default mode, treat the installed bits as stale or the environment as explicitly
opted into mDNS/IPv6/Tailscale until proven otherwise.
