//! Peer registration module.
//!
//! wiki/510 V26-W7: `musu peer register` CLI subcommand helper,
//! local self-node manifest at `~/.musu/node.toml`, capability autodetect,
//! and platform-specific service helper overrides.

pub mod capability;
// V26-W10 wiki/514: cached registry + manual peers + peer resolver.
pub mod discovery;
pub mod manifest;
pub mod tailscale;
pub mod hardware;
// V27-F2: mDNS auto-discovery of musu nodes on the local network.
pub mod mdns;
pub mod service;
pub mod register;
pub mod context_sync;

pub use register::*;
