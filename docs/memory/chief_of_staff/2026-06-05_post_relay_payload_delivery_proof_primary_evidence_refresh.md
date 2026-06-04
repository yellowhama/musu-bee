# 2026-06-05 Post Relay Payload Delivery Proof Primary Evidence Refresh

Fresh primary-machine packaged evidence was restored after source commit
`bd36815a838aa7e5d76426ddf5e09b7da70d9b71`, which added canonical relay
payload delivery proof responses.

Evidence commits:

- `d131fbcfd81a0926c2d46b631ead6a9396d0e7c9` refreshed single-machine
  evidence.
- `cf3614ce393c056e402e18259833cf4f430dd8b7` refreshed desktop-open idle CPU
  evidence.
- `e77587c6d2d63e2aa817c03d7e40e4fd1cd206b5` refreshed the five-state runtime
  CPU scenario matrix.

Primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-025404-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-025501-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-025643-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- single-machine smoke output `MUSU_RELEASE_SMOKE_OK_20260605_025339`
- desktop-open CPU passed for `60.06s` with MUSU `0`, Node `0`, WebView2
  `0.65`, owned WebView2 `6`, working set `432.91MB`, and hot `0`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_025643`
- matrix verifier passed with `ok=true` and `fail_count=0`
- go/no-go at `2026-06-05T03:07:49+09:00` reported
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `multi_device_verified=false`, `public_metadata_ok=true`,
  `msix_install_verified=true`, `manifest_git.dirty=false`, and
  `ready_for_public_desktop_release=false`

Roadmap decision:

- `musu.pro` is the web input/project room/company meeting room/presence/
  rendezvous/path-selection/relay-fallback/evidence control plane.
- Local MUSU programs remain the execution plane and perform work on each
  device after authenticated web input.
- Web-assisted rendezvous should bootstrap P2P mesh; relay remains fallback.

Public release remains No-Go until second-PC, hosted P2P, support mailbox, and
Store gates are closed.
