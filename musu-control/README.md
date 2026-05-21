<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->

# musu-control (DEPRECATED — V24 R10 pending)

> ⚠️ **DEPRECATED** (V24 R10 pending)
> This Python MCP server is superseded by the native Rust `musu control` subcommand. It remains in the working tree as a deletion target until the operator approves R10.
> Replacement: `musu control` (Rust, stdio MCP via `rmcp` crate). Same `.mcp.json` registration pattern, 14 tools ported.
> See [V24 closure — R10 runbook §4.1](../docs/V24_CLOSURE_2026_05_21.html) for the deletion procedure (open locally for rendered view, or view raw on GitHub).

> Note: `INSTALL.md` in this directory remains only for historical reference; install path is now `musu install` (Rust). The INSTALL.md will be deleted with the rest of the directory at R10.

## Historical role (pre-V24)

MCP server (stdio JSON-RPC) — Claude Code / Codex / Gemini control plane for the bridge. Registered via `.mcp.json` as a standalone Python process (`uvx --from git+...`).

## Migration

| Old Python entry | Rust replacement |
|---|---|
| `musu-control` (entry point in pyproject.toml) | `musu control` (subcommand of single binary) |
| 80 MCP tools (Python, full surface) | 14 most-used tools ported in V24-R3 (the rest deferred to V25) |
| stdio JSON-RPC via Python `mcp` library | stdio JSON-RPC via `rmcp` 1.7 crate (Anthropic-blessed) |

No new code in this module since V24-R0. R10 will delete the directory.
