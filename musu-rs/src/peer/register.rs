use crate::peer::capability::{self, Capability};
use crate::peer::manifest::{self, NodeManifest, ServiceState};
use crate::peer::service::{self, PeerServiceContext};
use clap::{Args, Subcommand, ValueEnum};
use std::path::PathBuf;

/// `musu peer ...` subcommand action enum.
#[derive(Subcommand, Debug, Clone)]
pub enum PeerAction {
    /// Register THIS machine as a musu peer node
    Register(PeerRegisterOpts),
    /// V26-W10: manually add a remote peer address for mesh discovery
    Add(PeerAddOpts),
    /// V26-W10: remove a manually-added peer address
    Remove(PeerRemoveOpts),
    /// V26-W10: list all known peers from all sources
    List(PeerListOpts),
}

#[derive(ValueEnum, Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PeerType {
    Ollama,
    Comfyui,
    Script,
}

#[derive(Args, Debug, Clone)]
pub struct PeerRegisterOpts {
    /// Kind of worker this peer hosts. Drives capability autodetect strategy
    /// and the service-unit filename: `musu-peer-{kind}-{name}`.
    #[arg(long = "type", value_enum)]
    pub type_: PeerType,

    /// Start command for the worker process. Recorded verbatim in
    /// ~/.musu/node.toml and templated into the service unit's ExecStart.
    #[arg(long)]
    pub start: String,

    /// Friendly name for this peer. Default = hostname + "-" + kind.
    #[arg(long, value_parser = validate_peer_name)]
    pub name: Option<String>,

    /// Override the install root (`~/.musu/`). Used by tests with a tempdir.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,

    /// Validate planned writes without actually writing anything or registering.
    #[arg(long)]
    pub dry_run: bool,

    /// Optional musu.pro registry URL to POST registration to.
    #[arg(long)]
    pub registry_url: Option<String>,

    /// Ollama base URL for `--type ollama` capability probe. Default =
    /// `http://127.0.0.1:11434`.
    #[arg(long, default_value = "http://127.0.0.1:11434")]
    pub ollama_url: String,

    /// ComfyUI base URL for `--type comfyui` capability probe. Default =
    /// `http://127.0.0.1:8188`.
    #[arg(long, default_value = "http://127.0.0.1:8188")]
    pub comfyui_url: String,
}

pub fn validate_peer_name(s: &str) -> Result<String, String> {
    if s.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if s.len() > 32 {
        return Err("Name length cannot exceed 32 characters".to_string());
    }
    if s.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
    {
        Ok(s.to_string())
    } else {
        Err("Name must match ^[a-z0-9_-]{1,32}$".to_string())
    }
}

pub async fn run(action: PeerAction) -> anyhow::Result<()> {
    match action {
        PeerAction::Register(opts) => register(opts).await,
        PeerAction::Add(opts) => run_add(opts).await,
        PeerAction::Remove(opts) => run_remove(opts).await,
        PeerAction::List(opts) => run_list(opts).await,
    }
}

fn get_default_name(kind: &str) -> String {
    let host = hostname::get()
        .map(|os| os.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "localhost".to_string());

    let mut sanitized: String = host
        .chars()
        .map(|c| c.to_ascii_lowercase())
        .filter(|&c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
        .collect();

    if sanitized.is_empty() {
        sanitized = "host".to_string();
    }

    let suffix = format!("-{}", kind);
    let max_len = 32 - suffix.len();
    if sanitized.len() > max_len {
        sanitized.truncate(max_len);
    }
    sanitized.push_str(&suffix);
    sanitized
}

fn xml_escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

fn current_user_id() -> String {
    let user = std::env::var("USERNAME").unwrap_or_default();
    let domain = std::env::var("USERDOMAIN").unwrap_or_else(|_| ".".to_string());
    if user.is_empty() {
        ".\\Operator".to_string()
    } else {
        format!("{domain}\\{user}")
    }
}

fn render_linux_template(ctx: &PeerServiceContext<'_>) -> String {
    let template = r#"[Unit]
Description=MUSU peer worker — {PEER_KIND} ({PEER_NAME})
After=network.target

[Service]
Type=simple
WorkingDirectory={MUSU_HOME}
ExecStart={START_CMD}
Restart=on-failure
RestartSec=5
Environment=MUSU_HOME={MUSU_HOME}
Environment=MUSU_PEER_NAME={PEER_NAME}
Environment=MUSU_PEER_KIND={PEER_KIND}

NoNewPrivileges=true

[Install]
WantedBy=default.target
"#;
    template
        .replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
        .replace("{PEER_NAME}", ctx.peer_name)
        .replace("{PEER_KIND}", ctx.peer_kind)
        .replace("{START_CMD}", ctx.start_cmd)
}

fn render_macos_template(ctx: &PeerServiceContext<'_>) -> String {
    let escaped_start = xml_escape(ctx.start_cmd);
    let template = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.musu.peer.{PEER_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>{START_CMD}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>{MUSU_HOME}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>MUSU_HOME</key>
    <string>{MUSU_HOME}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>{MUSU_HOME}/logs/peer-{PEER_NAME}.log</string>
  <key>StandardErrorPath</key>
  <string>{MUSU_HOME}/logs/peer-{PEER_NAME}.err</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
"#;
    template
        .replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
        .replace("{PEER_NAME}", ctx.peer_name)
        .replace("{START_CMD}", &escaped_start)
}

fn render_windows_template(ctx: &PeerServiceContext<'_>) -> String {
    let user_id = current_user_id();
    let escaped_start = xml_escape(ctx.start_cmd);
    let template = r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>MUSU peer worker — {PEER_KIND} ({PEER_NAME})</Description>
    <URI>\Musu\peer-{PEER_NAME}</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{USER_ID}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{USER_ID}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>5</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c {START_CMD}</Arguments>
      <WorkingDirectory>{MUSU_HOME}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"#;
    template
        .replace("{USER_ID}", &user_id)
        .replace("{PEER_NAME}", ctx.peer_name)
        .replace("{PEER_KIND}", ctx.peer_kind)
        .replace("{START_CMD}", &escaped_start)
        .replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
}

pub async fn register(opts: PeerRegisterOpts) -> anyhow::Result<()> {
    let musu_home = crate::install::resolve_musu_home(opts.musu_home.as_deref())?;
    let distribution = crate::install::distribution::DistributionMode::current();

    let peer_name = match &opts.name {
        Some(n) => n.clone(),
        None => {
            let kind_str = match opts.type_ {
                PeerType::Ollama => "ollama",
                PeerType::Comfyui => "comfyui",
                PeerType::Script => "script",
            };
            get_default_name(kind_str)
        }
    };

    // Capability Probing
    let capability = if opts.dry_run {
        match opts.type_ {
            PeerType::Ollama => {
                eprintln!(
                    "[dry-run] would probe Ollama API tags at {}",
                    opts.ollama_url
                );
                Capability::Ollama {
                    models: vec![],
                    base_url: opts.ollama_url.clone(),
                }
            }
            PeerType::Comfyui => {
                eprintln!(
                    "[dry-run] would probe ComfyUI system stats at {}",
                    opts.comfyui_url
                );
                Capability::Comfyui {
                    port: 8188,
                    base_url: opts.comfyui_url.clone(),
                }
            }
            PeerType::Script => {
                eprintln!("[dry-run] script worker start command: {}", opts.start);
                Capability::Script {
                    cmd: opts.start.clone(),
                }
            }
        }
    } else {
        match opts.type_ {
            PeerType::Ollama => capability::probe_ollama(&opts.ollama_url).await,
            PeerType::Comfyui => capability::probe_comfyui(&opts.comfyui_url).await,
            PeerType::Script => capability::probe_script(&opts.start),
        }
    };

    let kind_str = match opts.type_ {
        PeerType::Ollama => "ollama",
        PeerType::Comfyui => "comfyui",
        PeerType::Script => "script",
    };
    let now = chrono::Utc::now().timestamp();

    let (platform_str, unit_name, state_str) = if distribution.supports_platform_service_install() {
        let platform = if cfg!(target_os = "linux") {
            "systemd"
        } else if cfg!(target_os = "macos") {
            "launchd"
        } else if cfg!(target_os = "windows") {
            "scheduled_task"
        } else {
            "none"
        };
        let unit = match platform {
            "systemd" => format!("musu-peer-{}.service", peer_name),
            "launchd" => format!("com.musu.peer.{}", peer_name),
            "scheduled_task" => format!("peer-{}", peer_name),
            _ => format!("musu-peer-{}", peer_name),
        };
        let state = if opts.dry_run {
            "dry_run"
        } else {
            "registered"
        };
        (platform.to_string(), unit, state.to_string())
    } else {
        let state = if opts.dry_run {
            "dry_run"
        } else {
            "not_installed"
        };
        (
            "package_startup".to_string(),
            "package-managed".to_string(),
            state.to_string(),
        )
    };

    let mut manifest = NodeManifest {
        name: peer_name.clone(),
        kind: kind_str.to_string(),
        start: opts.start.clone(),
        registered_at: now,
        registry_url: opts
            .registry_url
            .clone()
            .or_else(|| std::env::var("MUSU_REGISTRY_URL").ok()),
        musu_pro_node_id: None,
        capability: vec![capability.clone()],
        service: ServiceState {
            platform: platform_str.clone(),
            unit_name: unit_name.clone(),
            state: state_str.clone(),
            registered_at: now,
        },
    };

    if opts.dry_run {
        let manifest_toml = toml::to_string_pretty(&manifest)?;
        eprintln!(
            "[dry-run] would write ~/.musu/node.toml:\n{}",
            manifest_toml
        );

        let mock_ctx = PeerServiceContext {
            musu_home: &musu_home,
            peer_name: &peer_name,
            peer_kind: kind_str,
            start_cmd: &opts.start,
            capability: &manifest.capability,
            unit_dir_override: opts.musu_home.as_deref(),
        };

        if !distribution.supports_platform_service_install() {
            eprintln!(
                "[dry-run] packaged Store/MSIX runtime detected: would write ~/.musu/node.toml, but would NOT register a raw platform service or Scheduled Task. Peer startup must come from a package-aware startup path."
            );
        } else if cfg!(target_os = "linux") {
            let body = render_linux_template(&mock_ctx);
            eprintln!("[dry-run] would write systemd unit:\n{}", body);
        } else if cfg!(target_os = "macos") {
            let body = render_macos_template(&mock_ctx);
            eprintln!("[dry-run] would write macOS plist:\n{}", body);
        } else if cfg!(target_os = "windows") {
            let body = render_windows_template(&mock_ctx);
            eprintln!("[dry-run] would write Scheduled Task XML:\n{}", body);
        } else {
            eprintln!("[dry-run] platform not supported");
        }
        return Ok(());
    }

    let _lock = manifest::PeerLock::acquire(&musu_home)?;

    manifest::write(&musu_home, &manifest)?;
    tracing::info!("node.toml written successfully");

    let ctx = PeerServiceContext {
        musu_home: &musu_home,
        peer_name: &peer_name,
        peer_kind: kind_str,
        start_cmd: &opts.start,
        capability: &manifest.capability,
        unit_dir_override: opts.musu_home.as_deref(),
    };

    if distribution.supports_platform_service_install() {
        service::register(&ctx)?;
        tracing::info!("peer service registered and started");
    } else {
        tracing::info!(
            distribution = distribution.as_str(),
            "skipping peer platform service registration for packaged Store/MSIX runtime"
        );
    }

    if let Some(ref registry_url) = manifest.registry_url {
        let auth_token = std::env::var("MUSU_TOKEN")
            .ok()
            .or_else(|| crate::install::token::read_bridge_token(&musu_home));

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("reqwest client build");

        let mut req = client.post(registry_url).json(&serde_json::json!({
            "name": manifest.name,
            "kind": manifest.kind,
            "capability": manifest.capability,
            "start": manifest.start,
            "tailscale_ip": serde_json::Value::Null,
        }));

        if let Some(token) = auth_token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        match req.send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    if let Ok(j) = resp.json::<serde_json::Value>().await {
                        if let Some(node_id) = j.get("node_id").and_then(|id| id.as_str()) {
                            manifest.musu_pro_node_id = Some(node_id.to_string());
                            if let Err(e) = manifest::write(&musu_home, &manifest) {
                                tracing::warn!("failed to write node_id to node.toml: {}", e);
                            } else {
                                tracing::info!(node_id, "registered successfully with musu.pro");
                            }
                        }
                    }
                } else {
                    tracing::warn!("musu.pro registration failed with status {}", resp.status());
                }
            }
            Err(e) => {
                tracing::warn!("failed to send registration to musu.pro: {}", e);
            }
        }
    }

    tracing::info!("node.toml written; bridge will pick up on next sync (W10). For now, GET /api/nodes self-row is unchanged until W10 SHIP.");

    Ok(())
}

// ── V26-W10: `musu peer add/remove/list` ────────────────────────────

#[derive(Args, Debug, Clone)]
pub struct PeerAddOpts {
    /// Address of the remote peer (e.g., "192.168.1.50:8070" or "10.0.0.5:8070").
    pub addr: String,

    /// Optional human-readable name for this peer.
    #[arg(long)]
    pub name: Option<String>,

    /// musu home directory override (for tests).
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PeerRemoveOpts {
    /// Address of the peer to remove.
    pub addr: String,

    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PeerListOpts {
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

fn resolve_musu_home_for_peer(override_: Option<&PathBuf>) -> anyhow::Result<PathBuf> {
    if let Some(p) = override_ {
        return Ok(p.clone());
    }
    crate::install::resolve_musu_home_from_env()
}

async fn run_add(opts: PeerAddOpts) -> anyhow::Result<()> {
    let musu_home = resolve_musu_home_for_peer(opts.musu_home.as_ref())?;
    std::fs::create_dir_all(&musu_home)?;

    crate::peer::discovery::validate_peer_addr(&opts.addr)
        .map_err(|e| anyhow::anyhow!("invalid peer address: {e}"))?;

    let mut list = crate::peer::discovery::ManualPeerList::load(&musu_home);
    list.add(opts.addr.clone(), opts.name.clone());
    list.save(&musu_home)?;

    println!(
        "✓ Added peer {} (name: {})",
        opts.addr,
        opts.name.as_deref().unwrap_or("<auto>")
    );
    println!(
        "  Stored in {}",
        musu_home.join("manual_peers.toml").display()
    );
    Ok(())
}

async fn run_remove(opts: PeerRemoveOpts) -> anyhow::Result<()> {
    let musu_home = resolve_musu_home_for_peer(opts.musu_home.as_ref())?;

    crate::peer::discovery::validate_peer_addr(&opts.addr)
        .map_err(|e| anyhow::anyhow!("invalid peer address: {e}"))?;

    let mut list = crate::peer::discovery::ManualPeerList::load(&musu_home);
    if list.remove(&opts.addr) {
        list.save(&musu_home)?;
        println!("✓ Removed peer {}", opts.addr);
    } else {
        println!("⚠ Peer {} not found in manual peer list", opts.addr);
    }
    Ok(())
}

async fn run_list(opts: PeerListOpts) -> anyhow::Result<()> {
    let musu_home = resolve_musu_home_for_peer(opts.musu_home.as_ref())?;

    let peers = crate::peer::discovery::resolve_all_peers(&musu_home);

    if peers.is_empty() {
        println!("No peers found. Use `musu peer add <addr>` to add a peer manually.");
        return Ok(());
    }

    println!("{:<25} {:<15} {:<10}", "ADDR", "NAME", "SOURCE");
    println!("{}", "-".repeat(50));
    for peer in &peers {
        println!(
            "{:<25} {:<15} {:?}",
            peer.addr,
            peer.name.as_deref().unwrap_or("-"),
            peer.source,
        );
    }
    println!("\nTotal: {} peer(s)", peers.len());
    Ok(())
}
