//! Token storage — V27 Account-based auto-connection.
//!
//! Stores and loads the `MUSU_TOKEN` from `~/.musu/token`.
//! The file is written with 0600 permissions to protect the credential.

use anyhow::Result;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Loads the account token if it exists.
pub fn load_token(musu_home: &Path) -> Option<String> {
    let token_path = musu_home.join("token");
    std::fs::read_to_string(token_path)
        .ok()
        .map(|s| s.trim().to_string())
}

/// Saves the account token to disk with secure permissions.
pub fn save_token(musu_home: &Path, token: &str) -> Result<()> {
    let token_path = musu_home.join("token");

    // Create ~/.musu if it doesn't exist
    if !musu_home.exists() {
        std::fs::create_dir_all(musu_home)?;
    }

    std::fs::write(&token_path, token)?;

    #[cfg(unix)]
    {
        if let Ok(meta) = std::fs::metadata(&token_path) {
            let mut perms = meta.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(&token_path, perms);
        }
    }

    Ok(())
}

/// Deletes the account token (logout).
pub fn delete_token(musu_home: &Path) -> Result<()> {
    let token_path = musu_home.join("token");
    if token_path.exists() {
        std::fs::remove_file(token_path)?;
    }
    Ok(())
}
