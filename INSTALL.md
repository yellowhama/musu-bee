# Install

MUSU runs on three platforms: **Linux / WSL**, **macOS**, **Windows**.
Pick yours.

Important Windows note:

- The **current** Windows install path is still the direct-download bootstrap flow.
- The packaged Windows path now has **two** contracts:
  - **local sideload / MSIX manual**: packaged install, but bridge startup is manual via `musu bridge`
  - **Store-reviewed auto-start**: packaged install plus restricted-capability approval for `ImmediateRegistration`
- Do not assume either packaged path will reuse `install.ps1`, `~/.musu/bin`, Task Scheduler registration, or MUSU-managed self-update.

Design references:

- [Store/MSIX audit](docs/STORE_MSIX_AUDIT_2026_05_27.md)
- [Store/MSIX packaging guide](docs/STORE_MSIX_PACKAGING_GUIDE_2026_05_27.md)
- [Store/MSIX approval status ledger](docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md)
- [Store/MSIX next steps](docs/STORE_MSIX_NEXT_STEPS_2026_05_27.md)
- [Store/MSIX restricted capability submission checklist](docs/STORE_MSIX_RESTRICTED_CAPABILITY_SUBMISSION_CHECKLIST_2026_05_27.md)
- [Windows distribution pivot](docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md)

---

## Quickstart by platform

### Linux / WSL (Ubuntu, Debian, Arch, …)

```bash
bash scripts/install.sh --service --start
```

This auto-detects your GPU, OS, and Tailscale IP, creates `~/.musu/`,
seeds the agents, registers a **systemd user service** (`musu-bridge`),
and starts the bridge on `http://127.0.0.1:8070`.

To enable HTTPS via Caddy: append `--https`.

### macOS

```bash
bash scripts/install.sh --service --start
```

Same script — on macOS it registers a **launchd LaunchAgent**
(`~/Library/LaunchAgents/com.musu.bridge.plist`) instead of systemd.
The plist template is at `scripts/launchd/com.musu.bridge.plist.example`.

### Windows (native, no WSL)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start
```

Runs the equivalent steps in PowerShell. Registers a user-level
**Task Scheduler task** (`musu-bridge`) that auto-starts on logon.
No admin privileges required.

This describes the **direct-download/operator** path.
It is not the intended final Store/MSIX install story.

---

## Prerequisites

| Platform | Required |
|---|---|
| Linux / WSL | Python 3.12+, Node.js 20+, `bash`, `openssl` |
| macOS | Python 3.12+ (Homebrew: `brew install python@3.12`), Node.js 20+ (`brew install node`) |
| Windows | Python 3.12+ (`winget install Python.Python.3.12`), Node.js 20+ (`winget install OpenJS.NodeJS`), PowerShell 5.1+ (preinstalled) |

Optional (any platform): Claude / Codex / Gemini CLI for adapter use.

---

## What the installer does

This section describes the current direct-download bootstrap path, not the future Store/MSIX packaged path.

Whether you ran `install.sh` or `install.ps1`, the same 7 steps run:

1. **Python check** — fails fast if < 3.12.
2. **Create operator dir** — `~/.musu/` (or `%USERPROFILE%\.musu\` on Windows). Permissions locked to current user.
3. **Create venv + install deps** — `musu-bridge/.venv` with `musu-core` and `musu-bridge` editable installs.
4. **Seed `bridge.env`** — `~/.musu/bridge.env` from template, with a fresh `MUSU_BRIDGE_TOKEN` auto-generated.
5. **Detect node identity** — writes `~/.musu/nodes.toml` with hostname, OS, GPU, Tailscale IP.
6. **Build `musu-bee`** — `npm install && npm run build` (matches `scripts/install.sh`'s actual invocation; requires Node.js, skipped with a warning if missing). `pnpm` works equivalently if you prefer it — see the per-module manual install below.
7. **Register service** — systemd (Linux), launchd (macOS), or Task Scheduler (Windows).

If you pass `--start` (`-Start` on Windows), the bridge is launched
and a health check confirms `http://127.0.0.1:8070/health` returns 200.

---

## Per-module manual install (if you skip the installer)

If you'd rather wire each module yourself:

### musu-bridge (Python)

```bash
cd musu-bridge
python -m venv .venv
. .venv/bin/activate          # Windows: .\.venv\Scripts\activate
pip install -e .
```

Config: `~/.musu/bridge.env` — copy from `scripts/systemd/bridge.env.example`.

### musu-core / musu-control / musu-writer / musu-indexer

Same pattern. Each has a local `pyproject.toml`.

### musu-bee (Next.js)

```bash
cd musu-bee
pnpm install
pnpm build
pnpm start
```

### musu-relay (Node.js)

`musu-relay` is optional unless you need self-hosted WebRTC signaling
rendezvous for cross-PC mesh (V23.4+). For single-machine use, skip
this block.

```bash
cd musu-relay
pnpm install
pnpm build
pnpm start    # runs dist/signaling/server.js
```

There is no `server.js` at the repo root — the entry is built into
`dist/signaling/server.js` by the `build` script. The legacy V21
WebSocket relay (`src/server.ts`) is still in tree but only used by
`pnpm dev:legacy-v21` for backward-compat tests.

---

## Service management

### Linux

```bash
systemctl --user start musu-bridge
systemctl --user stop musu-bridge
systemctl --user status musu-bridge
journalctl --user -u musu-bridge -f
```

### macOS

```bash
launchctl load   ~/Library/LaunchAgents/com.musu.bridge.plist
launchctl unload ~/Library/LaunchAgents/com.musu.bridge.plist
launchctl list | grep musu
tail -f ~/.musu/logs/musu-bridge.err.log
```

### Windows

```powershell
Start-ScheduledTask    -TaskName musu-bridge
Stop-ScheduledTask     -TaskName musu-bridge
Get-ScheduledTaskInfo  -TaskName musu-bridge
Get-Content "$env:USERPROFILE\musu-bee\logs\bridge-install-start.log" -Tail 50

# Reload bridge after a code change (no admin needed):
powershell -ExecutionPolicy Bypass -File scripts\restart-bridge.ps1
```

---

## Adding another machine

Once the bridge is running on one machine, register more nodes via
the bridge API. (There is no `musu` top-level CLI — only the
`musu-bridge` and `musu-bridge-init` entry points get put on PATH.)

```bash
# On the first machine:
curl -X POST http://localhost:8070/api/nodes/add \
  -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<friendly-name>",
    "tailscale_ip": "100.x.x.x"
  }'
```

`NodeAddRequest` accepts `name` (required, 1-64 chars), and either
`url` or `tailscale_ip` (the bridge auto-generates the URL from the
Tailscale IP). Optional `agents` list assigns specific agents to
the node. GPU/OS metadata goes in `~/.musu/nodes.toml` on the
destination machine, not in this request.

The new node needs to run the installer too (same one-liner). After
that, both bridges discover each other over Tailscale and the mesh
router can spill work between them.

See [`docs/ONBOARDING.md`](docs/ONBOARDING.md) for the full mesh
onboarding flow (token exchange, peer acceptance, agent assignment).

---

## Troubleshooting

### Bridge fails to start

```bash
# Linux
journalctl --user -u musu-bridge -n 50

# macOS
tail -100 ~/.musu/logs/musu-bridge.err.log

# Windows
Get-Content "$env:USERPROFILE\musu-bee\logs\bridge-install-start.log" -Tail 100
```

### "No AI CLI found" warning

Agents won't execute without a CLI. Install one:

- **Claude Code**: https://docs.anthropic.com/en/docs/claude-code
- **Gemini CLI**: https://github.com/google-gemini/gemini-cli
- **Codex CLI**: bundled with OpenAI Codex.

### Port 8070 already in use

Edit `~/.musu/bridge.env` and set `BRIDGE_PORT=8071` (or another free port).

### Repo layout assumption

Scripts default to `$(cd "$(dirname "$0")/.." && pwd)`. If you run
them from a different directory or call them from systemd / cron /
Task Scheduler, set `MUSU_FUNCTIONS_ROOT` explicitly.

### Windows: install.ps1 fails with "Unexpected token" on PowerShell 5.1

If the very first line of `powershell -File scripts\install.ps1` is
a parser error like `Unexpected token '}' in expression or statement`,
the script file lost its UTF-8 BOM somewhere (download, git config,
manual edit). Windows PowerShell 5.1 reads BOM-less files as ANSI,
which corrupts the multi-byte characters used in the prompts and
breaks quote matching.

Workarounds:
- Run with PowerShell 7 instead: `pwsh -ExecutionPolicy Bypass -File scripts\install.ps1 -Service -Start`.
- Or re-add the BOM: open the file in VS Code → bottom-right encoding
  → "Save with Encoding" → "UTF-8 with BOM".

Don't try to "fix" the source — the on-disk file is fine; the encoding
just needs to be visible to PS 5.1.

### Windows: install.ps1 aborts at "Step 5b: seeding agents..."

If you see `python.exe : INFO Auto-detected: ...` followed by
`RemoteException`, you're on a fixed-up version older than commit
`5ce3e7a`. Pull the latest `main` and re-run.

### Windows: "musu-bee build complete" but no UI

If install reports build success but `musu-bee\.next` doesn't exist,
the Next.js build is failing silently. Common cause: `musu-bee/package.json`
build script uses Unix-style `NODE_ENV=production next build`, which
Windows shells reject. Workaround for now:

```powershell
cd musu-bee
$env:NODE_ENV = "production"
npx next build
```

Tracked as a v16.A.2 follow-up.

---

## Operator data

User-bound data lives under `~/.musu/`:

```
~/.musu/
  bridge.env           # bridge config (TOKEN, RELAY, etc.)
  nodes.toml           # mesh node list (auto-detected)
  musu.db              # SQLite — agents, tasks, companies
  companies/           # operator-owned company manifests
  instructions/        # operator instructions per agent
  archive/             # rotated logs and snapshots
```

See [`docs/CONFIG.md`](docs/CONFIG.md) for the full env var reference.
