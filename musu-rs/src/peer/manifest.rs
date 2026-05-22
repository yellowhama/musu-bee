use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use crate::peer::capability::Capability;
use fs2::FileExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeManifest {
    pub name: String,
    pub kind: String,                            // PeerType serialized as lowercase
    pub start: String,
    pub registered_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub musu_pro_node_id: Option<String>,
    #[serde(default)]
    pub capability: Vec<Capability>,
    pub service: ServiceState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServiceState {
    /// "systemd" | "launchd" | "scheduled_task" | "none"
    pub platform: String,
    pub unit_name: String,
    /// "registered" | "running" | "not_installed" | "dry_run"
    pub state: String,
    pub registered_at: i64,
}

const MANIFEST_FILENAME: &str = "node.toml";

pub fn manifest_path(musu_home: &Path) -> PathBuf {
    musu_home.join(MANIFEST_FILENAME)
}

#[allow(dead_code)]
pub fn read(musu_home: &Path) -> anyhow::Result<Option<NodeManifest>> {
    let path = manifest_path(musu_home);
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path)?;
    let m: NodeManifest = toml::from_str(&text)?;
    Ok(Some(m))
}

pub fn write(musu_home: &Path, m: &NodeManifest) -> anyhow::Result<()> {
    let path = manifest_path(musu_home);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(m)?;
    
    // Atomic write: write to temp file then rename
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Advisory file lock for peer operations.
pub struct PeerLock {
    file: std::fs::File,
}

impl PeerLock {
    pub fn acquire(musu_home: &Path) -> anyhow::Result<Self> {
        if !musu_home.exists() {
            std::fs::create_dir_all(musu_home)?;
        }
        let lock_path = musu_home.join("peer.lock");
        let file = std::fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&lock_path)?;

        if file.try_lock_exclusive().is_err() {
            anyhow::bail!("another peer registration is currently running (could not acquire peer.lock)");
        }

        Ok(Self { file })
    }
}

impl Drop for PeerLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}
