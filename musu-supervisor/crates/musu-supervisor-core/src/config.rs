use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

/// Errors produced when loading or validating musu.toml.
#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("could not read config file '{path}': {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to parse musu.toml: {0}")]
    Parse(#[from] toml::de::Error),

    #[error("invalid port for service '{service}': port {port} is out of the valid range 1-65535")]
    InvalidPort { service: String, port: u32 },

    #[error(
        "port conflict: services '{a}' and '{b}' both bind port {port}"
    )]
    PortConflict { a: String, b: String, port: u16 },
}

/// Restart policy for a supervised service.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum RestartPolicy {
    /// Always restart the service regardless of exit code.
    Always,
    /// Restart only when the process exits with a non-zero code.  This is the default.
    #[default]
    OnFailure,
    /// Never restart the service.
    Never,
}

/// Health check configuration for a service.
///
/// Exactly one of `http` or `tcp` must be set.
///
/// ```toml
/// [services.core.health]
/// http              = "http://127.0.0.1:8420/health"
/// interval_secs     = 10
/// failure_threshold = 3
/// max_restarts      = 5
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HealthConfig {
    /// HTTP endpoint to GET.  Response must be 2xx.
    pub http: Option<String>,

    /// TCP address (`host:port`) to connect to.
    pub tcp: Option<String>,

    /// Seconds between health probes.  Defaults to 10.
    #[serde(default = "default_health_interval")]
    pub interval_secs: u64,

    /// Consecutive failures before triggering a restart.  Defaults to 3.
    #[serde(default = "default_failure_threshold")]
    pub failure_threshold: u32,

    /// Maximum number of supervisor-initiated restarts (0 = unlimited).
    #[serde(default)]
    pub max_restarts: u32,
}

fn default_health_interval() -> u64 {
    10
}

fn default_failure_threshold() -> u32 {
    3
}

/// Per-service configuration block.
///
/// Each key under `[services]` maps to one of these.
///
/// ```toml
/// [services.core]
/// enabled    = true
/// command    = "musu-core"
/// args       = ["--port", "8420"]
/// restart    = "on-failure"
/// depends_on = ["db"]
///
/// [services.core.health]
/// http              = "http://127.0.0.1:8420/health"
/// failure_threshold = 3
/// max_restarts      = 5
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServiceConfig {
    /// Whether the service should be started.  Defaults to `true`.
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// The executable to launch.  Defaults to the service key name.
    pub command: Option<String>,

    /// Extra CLI arguments passed to the executable.
    #[serde(default)]
    pub args: Vec<String>,

    /// Restart policy for this service.  Defaults to `on-failure`.
    #[serde(default)]
    pub restart: RestartPolicy,

    /// Services that must be started before this one.
    /// Used to determine graceful-shutdown order (dependents stop first).
    #[serde(default)]
    pub depends_on: Vec<String>,

    /// Optional health check.  When present, the supervisor polls the
    /// endpoint and restarts the service when the failure threshold is hit.
    pub health: Option<HealthConfig>,
}

fn default_true() -> bool {
    true
}

fn default_grace_period() -> u32 {
    30
}

/// Root musu.toml configuration.
///
/// ```toml
/// [services]
/// core    = { enabled = true }
/// chat    = { enabled = true }
/// llm     = { enabled = false, command = "ollama", args = ["serve"] }
/// mesh    = { enabled = false }
/// paperclip = { enabled = false }
///
/// [ports]
/// core = 8420
/// chat = 8421
/// llm  = 11434
///
/// [env]
/// LOG_LEVEL = "info"
/// DATA_DIR  = "~/.musu"
///
/// grace_period_secs = 30
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MusuConfig {
    /// Named service definitions.
    #[serde(default)]
    pub services: HashMap<String, ServiceConfig>,

    /// Port assignments keyed by service name.
    #[serde(default)]
    pub ports: HashMap<String, u16>,

    /// Additional environment variables injected into every child process.
    #[serde(default)]
    pub env: HashMap<String, String>,

    /// Seconds to wait for a service to exit after SIGTERM before sending SIGKILL.
    /// Defaults to 30.
    #[serde(default = "default_grace_period")]
    pub grace_period_secs: u32,
}

impl Default for MusuConfig {
    fn default() -> Self {
        Self {
            services: Default::default(),
            ports: Default::default(),
            env: Default::default(),
            grace_period_secs: default_grace_period(),
        }
    }
}

impl MusuConfig {
    /// Parse a `musu.toml` from a raw TOML string.
    pub fn from_str(content: &str) -> Result<Self, ConfigError> {
        let cfg: MusuConfig = toml::from_str(content)?;
        cfg.validate()?;
        Ok(cfg)
    }

    /// Load and parse a `musu.toml` from the filesystem.
    pub fn load(path: impl AsRef<Path>) -> Result<Self, ConfigError> {
        let path = path.as_ref();
        let content = std::fs::read_to_string(path).map_err(|e| ConfigError::Io {
            path: path.display().to_string(),
            source: e,
        })?;
        Self::from_str(&content)
    }

    /// Load from the default location (`~/.musu/musu.toml`).
    ///
    /// Returns `Ok(MusuConfig::default())` if the file does not exist.
    pub fn load_default() -> Result<Self, ConfigError> {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        let path = Path::new(&home).join(".musu").join("musu.toml");
        if !path.exists() {
            return Ok(Self::default());
        }
        Self::load(&path)
    }

    /// Validate the parsed configuration.
    fn validate(&self) -> Result<(), ConfigError> {
        // Check that every explicitly listed port is valid (redundant at the
        // type level since u16 can't exceed 65535, but we guard port 0).
        for (service, &port) in &self.ports {
            if port == 0 {
                return Err(ConfigError::InvalidPort {
                    service: service.clone(),
                    port: 0,
                });
            }
        }

        // Detect port collisions between different services.
        let mut seen: HashMap<u16, String> = HashMap::new();
        for (service, &port) in &self.ports {
            if let Some(other) = seen.get(&port) {
                return Err(ConfigError::PortConflict {
                    a: other.clone(),
                    b: service.clone(),
                    port,
                });
            }
            seen.insert(port, service.clone());
        }

        Ok(())
    }

    /// Returns the effective command for a service.
    ///
    /// Falls back to the service key name when `command` is not set.
    pub fn service_command<'a>(&'a self, name: &'a str) -> Option<&'a str> {
        self.services.get(name).map(|s| {
            s.command.as_deref().unwrap_or(name)
        })
    }

    /// Returns the default musu state directory (`~/.musu`).
    pub fn musu_dir() -> std::path::PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".to_string());
        std::path::Path::new(&home).join(".musu")
    }

    /// Path to the IPC Unix socket (`~/.musu/musu.sock`).
    pub fn default_socket_path() -> std::path::PathBuf {
        Self::musu_dir().join("musu.sock")
    }

    /// Directory where per-service log files are written (`~/.musu/logs/`).
    pub fn default_log_dir() -> std::path::PathBuf {
        Self::musu_dir().join("logs")
    }

    /// Path to the PID file (`~/.musu/musud.pid`).
    pub fn default_pid_path() -> std::path::PathBuf {
        Self::musu_dir().join("musud.pid")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── happy paths ──────────────────────────────────────────────────────────

    #[test]
    fn empty_config_parses() {
        let cfg = MusuConfig::from_str("").unwrap();
        assert!(cfg.services.is_empty());
        assert!(cfg.ports.is_empty());
        assert!(cfg.env.is_empty());
    }

    #[test]
    fn full_config_parses() {
        let toml = r#"
[services]
core     = { enabled = true }
chat     = { enabled = true }
llm      = { enabled = false, command = "ollama", args = ["serve"] }
mesh     = { enabled = false }
paperclip = { enabled = false }

[ports]
core = 8420
chat = 8421
llm  = 11434

[env]
LOG_LEVEL = "info"
DATA_DIR  = "~/.musu"
"#;
        let cfg = MusuConfig::from_str(toml).unwrap();

        assert_eq!(cfg.services.len(), 5);
        assert!(cfg.services["core"].enabled);
        assert!(!cfg.services["llm"].enabled);
        assert_eq!(
            cfg.services["llm"].command.as_deref(),
            Some("ollama")
        );
        assert_eq!(cfg.services["llm"].args, vec!["serve"]);

        assert_eq!(cfg.ports["core"], 8420);
        assert_eq!(cfg.ports["chat"], 8421);
        assert_eq!(cfg.ports["llm"], 11434);

        assert_eq!(cfg.env["LOG_LEVEL"], "info");
        assert_eq!(cfg.env["DATA_DIR"], "~/.musu");
    }

    #[test]
    fn service_enabled_defaults_to_true() {
        let toml = r#"
[services]
core = {}
"#;
        let cfg = MusuConfig::from_str(toml).unwrap();
        assert!(cfg.services["core"].enabled);
    }

    #[test]
    fn service_command_falls_back_to_key() {
        let toml = r#"
[services]
core = {}
llm  = { command = "ollama" }
"#;
        let cfg = MusuConfig::from_str(toml).unwrap();
        assert_eq!(cfg.service_command("core"), Some("core"));
        assert_eq!(cfg.service_command("llm"), Some("ollama"));
        assert_eq!(cfg.service_command("nonexistent"), None);
    }

    #[test]
    fn args_defaults_to_empty() {
        let toml = r#"
[services]
core = { enabled = true }
"#;
        let cfg = MusuConfig::from_str(toml).unwrap();
        assert!(cfg.services["core"].args.is_empty());
    }

    #[test]
    fn load_default_returns_empty_when_file_missing() {
        // Force HOME to a temp dir that definitely has no musu.toml.
        let dir = std::env::temp_dir().join(format!("musu-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::env::set_var("HOME", &dir);
        let cfg = MusuConfig::load_default().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(cfg, MusuConfig::default());
    }

    #[test]
    fn load_from_file_roundtrip() {
        let toml = r#"
[services]
core = { enabled = true }

[ports]
core = 8420

[env]
LOG_LEVEL = "debug"
"#;
        let dir = std::env::temp_dir().join(format!("musu-test-roundtrip-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("musu.toml");
        std::fs::write(&file, toml).unwrap();

        let cfg = MusuConfig::load(&file).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(cfg.ports["core"], 8420);
        assert_eq!(cfg.env["LOG_LEVEL"], "debug");
    }

    // ── error paths ──────────────────────────────────────────────────────────

    #[test]
    fn invalid_toml_returns_parse_error() {
        let err = MusuConfig::from_str("[[[ not valid toml").unwrap_err();
        assert!(
            matches!(err, ConfigError::Parse(_)),
            "expected Parse error, got {err}"
        );
    }

    #[test]
    fn wrong_type_returns_parse_error() {
        // ports must be integers, not strings
        let toml = r#"
[ports]
core = "not-a-number"
"#;
        let err = MusuConfig::from_str(toml).unwrap_err();
        assert!(
            matches!(err, ConfigError::Parse(_)),
            "expected Parse error, got {err}"
        );
    }

    #[test]
    fn port_zero_returns_invalid_port_error() {
        let toml = r#"
[ports]
core = 0
"#;
        // Port 0 is rejected because toml parses it as i64 first; we keep the
        // type as u16 so 0 is within range — but we explicitly forbid it.
        let err = MusuConfig::from_str(toml).unwrap_err();
        assert!(
            matches!(err, ConfigError::InvalidPort { .. }),
            "expected InvalidPort error, got {err}"
        );
    }

    #[test]
    fn duplicate_port_returns_conflict_error() {
        let toml = r#"
[ports]
core = 8420
chat = 8420
"#;
        let err = MusuConfig::from_str(toml).unwrap_err();
        assert!(
            matches!(err, ConfigError::PortConflict { port: 8420, .. }),
            "expected PortConflict(8420), got {err}"
        );
    }

    #[test]
    fn missing_file_returns_io_error() {
        let err = MusuConfig::load("/nonexistent/path/musu.toml").unwrap_err();
        assert!(
            matches!(err, ConfigError::Io { .. }),
            "expected Io error, got {err}"
        );
    }

    #[test]
    fn error_messages_are_human_readable() {
        // IO error contains the path
        let io_err = MusuConfig::load("/no/such/file.toml").unwrap_err();
        assert!(io_err.to_string().contains("/no/such/file.toml"));

        // Parse error is not empty
        let parse_err = MusuConfig::from_str("bad = [[[").unwrap_err();
        assert!(!parse_err.to_string().is_empty());

        // Conflict error names both services and the port
        let conflict_toml = "[ports]\na = 9000\nb = 9000\n";
        let conflict_err = MusuConfig::from_str(conflict_toml).unwrap_err();
        let msg = conflict_err.to_string();
        assert!(msg.contains("9000"), "message should mention port: {msg}");
    }
}
