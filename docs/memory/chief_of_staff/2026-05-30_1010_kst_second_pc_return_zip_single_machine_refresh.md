# 2026-05-30 10:10 KST - Second-PC Return Zip Single-Machine Refresh

## Durable Evidence

- After committing the second-PC return archive flow at `7294d65d7728378b65e671479237ce68646c906a`, the single-machine release smoke was rerun.
- The first attempt failed before dashboard warm-up because `musu up --json` saw dashboard status not ok while Next was still compiling `/app`.
- After warming `http://127.0.0.1:3000/app`, `musu up --json` and `musu doctor --json` reported dashboard/bridge ok.
- Passing evidence:
  - `docs\evidence\single-machine\1.15.0-rc.1\20260530-100818-HUGH_SECOND.evidence.json`
  - dashboard output `MUSU_RELEASE_SMOKE_OK_20260530_1008`
  - CLI route output `MUSU_CLI_ROUTE_OK_20260530_1008`
  - dashboard task `695f1e1d-1d1b-46bd-8783-3eebb216842a`
  - bridge `http://127.0.0.1:2217`

## Release State

- Assistant-side single-machine evidence is current for the new second-PC return archive flow.
- Public release remains No-Go until real second-PC MSIX install evidence, real multi-device evidence, `musu@musu.pro` inbox evidence, and Partner Center/Microsoft Store evidence are recorded.
