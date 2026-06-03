# 2026-06-03 Post Relay Status Descriptor Primary Evidence Refresh

After commit `16b7373d383751932651c926225aedbf946a9b99`, rebuilt and installed
the local-sideload MSIX, then refreshed primary-machine packaged evidence.

Evidence:

- single-machine smoke `20260603-213326-HUGH_SECOND`
- desktop-open CPU `20260603-213716-HUGH_SECOND.desktop-open`
- runtime CPU matrix `20260603-213849-HUGH_SECOND.runtime-cpu-scenario-matrix`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_213326`, dashboard
`http://127.0.0.1:3001`, bridge `http://127.0.0.1:8290`, desktop-open CPU
MUSU `0`, Node `0`, WebView2 `0.21`, working set `511.57MB`; matrix route
token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_213849`, max WebView2 `0.29`, max
working set `518.07MB`, verifier `ok=true`/`fail_count=0`.

Dirty-tree go/no-go after evidence restored primary gates to
`single_machine_verified=true`, runtime idle CPU `1/2`, and runtime CPU matrix
`1/2`; release remains No-Go on second-PC route/CPU/matrix, hosted relay
payload proof, support mailbox, Store, and dirty git until committed.
