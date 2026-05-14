//! Cross-platform sandbox abstraction for agent processes.
//!
//! Each platform crate (`musu-supervisor-isolation-linux`, `-windows`,
//! `-macos`) implements [`Isolation`] over this trait.
//!
//! The supervisor selects an impl at runtime via `Isolation::available()`.

use std::path::PathBuf;
use std::process::{Child, Command};

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Sandbox abstraction. Implementations are stateless; `IsolationProfile`
/// carries everything the spawn needs.
pub trait Isolation: Send + Sync {
    /// Spawn `cmd` inside the sandbox described by `profile`.
    fn spawn(
        &self,
        cmd: &mut Command,
        profile: &IsolationProfile,
    ) -> Result<Child, IsolationError>;

    /// Self-test: does this implementation actually work on this host?
    fn available(&self) -> Result<(), IsolationError>;

    /// Human-readable name for logging.
    fn name(&self) -> &'static str;
}

/// Allowlist-based sandbox profile. Serialized to JSON in the v36
/// `agents.isolation_profile` column.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct IsolationProfile {
    /// Read-only filesystem paths the agent may access.
    /// Everything else is hidden / denied by default.
    #[serde(default)]
    pub allow_read: Vec<PathBuf>,

    /// Read-write paths (project root, %TEMP%, agent's own .musu dir).
    #[serde(default)]
    pub allow_write: Vec<PathBuf>,

    /// Allow outbound TCP to host:port pairs only. Empty = no net.
    #[serde(default)]
    pub allow_net: Vec<NetEndpoint>,

    /// Wall-clock CPU limit (seconds). None = no limit.
    #[serde(default)]
    pub cpu_secs: Option<u32>,

    /// RSS limit (MB). None = no limit.
    #[serde(default)]
    pub mem_mb: Option<u32>,

    /// Strip these env vars before spawn (parent's secrets).
    #[serde(default)]
    pub strip_env: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NetEndpoint {
    pub host: String,
    pub port: u16,
}

/// Why a sandbox spawn failed. Callers distinguish "unsupported on this
/// kernel/OS" from "permission" so they can fall back gracefully.
#[derive(Debug, Error)]
pub enum IsolationError {
    /// Kernel / OS doesn't support the requested isolation primitive
    /// (e.g. user namespaces disabled by sysctl).
    #[error("isolation unsupported on this host: {0}")]
    Unsupported(String),

    /// Permission denied even though the primitive exists.
    #[error("isolation permission denied: {0}")]
    Permission(String),

    /// I/O or syscall failure during setup.
    #[error("isolation setup failed: {context}: {source}")]
    SetupFailed {
        context: String,
        #[source]
        source: std::io::Error,
    },
}

impl IsolationError {
    pub fn setup<S: Into<String>>(context: S, source: std::io::Error) -> Self {
        Self::SetupFailed {
            context: context.into(),
            source,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_serde_roundtrip() {
        let p = IsolationProfile {
            allow_read: vec![PathBuf::from("/usr"), PathBuf::from("/lib")],
            allow_write: vec![PathBuf::from("/tmp/musu-agent")],
            allow_net: vec![NetEndpoint {
                host: "api.musu.pro".into(),
                port: 443,
            }],
            cpu_secs: Some(600),
            mem_mb: Some(2048),
            strip_env: vec!["AWS_SECRET".into(), "GITHUB_TOKEN".into()],
        };
        let j = serde_json::to_string(&p).unwrap();
        let back: IsolationProfile = serde_json::from_str(&j).unwrap();
        assert_eq!(back.allow_read.len(), 2);
        assert_eq!(back.allow_net.len(), 1);
        assert_eq!(back.allow_net[0].port, 443);
        assert_eq!(back.cpu_secs, Some(600));
        assert_eq!(back.strip_env.len(), 2);
    }

    #[test]
    fn profile_defaults_to_empty() {
        let p = IsolationProfile::default();
        assert!(p.allow_read.is_empty());
        assert!(p.allow_write.is_empty());
        assert!(p.allow_net.is_empty());
        assert!(p.cpu_secs.is_none());
        assert!(p.mem_mb.is_none());
        assert!(p.strip_env.is_empty());
    }

    #[test]
    fn empty_json_deserializes_to_default() {
        let p: IsolationProfile = serde_json::from_str("{}").unwrap();
        assert!(p.allow_read.is_empty());
        assert!(p.allow_net.is_empty());
        assert_eq!(p.cpu_secs, None);
    }
}
