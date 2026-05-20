//! MCP tool parameter structs + shared T2-deprecation constants.
//!
//! Tool *implementations* live in `control::mod.rs` alongside the
//! `#[tool_router]` macro target so they can share a single
//! `Arc<BridgeClient>` via `&self`. This sub-module just hosts the
//! `#[derive(JsonSchema, Serialize, Deserialize)]` param types and the
//! deprecation suffix/body string constants — keeping `mod.rs` focused on
//! transport + lifecycle, while the per-domain schemas live here so future
//! T1 expansion (companies, tasks, nodes) lands in coherent sub-files
//! without re-jumping into `mod.rs`.

pub mod params;
