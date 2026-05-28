# MUSU CLI Reference

**Version**: 1.8.0

## Commands

### `musu up` — Start local MUSU for first-run use

```bash
musu up
musu up --json
musu up --open-dashboard
```

Ensures `~/.musu/bridge.env` exists, starts the local bridge when needed,
waits for `/health`, checks whether the dashboard is reachable, and prints the
next operator step. Use this as the beta first-run command before opening the
dashboard.

### `musu do` — Delegate a task to an AI agent

```bash
musu do "write unit tests for auth.py"
musu do "fix the login bug" --channel cto
musu do "run cargo test" --on 5070          # Run on a specific machine
```

Delegates to the `engineer` channel by default. Polls for 60s, prints result.

| Flag | Default | Description |
|------|---------|-------------|
| `--channel` | engineer | Agent channel (ceo, cto, engineer, qa, worker) |
| `--on` | (local) | Run on a specific machine name |
| `--bridge-url` | http://localhost:8070 | Bridge URL |

### `musu status` — System dashboard

```bash
musu status
```

Local CLI commands resolve the local bridge from `~/.musu/services/bridge.json` when available, then fall back to `BRIDGE_PORT` / `127.0.0.1:8070`.

Output:
```
  ✓ Bridge       http://localhost:8070
  ✓ Relay        connected
  ✓ Worker       http://localhost:9700
  ✓ Agents       44/44 active
  ✓ Nodes        2/2 healthy

  Recent tasks:
    ✓ [done] worker What is 3*7?
    ✗ [failed] team_lead ...

  Docs: http://localhost:8070/docs
```

### `musu doctor` — Diagnose system health

```bash
musu doctor
```

Checks: MUSU home, account/bridge tokens, bridge health, dashboard reachability,
package mode, and Windows PATH/alias shadowing.

### `musu update` — Update all mesh nodes

```bash
musu update
```

Runs `git pull` + restart on this node and every peer for direct-download nodes. Store/MSIX packaged Windows nodes must use Windows / Microsoft Store-managed updates instead and do not allow MUSU self-update.

### `musu nodes` — Manage mesh machines

```bash
musu nodes list                              # List all nodes + health
musu nodes add 100.121.211.106 --name gpu    # Add a machine
musu nodes remove gpu                        # Remove a machine
```

### `musu company` — Manage automated teams

```bash
musu company create my-startup               # Create from template
musu company create writers --template content-team
musu company list                            # List all companies
musu company templates                       # Available templates
```

Templates: `dev-team`, `content-team`, `writer-studio`, `research-team`.

### `musu agent` — Manage AI agents

```bash
musu agent list                              # List all agents
musu agent list --company my-startup         # Filter by company
musu agent assign engineer --node gpu-server # Move agent to a machine
```

### `musu setup` — One-step onboarding

```bash
musu setup --name my-startup --template dev-team --role all
```

Creates a company, assigns agents, configures this machine's role. One command.

### `musu xray` — Codebase analysis

```bash
musu xray ./my-project                       # Full analysis
musu xray ./my-project --depth deep          # Deep scan
musu xray ./my-project --compare             # Diff with previous scan
musu xray ./my-project --sync                # Upload to musu.pro
musu xray ./my-project --fix                 # Auto-create issues + delegate
```

Outputs: Markdown report + JSON. Checks: security, complexity, dependencies, docs.

### `musu security` — Security audit

```bash
musu security audit                          # Check config
musu security fix                            # Auto-fix issues
musu security fix --dry-run                  # Preview fixes
```

## Global Options

| Flag | Description |
|------|-------------|
| `--no-banner` | Disable startup banner |
| `-v, --verbose` | Debug logging |
| `--bridge-url` | Override bridge URL (default: http://localhost:8070) |
| `-V, --version` | Print version |
| `-h, --help` | Print help |

## Error Messages

MUSU CLI provides actionable error messages:

| Error | What It Means | What To Do |
|-------|--------------|------------|
| "Bridge not running" | Bridge server is down | `systemctl --user start musu-bridge` |
| "Bridge timed out" | Server overloaded | `musu status` to check load |
| "401 Unauthorized" | Token mismatch | Check `MUSU_BRIDGE_TOKEN` in bridge.env |
| "404 Not Found" | Agent channel doesn't exist | `musu agent list` |
| "409 Conflict" on update | Node is running in `store-msix` mode | Update that Windows install through its packaged Windows / Store channel |
| "429 Rate Limited" | Too many tasks | Wait, or increase `MUSU_MAX_CONCURRENT_TASKS` |
| "Agent unavailable" | Agent can't execute | `musu doctor` |
