//! Shared directory management — V27.
//!
//! Manages `~/.musu/shares.toml` for directories exposed to peers.
//! The bridge reads this at startup and merges the listed roots into
//! `file_serve_roots`, so operators never hand-edit env vars.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Top-level schema for `~/.musu/shares.toml`.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SharesConfig {
    #[serde(default)]
    pub shared: Vec<SharedDir>,
}

/// A single directory entry in the shares file.
#[derive(Debug, Serialize, Deserialize)]
pub struct SharedDir {
    pub path: String,
    pub writable: bool,
    pub label: Option<String>,
}

impl SharesConfig {
    /// Load the config from `<musu_home>/shares.toml`, falling back to
    /// an empty config if the file is missing or unparseable.
    pub fn load(musu_home: &Path) -> Self {
        let path = musu_home.join("shares.toml");
        if let Ok(data) = std::fs::read_to_string(&path) {
            toml::from_str(&data).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    /// Persist the config to `<musu_home>/shares.toml`.
    pub fn save(&self, musu_home: &Path) -> anyhow::Result<()> {
        let path = musu_home.join("shares.toml");
        let data = toml::to_string_pretty(self)?;
        std::fs::write(&path, data)?;
        Ok(())
    }

    /// Register a directory. Duplicates (by exact path string) are skipped.
    pub fn add(&mut self, dir_path: &str, writable: bool, label: Option<String>) {
        if !self.shared.iter().any(|s| s.path == dir_path) {
            self.shared.push(SharedDir {
                path: dir_path.to_string(),
                writable,
                label,
            });
        }
    }

    /// Remove a directory by exact path string. Returns `true` if anything
    /// was actually removed.
    pub fn remove(&mut self, dir_path: &str) -> bool {
        let before = self.shared.len();
        self.shared.retain(|s| s.path != dir_path);
        self.shared.len() < before
    }

    /// Collect all shared paths as `PathBuf`s (for merging into bridge config).
    pub fn roots(&self) -> Vec<PathBuf> {
        self.shared.iter().map(|s| PathBuf::from(&s.path)).collect()
    }

    /// Returns `true` if *any* share is writable.
    pub fn any_writable(&self) -> bool {
        self.shared.iter().any(|s| s.writable)
    }
}
