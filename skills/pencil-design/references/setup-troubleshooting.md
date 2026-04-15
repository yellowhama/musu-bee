# Pencil.dev MCP Setup & Troubleshooting

## Architecture Overview

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   MCP Client    │────────────────────▶│  Pencil Desktop │
│ (Claude Code /  │    ws://127.0.0.1  │  App (MCP Srv)  │
│  Cursor / VSC)  │      :33457        │  .pen files     │
└─────────────────┘                     └─────────────────┘
```

Pencil's MCP server is **built into the desktop app** — no separate server setup needed.

## Prerequisites

- **Pencil desktop app** installed
  - Linux: `.deb` (`sudo dpkg -i pencil-*.deb`) or `.AppImage`
  - macOS: `.dmg` (drag to Applications)
  - Windows: Native installer or use VS Code/Cursor extension
- **Claude Code CLI** authenticated (for AI integration)

## Installation

### Desktop App

Download from [pencil.dev](https://www.pencil.dev/) or use existing installation:

```bash
# Linux AppImage (this project)
/home/hugh51/tools/Pencil-1.1.24-linux-x64/pencil

# Linux .deb
sudo dpkg -i pencil-*.deb
```

### VS Code / Cursor Extension

Search "Pencil" in Extensions (Cmd/Ctrl+Shift+X) and install.

### MCP Server Configuration

Add to `~/.claude/mcp-servers.json`:

```json
{
  "pencil": {
    "url": "ws://127.0.0.1:33457"
  }
}
```

For Cursor: Settings → Tools & MCP → verify Pencil appears.

## Connection Order (Critical)

**Pencil MUST be opened BEFORE Claude Code / Cursor / VS Code.**

1. Launch Pencil desktop app
2. Open or create a `.pen` file
3. Start Claude Code (or restart if already running)
4. Verify: `mcp__pencil__get_editor_state`

If you start Claude Code first, the WebSocket connection won't establish.

## Troubleshooting

### MCP Tools Not Available

| Symptom | Cause | Solution |
| ------- | ----- | -------- |
| "No such tool" | Pencil not running | Open Pencil, restart Claude Code |
| WebSocket refused | Port 33457 blocked | `ss -tlnp \| grep 33457` to verify |
| Tools timeout | No `.pen` file open | Open a design file in Pencil |
| Intermittent drops | Version mismatch | Update Pencil to latest |

### Permission Issues

| Symptom | Solution |
| ------- | -------- |
| "Can't access folder" | Accept OS permission prompts |
| File operations fail | Check `.pen` file permissions |
| No permission prompts | Run operation in separate terminal |

### Known Issues

- **Codex config conflict**: Pencil may modify/duplicate Codex `config.toml` — back up first
- **Linux AppImage**: May need `chmod +x` before first run
- **WSL**: Runs via WSLg; ensure X11/Wayland forwarding works

## Verifying Connection

```bash
# Check if Pencil MCP server is listening
ss -tlnp | grep 33457

# In Claude Code, test:
# Call mcp__pencil__get_editor_state
# Expected: returns active file info and selection state
```

## Available Tools (Verification Checklist)

After connection, these tools should be available:

- [ ] `mcp__pencil__batch_design` — Create/modify design elements
- [ ] `mcp__pencil__batch_get` — Read design structure
- [ ] `mcp__pencil__get_screenshot` — Render previews
- [ ] `mcp__pencil__snapshot_layout` — Analyze layout
- [ ] `mcp__pencil__get_editor_state` — Editor context
- [ ] `mcp__pencil__get_variables` — Read design tokens
- [ ] `mcp__pencil__set_variables` — Update design tokens
