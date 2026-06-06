# 2026-06-06 Current Desktop Clean-Start Evidence

Current packaged MUSU Desktop was rebuilt/reinstalled on HUGH_SECOND after
runtime relay candidate coverage carry. Strict MSIX install evidence passed
with WindowsApps alias first and Cargo `musu.exe` only as an alternate alias.

Evidence:

- MSIX install: `20260606-171011-HUGH_SECOND`
- single-machine smoke: `20260606-170759-HUGH_SECOND`, `local-bridge-only`,
  bridge `http://127.0.0.1:4751`
- desktop-open CPU: `20260606-171154-HUGH_SECOND.desktop-open`, WebView2 max
  `0.23`, hot `0`, working set `363.69MB`
- runtime CPU matrix: `20260606-171403-HUGH_SECOND`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_171403`, route task
  `08b81687-bacf-40eb-a677-e92fca76149b`, verifier `ok=true`/`fail_count=0`

Clean go/no-go recognizes single-machine and MSIX install evidence and sees
runtime idle CPU/matrix valid on one machine. Public release remains No-Go on
second-PC multi-device/CPU/matrix, targeted second-PC route attempt, live
hosted P2P relay proof, support mailbox, and Store evidence.

Important interpretation: `localhost:3001` connection refusal is not the MUSU
Desktop success criterion. MUSU Desktop is the local executor; MUSU.PRO is
remote input, project/company room, AI meeting room, rendezvous/path-selection,
relay fallback, and evidence/control plane.
