# 2026-06-07 One-Machine MUSU.PRO Functional Roadmap

The operator scope was narrowed back to one machine before more second-PC work.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ONE_MACHINE_MUSU_PRO_CONNECTION_FUNCTIONAL_ROADMAP_2026_06_07.md`

Current facts:

- HEAD before the doc pass was `7501f588`.
- Latest go/no-go before the doc pass was generated at
  `2026-06-07T21:00:52.1567414+09:00`.
- `local_artifacts_ready=true`.
- `single_machine_verified=true`.
- `public_metadata_ok=true`.
- runtime idle CPU is `1/2`.
- runtime CPU scenario matrix is `1/2`.
- `p2p_control_plane_env_ready=false`.

Decision:

- The next product gate is not `localhost:3001`.
- The next product gate is authenticated MUSU.PRO work input, local MUSU
  Desktop pickup/execution on this PC, result/status return to MUSU.PRO, and
  post-run idle/resource evidence.
- Two-machine install, P2P mesh proof, and relay byte-path work resume after
  the one-machine MUSU.PRO functional gate is proven.

Search terms should include `one-machine MUSU.PRO functional roadmap`,
`musu.one_machine_musu_pro_work_order.v1`, `localhost:3001`,
`MUSU Desktop local executor`, `remote work-order pickup`, and
`post-run idle CPU`.
