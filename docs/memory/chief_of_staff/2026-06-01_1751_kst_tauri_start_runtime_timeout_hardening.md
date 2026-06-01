# CoS Memory - Tauri Start Runtime Timeout Hardening

Date: 2026-06-01 17:51 KST

The desktop shell `Start Runtime` path was hardened after the busy-loop/process
audit work. `musu-bee/src-tauri/src/lib.rs` no longer calls
`Command::output()` for `musu up --json`. It now uses `run_command_with_timeout`
with temp-file stdout/stderr capture, `stdin=null`, a 45s deadline, and 200ms
wait sleeps. This is the same failure class found in the PowerShell harness
audit: a long-lived bridge child must not keep an inherited stdout/stderr pipe
open and leave the UI command busy forever.

Validation:

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed
  3/3 Tauri shell tests.
- Added `timed_command_captures_stdout_without_output_pipes`.
- `rg -n "\.output\(\)|wait_with_output" musu-bee\src-tauri\src\lib.rs -S`
  found no direct output-pipe wait in the desktop shell.

Process diagnostic:

- `audit-musu-process-ownership.ps1 -Json` at 2026-06-01 17:53 KST observed
  16 machine-wide Node.js processes.
- Command lines showed Codex/MCP/npx helpers such as
  `@modelcontextprotocol/server-memory`, `task-master-ai`,
  `@executeautomation/playwright-mcp-server`, `@upstash/context7-mcp`,
  `@21st-dev/magic`, and `@morph-llm/morph-fast-apply`.
- MUSU-owned Node helpers: 0.
- Repo-related orphan helpers: 0.
- The audit failed only because no MUSU runtime or desktop shell was running
  and `~/.musu/services/bridge.json` pointed to dead PID `32192` at
  `127.0.0.1:6677`.

Release interpretation:

This is product hardening, not release evidence. The next gate still needs a
packaged desktop Start Runtime click audit plus clean/current 60s CPU samples
on the primary machine and second PC.
