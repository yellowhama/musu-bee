//! V24-R4 wiki/494 §3 — workspace profile (`.musu-indexer.json`).
//!
//! Ported from Python `musu-indexer/src/musu_indexer/workspace.py`. We only
//! carry the fields the Rust scanner actually consumes:
//!   * `name`         — logical workspace name (mirrors Python's profile.name)
//!   * `ignore_globs` — additive on top of `.gitignore` (the `ignore` crate
//!     already honors `.gitignore` automatically; this is the extra layer).
//!
//! Plan §4 C3: default ignore globs ported byte-for-byte from
//! `workspace.py:18-47` (DEFAULT_IGNORE_GLOBS — root-level + nested variants +
//! binary archive extensions). Critic flagged drift risk if Builder "improved"
//! them; we keep them literal.

use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// File name expected at the workspace root.
pub const PROFILE_FILE_NAME: &str = ".musu-indexer.json";

/// Ported byte-for-byte from Python `workspace.py:18-47` (DEFAULT_IGNORE_GLOBS).
///
/// Both root-level (`foo/**`) and nested (`**/foo/**`) variants are present
/// for every prune-worthy directory — Python comment: "fnmatch's ** does not
/// cross path separators the way one would expect from gitignore". The
/// `ignore` crate's matcher handles both forms cleanly, so we keep them all
/// to preserve user-provided profile compatibility.
pub const DEFAULT_IGNORE_GLOBS: &[&str] = &[
    // Root-level
    ".git/**",
    "node_modules/**",
    "target/**",
    "dist/**",
    "build/**",
    "work/**",
    "__pycache__/**",
    ".venv/**",
    ".next/**",
    // Nested
    "**/.git/**",
    "**/node_modules/**",
    "**/target/**",
    "**/dist/**",
    "**/build/**",
    "**/__pycache__/**",
    "**/.venv/**",
    "**/.next/**",
    // File-pattern leaves (fnmatch's basename behaviour already handles these)
    ".musu_dev.db",
    ".musu_dev.db-*",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.zip",
    "*.7z",
];

/// Workspace profile on-disk shape. `serde(default)` so older / hand-edited
/// `.musu-indexer.json` files missing one field still load.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_globs")]
    pub ignore_globs: Vec<String>,
}

fn default_globs() -> Vec<String> {
    DEFAULT_IGNORE_GLOBS.iter().map(|s| s.to_string()).collect()
}

impl Profile {
    /// Construct a default profile with the given workspace label.
    pub fn defaults_for(name: &str) -> Self {
        Self {
            name: name.to_string(),
            ignore_globs: default_globs(),
        }
    }

    /// Load profile from `<work_dir>/.musu-indexer.json` if present, else
    /// fall back to defaults. Never errors on a missing file — that's the
    /// expected pre-`init-profile` state.
    pub fn load_or_default(work_dir: &Path, fallback_name: &str) -> Result<Self> {
        let path = work_dir.join(PROFILE_FILE_NAME);
        if !path.exists() {
            return Ok(Self::defaults_for(fallback_name));
        }
        let raw =
            std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let mut p: Profile = serde_json::from_str(&raw)
            .with_context(|| format!("parse profile json at {}", path.display()))?;
        if p.name.trim().is_empty() {
            p.name = fallback_name.to_string();
        }
        if p.ignore_globs.is_empty() {
            p.ignore_globs = default_globs();
        }
        Ok(p)
    }
}

/// `musu indexer init-profile` implementation — write a default profile.
/// Idempotent over content: if the file already exists with the same bytes,
/// rewrite is a no-op; otherwise we overwrite.
pub fn init_profile_in(work_dir: &Path, name: &str) -> Result<()> {
    std::fs::create_dir_all(work_dir).with_context(|| format!("mkdir {}", work_dir.display()))?;
    let profile = Profile::defaults_for(name);
    let body = serde_json::to_string_pretty(&profile).context("serialize profile")?;
    let path = work_dir.join(PROFILE_FILE_NAME);
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn default_globs_count_matches_python() {
        // Python workspace.py:18-47 lists exactly 24 entries: 9 root-level
        // (.git/**, node_modules/**, target/**, dist/**, build/**, work/**,
        // __pycache__/**, .venv/**, .next/**) + 8 nested mirrors (no
        // work/** mirror; Python has only 8 nested forms) + 7 file-pattern
        // leaves (.musu_dev.db, .musu_dev.db-*, *.tar, *.tar.gz, *.tgz,
        // *.zip, *.7z). Total = 24. Lock this so a future "cleanup" can't
        // silently drop one without updating this assertion.
        assert_eq!(DEFAULT_IGNORE_GLOBS.len(), 24);
    }

    #[test]
    fn init_profile_writes_then_loads() {
        let dir = TempDir::new().unwrap();
        init_profile_in(dir.path(), "test-co").unwrap();
        let loaded = Profile::load_or_default(dir.path(), "fallback").unwrap();
        assert_eq!(loaded.name, "test-co");
        assert_eq!(loaded.ignore_globs.len(), 24);
    }

    #[test]
    fn load_or_default_no_file_yields_defaults() {
        let dir = TempDir::new().unwrap();
        let p = Profile::load_or_default(dir.path(), "fallback").unwrap();
        assert_eq!(p.name, "fallback");
        assert_eq!(p.ignore_globs.len(), 24);
    }
}
