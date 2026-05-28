# Windows Usability Report: Install and Login Flow

Date: 2026-05-27
Environment: Windows PowerShell, fresh user install path under `C:\Users\empty`
Scope: First-run install, login, node registration, bridge startup expectations

## Summary

The current Windows flow is not robust enough for a first-time user. The biggest problems are:

1. Windows Defender or PUA blocking is common, but the product gives almost no actionable recovery guidance.
2. Success messages overstate the actual system state.
3. Node registration failures are not debuggable from the CLI.
4. The install, login, and bridge lifecycle are not presented as separate states.

The user can end up believing the machine is fully connected when account auth succeeded but node registration failed and the bridge is not usable.

## Reproduction

1. Run the installer:

```powershell
iwr https://raw.githubusercontent.com/yellowhama/musu-bee/main/install.ps1 -UseBasicParsing | iex
```

2. Run login:

```powershell
musu login
```

3. Approve device login in the browser.

Observed login result:

```text
✅ Logged in successfully!
Registering node to your fleet...
⚠️ Logged in, but node registration failed: Failed to register node: {"error":"Invalid request","details":{"formErrors":[],"fieldErrors":{"public_url":["Invalid URL","Only http/https URLs allowed"]}}}
This machine is now connected to your musu account.
Start the bridge with `musu bridge` to join your fleet.
```

Additional observed Windows behavior during the same session:

1. `musu.exe` was blocked multiple times by Windows with:

```text
파일에 바이러스 또는 기타 사용자 동의 없이 설치된 소프트웨어가 있기 때문에 작업이 완료되지 않았습니다.
```

2. At one point `C:\Users\empty\.musu\bin\musu.exe` was no longer present.
3. `http://127.0.0.1:8070/health` was not reachable after the failed flow.

## Findings

### 1. Defender-blocked executable path is not handled well

Severity: High

When Windows blocks `musu.exe`, the user sees a raw process launch failure. The CLI does not detect the Windows-specific error shape and does not tell the user what to do next.

Impact:

- Users cannot tell whether the issue is malware detection, SmartScreen, a bad download, or a broken install.
- Re-running install often fails at a different point and increases confusion.

Expected:

- Detect common Windows error 225 / Defender block patterns.
- Print a short recovery flow:
  - Open Windows Security
  - Check Protection history
  - Restore or allow only if the binary is trusted
  - Re-run install or login

### 2. Final login messaging is misleading

Severity: High

`musu login` reports `Logged in successfully!`, then node registration fails, then still says `This machine is now connected to your musu account.`

Impact:

- Users will reasonably infer the machine is ready when it is not.
- Support and debugging become harder because the CLI’s own wording obscures the actual state.

Expected:

- Separate these states clearly:
  - Account auth: success or failure
  - Node registration: success or failure
  - Bridge availability: running or not running

Suggested wording:

```text
Account login succeeded.
Node registration failed.
This machine is not yet available in your fleet.
```

### 3. `public_url` registration failure is opaque

Severity: High

The server rejected `public_url` because it was not a valid `http` or `https` URL, but the CLI did not show what value it attempted to send or where that value came from.

Observed local state:

- `.musu` config files did not expose a user-editable `public_url`.
- `bridge.env`, `musu.toml`, and `services/bridge.json` did not contain that field.
- This strongly suggests the CLI computes the field internally.

Impact:

- Users cannot self-diagnose.
- Developers cannot distinguish misconfiguration from a client-side bug without deeper instrumentation.

Expected:

- Add `--debug` output for registration payload fields, with secrets masked.
- Print the computed `public_url` on failure.
- If the value is local-only or invalid, say that explicitly.

### 4. Install and bridge lifecycle are unclear

Severity: Medium

The install flow says the bridge will start automatically on next logon or if the platform service auto-starts. Later the login output says `Start the bridge with musu bridge to join your fleet.`

Impact:

- The user does not know whether the bridge is expected to already be running.
- There is no clear state model for scheduled task, service registration, bridge process, and fleet membership.

Expected:

- The CLI should describe one of two supported models clearly:
  - Auto-managed bridge
  - User-managed bridge

- If both are supported, the CLI should state which one is active on this machine.

### 5. There is no single health-check command for first-run diagnosis

Severity: Medium

The user had to infer system state from installer output, login output, file presence, and manual `curl` checks.

Expected:

Add a `musu status` or `musu doctor` command that checks:

1. Binary present
2. PATH configured
3. Token present
4. Account login state
5. Node registration state
6. Bridge listening status
7. Last registration error
8. Computed `public_url`
9. Windows Defender known-block hint if process start recently failed

### 6. Update source metadata appears inconsistent

Severity: Medium

The installer was fetched from `yellowhama/musu-bee`, but the generated local `update.toml` referenced `emptymind/musu-bee`.

Impact:

- Trust and provenance are unclear.
- Auto-update behavior may not match the install source.

Expected:

- The install source and update source should align unless intentionally documented.
- If they differ, the reason should be explicit in install output and docs.

## Quality of Current Error Messages

Current state:

- Too process-level
- Not action-oriented
- Not stateful enough

What is missing:

1. What succeeded
2. What failed
3. Whether retry is safe
4. What the user should do next
5. Whether the issue is local config, network, Windows security, or server-side validation

## Recommended CLI Improvements

### Priority 0

1. Split account login success from node registration success.
2. Show the computed `public_url` on registration failure.
3. Add Defender-specific help for Windows process launch failures.

### Priority 1

1. Add `musu status`
2. Add `musu doctor`
3. Add `musu login --debug`
4. Add a clear post-install state summary

### Priority 2

1. Unify install source and update source metadata
2. Improve docs for Windows recovery
3. Clarify whether bridge management is automatic or manual

## Suggested Ideal Output

Example of a more accurate login result:

```text
Account login succeeded.
Registering node to your fleet...
Node registration failed.

Reason:
  public_url must be an http:// or https:// URL
  computed public_url: ws://127.0.0.1:8070

Current machine state:
  account login: OK
  fleet membership: NOT REGISTERED
  bridge: NOT RUNNING

Next steps:
  1. Run `musu doctor`
  2. If on Windows and process launch failed recently, check Windows Security > Protection history
  3. Re-run `musu login --debug` after correcting the bridge public URL
```

## Bottom Line

The main issue is not that the flow fails sometimes. The main issue is that the CLI does not expose the real state clearly enough when partial success occurs. On Windows, that leads to a confusing user experience with ambiguous recovery steps and no obvious source of truth.
