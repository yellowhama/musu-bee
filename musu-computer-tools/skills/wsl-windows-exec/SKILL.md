---
name: wsl-windows-exec
description: "Run Windows executables from this Codex WSL snap environment when direct `.exe` execution fails. Use when PowerShell, `cmd.exe`, `cargo.exe`, or other Windows binaries return errors like `cannot execute: required file not found`, especially in Ubuntu Core or snap-confined WSL sessions where `/init` is hidden but `/var/lib/snapd/hostfs/init` is available."
---

# Wsl Windows Exec

## Overview

Use the host WSL init bridge to launch Windows executables from this shell. Prefer the bundled wrapper script instead of calling `.exe` files directly.

## Workflow

1. Confirm the failure mode.
   If a Windows binary fails with `cannot execute: required file not found`, assume WSL interop is present but `/init` is not visible inside the snap runtime.
2. Use the wrapper script.
   Run [`scripts/winexec.sh`](/home/hugh51/snap/codex/34/skills/wsl-windows-exec/scripts/winexec.sh) and pass the Windows executable path plus arguments unchanged.
3. Prefer PowerShell for complex Windows-side commands.
   Use `Set-Location` on the Windows path and run the Windows tool from there.

## Commands

Run Windows `cmd.exe`:

```bash
/home/hugh51/snap/codex/34/skills/wsl-windows-exec/scripts/winexec.sh \
  /mnt/c/Windows/System32/cmd.exe /C ver
```

Run PowerShell in a Windows project directory:

```bash
/home/hugh51/snap/codex/34/skills/wsl-windows-exec/scripts/winexec.sh \
  /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
  -NoProfile -Command "Set-Location 'F:\Aisaak\Projects\Musu-new\release\musu-desktop'; cargo check -p musu-desktop"
```

Query a Windows-hosted tool path:

```bash
/home/hugh51/snap/codex/34/skills/wsl-windows-exec/scripts/winexec.sh \
  /mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe \
  -NoProfile -Command "Get-Command cargo | Select-Object -ExpandProperty Source"
```

## Notes

- Prefer absolute `/mnt/c/...` executable paths from Linux.
- Do not rewrite arguments inside the wrapper. Pass them exactly as the Windows tool expects.
- Use PowerShell quoting carefully. When a command is complex, keep the outer shell in single quotes and the PowerShell `-Command` body in double quotes.
- If `/init` exists, the wrapper uses it. If `/init` is hidden by snap confinement, the wrapper falls back to `/var/lib/snapd/hostfs/init`.

## Failure Cases

- If both `/init` and `/var/lib/snapd/hostfs/init` are missing, WSL interop is unavailable in the current runtime. Run the command from a normal WSL or Windows terminal instead.
- If the Windows command starts but the tool itself fails, debug that tool on the Windows side. The interop layer is already working.
