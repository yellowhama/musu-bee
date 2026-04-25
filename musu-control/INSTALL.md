# musu-control — MCP Server for MUSU

## Quick Install

```bash
# Option 1: uvx (recommended)
uvx --from git+https://github.com/yellowhama/musu-bee#subdirectory=musu-control musu-control

# Option 2: pip install from local
cd musu-control && pip install -e .

# Option 3: direct run
cd musu-control && python -m musu_control.server
```

## Claude Code MCP Registration

Add to `~/.claude/mcp-servers.json`:

```json
{
  "musu-control": {
    "command": "musu-control",
    "env": {
      "MUSU_BRIDGE_URL": "http://localhost:8070",
      "MUSU_BRIDGE_TOKEN": "your-token-here",
      "PAPERCLIP_COMPANY_ID": "your-company-id"
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MUSU_BRIDGE_URL` | Yes | Bridge API URL (default: http://localhost:8070) |
| `MUSU_BRIDGE_TOKEN` | Yes | Authentication token |
| `PAPERCLIP_COMPANY_ID` | No | Default company for scoped operations |

## Available Tools (50+)

Agents, issues, tasks, dashboard, costs, wiki, goals, projects,
approvals, nodes, remote execution, board messaging, route_task,
morning report, auto-distribution control, and more.

Run `musu-control` to see the full tool list.
