# 2026-06-02 Relay Route Lease-Proof Single-Machine Refresh

- After relay route lease-proof hardening commit `f9beb79f3294ae73f049ad3649c71046179cee29`,
  single-machine smoke was refreshed against the current source.
- Evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.evidence.json`
- Verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.verification.json`
- Dashboard task: `a4ea114c-2483-4135-8dd0-756cf915d7a3`
- Bridge: `http://127.0.0.1:13886`
- CLI route checked: `true`
- This restores the single-machine evidence gate for the current commit. It
  does not close second-PC, P2P KV/owner scope, support mailbox, Store, or
  release-grade transport blockers.
