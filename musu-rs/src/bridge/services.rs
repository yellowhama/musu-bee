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
use std::path::Path;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const DEFAULT_LOCAL_BRIDGE_PORT: u16 = 8070;

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
    ///
    /// V28 H3: a record with `pid: None` is ALSO removed. Previously it was
    /// skipped, so a null-pid record (we saw one live) was un-cleanable and
    /// permanently bricked discovery — the cockpit kept dialing a dead dynamic
    /// port with no fallback. A record we can't prove is alive is treated as
    /// stale; the live bridge re-registers itself on boot anyway.
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
                continue;
            }

            // A record with no PID cannot prove ownership of a live service.
            {
                tracing::debug!(
                    name = %rec.name,
                    "removing stale service record (pid missing)"
                );
                let _ = self.deregister(&rec.name);
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

pub fn normalize_loopback_addr(addr: &str) -> String {
    if let Some(port) = addr.strip_prefix("0.0.0.0:") {
        return format!("127.0.0.1:{port}");
    }
    if let Some(port) = addr.strip_prefix("[::]:") {
        return format!("127.0.0.1:{port}");
    }
    if let Some(port) = addr.strip_prefix(":::") {
        return format!("127.0.0.1:{port}");
    }
    addr.to_string()
}

pub fn discover_local_bridge_addr(home: &Path) -> Option<String> {
    let registry = ServiceRegistry::with_dir(home.join("services"));
    registry.discover("bridge").and_then(|record| {
        if matches!(record.transport, Transport::Tcp) {
            Some(normalize_loopback_addr(&record.addr))
        } else {
            None
        }
    })
}

pub fn local_bridge_addr_for_home(home: &Path, fallback_port: u16) -> String {
    discover_local_bridge_addr(home).unwrap_or_else(|| format!("127.0.0.1:{fallback_port}"))
}

pub fn fallback_bridge_port_from_env() -> u16 {
    std::env::var("BRIDGE_PORT")
        .ok()
        .and_then(|port| port.parse::<u16>().ok())
        .unwrap_or(DEFAULT_LOCAL_BRIDGE_PORT)
}

pub fn local_bridge_addr(home: &Path) -> String {
    local_bridge_addr_for_home(home, fallback_bridge_port_from_env())
}

pub fn local_bridge_http_url_for_home(home: &Path, fallback_port: u16) -> String {
    format!("http://{}", local_bridge_addr_for_home(home, fallback_port))
}

pub fn local_bridge_http_url(home: &Path) -> String {
    local_bridge_http_url_for_home(home, fallback_bridge_port_from_env())
}

pub fn resolve_public_bridge_url(home: &Path) -> String {
    if let Ok(url) = std::env::var("MUSU_BRIDGE_PUBLIC_URL") {
        let trimmed = url.trim().trim_end_matches('/').to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    local_bridge_http_url(home)
}

pub fn current_bridge_addr(cfg: &crate::bridge::config::BridgeConfig) -> String {
    let home = cfg
        .nodes_toml_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    let registry = ServiceRegistry::with_dir(home.join("services"));
    if let Some(record) = registry.discover("bridge") {
        if matches!(record.transport, Transport::Tcp) {
            return record.addr;
        }
    }
    format!("{}:{}", cfg.bridge_host, cfg.bridge_port)
}

pub fn advertised_bridge_http_url(cfg: &crate::bridge::config::BridgeConfig) -> String {
    if let Some(url) = cfg.public_url.as_ref().filter(|u| !u.trim().is_empty()) {
        return url.trim_end_matches('/').to_string();
    }

    let addr = current_bridge_addr(cfg);
    let actual_port = addr
        .rsplit_once(':')
        .and_then(|(_, port)| port.parse::<u16>().ok())
        .unwrap_or(cfg.bridge_port);

    let host = if cfg.bridge_host == "0.0.0.0" || cfg.bridge_host == "::" {
        hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    } else {
        cfg.bridge_host.clone()
    };
    let scheme = if cfg.tls_enabled { "https" } else { "http" };
    format!("{scheme}://{}:{}", host, actual_port)
}

// ---------------------------------------------------------------------------
// Home directory helper (mirrors bridge::config::home_dir)
// ---------------------------------------------------------------------------

/// Resolve the musu home directory (`~/.musu`) using the shared install/runtime
/// contract.
fn musu_home() -> PathBuf {
    crate::install::resolve_musu_home_from_env()
        .unwrap_or_else(|_| PathBuf::from(".").join(".musu"))
}

// ---------------------------------------------------------------------------
// PID liveness check
// ---------------------------------------------------------------------------

/// Check whether a process with the given PID is still running.
///
/// On Unix we use `kill(pid, 0)` which succeeds (or returns EPERM) for live
/// processes.  On Windows we attempt `OpenProcess` via `windows-sys`.
#[cfg(unix)]
pub fn is_pid_alive(pid: u32) -> bool {
    // SAFETY: signal 0 is a null signal — no signal is sent, but error
    // checking is still performed, letting us probe for process existence.
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 || *libc::__errno_location() == libc::EPERM }
}

#[cfg(windows)]
pub fn is_pid_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

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
pub fn is_pid_alive(_pid: u32) -> bool {
    // Conservative: assume alive on unknown platforms.
    true
}

#[cfg(unix)]
pub fn terminate_pid(pid: u32) -> bool {
    // SAFETY: SIGTERM asks the target process to exit; errors are surfaced as
    // a false return so callers can fall back without panicking.
    unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) == 0 }
}

#[cfg(windows)]
pub fn terminate_pid(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};

    // SAFETY: OpenProcess returns NULL on failure. Any valid handle is closed
    // before returning.
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if handle.is_null() {
            return false;
        }
        let terminated = TerminateProcess(handle, 1) != 0;
        CloseHandle(handle);
        terminated
    }
}

#[cfg(not(any(unix, windows)))]
pub fn terminate_pid(_pid: u32) -> bool {
    false
}

#[cfg(unix)]
fn process_exe_path(pid: u32) -> Option<PathBuf> {
    std::fs::read_link(format!("/proc/{pid}/exe")).ok()
}

#[cfg(windows)]
fn process_exe_path(pid: u32) -> Option<PathBuf> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let mut buffer = vec![0u16; 32_768];
    let mut len = buffer.len() as u32;
    // SAFETY: OpenProcess returns NULL on failure. QueryFullProcessImageNameW
    // writes at most `len` UTF-16 code units into the allocated buffer.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut len) != 0;
        CloseHandle(handle);
        if !ok || len == 0 {
            return None;
        }
    }

    Some(PathBuf::from(String::from_utf16_lossy(
        &buffer[..len as usize],
    )))
}

#[cfg(not(any(unix, windows)))]
fn process_exe_path(_pid: u32) -> Option<PathBuf> {
    None
}

fn is_musu_runtime_exe_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "musu" | "musu.exe" | "musud" | "musud.exe"
    )
}

fn is_musu_desktop_exe_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "musu-desktop" | "musu-desktop.exe"
    )
}

pub fn is_musu_runtime_pid(pid: u32) -> bool {
    process_exe_path(pid)
        .and_then(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().to_string())
        })
        .is_some_and(|name| is_musu_runtime_exe_name(&name))
}

#[cfg(unix)]
fn process_ids_by_exe_name(predicate: fn(&str) -> bool) -> Vec<u32> {
    let mut pids = Vec::new();
    let entries = match std::fs::read_dir("/proc") {
        Ok(entries) => entries,
        Err(_) => return pids,
    };

    for entry in entries.flatten() {
        let Some(file_name) = entry.file_name().to_str().map(|name| name.to_string()) else {
            continue;
        };
        let Ok(pid) = file_name.parse::<u32>() else {
            continue;
        };
        let Some(exe_name) = process_exe_path(pid).and_then(|path| {
            path.file_name()
                .map(|name| name.to_string_lossy().to_string())
        }) else {
            continue;
        };
        if predicate(&exe_name) {
            pids.push(pid);
        }
    }

    pids.sort_unstable();
    pids.dedup();
    pids
}

#[cfg(windows)]
fn process_ids_by_exe_name(predicate: fn(&str) -> bool) -> Vec<u32> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let mut pids = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return pids;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|ch| *ch == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe_name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                if predicate(&exe_name) {
                    pids.push(entry.th32ProcessID);
                }

                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
    }

    pids.sort_unstable();
    pids.dedup();
    pids
}

#[cfg(not(any(unix, windows)))]
fn process_ids_by_exe_name(_predicate: fn(&str) -> bool) -> Vec<u32> {
    Vec::new()
}

pub fn musu_desktop_pids() -> Vec<u32> {
    process_ids_by_exe_name(is_musu_desktop_exe_name)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{LazyLock, Mutex, MutexGuard};

    static ENV_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    struct EnvRestore {
        values: Vec<(&'static str, Option<std::ffi::OsString>)>,
    }

    impl EnvRestore {
        fn capture(keys: &[&'static str]) -> Self {
            Self {
                values: keys
                    .iter()
                    .map(|key| (*key, std::env::var_os(key)))
                    .collect(),
            }
        }
    }

    impl Drop for EnvRestore {
        fn drop(&mut self) {
            for (key, value) in &self.values {
                if let Some(value) = value {
                    std::env::set_var(key, value);
                } else {
                    std::env::remove_var(key);
                }
            }
        }
    }

    fn lock_env() -> MutexGuard<'static, ()> {
        ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

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
    fn musu_runtime_exe_name_matches_only_runtime_bins() {
        assert!(is_musu_runtime_exe_name("musu"));
        assert!(is_musu_runtime_exe_name("musu.exe"));
        assert!(is_musu_runtime_exe_name("MUSUD.EXE"));
        assert!(!is_musu_runtime_exe_name("musu-desktop.exe"));
        assert!(!is_musu_runtime_exe_name("node.exe"));
    }

    #[test]
    fn musu_desktop_exe_name_matches_only_desktop_shell() {
        assert!(is_musu_desktop_exe_name("musu-desktop"));
        assert!(is_musu_desktop_exe_name("MUSU-DESKTOP.EXE"));
        assert!(!is_musu_desktop_exe_name("musu.exe"));
        assert!(!is_musu_desktop_exe_name("musud.exe"));
        assert!(!is_musu_desktop_exe_name("node.exe"));
    }

    #[test]
    fn register_discover_roundtrip() {
        let (_tmp, reg) = temp_registry();
        let rec = sample_record("facade");

        reg.register(&rec).unwrap();

        let found = reg
            .discover("facade")
            .expect("should find registered service");
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
    fn default_registry_honors_musu_home_override() {
        let _env_lock = lock_env();
        let _env_restore = EnvRestore::capture(&["MUSU_HOME"]);
        let tmp = tempfile::tempdir().expect("tempdir");
        let musu_home = tmp.path().join("custom-musu-home");
        std::env::set_var("MUSU_HOME", &musu_home);

        let reg = ServiceRegistry::new();
        reg.register(&sample_record("bridge")).unwrap();

        assert!(musu_home.join("services").join("bridge.json").exists());
    }

    #[test]
    fn helper_urls_use_registry_port_and_public_url_override() {
        let _env_lock = lock_env();
        let _env_restore = EnvRestore::capture(&["MUSU_HOME"]);
        let tmp = tempfile::tempdir().expect("tempdir");
        let musu_home = tmp.path().join("custom-musu-home");
        std::env::set_var("MUSU_HOME", &musu_home);

        let reg = ServiceRegistry::new();
        reg.register(&ServiceRecord {
            name: "bridge".to_string(),
            addr: "0.0.0.0:43123".to_string(),
            pid: None,
            started_at: 0,
            transport: Transport::Tcp,
        })
        .unwrap();

        let cfg = crate::bridge::config::BridgeConfig {
            bridge_host: "0.0.0.0".to_string(),
            bridge_port: 0,
            python_facade_port: 0,
            public_url: None,
            node_name: "test-node".to_string(),
            db_path: musu_home.join("db").join("musu.db"),
            audit_db_path: musu_home.join("data").join("audit.db"),
            nodes_toml_path: musu_home.join("nodes.toml"),
            token: String::new(),
            peer_token: None,
            localhost_auth_required: false,
            env: crate::bridge::config::AuthMode::Development,
            rate_limit_disabled: true,
            rate_limit_per_min: 0,
            allow_plaintext_lan: false,
            file_serve_roots: vec![],
            file_serve_writable: false,
            tls_enabled: false,
            tls_cert_path: None,
            tls_key_path: None,
        };

        assert_eq!(current_bridge_addr(&cfg), "0.0.0.0:43123");
        assert_eq!(
            discover_local_bridge_addr(&musu_home).as_deref(),
            Some("127.0.0.1:43123")
        );
        assert_eq!(
            local_bridge_http_url_for_home(&musu_home, 8070),
            "http://127.0.0.1:43123"
        );
        assert!(
            advertised_bridge_http_url(&cfg).ends_with(":43123"),
            "advertised URL should use actual runtime port"
        );

        let mut cfg = cfg;
        cfg.tls_enabled = true;
        assert!(
            advertised_bridge_http_url(&cfg).starts_with("https://"),
            "TLS bridge should advertise an HTTPS transport when no public URL override is set"
        );

        cfg.public_url = Some("https://fleet.example.test/".to_string());
        assert_eq!(
            advertised_bridge_http_url(&cfg),
            "https://fleet.example.test"
        );
    }

    #[test]
    fn env_default_helpers_use_bridge_port_and_public_url_override() {
        let _env_lock = lock_env();
        let _env_restore =
            EnvRestore::capture(&["MUSU_HOME", "BRIDGE_PORT", "MUSU_BRIDGE_PUBLIC_URL"]);
        let tmp = tempfile::tempdir().expect("tempdir");
        let musu_home = tmp.path().join("custom-musu-home");
        std::env::set_var("MUSU_HOME", &musu_home);
        std::env::set_var("BRIDGE_PORT", "9999");

        assert_eq!(fallback_bridge_port_from_env(), 9999);
        assert_eq!(local_bridge_addr(&musu_home), "127.0.0.1:9999");
        assert_eq!(local_bridge_http_url(&musu_home), "http://127.0.0.1:9999");

        std::env::set_var("MUSU_BRIDGE_PUBLIC_URL", "https://fleet.example.test/");
        assert_eq!(
            resolve_public_bridge_url(&musu_home),
            "https://fleet.example.test"
        );
    }

    #[test]
    fn local_bridge_helpers_fall_back_when_registry_missing() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let musu_home = tmp.path().join("missing-registry-home");
        assert_eq!(
            local_bridge_addr_for_home(&musu_home, DEFAULT_LOCAL_BRIDGE_PORT),
            "127.0.0.1:8070"
        );
        assert_eq!(
            local_bridge_http_url_for_home(&musu_home, DEFAULT_LOCAL_BRIDGE_PORT),
            "http://127.0.0.1:8070"
        );
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

    /// V28 H3: a null-pid record can't be proven alive, so cleanup removes it
    /// (previously it survived forever and bricked discovery).
    #[test]
    fn cleanup_stale_removes_null_pid() {
        let (_tmp, reg) = temp_registry();
        let mut rec = sample_record("ghost");
        rec.pid = None;
        reg.register(&rec).unwrap();

        reg.cleanup_stale();

        assert!(
            reg.discover("ghost").is_none(),
            "null-pid record should be cleaned up"
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
