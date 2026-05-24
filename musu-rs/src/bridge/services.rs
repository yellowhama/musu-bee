//! Local service registry for dynamic port allocation and service discovery.
//!
//! Internal musu services (Python facade, musu-worker, musu-port, musu-brainai)
//! register themselves here with dynamically allocated ports.  The Rust bridge
//! discovers them by name, falling back to well-known defaults when no
//! registration file exists.
//!
//! **Storage layout:**
//! ```text
//! ~/.musu/services/
//!   facade.json
//!   worker.json
//!   port.json
//!   brainai.json
//! ```
//!
//! Each JSON file contains a [`ServiceRecord`] serialised via serde.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Transport mechanism a service is listening on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Transport {
    /// TCP socket (e.g. `127.0.0.1:52341`).
    Tcp,
    /// Named pipe (Windows) or Unix domain socket.
    /// e.g. `\\.\pipe\musu-worker` or `/tmp/musu-worker.sock`.
    Pipe,
}

/// A single registered service entry.
///
/// Written to `~/.musu/services/{name}.json` by a starting service process
/// and read back by any consumer that needs to locate it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRecord {
    /// Logical service name, e.g. `"facade"`, `"worker"`, `"port"`, `"brainai"`.
    pub name: String,
    /// Listen address.  For TCP this is `host:port`; for Pipe it is the pipe
    /// path.
    pub addr: String,
    /// OS process ID of the service, used by [`ServiceRegistry::cleanup_stale`]
    /// to garbage-collect dead entries.
    pub pid: Option<u32>,
    /// Unix timestamp (seconds since epoch) when the service started.
    pub started_at: i64,
    /// Transport type.
    pub transport: Transport,
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/// In-memory façade over the `~/.musu/services/` directory.
///
/// All methods are synchronous (file I/O) because the registry is used at
/// boot and during infrequent discovery lookups — not on the hot request path.
pub struct ServiceRegistry {
    /// Root directory for service JSON files.
    dir: PathBuf,
}

impl ServiceRegistry {
    /// Create a registry backed by the default `~/.musu/services/` directory.
    pub fn new() -> Self {
        Self {
            dir: musu_home().join("services"),
        }
    }

    /// Create a registry rooted at an arbitrary directory (useful for tests).
    pub fn with_dir(dir: PathBuf) -> Self {
        Self { dir }
    }

    // -- mutations -----------------------------------------------------------

    /// Register a service by writing its record to
    /// `{dir}/{record.name}.json`.
    ///
    /// Creates the services directory if it does not yet exist.
    pub fn register(&self, record: &ServiceRecord) -> std::io::Result<()> {
        fs::create_dir_all(&self.dir)?;

        let path = self.path_for(&record.name);
        let json = serde_json::to_string_pretty(record)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        fs::write(&path, json)?;

        tracing::debug!(
            name = %record.name,
            addr = %record.addr,
            path = %path.display(),
            "service registered"
        );

        Ok(())
    }

    /// Remove a service registration file.
    pub fn deregister(&self, name: &str) -> std::io::Result<()> {
        let path = self.path_for(name);
        match fs::remove_file(&path) {
            Ok(()) => {
                tracing::debug!(name = %name, "service deregistered");
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                tracing::debug!(name = %name, "deregister: file already absent");
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    // -- queries -------------------------------------------------------------

    /// Discover a service by name.
    ///
    /// Returns `None` when no registration file exists or it fails to parse.
    pub fn discover(&self, name: &str) -> Option<ServiceRecord> {
        let path = self.path_for(name);
        let data = match fs::read_to_string(&path) {
            Ok(d) => d,
            Err(e) => {
                tracing::debug!(name = %name, error = %e, "service not found on disk");
                return None;
            }
        };
        match serde_json::from_str::<ServiceRecord>(&data) {
            Ok(rec) => Some(rec),
            Err(e) => {
                tracing::debug!(name = %name, error = %e, "corrupt service record");
                None
            }
        }
    }

    /// Discover a service or fall back to `127.0.0.1:{default_port}`.
    ///
    /// This is the primary lookup used at boot: try the registry first, and
    /// if the service hasn't self-registered yet, assume it's on its well-known
    /// port.
    pub fn discover_or_default(&self, name: &str, default_port: u16) -> String {
        self.discover(name)
            .map(|r| r.addr)
            .unwrap_or_else(|| format!("127.0.0.1:{}", default_port))
    }

    /// List every currently registered service.
    pub fn list(&self) -> Vec<ServiceRecord> {
        let entries = match fs::read_dir(&self.dir) {
            Ok(rd) => rd,
            Err(_) => return Vec::new(),
        };

        let mut out = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(rec) = serde_json::from_str::<ServiceRecord>(&data) {
                    out.push(rec);
                }
            }
        }
        out
    }

    // -- maintenance ---------------------------------------------------------

    /// Remove registration files whose PID is no longer alive.
    ///
    /// Services that crash without cleaning up leave stale JSON behind.
    /// Call this at bridge boot or on a periodic timer.
    pub fn cleanup_stale(&self) {
        for rec in self.list() {
            if let Some(pid) = rec.pid {
                if !is_pid_alive(pid) {
                    tracing::debug!(
                        name = %rec.name,
                        pid = pid,
                        "removing stale service record (pid dead)"
                    );
                    let _ = self.deregister(&rec.name);
                }
            }
        }
    }

    // -- helpers -------------------------------------------------------------

    /// File path for a given service name.
    fn path_for(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{}.json", name))
    }
}

impl Default for ServiceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Home directory helper (mirrors bridge::config::home_dir)
// ---------------------------------------------------------------------------

/// Resolve the musu home directory (`~/.musu`).
///
/// Uses `HOME` (Unix) → `USERPROFILE` (Windows) → `"."` fallback, matching
/// the convention in [`crate::bridge::config`].
fn musu_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".musu")
}

// ---------------------------------------------------------------------------
// PID liveness check
// ---------------------------------------------------------------------------

/// Check whether a process with the given PID is still running.
///
/// On Unix we use `kill(pid, 0)` which succeeds (or returns EPERM) for live
/// processes.  On Windows we attempt `OpenProcess` via `windows-sys`.
#[cfg(unix)]
fn is_pid_alive(pid: u32) -> bool {
    // SAFETY: signal 0 is a null signal — no signal is sent, but error
    // checking is still performed, letting us probe for process existence.
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 || *libc::__errno_location() == libc::EPERM }
}

#[cfg(windows)]
fn is_pid_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    // SAFETY: OpenProcess returns NULL on failure (invalid PID / access
    // denied with no handle leak).  We close any valid handle immediately.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        CloseHandle(handle);
        true
    }
}

#[cfg(not(any(unix, windows)))]
fn is_pid_alive(_pid: u32) -> bool {
    // Conservative: assume alive on unknown platforms.
    true
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a temporary registry directory and return a registry
    /// pointed at it.
    fn temp_registry() -> (tempfile::TempDir, ServiceRegistry) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let reg = ServiceRegistry::with_dir(tmp.path().join("services"));
        (tmp, reg)
    }

    fn sample_record(name: &str) -> ServiceRecord {
        ServiceRecord {
            name: name.to_string(),
            addr: "127.0.0.1:9999".to_string(),
            pid: Some(std::process::id()),
            started_at: 1700000000,
            transport: Transport::Tcp,
        }
    }

    #[test]
    fn register_discover_roundtrip() {
        let (_tmp, reg) = temp_registry();
        let rec = sample_record("facade");

        reg.register(&rec).unwrap();

        let found = reg.discover("facade").expect("should find registered service");
        assert_eq!(found.name, "facade");
        assert_eq!(found.addr, "127.0.0.1:9999");
        assert_eq!(found.pid, Some(std::process::id()));
        assert_eq!(found.transport, Transport::Tcp);
    }

    #[test]
    fn discover_missing_returns_none() {
        let (_tmp, reg) = temp_registry();
        assert!(reg.discover("nonexistent").is_none());
    }

    #[test]
    fn discover_or_default_fallback() {
        let (_tmp, reg) = temp_registry();

        // No registration → falls back to default port.
        let addr = reg.discover_or_default("worker", 8071);
        assert_eq!(addr, "127.0.0.1:8071");

        // With registration → returns registered addr.
        let rec = sample_record("worker");
        reg.register(&rec).unwrap();
        let addr = reg.discover_or_default("worker", 8071);
        assert_eq!(addr, "127.0.0.1:9999");
    }

    #[test]
    fn deregister_removes_file() {
        let (_tmp, reg) = temp_registry();
        let rec = sample_record("brainai");

        reg.register(&rec).unwrap();
        assert!(reg.discover("brainai").is_some());

        reg.deregister("brainai").unwrap();
        assert!(reg.discover("brainai").is_none());
    }

    #[test]
    fn deregister_absent_is_ok() {
        let (_tmp, reg) = temp_registry();
        // Should not error when the file doesn't exist.
        reg.deregister("ghost").unwrap();
    }

    #[test]
    fn list_returns_all() {
        let (_tmp, reg) = temp_registry();

        reg.register(&sample_record("facade")).unwrap();
        reg.register(&sample_record("worker")).unwrap();

        let all = reg.list();
        assert_eq!(all.len(), 2);

        let names: Vec<&str> = all.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"facade"));
        assert!(names.contains(&"worker"));
    }

    #[test]
    fn list_empty_dir() {
        let (_tmp, reg) = temp_registry();
        assert!(reg.list().is_empty());
    }

    #[test]
    fn cleanup_stale_removes_dead_pids() {
        let (_tmp, reg) = temp_registry();

        // PID 0 is never a user process — it will read as dead on most OSes.
        // (On Linux pid 0 is the idle task, on Windows OpenProcess(0) fails.)
        // Use a very high PID that almost certainly doesn't exist.
        let mut rec = sample_record("zombie");
        rec.pid = Some(4_000_000_000);
        reg.register(&rec).unwrap();

        reg.cleanup_stale();

        assert!(
            reg.discover("zombie").is_none(),
            "stale record should have been removed"
        );
    }

    #[test]
    fn cleanup_stale_keeps_alive_pids() {
        let (_tmp, reg) = temp_registry();

        // Our own PID is definitely alive.
        let rec = sample_record("self");
        reg.register(&rec).unwrap();

        reg.cleanup_stale();

        assert!(
            reg.discover("self").is_some(),
            "live record should survive cleanup"
        );
    }

    #[test]
    fn transport_serde_roundtrip() {
        let rec = ServiceRecord {
            name: "pipe-svc".to_string(),
            addr: r"\\.\pipe\musu-worker".to_string(),
            pid: None,
            started_at: 1700000000,
            transport: Transport::Pipe,
        };
        let json = serde_json::to_string(&rec).unwrap();
        assert!(json.contains(r#""transport":"pipe""#));

        let back: ServiceRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(back.transport, Transport::Pipe);
    }
}
