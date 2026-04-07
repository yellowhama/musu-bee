use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

use crate::discovery::{dedupe_listener_snapshot, parse_local_addr_port, ListenerEndpoint};
use crate::platform::{resolve_wsl_interop_launcher, RuntimeContext, RuntimeKind};

#[derive(Debug, Clone)]
struct WindowsProcessMetadata {
    name: String,
    user: Option<String>,
}

pub(crate) fn collect_listener_snapshot_windows(
    runtime_context: &RuntimeContext,
) -> Result<Vec<ListenerEndpoint>, String> {
    let mut out = Vec::new();
    let process_cache = collect_windows_process_metadata(runtime_context);
    let specs: [(&str, &[&str]); 2] = [
        ("tcp", &["-ano", "-p", "TCP"]),
        ("udp", &["-ano", "-p", "UDP"]),
    ];

    for (protocol, args) in specs {
        let output = match run_windows_system_command(runtime_context, "netstat.exe", args) {
            Ok(value) => value,
            Err(err) => {
                tracing::warn!(
                    error = %err,
                    protocol = %protocol,
                    "failed to execute windows netstat; discovery for protocol skipped"
                );
                continue;
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!(
                status = ?output.status.code(),
                stderr = %stderr,
                protocol = %protocol,
                "windows netstat command failed; discovery for protocol skipped"
            );
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Some(parsed) =
                parse_netstat_listener_line(line, protocol, &process_cache)
            {
                out.push(parsed);
            }
        }
    }

    Ok(dedupe_listener_snapshot(out))
}

fn parse_netstat_listener_line(
    line: &str,
    protocol: &str,
    process_cache: &HashMap<u32, WindowsProcessMetadata>,
) -> Option<ListenerEndpoint> {
    let cols = line.split_whitespace().collect::<Vec<_>>();
    if cols.len() < 4 {
        return None;
    }

    let line_protocol = cols.first()?.to_ascii_lowercase();
    if !line_protocol.eq_ignore_ascii_case(protocol) {
        return None;
    }

    let local = cols.get(1)?;
    let (listen_addr, port) = parse_local_addr_port(local)?;

    let (pid, metadata) = if protocol.eq_ignore_ascii_case("tcp") {
        let state = cols.get(3)?;
        if !state.eq_ignore_ascii_case("LISTENING") {
            return None;
        }
        let pid = cols.get(4)?.parse::<u32>().ok()?;
        (
            Some(pid),
            resolve_windows_process_metadata(pid, process_cache),
        )
    } else {
        let pid = cols.last()?.parse::<u32>().ok()?;
        (
            Some(pid),
            resolve_windows_process_metadata(pid, process_cache),
        )
    };

    Some(ListenerEndpoint {
        protocol: protocol.to_ascii_lowercase(),
        process_name: metadata.name,
        process_user: metadata.user,
        pid,
        listen_addr,
        port,
    })
}

fn resolve_windows_process_metadata(
    pid: u32,
    process_cache: &HashMap<u32, WindowsProcessMetadata>,
) -> WindowsProcessMetadata {
    if let Some(metadata) = process_cache.get(&pid) {
        return metadata.clone();
    }

    WindowsProcessMetadata {
        name: format!("pid-{pid}"),
        user: None,
    }
}

fn collect_windows_process_metadata(
    runtime_context: &RuntimeContext,
) -> HashMap<u32, WindowsProcessMetadata> {
    let args = ["/FO", "CSV", "/NH", "/V"];
    let output = match run_windows_system_command(runtime_context, "tasklist.exe", &args) {
        Ok(value) if value.status.success() => value,
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::warn!(
                status = ?output.status.code(),
                stderr = %stderr,
                "windows tasklist command failed; process metadata lookup disabled"
            );
            return HashMap::new();
        }
        Err(err) => {
            tracing::warn!(
                error = %err,
                "failed to execute windows tasklist; process metadata lookup disabled"
            );
            return HashMap::new();
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_tasklist_process_metadata_map(&stdout)
}

#[cfg(test)]
fn parse_tasklist_process_metadata(stdout: &str) -> Option<WindowsProcessMetadata> {
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("INFO:") {
            continue;
        }
        let fields = parse_windows_csv_line(trimmed);
        let name = fields.first()?.trim().to_string();
        if name.is_empty() {
            continue;
        }
        let user = fields
            .get(6)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty() && value != "N/A");
        return Some(WindowsProcessMetadata { name, user });
    }
    None
}

fn parse_tasklist_process_metadata_map(stdout: &str) -> HashMap<u32, WindowsProcessMetadata> {
    let mut out = HashMap::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("INFO:") {
            continue;
        }

        let fields = parse_windows_csv_line(trimmed);
        let Some(name) = fields.first().map(|value| value.trim()).filter(|value| !value.is_empty()) else {
            continue;
        };
        let Some(pid) = fields.get(1).and_then(|value| value.trim().parse::<u32>().ok()) else {
            continue;
        };
        let user = fields
            .get(6)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty() && value != "N/A");

        out.insert(
            pid,
            WindowsProcessMetadata {
                name: name.to_string(),
                user,
            },
        );
    }

    out
}

fn parse_windows_csv_line(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars = line.chars().peekable();

    for ch in chars {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
            }
            ',' if !in_quotes => {
                out.push(current.clone());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    out.push(current);
    out
}

fn run_windows_system_command(
    runtime_context: &RuntimeContext,
    executable_name: &str,
    args: &[&str],
) -> Result<Output, String> {
    let executable = windows_system_executable(runtime_context, executable_name);
    let launcher = resolve_wsl_interop_launcher(runtime_context);

    let mut command = if let Some(launcher) = launcher {
        let mut command = Command::new(launcher);
        command.arg(&executable);
        command
    } else {
        Command::new(&executable)
    };
    command.args(args);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let timeout = windows_command_timeout();
    let mut child = command.spawn().map_err(|err| {
        format!(
            "failed to spawn windows command '{}' with args {:?}: {err}",
            executable.display(),
            args
        )
    })?;
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child.wait_with_output().map_err(|err| {
                    format!(
                        "failed to collect windows command '{}' output: {err}",
                        executable.display()
                    )
                });
            }
            Ok(None) => {
                if started_at.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "windows command '{}' timed out after {}ms",
                        executable.display(),
                        timeout.as_millis()
                    ));
                }
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "failed to poll windows command '{}' with args {:?}: {err}",
                    executable.display(),
                    args
                ));
            }
        }
    }
}

fn windows_system_executable(runtime_context: &RuntimeContext, executable_name: &str) -> PathBuf {
    windows_system_root(runtime_context)
        .join("System32")
        .join(executable_name)
}

fn windows_system_root(runtime_context: &RuntimeContext) -> PathBuf {
    std::env::var("MUSU_PORT_WINDOWS_SYSTEM_ROOT")
        .ok()
        .or_else(|| std::env::var("SYSTEMROOT").ok())
        .or_else(|| std::env::var("WINDIR").ok())
        .map(|raw| {
            let trimmed = raw.trim();
            match runtime_context.runtime {
                RuntimeKind::Windows => PathBuf::from(trimmed),
                RuntimeKind::Linux | RuntimeKind::Wsl => {
                    crate::platform::normalize_input_path(trimmed, runtime_context)
                }
            }
        })
        .unwrap_or_else(|| match runtime_context.runtime {
            RuntimeKind::Windows => PathBuf::from(r"C:\Windows"),
            RuntimeKind::Linux | RuntimeKind::Wsl => PathBuf::from("/mnt/c/Windows"),
        })
}

fn windows_command_timeout() -> Duration {
    let timeout_ms = std::env::var("MUSU_PORT_WINDOWS_COMMAND_TIMEOUT_MS")
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .unwrap_or(1_200)
        .clamp(100, 10_000);
    Duration::from_millis(timeout_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_windows_tcp_listener_line() {
        let mut cache = HashMap::new();
        cache.insert(
            1412,
            WindowsProcessMetadata {
                name: "svchost.exe".to_string(),
                user: Some("NT AUTHORITY\\SYSTEM".to_string()),
            },
        );
        let parsed = parse_netstat_listener_line(
            "  TCP    0.0.0.0:135           0.0.0.0:0              LISTENING       1412",
            "tcp",
            &cache,
        )
        .expect("parsed tcp");
        assert_eq!(parsed.listen_addr, "0.0.0.0");
        assert_eq!(parsed.port, 135);
        assert_eq!(parsed.process_name, "svchost.exe");
        assert_eq!(parsed.process_user.as_deref(), Some("NT AUTHORITY\\SYSTEM"));
    }

    #[test]
    fn parses_windows_udp_listener_line() {
        let mut cache = HashMap::new();
        cache.insert(
            6789,
            WindowsProcessMetadata {
                name: "python.exe".to_string(),
                user: Some("EMPTY-PC\\empty".to_string()),
            },
        );
        let parsed = parse_netstat_listener_line(
            "  UDP    127.0.0.1:5050        *:*                                    6789",
            "udp",
            &cache,
        )
        .expect("parsed udp");
        assert_eq!(parsed.listen_addr, "127.0.0.1");
        assert_eq!(parsed.port, 5050);
        assert_eq!(parsed.process_name, "python.exe");
        assert_eq!(parsed.process_user.as_deref(), Some("EMPTY-PC\\empty"));
    }

    #[test]
    fn parses_tasklist_csv_process_metadata() {
        let parsed = parse_tasklist_process_metadata(
            "\"python.exe\",\"6789\",\"Console\",\"1\",\"12,312 K\",\"Running\",\"EMPTY-PC\\empty\",\"0:00:01\",\"N/A\"\r\n",
        );
        assert_eq!(
            parsed.as_ref().map(|row| row.name.as_str()),
            Some("python.exe")
        );
        assert_eq!(
            parsed.as_ref().and_then(|row| row.user.as_deref()),
            Some("EMPTY-PC\\empty")
        );
    }

    #[test]
    fn csv_parser_handles_commas_inside_quotes() {
        let fields =
            parse_windows_csv_line("\"python.exe\",\"6789\",\"Console\",\"1\",\"12,312 K\"");
        assert_eq!(fields[0], "python.exe");
        assert_eq!(fields[4], "12,312 K");
    }

    #[test]
    fn parses_tasklist_csv_metadata_map() {
        let parsed = parse_tasklist_process_metadata_map(
            "\"python.exe\",\"6789\",\"Console\",\"1\",\"12,312 K\",\"Running\",\"EMPTY-PC\\empty\",\"0:00:01\",\"N/A\"\r\n\
             \"cargo.exe\",\"6790\",\"Console\",\"1\",\"22,000 K\",\"Running\",\"EMPTY-PC\\empty\",\"0:00:02\",\"N/A\"\r\n",
        );

        assert_eq!(
            parsed.get(&6789).map(|row| row.name.as_str()),
            Some("python.exe")
        );
        assert_eq!(
            parsed.get(&6790).and_then(|row| row.user.as_deref()),
            Some("EMPTY-PC\\empty")
        );
    }
}
