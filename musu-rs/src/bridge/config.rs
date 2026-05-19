//! Bridge configuration loaded from environment variables.
//!
//! Port of `musu-bridge/config.py:45-81` with V23.2-B1 + Critic hardening.
//! Reference: wiki/491 §4 + §8.

use std::env;
use std::path::PathBuf;

use anyhow::{anyhow, Result};

/// Production-vs-development gate for boot-time auth checks.
///
/// wiki/491 §4 C-SEC-2: defaults to Production. Only the *exact* lowercase
/// strings "development" or "test" downgrade to Development. Typo, unset,
/// "Production", "PROD" all stay in Production mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMode {
    Production,
    Development,
}

impl AuthMode {
    pub fn as_str(self) -> &'static str {
        match self {
            AuthMode::Production => "production",
            AuthMode::Development => "development",
        }
    }
}

/// Full bridge configuration. Held by axum `State` via `Arc`.
#[derive(Debug, Clone)]
#[allow(dead_code)] // Several fields wired by later R-phases (audit DB, plaintext warn).
pub struct BridgeConfig {
    pub bridge_host: String,
    pub bridge_port: u16,
    pub python_facade_port: u16,
    pub public_url: Option<String>,
    pub node_name: String,
    pub db_path: PathBuf,
    pub audit_db_path: PathBuf,
    pub nodes_toml_path: PathBuf,
    pub token: String,
    pub peer_token: Option<String>,
    /// wiki/491 §4 C-SEC-3 INVERSION: default = true (no localhost bypass).
    /// Set `MUSU_BRIDGE_LOCALHOST_AUTH=0` to enable bypass.
    pub localhost_auth_required: bool,
    pub env: AuthMode,
    pub rate_limit_disabled: bool,
    pub rate_limit_per_min: u32,
    /// wiki/491 §4 C-SEC-8 plaintext-LAN gate.
    pub allow_plaintext_lan: bool,
}

impl BridgeConfig {
    /// Load from env. Performs boot-time validation per wiki/491 §4.
    pub fn from_env() -> Result<Self> {
        let env_mode = env::var("MUSU_ENV").unwrap_or_default();
        let auth_mode = match env_mode.as_str() {
            "development" | "test" => AuthMode::Development,
            // C-SEC-2: default + typo + unset → Production
            _ => AuthMode::Production,
        };

        let token = env::var("MUSU_BRIDGE_TOKEN").unwrap_or_default();

        // C-SEC-1: empty token rejected in production (unconditionally).
        if auth_mode == AuthMode::Production {
            if token.is_empty() {
                return Err(anyhow!(
                    "MUSU_BRIDGE_TOKEN required in production (MUSU_ENV not in {{development, test}})"
                ));
            }
            if token.len() < 32 {
                return Err(anyhow!(
                    "MUSU_BRIDGE_TOKEN must be ≥32 chars (got {})",
                    token.len()
                ));
            }
        }

        let peer_token = env::var("MUSU_TOKEN").ok().filter(|t| !t.is_empty());

        let bridge_host = env::var("BRIDGE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let bridge_port: u16 = env::var("BRIDGE_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8070);
        let python_facade_port: u16 = env::var("MUSU_PYTHON_BRIDGE_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(8071);

        let public_url = env::var("MUSU_BRIDGE_PUBLIC_URL").ok().filter(|s| !s.is_empty());

        let node_name = env::var("MUSU_NODE_NAME")
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                hostname::get()
                    .ok()
                    .and_then(|h| h.into_string().ok())
                    .unwrap_or_else(|| "unknown-node".to_string())
            });

        let home = home_dir();
        let db_path = env::var("MUSU_BRIDGE_DB_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".musu").join("db").join("musu.db"));
        let audit_db_path = env::var("MUSU_BRIDGE_AUDIT_DB")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".musu").join("data").join("audit.db"));
        let nodes_toml_path = env::var("MUSU_NODES_TOML_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".musu").join("nodes.toml"));

        // C-SEC-3 INVERSION: default = true (localhost requires auth).
        // Set MUSU_BRIDGE_LOCALHOST_AUTH=0 to enable bypass.
        let localhost_auth_required = !matches!(
            env::var("MUSU_BRIDGE_LOCALHOST_AUTH").as_deref(),
            Ok("0") | Ok("false") | Ok("no")
        );

        let rate_limit_disabled = match env::var("MUSU_DISABLE_RATE_LIMIT").as_deref() {
            Ok("1") | Ok("true") | Ok("yes") => {
                // wiki/491 §8.5: rejected at boot unless dev/test.
                if auth_mode != AuthMode::Development {
                    return Err(anyhow!(
                        "MUSU_DISABLE_RATE_LIMIT is only honored when MUSU_ENV in {{development, test}}"
                    ));
                }
                true
            }
            _ => false,
        };

        let rate_limit_per_min: u32 = env::var("MUSU_RATE_LIMIT_PER_MIN")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(60);

        let allow_plaintext_lan = matches!(
            env::var("MUSU_ALLOW_PLAINTEXT_LAN").as_deref(),
            Ok("1") | Ok("true") | Ok("yes")
        );

        // C-SEC-8: warn when binding non-loopback without explicit opt-in.
        if bridge_host != "127.0.0.1" && bridge_host != "::1" && !allow_plaintext_lan {
            tracing::warn!(
                bridge_host = %bridge_host,
                "binding non-loopback without MUSU_ALLOW_PLAINTEXT_LAN=1; \
                 bearer token will travel in cleartext over LAN"
            );
        }

        Ok(Self {
            bridge_host,
            bridge_port,
            python_facade_port,
            public_url,
            node_name,
            db_path,
            audit_db_path,
            nodes_toml_path,
            token,
            peer_token,
            localhost_auth_required,
            env: auth_mode,
            rate_limit_disabled,
            rate_limit_per_min,
            allow_plaintext_lan,
        })
    }
}

fn home_dir() -> PathBuf {
    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home);
    }
    if let Ok(userprofile) = env::var("USERPROFILE") {
        return PathBuf::from(userprofile);
    }
    PathBuf::from(".")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Helper: isolate env for each test. Tests must be careful with env vars
    // since they're process-global. We serialize via a mutex.
    use std::sync::Mutex;
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn clear_env() {
        for var in &[
            "MUSU_ENV",
            "MUSU_BRIDGE_TOKEN",
            "MUSU_TOKEN",
            "BRIDGE_HOST",
            "BRIDGE_PORT",
            "MUSU_DISABLE_RATE_LIMIT",
            "MUSU_BRIDGE_LOCALHOST_AUTH",
            "MUSU_ALLOW_PLAINTEXT_LAN",
        ] {
            env::remove_var(var);
        }
    }

    #[test]
    fn boot_rejects_empty_token_in_default_mode() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        // No MUSU_ENV → defaults to Production → requires token.
        let result = BridgeConfig::from_env();
        assert!(result.is_err(), "expected boot reject on empty token in default/prod");
    }

    #[test]
    fn boot_rejects_short_token_in_prod() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_BRIDGE_TOKEN", "shorttoken");
        let result = BridgeConfig::from_env();
        assert!(result.is_err(), "expected boot reject on <32 char token in prod");
    }

    #[test]
    fn boot_accepts_long_token_in_prod() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_BRIDGE_TOKEN", "a".repeat(32));
        let result = BridgeConfig::from_env();
        assert!(result.is_ok(), "expected boot OK on 32 char token in prod");
        assert_eq!(result.unwrap().env, AuthMode::Production);
    }

    #[test]
    fn boot_accepts_empty_token_in_dev() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_ENV", "development");
        let result = BridgeConfig::from_env();
        assert!(result.is_ok(), "expected boot OK in dev with empty token");
        assert_eq!(result.unwrap().env, AuthMode::Development);
    }

    #[test]
    fn boot_typo_production_treated_as_prod() {
        // C-SEC-2: "Production" (capitalized) → defaults to Production.
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_ENV", "Production");
        let result = BridgeConfig::from_env();
        assert!(result.is_err(), "Capitalized 'Production' must NOT downgrade to dev");
    }

    #[test]
    fn boot_typo_dev_treated_as_prod() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_ENV", "dev"); // typo, not "development"
        let result = BridgeConfig::from_env();
        assert!(result.is_err(), "'dev' typo must NOT downgrade to dev");
    }

    #[test]
    fn rate_limit_disable_rejected_in_prod() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_BRIDGE_TOKEN", "a".repeat(32));
        env::set_var("MUSU_DISABLE_RATE_LIMIT", "1");
        let result = BridgeConfig::from_env();
        assert!(result.is_err(), "MUSU_DISABLE_RATE_LIMIT must be rejected in prod");
    }

    #[test]
    fn localhost_auth_required_default_true() {
        // C-SEC-3 inversion: default is REQUIRED.
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_ENV", "development");
        let cfg = BridgeConfig::from_env().unwrap();
        assert!(cfg.localhost_auth_required, "default localhost_auth_required must be true");
    }

    #[test]
    fn localhost_auth_bypass_explicit_opt_in() {
        let _g = ENV_LOCK.lock().unwrap();
        clear_env();
        env::set_var("MUSU_ENV", "development");
        env::set_var("MUSU_BRIDGE_LOCALHOST_AUTH", "0");
        let cfg = BridgeConfig::from_env().unwrap();
        assert!(!cfg.localhost_auth_required, "explicit '0' must enable bypass");
    }
}
