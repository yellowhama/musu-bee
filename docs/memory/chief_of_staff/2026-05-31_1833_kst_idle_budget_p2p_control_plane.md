# Idle budget and P2P control-plane update

On 2026-05-31, runtime hardening was tightened after the operator emphasized
three P0 issues: idle CPU busy-loop behavior, need for `musu.pro` assisted P2P,
and insufficient desktop hardening.

Durable changes:

- `scripts/windows/measure-musu-idle-cpu.ps1` now separates MUSU, Node.js, and
  WebView2 roles, reports role counts/max CPU, and fails if no MUSU runtime
  process is sampled.
- Operator idle CPU command is now:
  `measure-musu-idle-cpu.ps1 -SampleSeconds 60 -MaxOneCorePercent 5 -IncludeNode -IncludeWebView2 -FailOnHot -Json`.
- Frontend polling was reduced/paused when hidden for service health, process,
  node/device, doctor, and fleet status surfaces.
- The bridge `musu.pro` registration loop now defaults to
  `MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC=300`, enforces a 60s floor, and applies
  failure backoff plus jitter.
- Added wiki/524:
  `docs/MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md`.

Current verdict remains No-Go until idle CPU evidence passes on two machines,
real second-PC route evidence exists, `musu@musu.pro` support delivery is
recorded, and Store/Partner Center evidence is recorded.
