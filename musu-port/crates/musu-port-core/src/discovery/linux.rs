use std::process::Command;

use crate::discovery::{dedupe_listener_snapshot, parse_local_addr_port, ListenerEndpoint};

pub(crate) fn collect_listener_snapshot_linux() -> Result<Vec<ListenerEndpoint>, String> {
    let mut out = Vec::new();
    let specs: [(&str, &[&str]); 2] = [("tcp", &["-ltnpH"]), ("udp", &["-lunpH"])];

    for (protocol, args) in specs {
        let output = match Command::new("ss").args(args).output() {
            Ok(value) => value,
            Err(err) => {
                tracing::warn!(
                    error = %err,
                    protocol = %protocol,
                    "failed to execute ss; discovery for protocol skipped"
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
                "ss command failed; discovery for protocol skipped"
            );
            continue;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if let Some(parsed) = parse_ss_listener_line(line, protocol) {
                out.push(parsed);
            }
        }
    }

    Ok(dedupe_listener_snapshot(out))
}

fn parse_ss_listener_line(line: &str, protocol: &str) -> Option<ListenerEndpoint> {
    let cols = line.split_whitespace().collect::<Vec<_>>();
    if cols.len() < 2 {
        return None;
    }

    let local = cols
        .iter()
        .copied()
        .find(|token| parse_local_addr_port(token).is_some())?;
    let (listen_addr, port) = parse_local_addr_port(local)?;

    let (process_name, pid) =
        parse_users_section(line).unwrap_or_else(|| ("unknown".to_string(), None));
    let process_user = resolve_linux_process_user(pid);

    Some(ListenerEndpoint {
        protocol: protocol.to_string(),
        process_name,
        process_user,
        pid,
        listen_addr,
        port,
    })
}

fn parse_users_section(line: &str) -> Option<(String, Option<u32>)> {
    let marker = line.find("users:((\"")?;
    let start = marker + "users:((\"".len();
    let end_name = line.get(start..)?.find('"')? + start;
    let process_name = line.get(start..end_name)?.to_string();

    let pid_marker = line.get(end_name..)?.find("pid=")? + end_name + "pid=".len();
    let pid_tail = line.get(pid_marker..)?;
    let pid_end = pid_tail
        .find(|ch: char| !ch.is_ascii_digit())
        .unwrap_or(pid_tail.len());
    let pid = pid_tail
        .get(..pid_end)
        .and_then(|raw| raw.parse::<u32>().ok());

    Some((process_name, pid))
}

fn resolve_linux_process_user(pid: Option<u32>) -> Option<String> {
    let pid = pid?;
    let status_path = format!("/proc/{pid}/status");
    let raw = std::fs::read_to_string(status_path).ok()?;
    let uid = raw
        .lines()
        .find_map(|line| line.strip_prefix("Uid:"))
        .and_then(|line| line.split_whitespace().next())
        .and_then(|raw| raw.parse::<u32>().ok())?;

    linux_username_from_uid(uid).or_else(|| Some(format!("uid-{uid}")))
}

fn linux_username_from_uid(uid: u32) -> Option<String> {
    let passwd = std::fs::read_to_string("/etc/passwd").ok()?;
    for line in passwd.lines() {
        let mut cols = line.split(':');
        let name = cols.next()?;
        let _password = cols.next();
        let uid_col = cols.next()?;
        if uid_col.parse::<u32>().ok()? == uid {
            return Some(name.to_string());
        }
    }
    None
}
