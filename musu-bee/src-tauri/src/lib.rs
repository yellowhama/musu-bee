use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            start_runtime,
            open_dashboard
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            spawn_runtime_autostart();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(serde::Serialize)]
struct DesktopStatus {
    version: String,
    musu_home: String,
    bridge_status: String,
    bridge_url: Option<String>,
    bridge_detail: String,
    dashboard_status: String,
    dashboard_url: Option<String>,
    dashboard_detail: String,
    can_start_runtime: bool,
}

#[derive(serde::Serialize)]
struct CommandResult {
    ok: bool,
    message: String,
    output: String,
}

const START_RUNTIME_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);

#[tauri::command]
fn desktop_status() -> DesktopStatus {
    let version = env!("CARGO_PKG_VERSION").to_string();
    let home = musu_home();
    let bridge_registry = bridge_registry_status(&home);
    let dashboard_probe = probe_dashboard();
    let bridge_probe = bridge_registry
        .url
        .as_deref()
        .map(|url| probe_http(url, "/health"))
        .unwrap_or_else(|| ProbeResult {
            ok: false,
            detail: bridge_registry.detail,
        });

    DesktopStatus {
        version,
        musu_home: home.display().to_string(),
        bridge_status: if bridge_probe.ok { "ok" } else { "offline" }.to_string(),
        bridge_url: bridge_registry.url,
        bridge_detail: bridge_probe.detail,
        dashboard_status: if dashboard_probe.ok { "ok" } else { "offline" }.to_string(),
        dashboard_url: dashboard_probe.url,
        dashboard_detail: dashboard_probe.detail,
        can_start_runtime: true,
    }
}

#[tauri::command]
fn start_runtime() -> Result<CommandResult, String> {
    let command = musu_command_path();
    let result = run_command_with_timeout(&command, &["up", "--json"], START_RUNTIME_TIMEOUT)
        .map_err(|err| format!("failed to run {} up --json: {err}", command.display()))?;

    let stdout = result.stdout.trim().to_string();
    let stderr = result.stderr.trim().to_string();
    let combined = if stderr.is_empty() {
        stdout
    } else {
        format!("{stdout}\n{stderr}").trim().to_string()
    };

    Ok(CommandResult {
        ok: result.status_success,
        message: if result.timed_out {
            format!(
                "musu up timed out after {}s",
                START_RUNTIME_TIMEOUT.as_secs()
            )
        } else if result.status_success {
            "musu up completed".to_string()
        } else {
            format!("musu up exited with {}", result.status_detail)
        },
        output: combined,
    })
}

#[tauri::command]
fn open_dashboard(url: String) -> Result<CommandResult, String> {
    if !is_allowed_dashboard_url(&url) {
        return Err("dashboard URL must be local http://127.0.0.1 or http://localhost".to_string());
    }

    open_url(&url)?;
    Ok(CommandResult {
        ok: true,
        message: format!("opening {url}"),
        output: String::new(),
    })
}

struct ProbeResult {
    ok: bool,
    detail: String,
}

struct DashboardProbe {
    ok: bool,
    url: Option<String>,
    detail: String,
}

struct BridgeRegistryStatus {
    url: Option<String>,
    detail: String,
}

fn musu_home() -> std::path::PathBuf {
    if let Some(home) = std::env::var_os("MUSU_HOME") {
        return std::path::PathBuf::from(home);
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        return std::path::PathBuf::from(home).join(".musu");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return std::path::PathBuf::from(home).join(".musu");
    }
    std::path::PathBuf::from(".musu")
}

fn bridge_registry_status(home: &std::path::Path) -> BridgeRegistryStatus {
    bridge_registry_status_with_pid_checker(home, is_pid_alive)
}

fn bridge_registry_status_with_pid_checker(
    home: &std::path::Path,
    is_pid_alive_fn: impl Fn(u32) -> bool,
) -> BridgeRegistryStatus {
    let path = home.join("services").join("bridge.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return BridgeRegistryStatus {
                url: None,
                detail: "bridge registry not found".to_string(),
            };
        }
        Err(err) => {
            return BridgeRegistryStatus {
                url: None,
                detail: format!("bridge registry unreadable: {err}"),
            };
        }
    };

    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(err) => {
            return BridgeRegistryStatus {
                url: None,
                detail: format!("bridge registry parse failed: {err}"),
            };
        }
    };

    let pid = value
        .get("pid")
        .and_then(|value| value.as_u64())
        .and_then(|value| u32::try_from(value).ok());
    if let Some(pid) = pid {
        if !is_pid_alive_fn(pid) {
            let cleanup_detail = match std::fs::remove_file(&path) {
                Ok(()) => format!("stale bridge registry removed: pid {pid} is not running"),
                Err(err) => {
                    format!("stale bridge registry detected: pid {pid} is not running; cleanup failed: {err}")
                }
            };
            return BridgeRegistryStatus {
                url: None,
                detail: cleanup_detail,
            };
        }
    }

    let Some(addr) = value.get("addr").and_then(|value| value.as_str()) else {
        return BridgeRegistryStatus {
            url: None,
            detail: "bridge registry missing addr".to_string(),
        };
    };

    BridgeRegistryStatus {
        url: Some(format!("http://{addr}")),
        detail: if let Some(pid) = pid {
            format!("bridge registry pid {pid} is running")
        } else {
            "bridge registry missing pid".to_string()
        },
    }
}

#[cfg(windows)]
fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let _ = CloseHandle(handle);
        true
    }
}

#[cfg(not(windows))]
fn is_pid_alive(_pid: u32) -> bool {
    true
}

fn probe_dashboard() -> DashboardProbe {
    for base in ["http://127.0.0.1:3000", "http://127.0.0.1:3001"] {
        let result = probe_http(base, "/api/doctor");
        if result.ok {
            return DashboardProbe {
                ok: true,
                url: Some(format!("{base}/app")),
                detail: result.detail,
            };
        }
    }

    DashboardProbe {
        ok: false,
        url: None,
        detail: "optional developer dashboard is not running on 3000 or 3001; MUSU Desktop does not require it".to_string(),
    }
}

fn probe_http(base: &str, path: &str) -> ProbeResult {
    match http_get(base, path) {
        Ok(response) => {
            let status = response.lines().next().unwrap_or_default().to_string();
            ProbeResult {
                ok: status.contains(" 200 "),
                detail: status,
            }
        }
        Err(err) => ProbeResult {
            ok: false,
            detail: err,
        },
    }
}

fn http_get(base: &str, path: &str) -> Result<String, String> {
    let without_scheme = base
        .strip_prefix("http://")
        .ok_or_else(|| format!("unsupported URL scheme in {base}"))?;
    let host_port = without_scheme
        .split('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("missing host in {base}"))?;

    let mut stream = std::net::TcpStream::connect_timeout(
        &host_port
            .parse()
            .map_err(|err| format!("bad address {host_port}: {err}"))?,
        std::time::Duration::from_millis(850),
    )
    .map_err(|err| format!("{host_port} unreachable: {err}"))?;

    let _ = stream.set_read_timeout(Some(std::time::Duration::from_millis(1200)));
    let request = format!("GET {path} HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n");
    std::io::Write::write_all(&mut stream, request.as_bytes())
        .map_err(|err| format!("request write failed: {err}"))?;

    let mut response = String::new();
    std::io::Read::read_to_string(&mut stream, &mut response)
        .map_err(|err| format!("response read failed: {err}"))?;
    Ok(response)
}

fn is_allowed_dashboard_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("http://") else {
        return false;
    };
    let authority_end = rest
        .find(|ch| matches!(ch, '/' | '?' | '#'))
        .unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.contains('@') {
        return false;
    }

    let Some((host, port)) = authority.rsplit_once(':') else {
        return false;
    };
    if host != "127.0.0.1" && host != "localhost" {
        return false;
    }
    if port.is_empty() || !port.chars().all(|ch| ch.is_ascii_digit()) {
        return false;
    }

    port.parse::<u16>().is_ok_and(|value| value > 0)
}

fn spawn_runtime_autostart() {
    let _ = std::thread::Builder::new()
        .name("musu-runtime-autostart".to_string())
        .spawn(|| {
            let home = musu_home();
            if bridge_is_healthy(&home) {
                return;
            }

            let command = musu_command_path();
            match run_command_with_timeout(&command, &["up", "--json"], START_RUNTIME_TIMEOUT) {
                Ok(result) if result.status_success => {
                    eprintln!("MUSU runtime autostart completed.");
                }
                Ok(result) => {
                    eprintln!(
                        "MUSU runtime autostart failed: {}; timed_out={}; stderr={}",
                        result.status_detail,
                        result.timed_out,
                        result.stderr.trim()
                    );
                }
                Err(err) => {
                    eprintln!(
                        "MUSU runtime autostart failed to spawn {}: {err}",
                        command.display()
                    );
                }
            }
        });
}

fn bridge_is_healthy(home: &std::path::Path) -> bool {
    let registry = bridge_registry_status(home);
    registry
        .url
        .as_deref()
        .map(|url| probe_http(url, "/health").ok)
        .unwrap_or(false)
}

fn musu_command_path() -> std::path::PathBuf {
    let runtime_name = musu_runtime_exe_name();
    match std::env::current_exe() {
        Ok(current_exe) => musu_command_path_for_current_exe(&current_exe, |path| path.exists()),
        Err(_) => std::path::PathBuf::from(runtime_name),
    }
}

fn musu_command_path_for_current_exe(
    current_exe: &std::path::Path,
    exists: impl Fn(&std::path::Path) -> bool,
) -> std::path::PathBuf {
    let runtime_name = musu_runtime_exe_name();
    if let Some(parent) = current_exe.parent() {
        let sibling = parent.join(runtime_name);
        if exists(&sibling) {
            return sibling;
        }
    }
    std::path::PathBuf::from(runtime_name)
}

fn musu_runtime_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "musu.exe"
    } else {
        "musu"
    }
}

struct TimedCommandOutput {
    status_success: bool,
    status_detail: String,
    timed_out: bool,
    stdout: String,
    stderr: String,
}

fn run_command_with_timeout(
    command: &std::path::Path,
    args: &[&str],
    timeout: std::time::Duration,
) -> Result<TimedCommandOutput, String> {
    let temp_dir = std::env::temp_dir();
    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let nonce = format!("{}-{}", std::process::id(), now_nanos);
    let stdout_path = temp_dir.join(format!("musu-desktop-{nonce}.stdout.log"));
    let stderr_path = temp_dir.join(format!("musu-desktop-{nonce}.stderr.log"));
    let stdout_file = std::fs::File::create(&stdout_path)
        .map_err(|err| format!("failed to create stdout capture file: {err}"))?;
    let stderr_file = std::fs::File::create(&stderr_path)
        .map_err(|err| format!("failed to create stderr capture file: {err}"))?;

    let mut child = std::process::Command::new(command)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(stdout_file))
        .stderr(std::process::Stdio::from(stderr_file))
        .spawn()
        .map_err(|err| format!("spawn failed: {err}"))?;

    let deadline = std::time::Instant::now() + timeout;
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("failed while waiting for command: {err}"))?
        {
            break status;
        }

        if std::time::Instant::now() >= deadline {
            timed_out = true;
            let _ = child.kill();
            let _ = child.wait();
            break exit_status_after_timeout();
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
    };

    let stdout = read_text_file_lossy(&stdout_path);
    let stderr = read_text_file_lossy(&stderr_path);
    let _ = std::fs::remove_file(&stdout_path);
    let _ = std::fs::remove_file(&stderr_path);

    Ok(TimedCommandOutput {
        status_success: status.success() && !timed_out,
        status_detail: status.to_string(),
        timed_out,
        stdout,
        stderr,
    })
}

fn read_text_file_lossy(path: &std::path::Path) -> String {
    std::fs::read(path)
        .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
        .unwrap_or_default()
}

#[cfg(unix)]
fn exit_status_after_timeout() -> std::process::ExitStatus {
    use std::os::unix::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(1 << 8)
}

#[cfg(windows)]
fn exit_status_after_timeout() -> std::process::ExitStatus {
    use std::os::windows::process::ExitStatusExt;
    std::process::ExitStatus::from_raw(1)
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|err| format!("failed to open dashboard: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("failed to open dashboard: {err}"))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|err| format!("failed to open dashboard: {err}"))?;
        return Ok(());
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bridge_is_healthy, bridge_registry_status_with_pid_checker, is_allowed_dashboard_url,
        musu_command_path_for_current_exe, run_command_with_timeout,
    };

    const TEST_MARKER: &str = "musu-desktop-command-capture-ok";

    #[test]
    fn allows_local_dashboard_urls() {
        assert!(is_allowed_dashboard_url("http://127.0.0.1:3000/app"));
        assert!(is_allowed_dashboard_url("http://localhost:3001"));
    }

    #[test]
    fn rejects_non_local_or_ambiguous_dashboard_urls() {
        assert!(!is_allowed_dashboard_url("https://127.0.0.1:3000/app"));
        assert!(!is_allowed_dashboard_url("http://example.com:3000/app"));
        assert!(!is_allowed_dashboard_url(
            "http://localhost:3000@example.com/app"
        ));
        assert!(!is_allowed_dashboard_url("http://localhost:bad/app"));
        assert!(!is_allowed_dashboard_url("http://localhost:0/app"));
    }

    #[test]
    fn timed_command_captures_stdout_without_output_pipes() {
        let (command, args) = shell_echo_command();
        let result = run_command_with_timeout(&command, &args, std::time::Duration::from_secs(5))
            .expect("command should run");

        assert!(result.status_success, "{:?}", result.status_detail);
        assert!(!result.timed_out);
        assert!(result.stdout.contains(TEST_MARKER), "{:?}", result.stdout);
    }

    #[cfg(windows)]
    fn shell_echo_command() -> (std::path::PathBuf, Vec<&'static str>) {
        (
            std::path::PathBuf::from("cmd"),
            vec!["/C", "echo", TEST_MARKER],
        )
    }

    #[cfg(unix)]
    fn shell_echo_command() -> (std::path::PathBuf, Vec<&'static str>) {
        (
            std::path::PathBuf::from("sh"),
            vec!["-c", "printf '%s\\n' \"$1\"", "sh", TEST_MARKER],
        )
    }

    #[test]
    fn runtime_command_prefers_packaged_sibling() {
        let desktop_exe = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(
                r"C:\Program Files\WindowsApps\Yellowhama.MUSU\musu-desktop.exe",
            )
        } else {
            std::path::PathBuf::from("/opt/musu/musu-desktop")
        };
        let expected_runtime = desktop_exe
            .parent()
            .unwrap()
            .join(if cfg!(target_os = "windows") {
                "musu.exe"
            } else {
                "musu"
            });

        let resolved =
            musu_command_path_for_current_exe(&desktop_exe, |path| path == expected_runtime);

        assert_eq!(resolved, expected_runtime);
    }

    #[test]
    fn runtime_command_falls_back_to_path_name_when_sibling_missing() {
        let desktop_exe = if cfg!(target_os = "windows") {
            std::path::PathBuf::from(r"C:\Temp\musu-desktop.exe")
        } else {
            std::path::PathBuf::from("/tmp/musu-desktop")
        };

        let resolved = musu_command_path_for_current_exe(&desktop_exe, |_| false);

        assert_eq!(
            resolved,
            std::path::PathBuf::from(if cfg!(target_os = "windows") {
                "musu.exe"
            } else {
                "musu"
            })
        );
    }

    #[test]
    fn stale_bridge_registry_is_removed_before_status_probe() {
        let home = make_temp_home("stale-bridge-registry");
        let services = home.join("services");
        std::fs::create_dir_all(&services).unwrap();
        let path = services.join("bridge.json");
        std::fs::write(
            &path,
            r#"{"name":"bridge","addr":"127.0.0.1:6677","pid":32192}"#,
        )
        .unwrap();

        let status = bridge_registry_status_with_pid_checker(&home, |_| false);

        assert!(status.url.is_none());
        assert!(status.detail.contains("stale bridge registry removed"));
        assert!(!bridge_is_healthy(&home));
        assert!(!path.exists());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn live_bridge_registry_returns_loopback_url() {
        let home = make_temp_home("live-bridge-registry");
        let services = home.join("services");
        std::fs::create_dir_all(&services).unwrap();
        std::fs::write(
            services.join("bridge.json"),
            r#"{"name":"bridge","addr":"127.0.0.1:6677","pid":32192}"#,
        )
        .unwrap();

        let status = bridge_registry_status_with_pid_checker(&home, |_| true);

        assert_eq!(status.url.as_deref(), Some("http://127.0.0.1:6677"));
        assert!(status.detail.contains("pid 32192 is running"));
        let _ = std::fs::remove_dir_all(home);
    }

    fn make_temp_home(name: &str) -> std::path::PathBuf {
        let now_nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!(
            "musu-desktop-test-{name}-{}-{now_nanos}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        path
    }
}
