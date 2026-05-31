# 2026-05-31 20:40 KST - Startup Single-Instance Gate

Durable memory:

- New release evidence script: `scripts\windows\audit-musu-startup-single-instance.ps1`.
- Evidence schema: `musu.startup_single_instance_audit.v1`.
- Go/no-go field: `startup_single_instance_verified`.
- Final handoff status and final operator packet verification now include the startup single-instance gate.
- The script calls `musu up --json` repeatedly, requires parseable `ok=true` output, requires bridge status `ok`, requires one stable bridge PID, rejects bridge spawn after the first call, enforces one MUSU runtime after repeated startup, and embeds `audit-musu-process-ownership.ps1`.
- Current canonical evidence: `docs\evidence\startup-single-instance\1.15.0-rc.1\20260531-203635-HUGH_SECOND.evidence.json`.
- Current local result on `HUGH_SECOND`: three repeated `musu up --json` calls reused bridge PID 31208, `after_musu_runtime=1`, `observed_bridge_pid_count=1`, `repeated_spawn_count=0`, `failed_invocation_count=0`, nested process ownership passed.
- Dashboard status was `warn` during the audit because the audit is runtime/bridge focused and does not require the Next dev server. That is acceptable for the startup single-instance gate.
- Remaining extension: add packaged desktop Start Runtime click and Store StartupTask/manual-launch collision evidence. The current gate proves CLI/runtime reuse, not every packaged desktop startup collision path.
