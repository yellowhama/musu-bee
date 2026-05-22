//! Peer registration module.
//!
//! wiki/510 V26-W7: `musu peer register` CLI subcommand helper,
//! local self-node manifest at `~/.musu/node.toml`, capability autodetect,
//! and platform-specific service helper overrides.

pub mod capability;
pub mod manifest;
pub mod service;
pub mod register;

pub use register::*;
