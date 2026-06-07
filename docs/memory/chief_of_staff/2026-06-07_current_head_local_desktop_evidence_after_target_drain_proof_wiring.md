# 2026-06-07 Current-Head Local Desktop Evidence After Target-Drain Proof Wiring

Commit `573d727f0df3b823e12090a237728ca1d293b00c` refreshed packaged local
Desktop evidence after target-drain release relay proof wiring.

Evidence:

- MSIX install `20260607-201305-HUGH_SECOND`
- single-machine smoke `20260607-201412-HUGH_SECOND`
- process ownership `20260607-201501-HUGH_SECOND`
- startup single-instance `20260607-201501-HUGH_SECOND`
- desktop single-instance `20260607-201501-HUGH_SECOND`
- desktop-open idle CPU `20260607-202202-HUGH_SECOND.current-head-after-target-proof`
- full runtime matrix `20260607-202317-HUGH_SECOND.current-head-after-target-proof`
- target diagnostic `20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof`

Results:

- local bridge was alive at `http://127.0.0.1:9741`
- desktop-open idle CPU passed with `git_dirty=false`, hot `0`, MUSU `0`,
  Node `0`, WebView2 max `0.08`, owned WebView2 helpers `6`, working set
  `367.77MB`
- full five-state matrix passed with `git_dirty=false`, `fail_count=0`, local
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_202317`, max WebView2
  `0.16`, and max working set `367.99MB`
- target diagnostic bound `PRIMARY-PC`, failed with `peer 'PRIMARY-PC' not
  found`, and passed target-only verification as failed-route CPU diagnostic

Operator diagnosis:

- `http://127.0.0.1:3001/app` is not the current installed MUSU Desktop
  runtime in this evidence set.
- Connection refusal on port `3001` means the separate dashboard/dev surface for
  that port is absent; it does not mean the packaged local bridge is down.
- MUSU Desktop remains local executor; MUSU.PRO remains remote input and
  control plane.

Release meaning:

- one-machine local Desktop evidence is healthy;
- target diagnostic is not successful multi-device route proof;
- public release remains No-Go on real second-PC proof, live MUSU.PRO P2P/relay
  proof, support mailbox, Store/Partner Center, and final clean git.
