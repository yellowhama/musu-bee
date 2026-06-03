# 2026-06-03 Rust Background Loop Contract Gate

Added `scripts\windows\audit-rust-background-loop-contract.ps1` with schema
`musu.rust_background_loop_contract.v1`.

The audit covers Rust background-loop contracts for planner, clipboard, mDNS,
cloud registration heartbeat, file sync, and auto-update health polling. It also
fails new unaudited Rust loop constructs outside the allowlist.

`write-release-go-no-go.ps1` now emits
`rust_background_loop_contract_verified` and blocks public release with
`rust-background-loops` if the audit fails. Final handoff status and final
operator packet generation/verification include the new audit.

Validation: `audit-rust-background-loop-contract.ps1 -FailOnProblem -Json`
passed with `ok=true`, `fail_count=0`, `unaudited_loop_hit_count=0`;
go/no-go dirty-tree summary showed `rust_background_loop_contract_verified=true`
and `rust_fail_count=0`; `audit-desktop-release-readiness.ps1 -Json` still only
fails on existing second-PC multi-device evidence; `git diff --check` passed.
