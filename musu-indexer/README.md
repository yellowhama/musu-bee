# musu-indexer

High-performance codebase indexer + MCP server. Used by MUSU agents to
search, list recent activity, and tail logs across the operator's
workspaces.

## What it does

- **`sync`** — incremental file scan + SQLite index
- **`watch`** — auto-ingest daemon
- **`search`** — keyword + tag query
- **`recent`** — recently changed files
- **`spy` / `session`** — PTY / chat logger
- **`mcp`** — MCP server (stdio or `--http` for shared singleton)

## Install

```bash
cd musu-indexer
python -m venv .venv
. .venv/bin/activate
pip install -e .
```

Pre-built scanner binaries ship in releases — do not commit local
builds (see `.gitignore`).

## Workspace profiles

Each workspace can carry a `.musu-indexer.json` profile defining
include/exclude roots and ignore globs. Run
`scripts/setup-indexer-workspace.sh` to auto-create defaults under
`$MUSU_WRITER_WORKSPACES` (colon-separated, defaults to `~/writer`).

## CLI

```bash
musu-indexer sync                # current workspace
musu-indexer sync --scope doc    # docs only
musu-indexer search "topic"
musu-indexer recent
musu-indexer mcp --http 9701     # shared singleton
```

See `musu-indexer --help` for the full surface.

## DB

Index DB lives at `$MUSU_FUNCTIONS_ROOT/.musu_dev.db` by default.
WAL mode; safe to read while writing. Don't kill mid-sync without
issuing a checkpoint first.
