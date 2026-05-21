<!-- Cross-ref invariant: this banner matches V24_CLOSURE §4.1 R10 deletion list. If you modify R10 list, update all 5 module READMEs. -->

# musu-bridge (DEPRECATED — V24 R10 pending)

> ⚠️ **DEPRECATED** (V24 R10 pending)
> This Python module is superseded by the native Rust binary's `musu bridge` subcommand. It remains in the working tree as a deletion target until the operator approves R10.
> Replacement: `musu bridge` (Rust, tokio + axum). Same HTTP surface, 7 endpoints + native handlers.
> See [V24 closure — R10 runbook §4.1](../docs/V24_CLOSURE_2026_05_21.html) for the deletion procedure (open locally for rendered view, or view raw on GitHub).

## Historical role (pre-V24)

Python FastAPI agent runtime: heartbeats, task delegation, mesh routing. Entry point `server:main` (broken in current toolchain since V24-R0 — facade now provided by Rust `musu bridge`).

## Migration

| Old Python entry | Rust replacement |
|---|---|
| `musu-bridge` (CLI) | `musu bridge` (subcommand of single binary) |
| FastAPI `/api/companies`, `/api/tasks`, `/api/nodes` etc. | `musu-rs::bridge` native handlers (R1 SHIP) |
| Python facade proxy (V24-R0..R5 transition) | dropped at R10 per V24 closure §4.1 step 3 |

No new code in this module since V24-R0. R10 will delete the directory.
