# CoS Memory - Current Single-Machine Smoke After CPU Count Reporting

Date: 2026-06-01 09:06 KST

After `da49990` changed release go/no-go CPU count reporting, older
single-machine evidence became stale because the verifier correctly treats
script changes as non-documentation code changes.

Refreshed single-machine smoke evidence:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-090548-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-090548-HUGH_SECOND.verification.json`
- source commit:
  `da4999081073018ab3b1b72a26645140ad2e68f7`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_090528`
- CLI output: `MUSU_CLI_ROUTE_OK_20260601_090528`
- dashboard task: `38d1eb2c-1905-493b-b536-459866c25c78`
- bridge: `http://127.0.0.1:5089`
- evidence SHA-256:
  `52f34b6bc377404e118ec429bdc2c3d9c781d622870debee0d2d62a67e6eaae7`
- verification SHA-256:
  `70f8665ddcc015305b539bf8832bcf57b4d4507c1f07d7284a1d0bfd59f7f22a`

Next required evidence is primary packaged `desktop-open` CPU for the same
post-script-change HEAD, then second-PC `desktop-open` CPU.
