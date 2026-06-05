# 2026-06-05 Post Native RPC Exec Primary Evidence, Audit, And Next Steps

Context:

- Native `/api/v1/rpc/exec` hardening changed runtime source at `fe25c5d8`, so
  primary packaged local-runtime evidence had to be refreshed.
- User clarified the product boundary: MUSU Desktop is the local program that
  executes work; MUSU.PRO is web input, project/company meeting room,
  rendezvous, connection/control-plane, relay fallback policy, and evidence.

What was restored:

- MSIX local-sideload rebuild/reinstall and packaged runtime identity were
  verified.
- Packaged runtime repair started bridge `http://127.0.0.1:6540` with
  `dashboard.required=false`, `worker_ok=true`, and production bridge auth.
- Single-machine smoke passed:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-230036-HUGH_SECOND.evidence.json`
  with `single_machine_surface=local-bridge-only`.
- Desktop-open idle CPU passed:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-230300-HUGH_SECOND.desktop-open.evidence.json`,
  `60.032s`, MUSU `0.03`, Node `0`, WebView2 `0.16`, hot `0`.
- Five-scenario runtime matrix passed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231115-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_231115`, route task
  `c0e4c3f1-3e79-44ef-846e-475449e1819e`, max WebView2 `0.1`.
- Targeted HUGH-MAIN post-route CPU evidence passed CPU verification with
  failed route allowed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  The route still timed out against `192.168.1.192:8949`, so this is not
  successful multi-device evidence.

Go/no-go:

- Clean go/no-go after `3b09dd73` reports local artifacts, single-machine,
  MSIX install, desktop entrypoint, targeted second-PC route CPU, hardening
  contracts, process ownership, and single-instance gates true.
- Public release remains No-Go with six blockers: multi-device, second-PC idle
  CPU, second-PC runtime CPU matrix, support mailbox, Store release, and hosted
  P2P control-plane proof.

Code audit:

- Current unpushed delta adds evidence only.
- `cargo test rpc_exec --lib` passed `6/6`.
- `audit-operator-api-security-contract.ps1 -FailOnProblem -Json` passed
  `ok=true`, `fail_count=0`.
- No high or medium issue found. Residual low-risk note: keep HTTP response
  semantics and command exit-code semantics visually distinct in future audit
  reporting.

Next steps:

- Install the exact current build on a second Windows PC and import the
  second-PC return zip.
- Fix or replace unreachable `HUGH-MAIN` at `192.168.1.192:8949`.
- Configure live MUSU.PRO owner-scoped P2P control-plane production storage,
  relay endpoints, route proof, payload transport proof, and delivery proof.
- Record `musu@musu.pro` mailbox evidence and Partner Center/Store evidence.

Index refresh:

- MUSU local indexer succeeded:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- Result: `2433 files`, `2705 symbols`, `34984 ms`.
- gbrain was not rerun because the same-session blocker remains missing
  `ZEROENTROPY_API_KEY`, import failures, `sync.last_commit` not advancing,
  and `gstack-brain-sync exited undefined`.
