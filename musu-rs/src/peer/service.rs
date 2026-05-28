use crate::peer::capability::Capability;
use std::path::Path;

/// Inputs the per-platform peer registrar needs.
#[allow(dead_code)]
pub struct PeerServiceContext<'a> {
    /// Absolute path to `~/.musu/`.
    pub musu_home: &'a Path,
    /// Sanitized peer name.
    pub peer_name: &'a str,
    /// Worker kind ("ollama" | "comfyui" | "script").
    pub peer_kind: &'a str,
    /// Start command verbatim.
    pub start_cmd: &'a str,
    /// Capability snapshot at registration time.
    pub capability: &'a [Capability],
    /// If Some, unit/plist file directory is overridden (for tests).
    pub unit_dir_override: Option<&'a Path>,
}

/// Thin glue to register the peer service using current platform service.
pub fn register(ctx: &PeerServiceContext) -> anyhow::Result<()> {
    crate::install::platform::current().register_peer(ctx)
}

/// Thin glue to unregister the peer service using current platform service.
#[allow(dead_code)]
pub fn unregister(peer_name: &str) -> anyhow::Result<()> {
    crate::install::platform::current().unregister_peer(peer_name)
}
