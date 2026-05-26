//! CLI command handlers for share, route, ls, get, put — V27.
//!
//! Each public `run_*` function corresponds to a `Cmd::*` variant wired
//! from `main.rs`. They resolve peer addresses from `nodes.toml` /
//! `manual_peers.toml`, authenticate with `MUSU_BRIDGE_TOKEN` /
//! `MUSU_TOKEN`, and print operator-friendly output.




use anyhow::Result;
use clap::Args;

use super::shares::SharesConfig;

// ── V27 CLI option structs ──────────────────────────────────────────────

/// Options for `musu share <path>`.
#[derive(Args, Debug)]
pub struct ShareOpts {
    /// Directory path to share (e.g., F:\workspace).
    pub path: String,
    /// Allow peers to write to this directory.
    #[arg(long, short = 'w')]
    pub writable: bool,
    /// Optional human-readable label for the share.
    #[arg(long)]
    pub label: Option<String>,
}

/// Options for `musu unshare <path>`.
#[derive(Args, Debug)]
pub struct UnshareOpts {
    /// Directory path to stop sharing.
    pub path: String,
}

/// Options for `musu route <text>`.
#[derive(Args, Debug)]
pub struct RouteOpts {
    /// The instruction/prompt to execute.
    pub text: String,
    /// Target node name (auto-routes if omitted).
    #[arg(long, short = 't')]
    pub target: Option<String>,
    /// Channel name.
    #[arg(long, default_value = "cli")]
    pub channel: String,
    /// Wait for the task to complete and print the result.
    #[arg(long, short = 'w')]
    pub wait: bool,
    /// Route to a GPU-capable node.
    #[arg(long)]
    pub gpu: bool,
}

/// Options for `musu ls peer-name:/path`.
#[derive(Args, Debug)]
pub struct LsOpts {
    /// Remote path: peer-name:/path or peer-name:C:\path.
    pub remote: String,
}

/// Options for `musu get peer-name:/path/to/file`.
#[derive(Args, Debug)]
pub struct GetOpts {
    /// Remote file: peer-name:/path/to/file.
    pub remote: String,
    /// Local destination (default: current directory, original filename).
    #[arg(short, long)]
    pub output: Option<String>,
}

/// Options for `musu put <local> peer-name:/path/to/dest`.
#[derive(Args, Debug)]
pub struct PutOpts {
    /// Local file to upload.
    pub local: String,
    /// Remote destination: peer-name:/path/to/dest.
    pub remote: String,
}
// ── share / unshare / shares ────────────────────────────────────────────

/// `musu share <path>` — register a directory in `shares.toml`.
pub async fn run_share(opts: ShareOpts) -> Result<()> {
    let home = musu_home();
    std::fs::create_dir_all(&home)?;

    let abs_path = std::fs::canonicalize(&opts.path)
        .map_err(|e| anyhow::anyhow!("cannot resolve '{}': {e}", opts.path))?;

    if !abs_path.is_dir() {
        anyhow::bail!("'{}' is not a directory", abs_path.display());
    }

    let mut config = SharesConfig::load(&home);
    config.add(&abs_path.to_string_lossy(), opts.writable, opts.label);
    config.save(&home)?;

    println!("✓ Shared: {}", abs_path.display());
    if opts.writable {
        println!("  Mode: read/write");
    } else {
        println!("  Mode: read-only");
    }
    println!("  Restart bridge to apply: musu bridge");
    Ok(())
}

/// `musu unshare <path>` — remove a directory from `shares.toml`.
pub async fn run_unshare(opts: UnshareOpts) -> Result<()> {
    let home = musu_home();
    let mut config = SharesConfig::load(&home);

    let abs_path = std::fs::canonicalize(&opts.path)
        .unwrap_or_else(|_| std::path::PathBuf::from(&opts.path));

    if config.remove(&abs_path.to_string_lossy()) {
        config.save(&home)?;
        println!("✓ Unshared: {}", abs_path.display());
    } else {
        println!("⚠ Not currently shared: {}", abs_path.display());
    }
    Ok(())
}

/// `musu shares` — list all shared directories.
pub async fn run_shares() -> Result<()> {
    let home = musu_home();
    let config = SharesConfig::load(&home);

    if config.shared.is_empty() {
        println!("No directories currently shared.");
        println!("Use: musu share <path>");
        return Ok(());
    }

    println!("Shared directories:");
    for (i, s) in config.shared.iter().enumerate() {
        let mode = if s.writable { "rw" } else { "ro" };
        let label = s.label.as_deref().unwrap_or("-");
        println!("  {}. {} [{}] ({})", i + 1, s.path, mode, label);
    }
    Ok(())
}

// ── route ───────────────────────────────────────────────────────────────

/// `musu route <text>` — send a task to a peer (or local bridge).
pub async fn run_route(opts: RouteOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();

    let addr = if let Some(ref target) = opts.target {
        find_peer_addr(&home, target.as_str())?
    } else {
        let port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
        format!("127.0.0.1:{port}")
    };

    let url = format!("http://{addr}/api/tasks/delegate");
    let client = reqwest::Client::new();

    println!(
        "→ Sending task to {}...",
        opts.target.as_deref().unwrap_or("local")
    );

    let body = serde_json::json!({
        "channel": opts.channel,
        "sender_id": "cli",
        "text": opts.text,
        "target_node": opts.target,
        "needs_gpu": opts.gpu,
    });

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?;

    if resp.status().is_success() {
        let result: serde_json::Value = resp.json().await?;
        let task_id = result["task_id"].as_str().unwrap_or("unknown");
        println!(
            "✓ Task queued: {}",
            task_id,
        );

        if opts.wait {
            println!("⏳ Waiting for task {}...", task_id);
            let task_id = task_id.to_string();
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                let status_url = format!("http://{}/api/tasks/{}", addr, task_id);
                let status_resp = client
                    .get(&status_url)
                    .bearer_auth(&token)
                    .timeout(std::time::Duration::from_secs(10))
                    .send()
                    .await;
                match status_resp {
                    Ok(r) if r.status().is_success() => {
                        let data: serde_json::Value = r.json().await?;
                        let status = data["status"].as_str().unwrap_or("");
                        match status {
                            "done" => {
                                println!("✓ Task completed");
                                if let Some(output) = data["output"].as_str() {
                                    if !output.is_empty() {
                                        println!("{}", output);
                                    }
                                }
                                break;
                            }
                            "failed" => {
                                println!("✗ Task failed");
                                if let Some(err) = data["error"].as_str() {
                                    eprintln!("{}", err);
                                }
                                break;
                            }
                            "cancelled" => {
                                println!("⚠ Task cancelled");
                                break;
                            }
                            _ => {
                                // still pending/running, continue polling
                            }
                        }
                    }
                    Ok(_) | Err(_) => {
                        // non-success or network error, keep polling
                    }
                }
            }
        }
    } else {
        let status = resp.status();
        let body = resp.text().await?;
        println!("✗ Failed ({status}): {body}");
    }
    Ok(())
}

// ── ls / get / put ──────────────────────────────────────────────────────

/// `musu ls peer-name:/path` — list files on a remote peer.
pub async fn run_ls(opts: LsOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();
    let (peer_name, path) = parse_remote(&opts.remote)?;
    let addr = find_peer_addr(&home, &peer_name)?;

    let url = format!(
        "http://{addr}/api/files?path={}",
        urlencoding::encode(&path)
    );
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }

    let listing: serde_json::Value = resp.json().await?;
    let entries = listing["entries"].as_array();

    if let Some(entries) = entries {
        println!("{peer_name}:{path} ({} items)", entries.len());
        println!();
        for entry in entries {
            let is_dir = entry["is_dir"].as_bool().unwrap_or(false);
            let name = entry["name"].as_str().unwrap_or("?");
            let size = entry["size"].as_u64().unwrap_or(0);

            if is_dir {
                println!("  📁 {name}/");
            } else {
                let size_str = format_size(size);
                println!("  📄 {name} ({size_str})");
            }
        }
    }
    Ok(())
}

/// `musu get peer-name:/path/to/file` — download a file from a peer.
pub async fn run_get(opts: GetOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();
    let (peer_name, path) = parse_remote(&opts.remote)?;
    let addr = find_peer_addr(&home, &peer_name)?;

    let url = format!(
        "http://{addr}/api/files/read?path={}",
        urlencoding::encode(&path)
    );
    let client = reqwest::Client::new();

    println!("→ Downloading {peer_name}:{path}...");

    let resp = client.get(&url).bearer_auth(&token).send().await?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }

    let filename = std::path::Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let dest = opts.output.unwrap_or(filename);

    let bytes = resp.bytes().await?;
    std::fs::write(&dest, &bytes)?;
    println!("✓ Saved: {dest} ({})", format_size(bytes.len() as u64));
    Ok(())
}

/// `musu put local-file peer-name:/path/to/dest` — upload a file to a peer.
pub async fn run_put(opts: PutOpts) -> Result<()> {
    let home = musu_home();
    let token = get_token();
    let (peer_name, path) = parse_remote(&opts.remote)?;
    let addr = find_peer_addr(&home, &peer_name)?;

    let data =
        std::fs::read(&opts.local).map_err(|e| anyhow::anyhow!("cannot read '{}': {e}", opts.local))?;
    let size = data.len();

    let url = format!(
        "http://{addr}/api/files/write?path={}",
        urlencoding::encode(&path)
    );
    let client = reqwest::Client::new();

    println!("→ Uploading {} to {peer_name}:{path}...", opts.local);

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .body(data)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await?;

    if resp.status().is_success() {
        println!("✓ Uploaded: {path} ({})", format_size(size as u64));
    } else {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }
    Ok(())
}

// ── helpers ─────────────────────────────────────────────────────────────

/// Parse `"peer-name:/path"` or `"peer-name:C:\path"` into `(peer, path)`.
///
/// Windows drive letters are handled: the first colon separates the peer
/// name from the remote path, and a second colon (e.g. `C:\`) is left
/// as part of the path.
fn parse_remote(remote: &str) -> Result<(String, String)> {
    let colon_pos = remote
        .find(':')
        .ok_or_else(|| anyhow::anyhow!("invalid remote format '{remote}'. Use: peer-name:/path or peer-name:C:\\path"))?;

    let peer = &remote[..colon_pos];
    let path = &remote[colon_pos + 1..];

    if peer.is_empty() {
        anyhow::bail!("missing peer name in '{remote}'");
    }
    Ok((peer.to_string(), path.to_string()))
}

/// Resolve a peer's bridge address from `nodes.toml` or `manual_peers.toml`.
fn find_peer_addr(home: &std::path::Path, peer_name: &str) -> Result<String> {
    // Try nodes.toml first.
    let nodes_path = home.join("nodes.toml");
    if nodes_path.exists() {
        let data = std::fs::read_to_string(&nodes_path)?;
        let parsed: toml::Value = toml::from_str(&data)?;
        if let Some(nodes) = parsed.get("nodes").and_then(|n| n.as_table()) {
            if let Some(node) = nodes.get(peer_name).and_then(|n| n.as_table()) {
                if let Some(url) = node.get("url").and_then(|u| u.as_str()) {
                    let addr = url
                        .trim_start_matches("http://")
                        .trim_start_matches("https://")
                        .trim_end_matches('/');
                    return Ok(addr.to_string());
                }
            }
        }
    }

    // Fallback: manual_peers.toml.
    let manual_path = home.join("manual_peers.toml");
    if manual_path.exists() {
        let data = std::fs::read_to_string(&manual_path)?;
        let parsed: toml::Value = toml::from_str(&data)?;
        if let Some(peers) = parsed.get("peers").and_then(|p| p.as_array()) {
            for peer in peers {
                if let Some(name) = peer.get("name").and_then(|n| n.as_str()) {
                    if name == peer_name {
                        if let Some(addr) = peer.get("addr").and_then(|a| a.as_str()) {
                            return Ok(addr.to_string());
                        }
                    }
                }
            }
        }
    }

    anyhow::bail!(
        "peer '{peer_name}' not found. Use: musu peer add --addr <ip:port> --name {peer_name}"
    )
}

/// Read the bridge/peer token from env.
fn get_token() -> String {
    std::env::var("MUSU_BRIDGE_TOKEN")
        .or_else(|_| std::env::var("MUSU_TOKEN"))
        .unwrap_or_default()
}

/// Human-friendly byte-size formatter.
fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

/// Resolve `~/.musu` from environment.
fn musu_home() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        return std::path::PathBuf::from(home).join(".musu");
    }
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        return std::path::PathBuf::from(userprofile).join(".musu");
    }
    std::path::PathBuf::from(".").join(".musu")
}

// ── F3 fleet dashboard CLI ──────────────────────────────────────────

/// `musu status` — show fleet status across all connected nodes.
pub async fn run_status() -> Result<()> {
    let _home = musu_home();
    let token = get_token();
    let port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
    let addr = format!("127.0.0.1:{}", port);
    let url = format!("http://{}/api/fleet/status", addr);
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            anyhow::anyhow!("cannot reach local bridge: {e}. Is `musu bridge` running?")
        })?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("bridge error: {body}");
    }

    let fleet: serde_json::Value = resp.json().await?;

    println!("\n\u{1f41d} MUSU Fleet Status\n");

    // This node
    let this = &fleet["this_node"];
    let status_icon = if this["healthy"].as_bool().unwrap_or(false) {
        "\u{2705}"
    } else {
        "\u{274c}"
    };
    println!(
        "  {} {} (this)    {} running, {} pending, {} dirs shared",
        status_icon,
        this["name"].as_str().unwrap_or("?"),
        this["tasks_running"].as_u64().unwrap_or(0),
        this["tasks_pending"].as_u64().unwrap_or(0),
        this["shared_dirs"]
            .as_array()
            .map(|a| a.len())
            .unwrap_or(0),
    );

    // Peers
    if let Some(peers) = fleet["peers"].as_array() {
        for peer in peers {
            let icon = if peer["healthy"].as_bool().unwrap_or(false) {
                "\u{2705}"
            } else {
                "\u{274c}"
            };
            let label = if peer["healthy"].as_bool().unwrap_or(false) {
                "healthy"
            } else {
                "offline"
            };
            println!(
                "  {} {} ({})    {} running, {} pending",
                icon,
                peer["name"].as_str().unwrap_or("?"),
                label,
                peer["tasks_running"].as_u64().unwrap_or(0),
                peer["tasks_pending"].as_u64().unwrap_or(0),
            );
        }
    }

    println!(
        "\n  Total: {} nodes, {} online, {} tasks running\n",
        fleet["total_nodes"].as_u64().unwrap_or(0),
        fleet["online_nodes"].as_u64().unwrap_or(0),
        fleet["total_tasks_running"].as_u64().unwrap_or(0),
    );

    Ok(())
}

/// `musu tasks` — list recent tasks across the fleet.
pub async fn run_tasks() -> Result<()> {
    let token = get_token();
    let port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
    let addr = format!("127.0.0.1:{}", port);
    let url = format!("http://{}/api/tasks", addr);
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("cannot reach local bridge: {e}"))?;

    if !resp.status().is_success() {
        let body = resp.text().await?;
        anyhow::bail!("bridge error: {body}");
    }

    let data: serde_json::Value = resp.json().await?;
    let tasks = data["tasks"].as_array();

    if let Some(tasks) = tasks {
        if tasks.is_empty() {
            println!("No tasks found.");
            return Ok(());
        }

        println!(
            "\n{:<12} {:<10} {:<10} CHANNEL",
            "TASK_ID", "STATUS", "DURATION"
        );
        println!("{}", "-".repeat(50));

        for task in tasks {
            let id = task["task_id"].as_str().unwrap_or("?");
            let short_id = if id.len() > 8 { &id[..8] } else { id };
            let status = task["status"].as_str().unwrap_or("?");
            let duration = task["duration_sec"]
                .as_f64()
                .map(|d| format!("{:.1}s", d))
                .unwrap_or_else(|| "-".into());
            let channel = task["channel"].as_str().unwrap_or("?");

            println!("{:<12} {:<10} {:<10} {}", short_id, status, duration, channel);
        }
        println!("\nTotal: {} tasks", tasks.len());
    }

    Ok(())
}

// ── F5 workflow execution CLI ───────────────────────────────────────

/// `musu workflow-run --id <ID>` — execute a workflow via the bridge.
pub async fn run_workflow_execute(workflow_id: &str) -> Result<()> {
    let token = get_token();
    let port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
    let url = format!(
        "http://127.0.0.1:{}/api/workflows/{}/execute",
        port, workflow_id
    );
    let client = reqwest::Client::new();

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("cannot reach bridge: {e}"))?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await?;
        println!("\u{2713} Workflow {} execution started", workflow_id);
        println!("  Status: {}", data["status"].as_str().unwrap_or("?"));
    } else {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }
    Ok(())
}

// ── F7 easy token pairing CLI ───────────────────────────────────────

/// `musu pair` — generate a pairing code for another machine to join.
pub async fn run_pair() -> Result<()> {
    let token = get_token();
    let port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
    let url = format!("http://127.0.0.1:{}/api/pair/offer", port);
    let client = reqwest::Client::new();

    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("cannot reach bridge: {e}"))?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await?;
        let code = data["code"].as_str().unwrap_or("?");
        println!("\n\u{1f517} Pairing code: {}\n", code);
        println!("   Valid for 5 minutes.");
        println!("   On the other machine, run:");
        println!("   musu join {}\n", code);
    } else {
        let body = resp.text().await?;
        anyhow::bail!("failed: {body}");
    }
    Ok(())
}

/// `musu join <code>` — join another machine using a pairing code.
pub async fn run_join(code: &str) -> Result<()> {
    // First, try to find the pairing host via mDNS.
    println!("\u{1f50d} Looking for pairing host...");
    let peers = crate::peer::mdns::discover_peers(std::time::Duration::from_secs(5)).await;

    let token = get_token();
    let my_port = std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
    let my_name = std::env::var("MUSU_NODE_NAME").unwrap_or_else(|_| {
        hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    let my_url = format!("http://0.0.0.0:{}", my_port);

    // Try each discovered peer.
    let client = reqwest::Client::new();
    for peer in &peers {
        let url = format!("http://{}/api/pair/accept", peer.addr);
        let body = serde_json::json!({
            "code": code,
            "my_name": my_name,
            "my_url": my_url,
        });

        match client
            .post(&url)
            .json(&body)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                let data: serde_json::Value = resp.json().await?;
                let peer_name = data["peer_name"].as_str().unwrap_or("?");
                println!("\u{2713} Paired with {} ({})", peer_name, peer.addr);

                // Also add the peer to our manual_peers.
                let home = musu_home();
                let mut list = crate::peer::discovery::ManualPeerList::load(&home);
                list.add(peer.addr.clone(), Some(peer_name.to_string()));
                let _ = list.save(&home);
                return Ok(());
            }
            Ok(resp) if resp.status().as_u16() == 404 => continue, // wrong peer
            _ => continue,
        }
    }

    // Fallback: try local bridge.
    let url = format!("http://127.0.0.1:{}/api/pair/accept", my_port);
    let body = serde_json::json!({
        "code": code,
        "my_name": my_name,
        "my_url": my_url,
    });
    let resp = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("no peers found and local bridge unreachable: {e}"))?;

    if resp.status().is_success() {
        println!("\u{2713} Paired via local bridge");
    } else {
        let body = resp.text().await?;
        anyhow::bail!("pairing failed: {body}");
    }
    Ok(())
}

// ── F9 file real-time sync CLI ──────────────────────────────────────

/// `musu sync` — start watching shared directories and sync to peers.
pub async fn run_sync() -> Result<()> {
    let home = musu_home();
    let shares = crate::install::shares::SharesConfig::load(&home);
    let paths: Vec<std::path::PathBuf> = shares
        .shared
        .iter()
        .map(|s| std::path::PathBuf::from(&s.path))
        .collect();

    if paths.is_empty() {
        println!("No shared directories. Use `musu share <path>` first.");
        return Ok(());
    }

    let token = get_token();
    let peers: Vec<String> = crate::peer::discovery::resolve_all_peers(&home)
        .into_iter()
        .map(|p| p.addr)
        .collect();

    if peers.is_empty() {
        println!("No peers found. Use `musu peer add` or `musu pair` first.");
        return Ok(());
    }

    println!(
        "Watching {} directories, syncing to {} peers...",
        paths.len(),
        peers.len()
    );
    for p in &paths {
        println!("  {}", p.display());
    }

    let (rx, watcher) = crate::install::sync::start_watcher(&paths)?;
    crate::install::sync::run_sync_loop(rx, watcher, peers, token).await;
    Ok(())
}

// ── F10 WebDAV mount CLI ────────────────────────────────────────────

/// `musu mount [--node <name>]` — show WebDAV URL and mount instructions.
pub async fn run_mount(node: Option<&str>) -> Result<()> {
    let home = musu_home();
    let peers = crate::peer::discovery::resolve_all_peers(&home);

    if let Some(target) = node {
        // Find specific peer.
        let peer = peers.iter().find(|p| {
            p.addr == target || p.name.as_deref() == Some(target)
        });
        match peer {
            Some(p) => {
                let url = format!("http://{}/webdav", p.addr);
                println!("\nWebDAV URL: {}\n", url);
                println!("To mount on Windows:");
                println!("  net use Z: {}", url);
                println!("\nTo mount on macOS:");
                println!("  mount_webdav {} /Volumes/musu", url);
                println!("\nTo mount on Linux:");
                println!("  sudo mount -t davfs {} /mnt/musu", url);
            }
            None => {
                anyhow::bail!("peer '{}' not found", target);
            }
        }
    } else {
        // Show local WebDAV URL.
        let port =
            std::env::var("BRIDGE_PORT").unwrap_or_else(|_| "8070".into());
        let url = format!("http://127.0.0.1:{}/webdav", port);
        println!("\nLocal WebDAV URL: {}\n", url);
        println!("Mount it on another machine to access shared files.");

        if !peers.is_empty() {
            println!("\nRemote nodes:");
            for p in &peers {
                let name = p.name.as_deref().unwrap_or(&p.addr);
                println!("  {} — http://{}/webdav", name, p.addr);
            }
            println!("\nUse `musu mount --node <name>` for mount instructions.");
        }
    }
    Ok(())
}

// ── V27 Account Auth CLI ────────────────────────────────────────────

/// `musu login` — start the device code login flow.
pub async fn run_login() -> Result<()> {
    let home = musu_home();
    let my_name = std::env::var("MUSU_NODE_NAME").unwrap_or_else(|_| {
        hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });

    println!("\u{1f511} Initiating login to musu.pro...");

    let cloud = crate::cloud::MusuCloud::new("https://musu.pro", None);
    let flow = cloud.initiate_device_login(&my_name).await?;

    println!("\n🔗 Open this URL in your browser to approve:");
    println!("   {}", flow.verification_uri);
    println!("\n⏳ Waiting for approval (timeout {}s)...", flow.expires_in);

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(flow.expires_in as u64);

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("Login timed out.");
        }

        tokio::time::sleep(std::time::Duration::from_secs(5)).await;

        match cloud.poll_device_token(&flow.device_code).await {
            Ok(Some(token)) => {
                crate::cloud::token::save_token(&home, &token)?;
                println!("\n✅ Logged in successfully!");
                
                // V27: Automatically register this node in the mesh
                println!("Registering node to your fleet...");
                let authed_cloud = crate::cloud::MusuCloud::new("https://musu.pro", Some(token));
                let req = crate::cloud::RegisterNodeRequest {
                    node_name: my_name.clone(),
                    public_url: "local".to_string(), // Can be updated later by musud
                    ..Default::default()
                };
                if let Err(e) = authed_cloud.register_node(req).await {
                    println!("⚠️ Logged in, but node registration failed: {}", e);
                } else {
                    println!("✅ Node registered successfully!");
                }
                
                println!("This machine is now connected to your musu account.");
                println!("Start the bridge with `musu bridge` to join your fleet.");
                return Ok(());
            }
            Ok(None) => {
                // still pending
            }
            Err(e) => {
                anyhow::bail!("Login failed: {}", e);
            }
        }
    }
}

/// `musu logout` — remove the account token.
pub async fn run_logout() -> Result<()> {
    let home = musu_home();
    crate::cloud::token::delete_token(&home)?;
    println!("✅ Logged out.");
    Ok(())
}

/// `musu whoami` — check if logged in.
pub async fn run_whoami() -> Result<()> {
    let home = musu_home();
    if let Some(_token) = crate::cloud::token::load_token(&home) {
        println!("✅ You are logged in.");
    } else {
        println!("❌ Not logged in. Run `musu login`.");
    }
    Ok(())
}
