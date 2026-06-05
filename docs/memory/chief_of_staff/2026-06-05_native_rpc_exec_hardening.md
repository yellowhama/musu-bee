# 2026-06-05 Native RPC Exec Hardening

- Hardened native bridge `/api/v1/rpc/exec` so remote/P2P control input cannot
  act as an unrestricted local shell.
- New default behavior: fail closed unless `MUSU_RPC_EXEC_ALLOWLIST` contains
  the bare command name. Command paths and user-supplied `cwd` are rejected.
- Execution is bounded by `MUSU_RPC_EXEC_TIMEOUT_SECS`, default `10`, clamped
  to `1..60`; children use `kill_on_drop(true)`.
- stdout/stderr are capped at `64 KiB`; rejected, failed, timed-out, and
  completed attempts are written to the bridge audit log.
- `audit-operator-api-security-contract.ps1` now covers the native RPC exec
  contract and passes with `ok=true`, `fail_count=0`, `check_count=44`.
- Validation also passed targeted Rust RPC exec tests `6/6`, `cargo check`,
  local API auth audit `39/39`, Rust background-loop audit `200/200`, and
  `git diff --check`.
- Code audit found and fixed one important issue before commit: bounded `cwd`
  was not enough because user-controlled `cwd` can affect executable path
  resolution. Final behavior rejects `cwd`.
- Clean go/no-go after `fe25c5d8` is No-Go with `manifest_git.dirty=false`,
  `local_artifacts_ready=true`, `msix_install_verified=true`, security/source
  contract gates true, but `single_machine_verified=false`, runtime idle CPU
  false, runtime matrix false, targeted second-PC route CPU false, hosted P2P
  false, support false, and Store false.
- Product boundary remains: MUSU Desktop executes locally; MUSU.PRO is remote
  input, room/rendezvous/path-selection/relay-fallback/evidence control plane.

