<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->

# musu-writer (DEPRECATED — V24 R10 pending)

> ⚠️ **DEPRECATED** (V24 R10 pending)
> This Python writer module is superseded by the native Rust `musu writer` subcommand. It remains in the working tree as a deletion target until the operator approves R10.
> Replacement: `musu writer` (Rust, tokio::process::Command for Claude CLI subprocess + SSE event stream).
> See [V24 closure — R10 runbook §4.1](../docs/V24_CLOSURE_2026_05_21.html) for the deletion procedure (open locally for rendered view, or view raw on GitHub).

## Historical role (pre-V24)

Long-form fiction writing tooling (operator-shaped). Agent task execution + supervisor integration. Entry point `musu-writer` (Python CLI).

## Migration

| Old Python entry | Rust replacement |
|---|---|
| `musu-writer` (CLI) | `musu writer` (subcommand of single binary) |
| Agent task execution loop | `musu-rs::writer::runner` (V24-R5 SHIP, 990 LOC) |
| Claude CLI subprocess management | `tokio::process::Command` (V24-R5) |
| SSE event stream | `tokio::sync::broadcast` (V24-R5) |
| musu-supervisor workspace integration | V24-R5 §A.1.1 — supervisor crate integration deferred per Phase 0 (b) GREENFIELD finding |

No new code in this module since V24-R0. R10 will delete the directory.
