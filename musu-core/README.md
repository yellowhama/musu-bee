<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->

# musu-core (DEPRECATED — V24 R10 pending)

> ⚠️ **DEPRECATED** (V24 R10 pending)
> This Python library is superseded by the native Rust `musu core` subcommand and the in-binary core module. It remains in the working tree as a deletion target until the operator approves R10.
> Replacement: `musu core` (Rust). Companies, agents, audit, adapters all subsumed by `musu-rs::core`.
> See [V24 closure — R10 runbook §4.1](../docs/V24_CLOSURE_2026_05_21.html) for the deletion procedure (open locally for rendered view, or view raw on GitHub).

## Historical role (pre-V24)

Agent / task / company / SQLite backend library. Used by musu-bridge as an in-process import. No CLI entry point of its own.

## Migration

| Old Python surface | Rust replacement |
|---|---|
| `musu_core.companies` module | `musu-rs::core::companies` |
| `musu_core.agents` module | `musu-rs::core::agents` |
| `musu_core.audit` module | `musu-rs::core::audit` |
| Adapter pattern (Claude/Gemini/Codex/Hermes) | `musu-rs::core::adapters` |
| SQLite schema v37 | Schema v1 fresh (V24-R2 SHIP) — operator companies are re-registered, not migrated |

No new code in this module since V24-R0. R10 will delete the directory.
