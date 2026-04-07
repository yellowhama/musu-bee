# Musu Indexer MCP Server

High-performance codebase indexer and MCP (Model Context Protocol) server powered by Go and SQLite FTS5.

This repository contains the complete toolset:
1. **The Scanner & Indexer (Go Engine)**: A compiled scanner/parser implementation kept in `indexer_src/`.
2. **The Database Manager (Python)**: Orchestrates scanning, applies correctness guards, and manages the `.musu_dev.db` SQLite database using `WAL` mode and 3GB memory mapping.
3. **The MCP Server (Python)**: Exposes the indexed context directly to AI assistants (Claude, Gemini, etc.) via tools like `search_codebase` and `sync_workspace`.

## Current Planning

- Master plan:
  - `/home/hugh51/musu-functions/musu-indexer/MASTER_PLAN.md`
- Phase 01 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/01_cli_runtime_decoupling_and_workspace_profiles.md`
- Phase 02 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/02_sync_engine_stabilization.md`
- Phase 03 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/03_query_and_retrieval_quality.md`
- Phase 04 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/04_session_acp_productization.md`
- Phase 05 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/05_mcp_tool_surface_and_packaging.md`
- Phase 06 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/06_validation_and_release_readiness.md`
- Phase 07 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/07_session_runtime_persistence.md`
- Phase 08 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/08_packaged_install_and_engine_failure_propagation.md`
- Phase 09 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/09_host_packaged_validation_and_release_evidence.md`
- Phase 10 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/10_packaged_bootstrap_fallback_and_host_guidance.md`
- Phase 11 detailed plan:
  - `/home/hugh51/musu-functions/musu-indexer/plans/11_host_validation_automation_and_bundle.md`
- Backlog / phase tracker:
  - `/home/hugh51/musu-functions/musu-indexer/TODO.md`

## Features
- **Guarded Workspace Indexing**: The repository still ships a Go engine, but the current `sync` path uses Python scan plus a Python write fallback to keep the DB correct when the bundled engine is stale or partial.
- **Incremental Sync**: Only updates modified files using stable filesystem keys.
- **FTS5 Search**: Provides deep contextual search across code symbols, document sections, and raw text.
- **MCP Integration**: Exposes `sync_workspace`, `search_codebase`, and `log_action` tools directly to AI assistants.
- **Cross-Platform & WSL2 Optimized**: Includes both Linux and Windows native binaries out-of-the-box.

## 🚀 Special Note for Windows & WSL2 Users

If you are a Windows user developing inside WSL2 (Ubuntu, Debian, etc.) while your project files reside on a mounted Windows drive (e.g., `/mnt/c/` or `/mnt/f/`), **file system access can be notoriously slow** due to the 9P protocol bridge.

**Musu Indexer automatically solves this!**
When it detects a WSL2 environment and a mounted path, the Python server intelligently bypasses the slow bridge by executing the native Windows binary (`musu-indexer.exe`) directly via `wslpath`. This guarantees ultra-fast native disk I/O speeds even while you work entirely inside Linux!

## Installation & Usage

### Install Profiles

- Base CLI only:
  - `pip install .`
- MCP support:
  - `pip install .[mcp]`
- Watcher support:
  - `pip install .[watch]`
- Everything:
  - `pip install .[full]`

The easiest and recommended way to use this tool is via `uvx` (or `pipx`), which automatically pulls the latest package from PyPI and runs it in an isolated environment without messing up your system packages.

### 1. As an MCP Server (For AI Assistants)
Expose the indexed context directly to Claude, Gemini, and other MCP-compatible clients. The server runs in the background and responds to tool calls (`search_codebase`, `sync_workspace`).

Add the following to your MCP client configuration (e.g., `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "musu-indexer": {
      "command": "uvx",
      "args": ["musu-indexer", "mcp"]
    }
  }
}
```

### 2. As an "Everything" CLI (For Humans)
You don't need an AI to benefit from ultra-fast FTS5 searches. Use the CLI tool directly in your terminal:
```bash
# Sync the current project
uvx musu-indexer sync

# Search the codebase instantly
uvx musu-indexer search "VRAM configuration"
uvx musu-indexer search "workspace profile" --scope doc

# Log an important milestone
uvx musu-indexer log "Refactored the parallel scanning logic"

# Reconcile stale rows after a profile/root change
uvx musu-indexer cleanup --dry-run

# Review recent sync evidence
uvx musu-indexer runs --limit 5

# Purge old PTY/spy snapshots
uvx musu-indexer cleanup-snapshots --hours 24
```

### Workspace Root And Profile Control

The CLI now resolves workspace root in this order:

1. `--profile /path/to/.musu-indexer.json`
2. `MUSU_INDEXER_PROFILE`
3. nearest parent `.musu-indexer.json`
4. `--root /path/to/root`
5. `MUSU_INDEXER_ROOT`
6. nearest parent `.git`
7. current working directory

This prevents accidental `cwd` bleed when you are sitting in a large workspace.

Example:
```bash
uvx musu-indexer sync --profile /home/hugh51/musu-functions/musu-indexer/examples/musu-functions.workspace.json
uvx musu-indexer search "windows bridge helper" --profile /home/hugh51/musu-functions/musu-indexer/examples/musu-functions.workspace.json
```

Profile file shape:
```json
{
  "name": "musu-functions",
  "root": "/home/hugh51/musu-functions",
  "include_roots": ["musu-computer-tools", "musu-indexer", "musu-port", "references"],
  "exclude_roots": ["references_AI"],
  "ignore_globs": ["work/**", "**/*.tar.gz", "**/*.tgz", "**/*.zip"]
}
```

### Runtime Boundaries

- Local CLI commands (`sync`, `search`, `recent`, `log`) no longer require the MCP runtime at import time.
- `mcp` only loads the MCP server when the `mcp` subcommand is selected.
- `watch` only loads `watchdog` when the `watch` subcommand is selected.
- `session` and `spy` stay available on the base install.
- Session logs are stored by exact session source (`pty:<id>` / `spy:<id>`) so CLI/MCP `session logs` can read them consistently.
- Session history and completed status are now persisted in `session_runs`.
- Detached rows from an old runtime are surfaced as `orphaned`.
- `sync` currently uses Python workspace scan for correctness. The Go index writer is treated as best-effort, with Python row materialization as the guard path.

### Session Surface Notes

- `session list` shows only active sessions in the current runtime.
- `session history` shows persisted recent session rows, including completed and orphaned entries.
- `session cleanup-history --hours N` removes old completed/orphaned rows.

### Search Quality Notes

- `search` now supports `--scope all|code|doc`
- results include `type`, `category`, and `score`
- category inference distinguishes `spec`, `plan`, `report`, `reference`, `guide`, `config`, `log`, and `code`

### Validation

- smoke script:
  - `/home/hugh51/musu-functions/musu-indexer/scripts/run-smoke.sh`
- packaged install smoke:
  - `/home/hugh51/musu-functions/musu-indexer/scripts/run-packaged-install-smoke.sh`
  - example:
    - `bash scripts/run-packaged-install-smoke.sh --report /tmp/musu-indexer-packaged-report.txt`
    - `bash scripts/run-packaged-install-smoke.sh --online-extras --report /tmp/musu-indexer-packaged-report-online.txt`
- host prerequisite probe:
  - `/home/hugh51/musu-functions/musu-indexer/scripts/check-packaged-host-prereqs.sh`
- validation bundle:
  - `/home/hugh51/musu-functions/musu-indexer/scripts/run-validation-bundle.sh`
- blocker research:
  - `/home/hugh51/musu-functions/musu-indexer/PACKAGED_INSTALL_BLOCKER_RESEARCH_2026-04-02.md`
- next-step runbook:
  - `/home/hugh51/musu-functions/musu-indexer/NEXT_STEPS.md`
- quality audit:
  - `/home/hugh51/musu-functions/musu-indexer/QUALITY_AUDIT_2026-04-02.md`
- release checklist:
  - `/home/hugh51/musu-functions/musu-indexer/RELEASE_CHECKLIST.md`
- handoff:
  - `/home/hugh51/musu-functions/musu-indexer/HANDOFF.md`

Current host note:

- `run-packaged-install-smoke.sh` first tries `python3 -m venv`, then falls back to `uv venv --seed` when `uv` is available.
- This host is still blocked because `/usr/bin/python3` lacks `python3-venv/ensurepip` and `uv` is not installed.
- On Ubuntu-family hosts, the official guidance is to provide `python3-full` or an equivalent environment with working `venv`.
- To capture a full evidence pack on a suitable host, run:
  - `bash scripts/run-validation-bundle.sh`
  - `bash scripts/run-validation-bundle.sh --online-extras`
- `run-validation-bundle.sh` now writes a smoke log and exits `0` on success, `2` on blocked host prerequisites, and `1` on real validation failure.

### 3. As an AI Skill (For CLI Agents)
If you are using terminal-based AI agents (like Gemini CLI), you can load the `SKILL.md` file included in this repository. This instructs the AI on exactly how to use the `musu-indexer` CLI commands to gather context autonomously, replacing slow and error-prone `grep` searches with instant database queries.
