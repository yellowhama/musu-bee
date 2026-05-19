# V24 Rust Dependency Audit (R0)

**Wiki ID**: companion to wiki/490 (not separate wiki ID — R0 deliverable)
**Created**: 2026-05-20
**Purpose**: Panel HIGH-2 mitigation (c) — enumerate every new crate, justify per `[[feedback-self-contained-product]]`, mark removal cost.
**Rule**: any crate that fails to justify here MUST be removed from `musu-rs/Cargo.toml` before R1 Builder starts.

## Workspace baseline (R0 bootstrap commit)

These are in `musu-rs/Cargo.toml` at R0:

| Crate | Version | Purpose | License | Removal cost | Self-contained-product? |
|---|---|---|---|---|---|
| `tokio` | 1 | Async runtime (panel decision-musu-backend-rust lock) | MIT | HIGH (rewrite all async surface) | OK — single-binary, no SaaS, well-maintained, ~80M downloads/month |
| `axum` | 0.7 | HTTP server (panel decision-musu-backend-rust lock) | MIT | HIGH (rewrite all HTTP surface) | OK — built on tokio, no SaaS, official Rust foundation tokio-rs |
| `tower` | 0.4 | axum middleware substrate | MIT | LOW (axum dep, not direct) | OK — same upstream as axum |
| `tower-http` | 0.5 | Tracing middleware for axum | MIT | LOW (can replace with manual logging) | OK |
| `tracing` | 0.1 | Structured logging | MIT | LOW (can swap for log crate) | OK |
| `tracing-subscriber` | 0.3 | tracing → stderr/JSON output | MIT | LOW | OK |
| `serde` | 1 | Serialization | MIT/Apache-2.0 | HIGH (any JSON/YAML breaks without) | OK — de facto standard, 100M+ downloads |
| `serde_json` | 1 | JSON codec for serde | MIT/Apache-2.0 | HIGH (rewrite all JSON paths) | OK |
| `serde_yaml` | 0.9 | YAML codec for serde (companies.yaml) | MIT/Apache-2.0 | MED (can switch to TOML if maintainership drops) | OK — note: dtolnay/serde_yaml maintenance has slowed; alternative `serde_yml` exists if fork needed |
| `anyhow` | 1 | Application-level errors | MIT/Apache-2.0 | LOW (can replace with Box<dyn Error>) | OK |
| `thiserror` | 1 | Library-level errors | MIT/Apache-2.0 | LOW | OK |
| `clap` | 4 | CLI arg parsing (subcommand dispatch) | MIT/Apache-2.0 | LOW (can hand-roll for 4 subcommands) | OK |

**Total R0 deps**: 12 crates. No SaaS deps, no proprietary, no network-call-at-import behavior. All have local-build path.

## R1 expected additions (musu-rs::bridge)

| Crate | Likely version | Purpose | Fallback if yanked | Decision gate |
|---|---|---|---|---|
| `sqlx` OR `rusqlite` | 0.7 / 0.32 | SQLite client | `rusqlite` if sqlx async overhead too high; both mature | **R1 Plan picks** based on async needs |
| `hmac` | 0.12 | Auth token HMAC (V23.2-B1 pattern port) | hand-rolled SHA-256 + constant-time compare | OK — RustCrypto org maintained |
| `sha2` | 0.10 | SHA-256 for HMAC | hand-rolled (200 LOC) | OK |
| `subtle` | 2 | Constant-time comparison (panel HIGH-2-mitigation: V23.2-B1 timingSafeEqual forward) | hand-rolled compare loop | OK |
| `reqwest` | 0.12 | HTTP client for Python-facade proxy (R1 reverse-proxy to localhost:8071) | hand-rolled tokio TCP+HTTP/1.1 | OK but heavy; may swap for `hyper` direct |
| `uuid` | 1 | Company/agent ID generation | hand-rolled with rand | OK |

## R2 expected additions (musu-rs::core)

| Crate | Likely version | Purpose | Fallback | Decision gate |
|---|---|---|---|---|
| `sqlx`/`rusqlite` | (same as R1) | Schema management + queries | — | inherited from R1 |
| `chrono` OR `time` | 0.4 / 0.3 | Timestamps for audit_log | `std::time::SystemTime` (loss of formatting niceness) | R2 Plan picks |

## R3 expected additions (musu-rs::control)

**Per panel HIGH-2 mitigation (b)**: R3 Plan MUST demonstrate fallback-to-hand-rolled `tokio` JSON-RPC compile path BEFORE adopting rmcp crate, not as Builder-time pivot.

| Crate | Likely version | Purpose | Fallback (load-bearing) | Decision gate |
|---|---|---|---|---|
| `rmcp` | TBD | MCP server stdio JSON-RPC | **REQUIRED FALLBACK**: hand-rolled `tokio::io::AsyncBufReadExt` + `serde_json` line-delimited JSON-RPC (MCP spec is well-documented, ~300 LOC) | R3 Plan MUST evaluate `rmcp` API stability + maintenance signal. If unstable, hand-roll. |

## R4 expected additions (musu-rs::indexer)

**Per panel HIGH-2 mitigation (b)**: R4 Plan MUST demonstrate FTS5 fallback compile path BEFORE adopting tantivy.

| Crate | Likely version | Purpose | Fallback (load-bearing) | Decision gate |
|---|---|---|---|---|
| `tantivy` | 0.22 | Full-text indexing | **REQUIRED FALLBACK**: SQLite FTS5 via sqlx/rusqlite (already in R2 deps) | R4 Plan picks; FTS5 is the safer default given musu's <100k file scale |
| `notify` | 6 | Filesystem watcher | hand-rolled poll loop (acceptable for 2 company roots) | OK |
| `walkdir` | 2 | Tree traversal | hand-rolled `std::fs::read_dir` recursion | OK |
| `ignore` | 0.4 | .gitignore semantics | hand-rolled glob | OK |

## R5 expected additions (musu-rs::writer)

R0 audit verdict: GREENFIELD (no integration of musu-supervisor/). Per-platform process isolation is its own R5 deep dive.

| Crate | Likely version | Purpose | Fallback | Decision gate |
|---|---|---|---|---|
| `nix` (Linux/macOS) | 0.27 | unshare, setrlimit, cgroups | std::process + manual rlimit | R5 Plan picks platform strategy |
| `windows` (Windows) | 0.58 | Job Objects, AppContainer | std::process + minimal hardening | R5 Plan picks |
| `tokio-stream` | 0.1 | SSE writer | hand-rolled `tokio::sync::broadcast` | OK |

## What's NOT allowed (panel firewall)

Anything matching these patterns is rejected during R1..R6 Plan phase:

- **Cloud SDK crates** (aws-sdk-*, gcp-*, azure-*) — violates [[feedback-self-contained-product]]
- **Telemetry-as-a-service** (sentry, datadog, etc.) — same
- **Proc-macro crates that phone home at build time** — verify each new crate has no `build.rs` network access
- **Crates with `git = "..."` deps** in their Cargo.toml — must be crates.io-published with semver
- **Crates depending on Node.js, Python, or other runtime substrate** — must be pure Rust + libc

## Removal-cost ranking (HIGH-2 fragility minimization)

If any single crate becomes unmaintained or yanked:

- **HIGH cost** (rewrite ≥500 LOC): tokio, axum, serde, serde_json, sqlx (if adopted)
- **MED cost** (rewrite 100-500 LOC): tracing, serde_yaml, hmac+sha2 bundle, sqlx-or-rusqlite, tantivy (if adopted, FTS5 fallback ~200 LOC), rmcp (hand-roll ~300 LOC), nix/windows
- **LOW cost** (rewrite <100 LOC): tower, tower-http, anyhow, thiserror, clap, uuid, chrono/time, subtle, walkdir, ignore, notify, tokio-stream, reqwest

**Pre-commit check at each R-* Builder**: any new dep added during implementation must be classified here OR R-* Critic findings table records the deviation.

## Audit refresh schedule

This doc is re-read at:
- Start of R1 Plan (Phase 1) — verify R1's actual deps match the "R1 expected additions" table
- Start of R3 Plan — apply panel HIGH-2-mitigation (b) rmcp fallback compile gate
- Start of R4 Plan — apply panel HIGH-2-mitigation (b) tantivy → FTS5 fallback gate
- Each Builder commit that touches `Cargo.toml` — diff vs this doc, append new deps with justification
- R10 closure — final dep inventory in wiki/500 closure HTML
