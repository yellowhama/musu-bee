//! musu-rs library surface — wiki/509 V26-W1 Commit 3.
//!
//! The `musu` binary at `src/main.rs` owns the runtime entry point. This
//! `lib.rs` exposes the same module tree as a Rust library so that
//! out-of-bin integration tests under `musu-rs/tests/*.rs` can
//! `use musu_rs::core::companies::AgentRecord` etc. without spinning up
//! the full binary.
//!
//! Modules are declared as `pub` here AND as private `mod` in `main.rs`.
//! Rust permits this: the binary's private tree and the library's public
//! tree are distinct compilation units, both mounting the same source
//! files. There is no double-compilation cost beyond what `cargo` already
//! does for `--bin musu` and `--lib musu_rs`.
//!
//! Surface kept intentionally minimal — only `pub mod` re-exports for now.
//! As future tests need additional modules, add them here.

pub mod adapter;
pub mod bridge;
pub mod control;
pub mod core;
pub mod indexer;
pub mod install;
// V26-W7 wiki/510 (Critic H1): export peer module so integration tests
// (`tests/r7_peer_register.rs`) can `use musu_rs::peer::capability::Capability`
// etc. Same pattern as V26-W1 Commit 3 added `core::companies::AgentRecord`.
pub mod peer;
// V26-W9 wiki/512: workflow DAG spec + LLM DAG builder.
pub mod workflow;
pub mod writer;
pub mod cloud;
