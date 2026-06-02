# MUSU 1.15.0-rc.1 External Recheck CLI Override and Operator Pack

Date: 2026-06-03 07:00 KST

## Scope

This pass fixed an evidence tooling gap and refreshed the operator handoff
artifacts for the current HEAD.

The external release gate recorder now accepts `-MusuExe` and passes it through
to `record-p2p-control-plane-evidence.ps1`. This matters because the installed
WindowsApps alias can lag current-source CLI parsing. The relay lease store
status fields must stay visible in live P2P evidence even before a new MSIX is
rebuilt and installed.

## Tooling Change

Changed:

- `scripts\windows\record-external-release-gate-recheck.ps1`

New behavior:

- accepts optional `-MusuExe`
- passes `-MusuExe` into `record-p2p-control-plane-evidence.ps1`
- records `p2p_evidence_musu_exe`
- records `p2p_evidence_musu_exe_source`
- writes those fields into the external gate summary and JSON result

Validation:

- PowerShell parser: `parse_ok`
- `git diff --check`

## Current Operator Pack

Final operator gate packet:

- packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-065454.zip`
- latest pointer:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- commit: `e112c4705cd54371b69f788891d15ec6ef264f9c`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260603-065454`
- verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- SHA256:
  `f8409981f86460c94fdb17ef8ae3e43d953c0798dd755653793225934d5598bb`

Operator action pack:

- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519.zip`
- latest pointer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- commit: `e112c4705cd54371b69f788891d15ec6ef264f9c`
- verifier: `ok=true`, `fail_count=0`
- SHA256:
  `927b2073d37795c2b6e10fd8944c4718d3c0e2b2bf78a3276343b750c3e447d0`

Nested handoff artifacts:

- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-065519.zip`
- second-PC transfer SHA256:
  `d95cdd92f9b0a7f0fc717035fe814918100b2feec5b3a9ca3712ff77b0397f91`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-065519.zip`
- Partner Center zip SHA256:
  `2b3cf5e9f4c8aa4d7b8920fc60d32e66fe710dde4c149dd92bd5b2c81e2aaa20`

## External Gate Evidence

Recorded clean external gate evidence using the current-source debug CLI:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-external-release-gate-recheck.ps1 -MusuExe .\musu-rs\target\debug\musu.exe -Json
```

Artifacts:

- external evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-065918-HUGH_SECOND.external-gates.evidence.json`
- external summary:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-065918-HUGH_SECOND.external-gates.summary.md`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.evidence.json`
- P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.verification.json`
- P2P summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.summary.md`

Result:

- external `ok=false`
- `release_ready=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU valid machines: `1`
- runtime CPU matrix valid machines: `1`
- second-PC `192.168.1.192:8949` TCP reachable: `false`
- second-PC TCP error: `tcp_connect_timeout`
- `p2p_env_ok=false`
- `p2p_evidence_ok=false`
- P2P evidence MUSU exe:
  `F:\workspace\musu-bee\musu-rs\target\debug\musu.exe`
- P2P evidence MUSU exe source: `parameter`
- relay leases ok: `false`
- owner scope verified: `false`
- relay default data path: `false`
- relay lease store configured: `false`
- relay lease store backend: `unconfigured`
- relay lease store release-grade: `false`
- live detail: `p2p_relay_lease_kv_not_configured`

## Interpretation

This does not close the release gates. It improves the evidence pipeline so the
external recheck can use a current-source CLI when the packaged alias is behind
the latest CLI evidence schema.

Public desktop release remains No-Go on:

- real second-PC multi-device evidence
- second-PC desktop-open CPU evidence
- second-PC four-state runtime CPU matrix evidence
- live `musu.pro` owner-scoped KV/Upstash relay lease evidence
- relay/tunnel payload transport proof
- `musu@musu.pro` mailbox delivery evidence
- Partner Center / Store evidence

The current second-PC action is to run and return:

```text
.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-065519.zip
```
