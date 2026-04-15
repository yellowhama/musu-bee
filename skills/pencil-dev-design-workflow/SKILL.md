---
name: pencil-dev-design-workflow
description: "Launch and stabilize Pencil Dev on Linux, open a target .pen file, verify IPC/MCP connection from logs, and run a design-heavy delivery workflow that coordinates existing design skills. Use when the user asks to keep Pencil running, connect Codex/Claude in Pencil, stabilize related Linux/WSLg MCP tooling, or execute UI implementation/review using ui-ux-expert, vercel-composition-patterns, vercel-react-best-practices, web-design-guidelines, and optionally next-best-practices."
---

# Pencil Dev Design Workflow

## Overview

Start Pencil reliably in Linux, verify MCP connectivity, and perform design edits through Pencil MCP tool calling (not raw file patching) so changes apply live in the open canvas.

This skill is the canonical Pencil workflow skill in this environment. Keep all Pencil runtime + MCP guidance consolidated here.

## Workflow

1. Resolve target `.pen` file path and confirm it exists.
2. If Pencil is not running, start with `scripts/start_pencil_dev.sh`.
3. Verify runtime health with `scripts/check_pencil_connection.sh`.
4. Verify MCP connection in Codex (`/mcp`) and confirm Pencil server appears.
5. Confirm the active editor is the expected `.pen` file (`get_editor_state` when allowed).
6. If the task needs desktop-level inspection or WSLg screenshot verification, also confirm `computer-control` MCP is available.
7. Do all design mutations via Pencil MCP tools (`batch_get`, `batch_design`, `get_screenshot`, `snapshot_layout`).
8. Apply the design skill stack in order for implementation and review.
9. Use `references/pencil-mcp-tool-calling-playbook.md` for tool-call sequence and troubleshooting.

## Start Pencil Dev

Use this command in the user's terminal:

```bash
~/.agents/skills/pencil-dev-design-workflow/scripts/start_pencil_dev.sh /absolute/path/to/file.pen
```

Or for explicit deterministic restart + verification in one command (only when user asks restart):

```bash
~/.agents/skills/pencil-dev-design-workflow/scripts/reload_pencil_dev.sh /absolute/path/to/file.pen
```

If Pencil is already running but MCP is not attached, sync MCP mapping only:

```bash
~/.agents/skills/pencil-dev-design-workflow/scripts/sync_pencil_mcp.sh
```

### Execution rules

- Default preferred binary (Linux): `/home/hugh51/Pencil-linux-x86_64.AppImage`
- Secondary binaries: `pencil` in `PATH`, then `/home/hugh51/tools/Pencil-1.1.24-linux-x64/pencil`
- Always pass:
  - `--no-sandbox`
  - `--enable-unsafe-swiftshader`
- Default behavior:
  - First launch uses `--disable-gpu`
  - If launch fails, retry once without `--disable-gpu`
  - Enforce X11 hints by default: `ELECTRON_OZONE_PLATFORM_HINT=x11`, `GDK_BACKEND=x11`
- Stability checks:
  - PID file is not trusted alone; validate live main process
  - Hold process for stability window before reporting success
- Default runtime artifacts:
  - PID file: `/tmp/pencil-dev.pid`
  - Runtime log: `/tmp/pencil-dev.log`
  - Main app log: `/home/hugh51/.config/Pencil/logs/main.log`
- If user already has Pencil open, do not stop/reload by default.
- Prefer keeping one live session and editing through MCP.

## Verify Connection

Use:

```bash
~/.agents/skills/pencil-dev-design-workflow/scripts/check_pencil_connection.sh /absolute/path/to/file.pen
```

Treat connection as healthy when all are present in the log window:
- Main process is running (`process-running: 1`)
- `loadFile <target.pen>`
- `addResource: <target.pen>`
- `[IPC] initialized: <target.pen>`
- `Sending notification: claude-status` or `Sending notification: codex-status`

Additionally, for AI live editing workflow:
- Codex `/mcp` must list Pencil MCP server.
- Pencil MCP tools must be callable (`batch_get`, `batch_design` at minimum).

When desktop automation or a whole-window screenshot is part of the task:
- Codex `/mcp` should also list `computer-control`.
- Minimal smoke tests:
  - `get_screen_size`
  - `get_mouse_location`
  - `take_screenshot(x=0, y=0, width=64, height=48)`
- On this WSLg setup, `computer-control` auto-starts a screenshot helper through `launch-computer-control.sh`.
- If `computer-control` was reconfigured, restart or reload the MCP client before re-testing.

CLI verification shortcut:

```bash
codex mcp list
codex mcp get pencil
```

If process is unstable and user approved restart, use:

```bash
~/.agents/skills/pencil-dev-design-workflow/scripts/stop_pencil_dev.sh
~/.agents/skills/pencil-dev-design-workflow/scripts/start_pencil_dev.sh /absolute/path/to/file.pen
```

Recommended quick recovery:

```bash
~/.agents/skills/pencil-dev-design-workflow/scripts/reload_pencil_dev.sh /absolute/path/to/file.pen
```

### Linux troubleshooting knobs

- Disable X11 forcing: `PENCIL_FORCE_X11=0`
- Disable first-pass GPU off: `PENCIL_DISABLE_GPU=0`
- Extend stability hold: `PENCIL_STABILITY_SECS=20`
- Force a new launch even if instance exists: `PENCIL_FORCE_LAUNCH=1`
- Force non-AppImage binary preference: `PENCIL_PREFER_APPIMAGE=0`

## Critical Editing Rule (MCP-first)

- Default path: edit designs through Pencil MCP tools so the running Pencil canvas updates immediately.
- Do not use raw `.pen` file editing as the primary workflow.
- Prefer Pencil `get_screenshot` for canvas/frame validation.
- Use `computer-control` only when you need desktop/window capture outside the Pencil node tree, or when validating Linux/WSLg rendering at the desktop level.
- When a user explicitly restricts allowed Pencil tools, follow that tool whitelist exactly.
- Raw `.pen` edits are fallback-only and require:
  1. MCP unavailable/blocked, and
  2. explicit user approval, and
  3. explicit notice that live canvas may require manual reload/reopen.

## MCP Tool Usage Pattern

1. `batch_get`: inspect current frame/object IDs and hierarchy.
2. `get_screenshot`: capture `before` for the edited node/frame.
3. `batch_design`: apply create/update/move/delete operations in small batches.
4. `snapshot_layout`: validate structure after mutation (`problemsOnly=true` when needed).
5. `get_screenshot`: capture `after` and compare with expected changes.

Always work in small batches and verify after each batch. If changes are not visible, run the troubleshooting checklist in `references/pencil-mcp-tool-calling-playbook.md`.

## MCP Troubleshooting (No Visible Change)

Run these checks in order:

1. Active editor mismatch: confirm Pencil's active file path is the target `.pen`.
2. Wrong node/frame: screenshot the exact node ID you edited (`get_screenshot`).
3. Missing IDs: re-read nodes using `batch_get`; if ID is missing, it may have been deleted/replaced.
4. Canceled calls: retry if a tool call was canceled/interrupted.
5. Oversized operation batch: split into smaller `batch_design` calls and re-verify.

For WSLg desktop screenshot issues outside Pencil MCP:

1. Smoke-test `computer-control` with `get_screen_size`, `get_mouse_location`, then a tiny `take_screenshot`.
2. If `take_screenshot` fails immediately after config/runtime changes, restart the MCP client so the `computer-control` launcher is re-read.
3. Check helper log at `/tmp/computer-control-scrot-helper.log`.
4. Treat `computer-control` as verification-only for desktop state; continue using Pencil MCP for actual `.pen` mutations.

## Design Skill Stack

After Pencil is connected, execute this stack:

1. `ui-ux-expert`: define UX intent, information architecture, accessibility goals.
2. `vercel-composition-patterns`: define component API boundaries and composition model.
3. `vercel-react-best-practices`: optimize rendering, data flow, and performance.
4. `web-design-guidelines`: run UI/accessibility compliance review and fix gaps.
5. `next-best-practices` (only for Next.js projects): align routing, data and server/client boundaries.

Read [design-skill-stack.md](references/design-skill-stack.md) for a compact trigger map.

## Output Contract

For each design task, produce:

1. Pencil runtime status summary.
2. Files changed for implementation.
3. Accessibility/performance findings and fixes applied.
4. Remaining risks and exact follow-up commands when verification is incomplete.

## Scripts

- `scripts/start_pencil_dev.sh`: start and detach Pencil Dev.
- `scripts/check_pencil_connection.sh`: verify live process + log markers.
- `scripts/stop_pencil_dev.sh`: stop PID-file target and orphaned main process.
- `scripts/reload_pencil_dev.sh`: stop + start + connection verification in one shot.
- `scripts/sync_pencil_mcp.sh`: rebind `codex` pencil MCP server to stable binary path.
- `scripts/mcp_banner.sh`: shared MCP banner/hint output used by all scripts.

All runtime scripts print an MCP banner or failure hint so operators always see the recommended tool-calling sequence and playbook path.
