# MUSU 1.15.0-rc.1 Current-Head Local Desktop Evidence After Target-Drain Proof Wiring

Date: 2026-06-07 20:35 KST

## Scope

This report records the fresh packaged one-machine local Desktop evidence after
commit `573d727f0df3b823e12090a237728ca1d293b00c`, which follows the target
drain release relay transport-proof wiring commit.

It also records the operator-facing diagnosis for the repeated
`ERR_CONNECTION_REFUSED` report: `http://127.0.0.1:3001/app` is not the
installed MUSU Desktop runtime. In this evidence set, the packaged local bridge
is alive at `http://127.0.0.1:9741`; a browser error on port `3001` means the
separate dashboard/dev server for that port is not running.

## Evidence

Fresh promoted evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260607-201305-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-201412-HUGH_SECOND.evidence.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260607-201501-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-201501-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-201501-HUGH_SECOND.desktop-single-instance.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-202202-HUGH_SECOND.current-head-after-target-proof.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202317-HUGH_SECOND.current-head-after-target-proof.runtime-cpu-scenario-matrix.json`
- five-state matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202317-HUGH_SECOND.current-head-after-target-proof.runtime-cpu-scenario-matrix.verification.json`
- target-route diagnostic matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof.runtime-cpu-scenario-matrix.json`
- target-route diagnostic verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof.post-route-target.verification.json`

## Results

The desktop-open idle CPU evidence was captured from clean commit
`573d727f0df3b823e12090a237728ca1d293b00c` with `git_dirty=false`.

- `ok=true`
- sample `60.052s`
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max CPU `0.08`
- owned process count `8`
- bridge runtime `1`
- desktop shell `1`
- owned WebView2 helpers `6`
- working set `367.77MB`

The five-state runtime CPU matrix was also captured from clean commit
`573d727f0df3b823e12090a237728ca1d293b00c` with `git_dirty=false`.

- `ok=true`
- `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- local route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_202317`
- route probe `ok=true`
- hot process count `0` in every scenario
- MUSU CPU `0` in every scenario
- Node CPU `0` in every scenario
- max owned WebView2 CPU `0.16`
- max working set `367.99MB`
- owned WebView2 helper count `6`

The targeted route diagnostic was captured from clean commit
`573d727f0df3b823e12090a237728ca1d293b00c` with `git_dirty=false`.

- target `PRIMARY-PC`
- route probe `ok=false`
- failure allowed `true`
- failure output:
  `Error: peer 'PRIMARY-PC' not found. Use: musu peer add --addr <ip:port> --name PRIMARY-PC`
- target-only verifier `ok=true`, `fail_count=0`
- hot process count `0`
- MUSU CPU `0.16`
- Node CPU `0`
- WebView2 CPU `0.16`
- working set `366.16MB`

This is valid failed target-route CPU diagnostic evidence. It is not successful
multi-device route proof.

## Go/No-Go Read

Dirty-tree go/no-go after evidence promotion reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines `1`
- runtime CPU scenario matrix valid machines `1`
- targeted second-PC route-attempt diagnostic valid machines `1`
- process ownership verified `true`
- startup single-instance verified `true`
- desktop single-instance verified `true`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC desktop-open CPU evidence
- second-PC runtime CPU scenario matrix evidence
- live `https://musu.pro` P2P control-plane and release relay proof
- support mailbox operator verification
- Store/Partner Center evidence
- public privacy/support metadata was skipped in this go/no-go run
- git dirty until the evidence/docs commit lands

## Product Interpretation

The local program direction is intact:

- MUSU Desktop is the installed local executor.
- MUSU.PRO is the remote input, project room, rendezvous, route policy,
  evidence, notification, and owner/org control plane.
- `localhost` URLs are diagnostics or same-machine surfaces, not public product
  UX.
- `127.0.0.1:3001` connection refusal means the separate dashboard/dev surface
  for that port is not running; it does not prove the packaged local runtime is
  down.
- The current packaged local bridge in this evidence set is
  `http://127.0.0.1:9741`.

## Qualitative Audit

No high or medium code-audit issue was found in the target-drain proof wiring.

The important release boundary is preserved:

- release-grade payload or delivery proof without attached relay transport
  proof fails as `release_relay_transport_proof_missing`;
- attached `musu.relay_transport_proof.v1` is converted and passed to the
  release-grade route evidence recorder;
- preview store-forward delivery still records preview evidence and is not
  promoted into release-grade proof.

Risk remains in product communication, not the local runtime evidence: the UI
must stop sending operators to stale or non-running localhost dashboard ports
when the intended product surface is the installed Desktop plus MUSU.PRO remote
control plane.
