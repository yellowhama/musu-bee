//! Shared `MUSU_BRIDGE_TOKEN` resolver.
//!
//! Per V24-R3 wiki/493 Critic C4 (HIGH): the bridge bearer-token lookup was
//! duplicated in `auto_update.rs::read_ipc_token` and
//! `uninstall.rs::read_ipc_token`. R3's `control::bridge_client` would be the
//! third copy. This module extracts the single canonical resolver:
//!
//!   1. `MUSU_BRIDGE_TOKEN` env var (non-empty), THEN
//!   2. `<musu_home>/bridge.env` parsed line-by-line for `MUSU_BRIDGE_TOKEN=…`
//!
//! Both call sites preserve their previous behavior: skip blanks and `#`
//! comments, allow `export ` prefix, trim ASCII `"` / `'` from the value.
//! `auto_update.rs` and `uninstall.rs` now delegate to `read_bridge_token`;
//! `control::bridge_client` calls it directly.

use anyhow::{anyhow, Context, Result};
use std::path::Path;

/// Resolve the bridge bearer token. Returns `None` if neither source yields a
/// non-empty value. Callers decide whether absence is an error (control needs
/// it; uninstall/auto-update tolerate `None` and let musud reject).
pub fn read_bridge_token(home: &Path) -> Option<String> {
    if let Ok(t) = std::env::var("MUSU_BRIDGE_TOKEN") {
        if !t.is_empty() {
            return Some(t);
        }
    }
    let env_path = home.join("bridge.env");
    let body = std::fs::read_to_string(&env_path).ok()?;
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        if let Some(rest) = line.strip_prefix("MUSU_BRIDGE_TOKEN=") {
            let val = rest.trim_matches(|c| c == '"' || c == '\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Ensure a valid `bridge.env` exists under `home` and return the token.
///
/// Used by packaged startup paths where no prior `musu install` bootstrap may
/// have run yet, but the bridge still needs a production token to boot.
pub fn ensure_bridge_token(home: &Path) -> Result<String> {
    if let Some(token) = read_bridge_token(home) {
        return Ok(token);
    }

    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).map_err(|e| anyhow!("getrandom failed: {e}"))?;
    let token = hex::encode(buf);

    let path = home.join("bridge.env");
    let body = format!(
        "# musu bridge environment — generated automatically.\n\
         # Do NOT commit this file. Do NOT share the token.\n\
         MUSU_BRIDGE_TOKEN={token}\n"
    );
    std::fs::create_dir_all(home).with_context(|| format!("create {}", home.display()))?;
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&path, perms)
            .with_context(|| format!("chmod 600 {}", path.display()))?;
    }

    #[cfg(windows)]
    {
        let user = windows_acl_principal()?;
        let output = std::process::Command::new("icacls")
            .arg(&path)
            .arg("/inheritance:r")
            .arg("/grant:r")
            .arg(format!("{user}:F"))
            .output()
            .context("spawn icacls")?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("icacls failed: {}", err.trim());
        }
    }

    Ok(token)
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
    use std::sync::Mutex;

    /// Process-global lock — `cargo test` runs `#[test]` fns concurrently by
    /// default and `std::env::set_var` / `remove_var` race across tests in
    /// the same binary. Serializing the three env-touching tests here keeps
    /// us safe without pulling in `serial_test` as a new dev-dep.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// `MUSU_BRIDGE_TOKEN` env wins over the file.
    #[test]
    fn env_var_takes_precedence() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::set_var("MUSU_BRIDGE_TOKEN", "env-wins");
        let home = std::env::temp_dir().join("musu-rs-token-test-env");
        std::fs::create_dir_all(&home).ok();
        std::fs::write(home.join("bridge.env"), "MUSU_BRIDGE_TOKEN=file-loses\n").ok();
        let result = read_bridge_token(&home);
        // Reset BEFORE the assertion so even a panic doesn't leak state to
        // the next test (Mutex drop happens regardless via Drop).
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        assert_eq!(result, Some("env-wins".into()));
    }

    #[test]
    fn empty_env_falls_back_to_file() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        let home = std::env::temp_dir().join("musu-rs-token-test-file");
        std::fs::create_dir_all(&home).ok();
        std::fs::write(
            home.join("bridge.env"),
            "# comment\nexport MUSU_BRIDGE_TOKEN=\"quoted-val\"\n",
        )
        .ok();
        assert_eq!(read_bridge_token(&home), Some("quoted-val".into()));
    }

    #[test]
    fn missing_everything_returns_none() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        let home = std::env::temp_dir().join("musu-rs-token-test-missing");
        std::fs::create_dir_all(&home).ok();
        let _ = std::fs::remove_file(home.join("bridge.env"));
        assert_eq!(read_bridge_token(&home), None);
    }

    #[test]
    fn ensure_bridge_token_creates_bridge_env() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        let home = std::env::temp_dir().join("musu-rs-token-test-ensure");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();
        let _ = std::fs::remove_file(home.join("bridge.env"));

        let token = ensure_bridge_token(&home).expect("ensure token");
        assert_eq!(token.len(), 64);
        assert_eq!(read_bridge_token(&home), Some(token));
    }
}
