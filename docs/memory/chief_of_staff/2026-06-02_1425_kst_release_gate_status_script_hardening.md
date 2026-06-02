# 2026-06-02 14:25 KST - Release Gate Status Script Hardening

Problem found:

- `show-final-release-handoff-status.ps1` and `write-release-go-no-go.ps1`
  previously depended on unbounded child PowerShell calls.
- `write-release-candidate-manifest.ps1` failed under a child Windows
  PowerShell host where `Get-FileHash` was unavailable.

Change recorded:

- Added .NET SHA256 fallback hashing to `write-release-candidate-manifest.ps1`.
- Added `-ScriptTimeoutSeconds` to `write-release-go-no-go.ps1` and
  `show-final-release-handoff-status.ps1`.
- Replaced direct child `powershell` calls in those status scripts with a
  bounded `.NET ProcessStartInfo` wrapper that captures stdout/stderr, elapsed
  time, timeout state, and kills timed-out children.
- Added `show-final-release-handoff-status.ps1` and
  `write-release-candidate-manifest.ps1` to the status-only freshness allowlists
  in `write-release-go-no-go.ps1`, `verify-single-machine-evidence.ps1`, and
  `verify-runtime-cpu-scenario-matrix.ps1`.
- Added content-specific tooling-only freshness recognition for the exact
  `test:p2p` `package.json` and GitHub Actions diff, without broadly allowing
  dependency or build-script changes.

Validation:

- `git diff --check`: passed.
- `write-release-candidate-manifest.ps1` under `powershell.exe`: exit 0.
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`: completed.
- `show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds 120 -Json`:
  completed with packet/action pack verification true.
- Forced `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 1 -Json`: exited
  nonzero in about 2.9s with `Script timed out after 1s`.
- After the freshness fix, current dirty-tree go/no-go reports
  `single_machine=true`, runtime idle CPU `1/2`, runtime matrix `1/2`, and
  release No-Go on second-PC/P2P/support/Store plus dirty git.
- Clean post-hardening go/no-go reports
  `single_machine=true`, runtime idle CPU `1/2`, runtime matrix `1/2`,
  process/startup/desktop single-instance true, `manifest_dirty=false`, and
  release No-Go on second-PC/P2P/support/Store gates.

Release interpretation:

- This closes a local release-gate failure-handling gap.
- It does not close public release gates for second-PC evidence, live P2P KV
  owner-scope evidence, `musu@musu.pro` mailbox evidence, or Store evidence.
