//! Token storage — V27 Account-based auto-connection.
//!
//! Stores and loads the `MUSU_TOKEN` from `~/.musu/token`.
//! The file is written with 0600 permissions to protect the credential.

use anyhow::{bail, Context, Result};
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Loads the account token if it exists.
pub fn load_token(musu_home: &Path) -> Option<String> {
    for name in [
        "MUSU_P2P_CONTROL_TOKEN",
        "MUSU_ROUTE_EVIDENCE_TOKEN",
        "MUSU_TOKEN",
    ] {
        if let Ok(token) = std::env::var(name) {
            let token = token.trim().to_string();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }
    
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

    #[cfg(windows)]
    restrict_acl_to_current_user(&token_path)?;

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

#[cfg(windows)]
fn restrict_acl_to_current_user(path: &Path) -> Result<()> {
    let user = windows_acl_principal()?;
    let output = std::process::Command::new("icacls")
        .arg(path)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{user}:F"))
        .output()
        .context("spawn icacls")?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        bail!("icacls failed: {}", err.trim());
    }

    Ok(())
}

#[cfg(windows)]
fn windows_acl_principal() -> Result<String> {
    let user = std::env::var("USERNAME").context("USERNAME env var")?;
    let domain = std::env::var("USERDOMAIN").unwrap_or_default();
    if domain.is_empty() || user.contains('\\') || domain.eq_ignore_ascii_case(&user) {
        Ok(user)
    } else {
        Ok(format!("{domain}\\{user}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn save_load_delete_token_round_trips() {
        let tmp = TempDir::new().expect("tempdir");
        let home = tmp.path().join(".musu");

        save_token(&home, "account-token").expect("save token");
        assert_eq!(load_token(&home), Some("account-token".to_string()));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(home.join("token"))
                .expect("token metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }

        delete_token(&home).expect("delete token");
        assert_eq!(load_token(&home), None);
    }
}
