<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->

# musu-indexer (DEPRECATED — V24 R10 pending)

> ⚠️ **DEPRECATED** (V24 R10 pending)
> This Python codebase indexer is superseded by the native Rust `musu indexer` subcommand (per-workspace SQLite FTS5). It remains in the working tree as a deletion target until the operator approves R10.
> Replacement: `musu indexer sync|search|init-profile|watch` (Rust). Same `.musu_dev.db` per-workspace pattern.
> See [V24 closure — R10 runbook §4.1](../docs/V24_CLOSURE_2026_05_21.html) for the deletion procedure (open locally for rendered view, or view raw on GitHub).

## Migration

| Old Python entry | Rust replacement |
|---|---|
| `musu-indexer sync` | `musu indexer sync` |
| `musu-indexer search` | `musu indexer search --work-dir . --query "..."` |
| `musu-indexer recent` | (dropped — session/spy dead path; per V24-R4 Researcher F2) |
| `musu-indexer mcp --http` | (dropped — HTTP-first frame was wrong; per V24-R4 Researcher F1) |
| `musu-indexer watch` | `musu indexer watch` (Cargo feature `indexer-watch`) |
| `.musu-indexer.json` profile | unchanged (per-workspace JSON) |

No new code in this module since V24-R0. R10 will delete the directory.

---

## Legacy Python surface (R10-pending deletion)

> Below is the original Python-era documentation, preserved for historical reference until R10. **Do not follow these instructions** — they reference a Python entry point that no longer exists after V24-R0 facade transition.

### What it did

- **`sync`** — incremental file scan + SQLite index
- **`watch`** — auto-ingest daemon
- **`search`** — keyword + tag query
- **`recent`** — recently changed files
- **`spy` / `session`** — PTY / chat logger
- **`mcp`** — MCP server (stdio or `--http` for shared singleton)

### Install (historical, do not run)

```bash
cd musu-indexer
python -m venv .venv
. .venv/bin/activate
pip install -e .
```

Pre-built scanner binaries shipped in releases — do not commit local
builds (see `.gitignore`).

### Workspace profiles

Each workspace can carry a `.musu-indexer.json` profile defining
include/exclude roots and ignore globs. Run
`scripts/setup-indexer-workspace.sh` to auto-create defaults under
`$MUSU_WRITER_WORKSPACES` (colon-separated, defaults to `~/writer`).

### CLI (historical)

```bash
musu-indexer sync                # current workspace
musu-indexer sync --scope doc    # docs only
musu-indexer search "topic"
musu-indexer recent
musu-indexer mcp --http 9701     # shared singleton
```

See `musu-indexer --help` for the full surface.

### DB

Index DB lived at `$MUSU_FUNCTIONS_ROOT/.musu_dev.db` by default.
WAL mode; safe to read while writing. Don't kill mid-sync without
issuing a checkpoint first. (Rust replacement preserves this DB path and WAL mode.)
