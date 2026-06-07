# 2026-06-07 Second-PC Route Preflight

Added primary-side second-PC route preflight to catch missing peer registration
before targeted CPU matrix or final multi-device smoke.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_PREFLIGHT_2026_06_07.md`

New script:

- `scripts\windows\test-second-pc-route-preflight.ps1`

Updated:

- multi-device kit packaging and README
- final operator packet packaging and README
- operator action pack quickstart
- final packet verifier
- operator action pack verifier
- release verifier regression
- desktop release readiness audit inventory
- freshness/status-only allowlists in go/no-go and CPU/single-machine verifiers

The preflight consumes a second-PC return zip or handoff JSON, resolves
`suggested_remote_addrs`, runs `musu peer add`, confirms `musu peer list`, runs
`musu route --explain --target <SECOND_PC_NAME>`, writes
`.local-build\second-pc-route-preflight\*.second-pc-route-preflight.json`, and
prints exact targeted CPU matrix / multi-device smoke commands.

Synthetic smoke with fake `203.0.113.2:8949` and `SECOND-PC` returned expected
`ok=false` with `target peer listed=fail` and wrote structured evidence.

Release meaning:

- this catches `peer not found` before wasting a 60s post-route CPU sample;
- it is not successful multi-device proof;
- public release remains No-Go until real second-PC CPU/matrix, successful
  route, hosted MUSU.PRO relay, support mailbox, and Store proof pass.

Search terms should include `GOAL v827`, `wiki/1002`,
`test-second-pc-route-preflight.ps1`,
`musu.second_pc_route_preflight.v1`, `second-pc-route-preflight`,
`musu peer add`, `route --explain`, and `peer not found`.
