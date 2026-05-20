use std::path::PathBuf;

use musu_supervisor_core::{MusuConfig, Supervisor};

const USAGE: &str = "\
Usage: musu [--config PATH] <command>

Commands:
  start              Read musu.toml and start all services (foreground)
  stop [SERVICE]     Gracefully stop all services, or a named service
  status             Show service status table (PID, uptime, restarts)
  logs SERVICE [-f]  Print service log; -f to follow in real time

Options:
  --config PATH      Path to musu.toml  [default: ~/.musu/musu.toml]
";

fn print_usage() {
    print!("{USAGE}");
}

// ── Arg parsing ────────────────────────────────────────────────────────────

struct Args {
    config_path: Option<PathBuf>,
    subcommand: String,
    rest: Vec<String>,
}

fn parse_args() -> Result<Args, String> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut config_path: Option<PathBuf> = None;
    let mut positional: Vec<String> = Vec::new();
    let mut i = 0;

    while i < raw.len() {
        match raw[i].as_str() {
            "--config" | "-c" => {
                i += 1;
                if i >= raw.len() {
                    return Err("--config requires a path argument".into());
                }
                config_path = Some(PathBuf::from(&raw[i]));
            }
            _ => positional.push(raw[i].clone()),
        }
        i += 1;
    }

    let subcommand = positional
        .first()
        .cloned()
        .unwrap_or_else(|| "help".to_string());
    let rest = positional.into_iter().skip(1).collect();

    Ok(Args {
        config_path,
        subcommand,
        rest,
    })
}

// ── Entry point ────────────────────────────────────────────────────────────

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("musu: {e}");
            std::process::exit(2);
        }
    };

    match args.subcommand.as_str() {
        "start" => {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(cmd_start(args.config_path));
        }
        "stop" => {
            let rt = tokio::runtime::Runtime::new().unwrap();
            let service = args.rest.first().cloned();
            match rt.block_on(cmd_stop_ipc(args.config_path.as_deref(), service)) {
                Ok(()) => {}
                Err(e) => {
                    eprintln!("musu stop: {e}");
                    std::process::exit(1);
                }
            }
        }
        "status" => {
            let rt = tokio::runtime::Runtime::new().unwrap();
            match rt.block_on(cmd_status_ipc(args.config_path.as_deref())) {
                Ok(()) => {}
                Err(e) => {
                    eprintln!("musu status: {e}");
                    std::process::exit(1);
                }
            }
        }
        "logs" => {
            let service = match args.rest.first() {
                Some(s) => s.clone(),
                None => {
                    eprintln!("musu logs: requires a service name");
                    eprintln!("  Usage: musu logs <service> [-f]");
                    std::process::exit(2);
                }
            };
            let follow = args.rest.iter().any(|a| a == "-f" || a == "--follow");
            if let Err(e) = cmd_logs(args.config_path.as_deref(), &service, follow) {
                eprintln!("musu logs: {e}");
                std::process::exit(1);
            }
        }
        "help" | "--help" | "-h" => print_usage(),
        other => {
            eprintln!("musu: unknown command '{other}'\n");
            print_usage();
            std::process::exit(2);
        }
    }
}

// ── musu start ─────────────────────────────────────────────────────────────

async fn cmd_start(config_path: Option<PathBuf>) {
    let cfg = load_config(config_path.as_deref());

    let enabled_count = cfg.services.values().filter(|s| s.enabled).count();
    if enabled_count == 0 {
        println!("musu: no services enabled — nothing to start");
        return;
    }

    println!("musu: starting {enabled_count} service(s)");

    let supervisor = Supervisor::start(&cfg).await;

    // Start the IPC socket so `musu stop/status` can connect.
    #[cfg(unix)]
    let _ipc_task = supervisor.start_ipc_server();

    let shutdown_notify = supervisor.ipc.shutdown_notify.clone();

    // Wait for SIGINT, SIGTERM, or an IPC stop-all command.
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("musu: failed to install SIGTERM handler: {e}");
                std::process::exit(1);
            }
        };
        tokio::select! {
            result = tokio::signal::ctrl_c() => {
                match result {
                    Ok(_) => println!("\nmusu: received SIGINT"),
                    Err(e) => eprintln!("musu: SIGINT handler error: {e}"),
                }
            }
            _ = sigterm.recv() => {
                println!("musu: received SIGTERM");
            }
            _ = shutdown_notify.notified() => {
                println!("musu: IPC shutdown requested");
            }
        }
    }

    #[cfg(not(unix))]
    tokio::select! {
        result = tokio::signal::ctrl_c() => {
            match result {
                Ok(_) => println!("\nmusu: received shutdown signal"),
                Err(e) => eprintln!("musu: signal error: {e}"),
            }
        }
        _ = shutdown_notify.notified() => {
            println!("musu: IPC shutdown requested");
        }
    }

    println!(
        "musu: stopping all services (grace={}s)...",
        cfg.grace_period_secs
    );
    supervisor.stop_all().await;
    println!("musu: stopped");
}

// ── musu stop (IPC) ────────────────────────────────────────────────────────

#[cfg(unix)]
async fn cmd_stop_ipc(
    _config_path: Option<&std::path::Path>,
    service: Option<String>,
) -> Result<(), String> {
    use musu_supervisor_core::ipc::{IpcCmd, IpcRequest};

    let is_stop_all = service.is_none();
    let socket_path = MusuConfig::default_socket_path();
    // R6 audit-fix (Auditor B QB2): include the bearer token so musud
    // can authenticate this request.
    let req = IpcRequest {
        cmd: IpcCmd::Stop,
        service,
        token: read_ipc_token(),
    };
    let resp = send_ipc(&socket_path, &req).await?;
    if resp.ok {
        if is_stop_all {
            println!("musu: stop-all signal sent");
        } else {
            println!("musu: stopped");
        }
        Ok(())
    } else {
        Err(resp.error.unwrap_or_else(|| "unknown error".into()))
    }
}

#[cfg(not(unix))]
async fn cmd_stop_ipc(
    _config_path: Option<&std::path::Path>,
    _service: Option<String>,
) -> Result<(), String> {
    Err("musu stop via IPC is only supported on Unix".into())
}

// ── musu status (IPC) ──────────────────────────────────────────────────────

#[cfg(unix)]
async fn cmd_status_ipc(_config_path: Option<&std::path::Path>) -> Result<(), String> {
    use musu_supervisor_core::ipc::{IpcCmd, IpcRequest};

    let socket_path = MusuConfig::default_socket_path();
    // R6 audit-fix (Auditor B QB2): include the bearer token.
    let req = IpcRequest {
        cmd: IpcCmd::Status,
        service: None,
        token: read_ipc_token(),
    };
    let resp = send_ipc(&socket_path, &req).await?;
    if !resp.ok {
        return Err(resp.error.unwrap_or_else(|| "unknown error".into()));
    }

    let services = resp.services.unwrap_or_default();
    if services.is_empty() {
        println!("No services running.");
        return Ok(());
    }

    // Determine column widths.
    let name_w = services
        .iter()
        .map(|s| s.name.len())
        .max()
        .unwrap_or(4)
        .max(4);
    let pid_w = 7usize;
    let status_w = 7usize;
    let uptime_w = 9usize;
    let restarts_w = 8usize;

    // Header
    println!(
        "{:<name_w$}  {:>pid_w$}  {:<status_w$}  {:>uptime_w$}  {:>restarts_w$}",
        "NAME",
        "PID",
        "STATUS",
        "UPTIME",
        "RESTARTS",
        name_w = name_w,
        pid_w = pid_w,
        status_w = status_w,
        uptime_w = uptime_w,
        restarts_w = restarts_w,
    );
    println!(
        "{}",
        "-".repeat(name_w + pid_w + status_w + uptime_w + restarts_w + 8)
    );

    for svc in &services {
        let pid_str = svc
            .pid
            .map(|p| p.to_string())
            .unwrap_or_else(|| "-".to_string());
        let status_str = if svc.running { "running" } else { "stopped" };
        let uptime_str = if svc.running {
            format_uptime(svc.uptime_secs)
        } else {
            "-".to_string()
        };
        println!(
            "{:<name_w$}  {:>pid_w$}  {:<status_w$}  {:>uptime_w$}  {:>restarts_w$}",
            svc.name,
            pid_str,
            status_str,
            uptime_str,
            svc.restart_count,
            name_w = name_w,
            pid_w = pid_w,
            status_w = status_w,
            uptime_w = uptime_w,
            restarts_w = restarts_w,
        );
    }
    Ok(())
}

#[cfg(not(unix))]
async fn cmd_status_ipc(_config_path: Option<&std::path::Path>) -> Result<(), String> {
    Err("musu status via IPC is only supported on Unix".into())
}

#[cfg_attr(not(unix), allow(dead_code))]
fn format_uptime(secs: u64) -> String {
    if secs < 60 {
        format!("{secs}s")
    } else if secs < 3600 {
        format!("{}m{}s", secs / 60, secs % 60)
    } else {
        format!("{}h{}m", secs / 3600, (secs % 3600) / 60)
    }
}

// ── musu logs ─────────────────────────────────────────────────────────────

fn cmd_logs(
    _config_path: Option<&std::path::Path>,
    service: &str,
    follow: bool,
) -> Result<(), String> {
    let log_path = MusuConfig::default_log_dir().join(format!("{service}.log"));

    if !log_path.exists() {
        return Err(format!(
            "log file not found: {} (has the service been started?)",
            log_path.display()
        ));
    }

    use std::io::{Read, Seek, SeekFrom, Write};

    // Print last ~50 lines.
    let content = std::fs::read_to_string(&log_path)
        .map_err(|e| format!("cannot read {}: {e}", log_path.display()))?;
    let lines: Vec<&str> = content.lines().collect();
    let tail_start = if lines.len() > 50 {
        lines.len() - 50
    } else {
        0
    };
    for line in &lines[tail_start..] {
        println!("{line}");
    }

    if follow {
        let mut file = std::fs::File::open(&log_path)
            .map_err(|e| format!("cannot open {}: {e}", log_path.display()))?;
        file.seek(SeekFrom::End(0))
            .map_err(|e| format!("seek error: {e}"))?;

        let stdout = std::io::stdout();
        let mut out = stdout.lock();
        let mut buf = vec![0u8; 4096];

        loop {
            let n = file.read(&mut buf).unwrap_or(0);
            if n > 0 {
                let _ = out.write_all(&buf[..n]);
                let _ = out.flush();
            } else {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
        }
    }

    Ok(())
}

// ── IPC client helpers ─────────────────────────────────────────────────────

/// R6 audit-fix (Auditor B QB2 — ipc-auth): resolve the IPC bearer token
/// from `MUSU_BRIDGE_TOKEN` env, falling back to `~/.musu/bridge.env`.
/// Returns `None` if no token is configured — the musud side will reject
/// if it has an expected token configured, which is the production path.
#[cfg(unix)]
fn read_ipc_token() -> Option<String> {
    if let Ok(t) = std::env::var("MUSU_BRIDGE_TOKEN") {
        if !t.is_empty() {
            return Some(t);
        }
    }
    let env_path = MusuConfig::musu_dir().join("bridge.env");
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

#[cfg(unix)]
async fn send_ipc(
    socket_path: &std::path::Path,
    request: &musu_supervisor_core::ipc::IpcRequest,
) -> Result<musu_supervisor_core::ipc::IpcResponse, String> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixStream;

    let stream = UnixStream::connect(socket_path).await.map_err(|e| {
        format!(
            "cannot connect to musu socket {}: {e}\n  (is musu running?)",
            socket_path.display()
        )
    })?;

    let (reader, mut writer) = stream.into_split();

    let mut json = serde_json::to_string(request).map_err(|e| format!("serialize error: {e}"))?;
    json.push('\n');
    writer
        .write_all(json.as_bytes())
        .await
        .map_err(|e| format!("write error: {e}"))?;

    let mut lines = BufReader::new(reader).lines();
    let line = lines
        .next_line()
        .await
        .map_err(|e| format!("read error: {e}"))?
        .ok_or_else(|| "empty response from supervisor".to_string())?;

    serde_json::from_str(&line).map_err(|e| format!("parse response: {e}"))
}

// ── Config loader ──────────────────────────────────────────────────────────

fn load_config(path: Option<&std::path::Path>) -> MusuConfig {
    match path {
        Some(p) => match MusuConfig::load(p) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("musu: failed to load config {}: {e}", p.display());
                std::process::exit(1);
            }
        },
        None => match MusuConfig::load_default() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("musu: failed to load config: {e}");
                std::process::exit(1);
            }
        },
    }
}
