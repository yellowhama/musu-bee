# 2026-06-03 External Recheck CLI Override and Operator Pack

`record-external-release-gate-recheck.ps1` now accepts `-MusuExe` and passes it
through to `record-p2p-control-plane-evidence.ps1`. The external evidence
summary/result now records `p2p_evidence_musu_exe` and
`p2p_evidence_musu_exe_source`.

This fixes the evidence gap where the external recorder defaulted to the
packaged WindowsApps alias, which can lag current-source CLI parsing. Clean
validation passed PowerShell parser `parse_ok` and `git diff --check`.

Current operator artifacts were regenerated from clean HEAD `e112c470`:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-065454.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-065519.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-065519.zip`

Both packet verifiers passed: final packet `ok=true`, `fail_count=0`,
`kit_count=1`; action pack `ok=true`, `fail_count=0`.

Clean external recheck with `-MusuExe .\musu-rs\target\debug\musu.exe`
recorded:

- `docs\evidence\external-gates\1.15.0-rc.1\20260603-065918-HUGH_SECOND.external-gates.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.evidence.json`

Result remains No-Go: second-PC TCP connect timed out, P2P env is missing
KV/Upstash storage, live P2P evidence still reports
`p2p_relay_lease_kv_not_configured`, `relay_lease_store_backend=unconfigured`,
and `relay_lease_store_release_grade=false`.
