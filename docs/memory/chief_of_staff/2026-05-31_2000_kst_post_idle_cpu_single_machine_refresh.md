# 2026-05-31 20:00 KST - Post Idle CPU Hardening Single-Machine Refresh

Durable result:

- After idle CPU ownership measurement and frontend polling hardening, the
  single-machine smoke was rerun on HUGH_SECOND.
- Evidence recorded:
  `docs/evidence/single-machine/1.15.0-rc.1/20260531-195832-HUGH_SECOND.evidence.json`
- Source commit in evidence: `3b1b1b0e751a12c63728829a8afe2774b489444e`
- Dashboard task: `d568c5f1-d15d-4cbf-8172-c4a308deaf95`
- Bridge URL: `http://127.0.0.1:9818`
- Outputs remained `MUSU_RELEASE_SMOKE_OK` and `MUSU_CLI_ROUTE_OK`.
- First attempt failed only because the dashboard dev server was still compiling;
  after `musu up --json` reported dashboard `ok`, the rerun passed.
