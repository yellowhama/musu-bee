use anyhow::{anyhow, Result};
use clap::{Args, Subcommand};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

const PRIVATE_MESH_CONFIG: &str = "private_mesh.toml";
const DEVICE_ADD_PASS_EXPIRES_AFTER_SECONDS: i64 = 3600;
const DEVICE_ADD_PASS_CREATED_AT_FUTURE_SKEW_SECONDS: i64 = 300;
const PHYSICAL_PEER_EVIDENCE_MAX_AGE_SECONDS: i64 = 86_400;
const PHYSICAL_PEER_EVIDENCE_FUTURE_SKEW_SECONDS: i64 = 300;
const CREATE_JOIN_KEY_HELPER_TIMEOUT: Duration = Duration::from_secs(45);
const START_CONTROL_CONFIG_TIMEOUT: Duration = Duration::from_secs(15);
const START_CONTROL_UP_TIMEOUT: Duration = Duration::from_secs(90);
const START_CONTROL_HEALTH_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Subcommand, Debug)]
pub enum PrivateMeshAction {
    /// Show this machine's MUSU Private Mesh state.
    Status(PrivateMeshStatusOpts),
    /// Diagnose mesh setup and print actionable next steps.
    Doctor(PrivateMeshStatusOpts),
    /// Generate a self-hosted Headscale control-plane deployment bundle.
    Bootstrap(PrivateMeshBootstrapOpts),
    /// Start the generated control-plane bundle (docker compose up) and confirm
    /// Headscale is healthy, so the cockpit's "Start control host" button can
    /// bring the mesh online without the operator running docker by hand.
    StartControlHost(PrivateMeshStartControlHostOpts),
    /// Mint a one-use device-add pass (Headscale preauth key) from a running
    /// control-plane bundle, so the cockpit's "Add PC" button can issue a pass
    /// without the operator running scripts/create-join-key by hand.
    CreateJoinKey(PrivateMeshCreateJoinKeyOpts),
    /// Join this machine to MUSU Private Mesh through a Headscale login server.
    Join(PrivateMeshJoinOpts),
    /// Verify a target peer over MUSU Private Mesh and update local evidence.
    Verify(PrivateMeshVerifyOpts),
    /// Write physical-peer evidence from this target machine for release proof.
    PhysicalPeerEvidence(PrivateMeshPhysicalPeerEvidenceOpts),
    /// Run target-bound ping, bridge health, delegated task, callback, and evidence proof.
    ReleaseProof(PrivateMeshReleaseProofOpts),
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshStatusOpts {
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshBootstrapOpts {
    /// Public Headscale control server URL, for example https://mesh.example.com.
    #[arg(long)]
    pub server_url: String,
    /// Directory where the deployment bundle is written.
    #[arg(long)]
    pub output: Option<PathBuf>,
    /// Tailnet/user name created in Headscale for this MUSU owner.
    #[arg(long, default_value = "musu")]
    pub tailnet_name: String,
    /// MagicDNS base domain exposed to clients.
    #[arg(long, default_value = "musu.private")]
    pub base_domain: String,
    /// Headscale container image to use. Keep this pinned; do not ship `latest`.
    #[arg(long, default_value = "ghcr.io/juanfont/headscale:v0.28.0")]
    pub image: String,
    /// Bind Headscale's client port on 0.0.0.0 instead of localhost.
    #[arg(long)]
    pub expose_public: bool,
    /// Disable Headscale embedded DERP. Use only if you provide another MUSU/operator DERP path.
    #[arg(long)]
    pub disable_embedded_derp: bool,
    /// Public IPv4 address for the embedded DERP map entry.
    #[arg(long)]
    pub derp_ipv4: Option<String>,
    /// Public IPv6 address for the embedded DERP map entry.
    #[arg(long)]
    pub derp_ipv6: Option<String>,
    /// Keep the upstream Tailscale DERP map as a temporary fallback.
    #[arg(long)]
    pub keep_tailscale_derp: bool,
    /// Allow an http:// server_url for local lab use. Production should use HTTPS.
    #[arg(long)]
    pub allow_insecure_http: bool,
    /// Overwrite an existing generated bundle.
    #[arg(long)]
    pub force: bool,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshCreateJoinKeyOpts {
    /// Control-plane bundle directory (the one `mesh bootstrap` wrote). Defaults
    /// to `~/.musu/private-mesh-control-plane`.
    #[arg(long)]
    pub bundle_dir: Option<PathBuf>,
    /// Emit machine-readable JSON (the cockpit Add PC button uses this).
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshStartControlHostOpts {
    /// Control-plane bundle directory (the one `mesh bootstrap` wrote). Defaults
    /// to `~/.musu/private-mesh-control-plane`.
    #[arg(long)]
    pub bundle_dir: Option<PathBuf>,
    /// Emit machine-readable JSON (the cockpit Start control host button uses this).
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshJoinOpts {
    /// Headscale-compatible control server URL. Use this or --device-add-pass; plain tailscale login is never used.
    #[arg(long)]
    pub login_server: Option<String>,
    /// Optional preauth key generated by the MUSU/Headscale control plane.
    #[arg(long)]
    pub authkey: Option<String>,
    /// MUSU device-add pass file path generated by the control-plane helper.
    #[arg(long)]
    pub device_add_pass: Option<String>,
    /// Human-readable node name to persist in MUSU's local mesh state.
    #[arg(long)]
    pub node_name: Option<String>,
    /// Owner id to persist in local state.
    #[arg(long)]
    pub owner_id: Option<String>,
    /// Tailnet id to persist in local state.
    #[arg(long)]
    pub tailnet_id: Option<String>,
    /// Skip the control server /health check. This never marks the server verified.
    #[arg(long)]
    pub skip_control_health: bool,
    /// Do not execute the compatible mesh client; only write MUSU local state.
    #[arg(long)]
    pub dry_run: bool,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Debug, Clone)]
struct ResolvedJoinInputs {
    login_server: String,
    authkey: Option<String>,
    device_add_pass_used: bool,
    device_add_pass_path: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshVerifyOpts {
    /// Target peer tailnet IPv4 address in 100.64.0.0/10.
    #[arg(long)]
    pub target_ip: String,
    /// Target MUSU bridge port.
    #[arg(long, default_value_t = 8070)]
    pub bridge_port: u16,
    /// Skip tailscale ping; useful only for tests or when ping was proven externally.
    #[arg(long)]
    pub skip_ping: bool,
    /// Skip target bridge /health.
    #[arg(long)]
    pub skip_health: bool,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshPhysicalPeerEvidenceOpts {
    /// File path to write. Defaults under MUSU_HOME/private-mesh-physical-peer-evidence.
    #[arg(long)]
    pub output: Option<PathBuf>,
    /// Emit machine-readable JSON report.
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Args, Debug, Clone)]
pub struct PrivateMeshReleaseProofOpts {
    /// Target peer node name as shown in the MUSU fleet.
    #[arg(long)]
    pub target_node: String,
    /// Target peer tailnet IPv4 address in 100.64.0.0/10.
    #[arg(long)]
    pub target_ip: String,
    /// Target MUSU bridge port.
    #[arg(long, default_value_t = 8070)]
    pub bridge_port: u16,
    /// Local source bridge URL. Defaults to this machine's registered local bridge URL.
    #[arg(long)]
    pub source_bridge_url: Option<String>,
    /// Explicit target bridge URL to register before delegation.
    #[arg(long)]
    pub target_url: Option<String>,
    /// Expected Headscale-compatible control server URL.
    #[arg(long)]
    pub expected_control_server_url: Option<String>,
    /// Bridge bearer token. Defaults to MUSU_BRIDGE_TOKEN/MUSU_TOKEN/bridge.env.
    #[arg(long)]
    pub token: Option<String>,
    /// Maximum seconds to wait for delegated task callback.
    #[arg(long, default_value_t = 120)]
    pub timeout_sec: u64,
    /// Directory where release proof artifacts are written.
    #[arg(long)]
    pub evidence_root: Option<PathBuf>,
    /// JSON file generated on the target PC by `musu mesh physical-peer-evidence`.
    ///
    /// This is intentionally separate from node/IP distinctness: two local
    /// bridge instances can have different names and tailnet IPs without
    /// proving separate hardware.
    #[arg(long)]
    pub physical_peer_evidence: Option<PathBuf>,
    /// Emit machine-readable JSON.
    #[arg(long)]
    pub json: bool,
    /// Override the install root (`~/.musu/`). Used by tests and smoke scripts.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct PrivateMeshConfig {
    pub mesh: PrivateMeshConfigMesh,
    #[serde(default)]
    pub verification: PrivateMeshConfigVerification,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct PrivateMeshConfigMesh {
    pub mode: MeshMode,
    pub control_server_url: Option<String>,
    pub owner_id: Option<String>,
    pub tailnet_id: Option<String>,
    pub node_name: Option<String>,
    pub client_kind: Option<String>,
    pub derp_policy: Option<String>,
    pub last_verified_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default, PartialEq, Eq)]
pub struct PrivateMeshConfigVerification {
    pub local_tailnet_ip: Option<String>,
    pub verified_target_tailnet_ip: Option<String>,
    pub callback_tailnet_ip: Option<String>,
    pub control_server_verified: Option<bool>,
    pub tailscale_ping_verified: Option<bool>,
    pub bridge_health_verified: Option<bool>,
    pub callback_verified: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MeshMode {
    LocalLan,
    MusuHeadscale,
    ExternalTailscaleOptIn,
}

impl MeshMode {
    fn as_str(self) -> &'static str {
        match self {
            MeshMode::LocalLan => "local_lan",
            MeshMode::MusuHeadscale => "musu_headscale",
            MeshMode::ExternalTailscaleOptIn => "external_tailscale_opt_in",
        }
    }
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshCommandReport {
    pub found: bool,
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshStatusReport {
    pub schema: &'static str,
    pub product_name: &'static str,
    pub mode: String,
    pub route_label: String,
    pub account_requirement: String,
    pub config_path: String,
    pub config_present: bool,
    pub control_server_url: Option<String>,
    pub control_server_verified: bool,
    pub derp_policy: Option<String>,
    pub derp_readiness: String,
    pub derp_probe_command: Option<PrivateMeshCommandReport>,
    pub derp_probe_ok: bool,
    pub local_tailnet_ip: Option<String>,
    pub verified_target_tailnet_ip: Option<String>,
    pub callback_tailnet_ip: Option<String>,
    pub target_callback_match: bool,
    pub compatible_client_found: bool,
    pub client_ip_command: PrivateMeshCommandReport,
    pub client_status_command: PrivateMeshCommandReport,
    pub verification: PrivateMeshVerificationStatus,
    pub warnings: Vec<String>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshJoinReport {
    pub schema: &'static str,
    pub product_name: &'static str,
    pub mode: &'static str,
    pub device_add_pass_used: bool,
    pub device_add_pass_consumed: bool,
    pub device_add_pass_consumed_path: Option<String>,
    pub device_add_pass_cleanup_error: Option<String>,
    pub login_server: String,
    pub control_server_health_url: String,
    pub control_server_health_ok: bool,
    pub control_server_health_status: Option<u16>,
    pub control_server_verified: bool,
    pub config_path: String,
    pub dry_run: bool,
    pub command: Option<PrivateMeshCommandReport>,
    pub local_tailnet_ip: Option<String>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshBootstrapReport {
    pub schema: &'static str,
    pub product_name: &'static str,
    pub server_url: String,
    pub output_dir: String,
    pub tailnet_name: String,
    pub base_domain: String,
    pub embedded_derp_enabled: bool,
    pub derp_public_ipv4: Option<String>,
    pub derp_public_ipv6: Option<String>,
    pub upstream_tailscale_derp_enabled: bool,
    pub caddy_reverse_proxy_enabled: bool,
    pub caddy_https_port: Option<u16>,
    pub generated_files: Vec<String>,
    pub commands: Vec<String>,
    pub warnings: Vec<String>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshVerifyReport {
    pub schema: &'static str,
    pub product_name: &'static str,
    pub target_ip: String,
    pub target_bridge_health_url: String,
    pub derp_readiness: String,
    pub derp_private_declared: bool,
    pub ping: PrivateMeshCommandReport,
    pub bridge_health_ok: bool,
    pub bridge_health_status: Option<u16>,
    pub callback_verified: bool,
    pub callback_tailnet_ip: Option<String>,
    pub target_callback_match: bool,
    pub release_grade: bool,
    pub config_path: String,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshPhysicalPeerEvidenceReport {
    pub schema: &'static str,
    pub product_name: &'static str,
    pub ok: bool,
    pub evidence_path: String,
    pub evidence_sha256_path: String,
    pub node_name: String,
    pub tailnet_ip: String,
    pub control_server_url: String,
    pub hostname: String,
    pub control_server_verified: bool,
    pub physical_peer_verified: bool,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct PrivateMeshReleaseProofReport {
    pub schema: &'static str,
    pub product_name: &'static str,
    pub ok: bool,
    pub target_node: String,
    pub target_ip: String,
    pub expected_control_server_url: Option<String>,
    pub evidence_root: String,
    pub evidence_path: String,
    pub verification_path: String,
    pub verification_sha256_path: String,
    pub completed_at: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct PrivateMeshVerificationStatus {
    pub tailscale_ping_verified: bool,
    pub bridge_health_verified: bool,
    pub callback_verified: bool,
    pub target_callback_match: bool,
    pub derp_private_declared: bool,
    pub release_grade: bool,
}

pub async fn run(action: PrivateMeshAction) -> Result<()> {
    match action {
        PrivateMeshAction::Status(opts) => run_status(opts, false).await,
        PrivateMeshAction::Doctor(opts) => run_status(opts, true).await,
        PrivateMeshAction::Bootstrap(opts) => run_bootstrap(opts).await,
        PrivateMeshAction::StartControlHost(opts) => run_start_control_host(opts).await,
        PrivateMeshAction::CreateJoinKey(opts) => run_create_join_key(opts).await,
        PrivateMeshAction::Join(opts) => run_join(opts).await,
        PrivateMeshAction::Verify(opts) => run_verify(opts).await,
        PrivateMeshAction::PhysicalPeerEvidence(opts) => run_physical_peer_evidence(opts).await,
        PrivateMeshAction::ReleaseProof(opts) => run_release_proof(opts).await,
    }
}

async fn run_status(opts: PrivateMeshStatusOpts, doctor: bool) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let mut report = build_status_report(&home);
    if doctor {
        attach_derp_doctor_probe(&mut report);
    }
    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_human_status(&report, doctor);
    }
    Ok(())
}

async fn run_bootstrap(opts: PrivateMeshBootstrapOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let report = write_bootstrap_bundle(&opts, &home)?;
    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("MUSU Private Mesh control-plane bundle");
        println!("  output: {}", report.output_dir);
        println!("  server_url: {}", report.server_url);
        println!("  tailnet: {}", report.tailnet_name);
        println!();
        println!("Generated files:");
        for file in &report.generated_files {
            println!("  - {file}");
        }
        println!();
        println!("Commands:");
        for command in &report.commands {
            println!("  - {command}");
        }
        if !report.warnings.is_empty() {
            println!();
            println!("Warnings:");
            for warning in &report.warnings {
                println!("  - {warning}");
            }
        }
        println!();
        println!("Next steps:");
        for step in &report.next_steps {
            println!("  - {step}");
        }
    }
    Ok(())
}

/// Run the bundle's `create-join-key` helper to mint a one-use device-add pass
/// from the running Headscale control plane, then report the generated pass
/// file. This is what the cockpit's "Issue device-add pass" button calls, so
/// adding a PC never requires the operator to run the helper script by hand.
async fn run_create_join_key(opts: PrivateMeshCreateJoinKeyOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let bundle_dir = opts
        .bundle_dir
        .clone()
        .unwrap_or_else(|| home.join("private-mesh-control-plane"));

    if !bundle_dir.is_dir() {
        anyhow::bail!(
            "control-plane bundle not found at {}. Generate it first (Add PC → Generate bundle / `musu mesh bootstrap`).",
            bundle_dir.display()
        );
    }
    let scripts_dir = bundle_dir.join("scripts");
    let passes_before = list_device_add_passes(&bundle_dir);

    // Run the platform helper. The helper itself talks to the running Headscale
    // container (`docker compose exec -T headscale headscale preauthkeys create`)
    // and writes a musu.device_add.v1 file under device-add-passes/.
    #[cfg(windows)]
    let (program, args): (&str, Vec<String>) = (
        "powershell",
        vec![
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-File".to_string(),
            scripts_dir
                .join("create-join-key.ps1")
                .to_string_lossy()
                .into_owned(),
        ],
    );
    #[cfg(not(windows))]
    let (program, args): (&str, Vec<String>) = (
        "sh",
        vec![scripts_dir
            .join("create-join-key.sh")
            .to_string_lossy()
            .into_owned()],
    );

    let mut command = tokio::process::Command::new(program);
    command.args(&args).current_dir(&bundle_dir);
    command.kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = tokio::time::timeout(CREATE_JOIN_KEY_HELPER_TIMEOUT, command.output())
        .await
        .map_err(|_| {
            anyhow!(
                "create-join-key helper timed out after {} seconds. Check Docker/Headscale, then retry from Add PC.",
                CREATE_JOIN_KEY_HELPER_TIMEOUT.as_secs()
            )
        })?
        .map_err(|err| anyhow!("failed to run create-join-key helper: {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        anyhow::bail!(
            "create-join-key helper failed. Is the Headscale control plane running (Add PC → Start the control host)?\n{stderr}{stdout}"
        );
    }

    // Only a pass file created by this run is safe to surface. Falling back to
    // an older file would make the cockpit copy a stale or already-consumed key.
    let passes_after = list_device_add_passes(&bundle_dir);
    let new_pass = passes_after
        .iter()
        .find(|p| !passes_before.contains(*p))
        .cloned()
        .ok_or_else(|| {
            anyhow!("create-join-key helper ran but no new device-add pass file was produced")
        })?;

    let pass_value = read_device_add_pass(&new_pass.to_string_lossy())?;
    let field = |k: &str| {
        pass_value
            .get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let result = serde_json::json!({
        "schema": "musu.create_join_key.v1",
        "ok": true,
        "pass_path": new_pass.to_string_lossy(),
        "login_server": field("login_server"),
        "tailnet": field("tailnet"),
        "created_at_utc": field("created_at_utc"),
        "expires_after_seconds": pass_value.get("expires_after_seconds").and_then(|v| v.as_i64()).unwrap_or(0),
        "one_time_key": pass_value.get("one_time_key").and_then(|v| v.as_bool()).unwrap_or(false),
        "join_command": field("join_command"),
        "operator_instruction": field("operator_instruction"),
    });

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        println!("MUSU device-add pass minted.");
        println!("  pass file: {}", new_pass.display());
        println!("  login server: {}", field("login_server"));
        println!("  expires in: 1 hour, one-time use.");
        println!();
        println!("Copy that file to the target PC, then run:");
        println!("  musu mesh join --device-add-pass <musu.device_add.v1.json>");
    }
    Ok(())
}

/// List existing `device-add-passes/*.json` files in a bundle, sorted, so the
/// caller can detect the newly-minted one.
fn list_device_add_passes(bundle_dir: &std::path::Path) -> Vec<PathBuf> {
    let dir = bundle_dir.join("device-add-passes");
    let mut out: Vec<PathBuf> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    out.sort();
    out
}

/// Bring the generated control-plane bundle online: `docker compose up -d` then
/// confirm Headscale is healthy. This is what the cockpit's "Start control host"
/// button calls, so the operator never has to run docker by hand.
async fn run_start_control_host(opts: PrivateMeshStartControlHostOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let bundle_dir = opts
        .bundle_dir
        .clone()
        .unwrap_or_else(|| home.join("private-mesh-control-plane"));

    if !bundle_dir.is_dir() {
        anyhow::bail!(
            "control-plane bundle not found at {}. Generate it first (Add PC → Generate bundle / `musu mesh bootstrap`).",
            bundle_dir.display()
        );
    }

    // Run a `docker compose` step in the bundle dir, returning (success, output).
    async fn compose_step(
        bundle_dir: &std::path::Path,
        args: &[&str],
        timeout: Duration,
    ) -> (bool, String) {
        let mut command = tokio::process::Command::new("docker");
        command
            .arg("compose")
            .args(args)
            .current_dir(bundle_dir)
            .kill_on_drop(true);
        match tokio::time::timeout(timeout, command.output()).await {
            Ok(Ok(out)) => {
                let mut combined = String::from_utf8_lossy(&out.stdout).into_owned();
                combined.push_str(&String::from_utf8_lossy(&out.stderr));
                (out.status.success(), combined.trim().to_string())
            }
            Ok(Err(err)) => (false, format!("failed to run docker compose: {err}")),
            Err(_) => (
                false,
                format!(
                    "docker compose {} timed out after {} seconds",
                    args.join(" "),
                    timeout.as_secs()
                ),
            ),
        }
    }

    // 1) Validate the compose file before starting anything.
    let (config_ok, config_out) = compose_step(
        &bundle_dir,
        &["config", "--quiet"],
        START_CONTROL_CONFIG_TIMEOUT,
    )
    .await;
    if !config_ok {
        let result = serde_json::json!({
            "schema": "musu.start_control_host.v1",
            "ok": false,
            "stage": "config",
            "error": format!("docker compose config failed. Is Docker installed and running?\n{config_out}"),
        });
        emit_start_control_host(opts.json, &bundle_dir, &result);
        return Ok(());
    }

    // 2) Start the stack detached.
    let (up_ok, up_out) = compose_step(&bundle_dir, &["up", "-d"], START_CONTROL_UP_TIMEOUT).await;
    if !up_ok {
        let result = serde_json::json!({
            "schema": "musu.start_control_host.v1",
            "ok": false,
            "stage": "up",
            "error": format!("docker compose up -d failed.\n{up_out}"),
        });
        emit_start_control_host(opts.json, &bundle_dir, &result);
        return Ok(());
    }

    // 3) Confirm Headscale is healthy. Give the container a few seconds to boot
    //    before the first probe, then retry briefly.
    let mut health_ok = false;
    let mut health_out = String::new();
    for attempt in 0..6 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
        let (ok, out) = compose_step(
            &bundle_dir,
            &["exec", "-T", "headscale", "headscale", "health"],
            START_CONTROL_HEALTH_TIMEOUT,
        )
        .await;
        health_out = out;
        if ok {
            health_ok = true;
            break;
        }
    }

    let result = serde_json::json!({
        "schema": "musu.start_control_host.v1",
        "ok": health_ok,
        "stage": if health_ok { "healthy" } else { "health" },
        "bundle_dir": bundle_dir.to_string_lossy(),
        "error": if health_ok { serde_json::Value::Null } else {
            serde_json::Value::String(format!(
                "Headscale started but did not report healthy yet.\n{health_out}"
            ))
        },
    });
    emit_start_control_host(opts.json, &bundle_dir, &result);
    Ok(())
}

fn emit_start_control_host(json: bool, bundle_dir: &std::path::Path, result: &serde_json::Value) {
    if json {
        if let Ok(s) = serde_json::to_string_pretty(result) {
            println!("{s}");
        }
    } else if result.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        println!("MUSU Private Mesh control host is up and healthy.");
        println!("  bundle: {}", bundle_dir.display());
        println!("  next: Add PC → Issue device-add pass.");
    } else {
        println!("Could not bring the control host up.");
        if let Some(err) = result.get("error").and_then(|v| v.as_str()) {
            println!("{err}");
        }
    }
}

fn resolve_join_inputs(opts: &PrivateMeshJoinOpts) -> Result<ResolvedJoinInputs> {
    if let Some(pass) = opts.device_add_pass.as_deref() {
        if opts.login_server.is_some() || opts.authkey.is_some() {
            return Err(anyhow!(
                "--device-add-pass must not be combined with --login-server or --authkey; the pass owns the join tuple"
            ));
        }
        let value = read_device_add_pass(pass)?;
        let mut inputs = join_inputs_from_device_add_pass(&value)?;
        if !pass.trim().starts_with('{') {
            inputs.device_add_pass_path = Some(PathBuf::from(pass.trim()));
        }
        return Ok(inputs);
    }

    let Some(login_server) = opts.login_server.as_deref() else {
        return Err(anyhow!(
            "either --device-add-pass <json-or-path> or --login-server <url> is required"
        ));
    };

    Ok(ResolvedJoinInputs {
        login_server: login_server.to_string(),
        authkey: opts.authkey.clone(),
        device_add_pass_used: false,
        device_add_pass_path: None,
    })
}

fn read_device_add_pass(input: &str) -> Result<serde_json::Value> {
    let trimmed = input.trim();
    if trimmed.starts_with('{') {
        let value: serde_json::Value = serde_json::from_str(trimmed)
            .map_err(|err| anyhow!("--device-add-pass is not valid JSON: {err}"))?;
        if value
            .get("authkey")
            .and_then(|item| item.as_str())
            .map(str::trim)
            .is_some_and(|item| !item.is_empty())
        {
            return Err(anyhow!(
                "--device-add-pass with authkey must be a file path, not inline JSON; save the musu.device_add.v1 pass and pass its path so the secret does not leak through shell history or process arguments"
            ));
        }
        return Ok(value);
    }

    let path = Path::new(trimmed);
    let body = fs::read_to_string(path).map_err(|err| {
        anyhow!(
            "--device-add-pass must be JSON or a readable file path; failed to read {}: {err}",
            path.display()
        )
    })?;
    // The Windows create-join-key.ps1 helper writes the pass file as UTF-8 with a
    // BOM; serde_json rejects a leading BOM ("expected value at line 1 column 1").
    // Strip it (and any surrounding whitespace) before parsing.
    let body = body.trim_start_matches('\u{feff}').trim();
    serde_json::from_str(body).map_err(|err| {
        anyhow!(
            "--device-add-pass file is not valid JSON at {}: {err}",
            path.display()
        )
    })
}

fn join_inputs_from_device_add_pass(value: &serde_json::Value) -> Result<ResolvedJoinInputs> {
    if value.get("schema").and_then(|item| item.as_str()) != Some("musu.device_add.v1") {
        return Err(anyhow!(
            "--device-add-pass must use schema musu.device_add.v1"
        ));
    }

    validate_device_add_pass_one_time(value)?;
    validate_device_add_pass_expiry(value)?;

    let login_server = value
        .get("login_server")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .ok_or_else(|| anyhow!("--device-add-pass is missing login_server"))?;

    let authkey = value
        .get("authkey")
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string);

    if authkey.is_none() {
        return Err(anyhow!(
            "--device-add-pass is missing authkey; create a fresh pass with scripts/create-join-key"
        ));
    }

    Ok(ResolvedJoinInputs {
        login_server: login_server.to_string(),
        authkey,
        device_add_pass_used: true,
        device_add_pass_path: None,
    })
}

fn validate_device_add_pass_one_time(value: &serde_json::Value) -> Result<()> {
    if value.get("one_time_key").and_then(|item| item.as_bool()) != Some(true) {
        return Err(anyhow!(
            "--device-add-pass must declare one_time_key=true; create a fresh one-use pass with scripts/create-join-key"
        ));
    }
    if value.get("reusable").and_then(|item| item.as_bool()) != Some(false) {
        return Err(anyhow!(
            "--device-add-pass reusable=true is not allowed; create a fresh one-use pass with scripts/create-join-key"
        ));
    }
    Ok(())
}

fn validate_device_add_pass_expiry(value: &serde_json::Value) -> Result<()> {
    let Some(created_at) = value.get("created_at_utc").and_then(|item| item.as_str()) else {
        return Err(anyhow!(
            "--device-add-pass is missing created_at_utc; create a fresh pass with scripts/create-join-key"
        ));
    };
    let expires_after = value
        .get("expires_after_seconds")
        .and_then(|item| item.as_i64())
        .ok_or_else(|| {
            anyhow!(
                "--device-add-pass is missing expires_after_seconds; create a fresh pass with scripts/create-join-key"
            )
        })?;
    if expires_after <= 0 {
        return Err(anyhow!(
            "--device-add-pass expires_after_seconds must be positive"
        ));
    }
    if expires_after != DEVICE_ADD_PASS_EXPIRES_AFTER_SECONDS {
        return Err(anyhow!(
            "--device-add-pass expires_after_seconds must be {}",
            DEVICE_ADD_PASS_EXPIRES_AFTER_SECONDS
        ));
    }

    let created = chrono::DateTime::parse_from_rfc3339(created_at)
        .map_err(|err| anyhow!("--device-add-pass created_at_utc is not valid RFC3339: {err}"))?
        .with_timezone(&chrono::Utc);
    let now = chrono::Utc::now();
    let max_created_at =
        now + chrono::Duration::seconds(DEVICE_ADD_PASS_CREATED_AT_FUTURE_SKEW_SECONDS);
    if created > max_created_at {
        return Err(anyhow!(
            "--device-add-pass created_at_utc is too far in the future; allowed clock skew is {} seconds",
            DEVICE_ADD_PASS_CREATED_AT_FUTURE_SKEW_SECONDS
        ));
    }
    let expires_at = created + chrono::Duration::seconds(expires_after);
    if now > expires_at {
        return Err(anyhow!(
            "--device-add-pass expired at {}; create a fresh pass with scripts/create-join-key",
            expires_at.to_rfc3339()
        ));
    }
    Ok(())
}

fn consume_device_add_pass_file(path: &Path) -> Result<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|item| item.to_str())
        .ok_or_else(|| {
            anyhow!(
                "device-add pass path has no valid file name: {}",
                path.display()
            )
        })?;
    let consumed_at = chrono::Utc::now();
    let marker_name = format!(
        "{}.used-{}",
        file_name,
        consumed_at.format("%Y%m%dT%H%M%SZ")
    );
    let marker_path = path.with_file_name(marker_name);
    let pass_bytes = fs::read(path).map_err(|err| {
        anyhow!(
            "failed to read consumed device-add pass {}: {err}",
            path.display()
        )
    })?;
    let pass_sha256 = Sha256::digest(&pass_bytes);
    let marker = serde_json::json!({
        "schema": "musu.device_add.consumed.v1",
        "original_file_name": file_name,
        "original_sha256": format!("{:x}", pass_sha256),
        "consumed_at_utc": consumed_at.to_rfc3339(),
        "redacted": true,
        "secret_material_retained": false
    });
    fs::write(
        &marker_path,
        format!("{}\n", serde_json::to_string_pretty(&marker)?),
    )
    .map_err(|err| {
        anyhow!(
            "failed to write redacted consumed device-add pass marker {}: {err}",
            marker_path.display()
        )
    })?;
    fs::remove_file(path).map_err(|err| {
        let _ = fs::remove_file(&marker_path);
        anyhow!(
            "failed to delete consumed device-add pass {}; redacted marker was removed: {err}",
            path.display()
        )
    })?;
    Ok(marker_path)
}

async fn run_join(opts: PrivateMeshJoinOpts) -> Result<()> {
    let join_inputs = resolve_join_inputs(&opts)?;
    let login_server = normalize_login_server(&join_inputs.login_server)?;
    let control_server_health_url = control_server_health_url(&login_server)?;
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let config_path = home.join(PRIVATE_MESH_CONFIG);
    let (control_server_health_ok, control_server_health_status) = if opts.dry_run
        || opts.skip_control_health
    {
        (false, None)
    } else {
        let result = check_bridge_health(&control_server_health_url).await;
        if !result.0 {
            return Err(anyhow!(
                    "Headscale control server health check failed at {}; verify DNS, HTTPS, Caddy/reverse proxy, and /health before joining. Use --skip-control-health only for lab debugging; skipped health is not release-grade proof.",
                    control_server_health_url
                ));
        }
        result
    };
    let command = if opts.dry_run {
        None
    } else {
        let report = run_tail_command_owned(join_tail_args(
            &login_server,
            join_inputs.authkey.as_deref(),
        ));
        if !report.found {
            return Err(anyhow!(
                "compatible mesh client CLI not found; install it, then run this command again. MUSU does not require Tailscale.com signup."
            ));
        }
        if report.exit_code != Some(0) {
            return Err(anyhow!(
                "compatible mesh client join failed: {}",
                report
                    .stderr
                    .as_deref()
                    .or(report.stdout.as_deref())
                    .unwrap_or("no output")
            ));
        }
        Some(report)
    };

    let ip_command = if opts.dry_run {
        PrivateMeshCommandReport {
            found: false,
            exit_code: None,
            stdout: None,
            stderr: None,
        }
    } else {
        run_tail_command(&["ip", "-4"])
    };
    let local_tailnet_ip = parse_tailnet_ipv4(ip_command.stdout.as_deref().unwrap_or(""));
    let control_server_verified =
        !opts.dry_run && !opts.skip_control_health && control_server_health_ok;
    let config = PrivateMeshConfig {
        mesh: PrivateMeshConfigMesh {
            mode: MeshMode::MusuHeadscale,
            control_server_url: Some(login_server.clone()),
            owner_id: opts.owner_id.clone(),
            tailnet_id: opts.tailnet_id.clone(),
            node_name: opts.node_name.clone(),
            client_kind: Some("tailscale_cli".into()),
            derp_policy: Some("musu_or_operator_managed".into()),
            last_verified_at: None,
        },
        verification: PrivateMeshConfigVerification {
            local_tailnet_ip: local_tailnet_ip.clone(),
            verified_target_tailnet_ip: None,
            callback_tailnet_ip: None,
            control_server_verified: Some(control_server_verified),
            tailscale_ping_verified: Some(false),
            bridge_health_verified: Some(false),
            callback_verified: Some(false),
        },
    };
    write_private_mesh_config(&config_path, &config)?;
    let (device_add_pass_consumed, device_add_pass_consumed_path, device_add_pass_cleanup_error) =
        if !opts.dry_run {
            if let Some(path) = join_inputs.device_add_pass_path.as_deref() {
                match consume_device_add_pass_file(path) {
                    Ok(marker_path) => (true, Some(marker_path.display().to_string()), None),
                    Err(err) => (false, None, Some(err.to_string())),
                }
            } else {
                (false, None, None)
            }
        } else {
            (false, None, None)
        };
    let mut next_steps = vec![
        "Run `musu mesh status --json` to confirm this machine is classified as Private Mesh and control_server_verified reflects a real /health check.".into(),
        "Run `musu mesh verify --target-ip <peer-100.x.y.z>` before claiming peer reachability.".into(),
        "Run delegated task proof with callback reconciliation before release claims.".into(),
    ];
    if join_inputs.device_add_pass_used && !device_add_pass_consumed && !opts.dry_run {
        next_steps.push(
            "Delete the consumed device-add pass file manually; MUSU could not move it to a .used marker.".into(),
        );
    }
    let report = PrivateMeshJoinReport {
        schema: "musu.private_mesh_join.v1",
        product_name: "MUSU Private Mesh",
        mode: "musu_headscale",
        device_add_pass_used: join_inputs.device_add_pass_used,
        device_add_pass_consumed,
        device_add_pass_consumed_path,
        device_add_pass_cleanup_error,
        login_server,
        control_server_health_url,
        control_server_health_ok,
        control_server_health_status,
        control_server_verified,
        config_path: config_path.display().to_string(),
        dry_run: opts.dry_run,
        command,
        local_tailnet_ip,
        next_steps,
    };
    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("Joined MUSU Private Mesh state at {}", report.config_path);
        if report.device_add_pass_used {
            println!("  device-add pass: accepted");
            println!(
                "  device-add pass consumed: {}",
                report.device_add_pass_consumed
            );
            if let Some(path) = report.device_add_pass_consumed_path.as_deref() {
                println!("  device-add pass marker: {path}");
            }
            if let Some(err) = report.device_add_pass_cleanup_error.as_deref() {
                println!("  device-add pass cleanup warning: {err}");
            }
        }
        println!("  login server: {}", report.login_server);
        println!(
            "  control server health: {} ({})",
            report.control_server_health_ok,
            report
                .control_server_health_status
                .map(|status| status.to_string())
                .unwrap_or_else(|| "not checked".into())
        );
        println!(
            "  control server verified: {}",
            report.control_server_verified
        );
        println!("  dry run: {}", report.dry_run);
        println!(
            "  local tailnet ip: {}",
            report
                .local_tailnet_ip
                .as_deref()
                .unwrap_or("[not detected]")
        );
        println!("Next steps:");
        for step in &report.next_steps {
            println!("  - {step}");
        }
    }
    Ok(())
}

async fn run_verify(opts: PrivateMeshVerifyOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let report = verify_target(
        &home,
        &opts.target_ip,
        opts.bridge_port,
        opts.skip_ping,
        opts.skip_health,
    )
    .await?;
    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("MUSU Private Mesh verify");
        println!("  target: {}", report.target_ip);
        println!(
            "  ping ok: {}",
            report.ping.found && report.ping.exit_code == Some(0)
        );
        println!("  bridge health ok: {}", report.bridge_health_ok);
        println!("  callback verified: {}", report.callback_verified);
        println!("  release-grade proof: {}", report.release_grade);
        println!("Next steps:");
        for step in &report.next_steps {
            println!("  - {step}");
        }
    }
    Ok(())
}

async fn run_physical_peer_evidence(opts: PrivateMeshPhysicalPeerEvidenceOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let config_path = home.join(PRIVATE_MESH_CONFIG);
    let config = read_private_mesh_config(&config_path).ok_or_else(|| {
        anyhow!(
            "MUSU Private Mesh config missing at {}; run this on the target PC after `musu mesh join`",
            config_path.display()
        )
    })?;
    if config.mesh.mode != MeshMode::MusuHeadscale {
        return Err(anyhow!(
            "physical peer evidence requires MUSU Private Mesh mode, got {}",
            config.mesh.mode.as_str()
        ));
    }
    let node_name = config
        .mesh
        .node_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("physical peer evidence requires mesh.node_name"))?
        .trim()
        .to_string();
    let tailnet_ip = config
        .verification
        .local_tailnet_ip
        .as_deref()
        .filter(|value| is_tailnet_ipv4(value))
        .ok_or_else(|| {
            anyhow!(
                "physical peer evidence requires verification.local_tailnet_ip in 100.64.0.0/10"
            )
        })?
        .trim()
        .to_string();
    let control_server_url = config
        .mesh
        .control_server_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("physical peer evidence requires mesh.control_server_url"))?
        .trim()
        .to_string();
    let control_server_verified = config.verification.control_server_verified.unwrap_or(false);
    if !control_server_verified {
        return Err(anyhow!(
            "physical peer evidence requires control_server_verified=true on the target PC"
        ));
    }

    let output = opts.output.unwrap_or_else(|| {
        home.join("private-mesh-physical-peer-evidence")
            .join(format!(
                "{}.{}.physical-peer-evidence.json",
                chrono::Utc::now().format("%Y%m%d-%H%M%S"),
                safe_file_stem(&node_name)
            ))
    });
    let hostname = hostname::get()
        .ok()
        .and_then(|value| value.into_string().ok())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("physical peer evidence requires a readable target OS hostname"))?;
    let evidence = serde_json::json!({
        "schema": "musu.private_mesh_physical_peer_evidence.v1",
        "product_name": "MUSU Private Mesh",
        "physical_peer_verified": true,
        "method": "target_pc_generated_local_mesh_state",
        "node_name": node_name,
        "tailnet_ip": tailnet_ip,
        "control_server_url": control_server_url,
        "control_server_verified": control_server_verified,
        "hostname": hostname,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "config_path": config_path.display().to_string(),
        "generated_at": chrono::Utc::now().to_rfc3339(),
        "operator_instruction": "Generate this file on the target physical PC, then copy it to the source PC and pass it to `musu mesh release-proof --physical-peer-evidence`. The target hostname must differ from the source hostname for release trust."
    });
    write_json_with_sha256(&output, &evidence)?;
    let report = PrivateMeshPhysicalPeerEvidenceReport {
        schema: "musu.private_mesh_physical_peer_evidence_report.v1",
        product_name: "MUSU Private Mesh",
        ok: true,
        evidence_path: output.display().to_string(),
        evidence_sha256_path: sha256_sidecar_path(&output).display().to_string(),
        node_name: evidence
            .get("node_name")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        tailnet_ip: evidence
            .get("tailnet_ip")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        control_server_url: evidence
            .get("control_server_url")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        hostname: evidence
            .get("hostname")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string(),
        control_server_verified,
        physical_peer_verified: true,
        next_steps: vec![
            "Copy evidence_path from this target PC to the source PC.".into(),
            "Confirm this target PC hostname is different from the source PC hostname; same-host bridge simulations are not release proof.".into(),
            "On the source PC run `musu mesh release-proof --target-node <node> --target-ip <peer-100.x.y.z> --expected-control-server-url <url> --physical-peer-evidence <copied-file> --json`.".into(),
        ],
    };
    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("MUSU physical peer evidence written");
        println!("  evidence: {}", report.evidence_path);
        println!("  sha256: {}", report.evidence_sha256_path);
        println!("  node: {}", report.node_name);
        println!("  tailnet ip: {}", report.tailnet_ip);
        println!("  hostname: {}", report.hostname);
        println!("Next steps:");
        for step in &report.next_steps {
            println!("  - {step}");
        }
    }
    Ok(())
}

async fn verify_target(
    home: &Path,
    target_ip: &str,
    bridge_port: u16,
    skip_ping: bool,
    skip_health: bool,
) -> Result<PrivateMeshVerifyReport> {
    if !is_tailnet_ipv4(target_ip) {
        return Err(anyhow!(
            "--target-ip must be an IPv4 tailnet address in 100.64.0.0/10"
        ));
    }
    let config_path = home.join(PRIVATE_MESH_CONFIG);
    let mut config = read_private_mesh_config(&config_path).ok_or_else(|| {
        anyhow!(
            "MUSU Private Mesh config missing at {}; run `musu mesh join --login-server <url>` first",
            config_path.display()
        )
    })?;
    let local_tailnet_ip = config.verification.local_tailnet_ip.clone().or_else(|| {
        parse_tailnet_ipv4(
            run_tail_command(&["ip", "-4"])
                .stdout
                .as_deref()
                .unwrap_or(""),
        )
    });
    assert_distinct_target_tailnet_ip(local_tailnet_ip.as_deref(), target_ip)?;
    let ping = if skip_ping {
        PrivateMeshCommandReport {
            found: true,
            exit_code: Some(0),
            stdout: Some("skipped by operator".into()),
            stderr: None,
        }
    } else {
        run_tail_command_owned(vec![
            "ping".into(),
            "--timeout=5s".into(),
            "--c=1".into(),
            target_ip.to_string(),
        ])
    };
    let ping_ok = ping.found && ping.exit_code == Some(0);

    let health_url = format!("http://{}:{}/health", target_ip, bridge_port);
    let (bridge_health_ok, bridge_health_status) = if skip_health {
        (true, Some(200))
    } else {
        check_bridge_health(&health_url).await
    };

    config.verification.tailscale_ping_verified = Some(ping_ok);
    config.verification.bridge_health_verified = Some(bridge_health_ok);
    config.verification.verified_target_tailnet_ip = Some(target_ip.to_string());
    config.verification.local_tailnet_ip =
        config.verification.local_tailnet_ip.or(local_tailnet_ip);
    config.mesh.last_verified_at = Some(chrono::Utc::now().to_rfc3339());
    write_private_mesh_config(&config_path, &config)?;

    let control_server_verified = config.verification.control_server_verified.unwrap_or(false)
        && config.mesh.mode == MeshMode::MusuHeadscale
        && config
            .mesh
            .control_server_url
            .as_deref()
            .map(|url| !url.trim().is_empty())
            .unwrap_or(false);
    let callback_tailnet_ip = config.verification.callback_tailnet_ip.clone();
    let target_callback_match = callback_tailnet_ip
        .as_deref()
        .map(|ip| ip == target_ip)
        .unwrap_or(false);
    let callback_verified =
        config.verification.callback_verified.unwrap_or(false) && target_callback_match;
    let derp_readiness = derp_readiness_for(config.mesh.mode, config.mesh.derp_policy.as_deref());
    let derp_private_declared = derp_readiness == "declared_private";
    let release_grade = control_server_verified
        && derp_private_declared
        && ping_ok
        && bridge_health_ok
        && callback_verified;
    Ok(PrivateMeshVerifyReport {
        schema: "musu.private_mesh_verify.v1",
        product_name: "MUSU Private Mesh",
        target_ip: target_ip.to_string(),
        target_bridge_health_url: health_url,
        derp_readiness: derp_readiness.to_string(),
        derp_private_declared,
        ping,
        bridge_health_ok,
        bridge_health_status,
        callback_verified,
        callback_tailnet_ip,
        target_callback_match,
        release_grade,
        config_path: config_path.display().to_string(),
        next_steps: if release_grade {
            vec![
                "Private Mesh transport and callback proof are release-grade for this target."
                    .into(),
            ]
        } else {
            vec![
                "This verifies only overlay ping and target bridge /health.".into(),
                "Release-grade Private Mesh also requires verified MUSU Headscale control-server identity, private/operator DERP policy, and callback reconciliation.".into(),
            ]
        },
    })
}

async fn run_release_proof(opts: PrivateMeshReleaseProofOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let evidence_root = resolve_release_evidence_root(opts.evidence_root.as_deref(), &home)?;
    fs::create_dir_all(&evidence_root)?;
    let evidence_path = evidence_root.join("private-mesh-route-proof.evidence.json");
    let verification_path = evidence_root.join("private-mesh-release-proof.verification.json");

    let mut evidence = serde_json::json!({
        "schema": "musu.private_mesh_route_proof_smoke.v1",
        "started_at": chrono::Utc::now().to_rfc3339(),
        "evidence_root": evidence_root.display().to_string(),
        "target_node": &opts.target_node,
        "target_ip": &opts.target_ip,
        "bridge_port": opts.bridge_port,
        "expected_control_server_url": &opts.expected_control_server_url,
        "ok": false
    });
    let mut error: Option<String> = None;

    let result = run_release_proof_inner(&opts, &home, &evidence_root, &mut evidence).await;
    if let Err(err) = result {
        error = Some(err.to_string());
        evidence["error"] = serde_json::Value::String(err.to_string());
    }
    let completed_at = chrono::Utc::now().to_rfc3339();
    evidence["completed_at"] = serde_json::Value::String(completed_at.clone());
    write_json_with_sha256(&evidence_path, &evidence)?;

    let ok = evidence
        .get("ok")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let report = PrivateMeshReleaseProofReport {
        schema: "musu.private_mesh_release_proof.v1",
        product_name: "MUSU Private Mesh",
        ok,
        target_node: opts.target_node.clone(),
        target_ip: opts.target_ip.clone(),
        expected_control_server_url: opts.expected_control_server_url.clone(),
        evidence_root: evidence_root.display().to_string(),
        evidence_path: evidence_path.display().to_string(),
        verification_path: verification_path.display().to_string(),
        verification_sha256_path: sha256_sidecar_path(&verification_path)
            .display()
            .to_string(),
        completed_at,
        error,
    };
    write_json_with_sha256(&verification_path, &serde_json::to_value(&report)?)?;

    if opts.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else if report.ok {
        println!("MUSU Private Mesh release proof verified");
        println!("  evidence: {}", report.evidence_path);
        println!("  verification: {}", report.verification_path);
    } else {
        println!("MUSU Private Mesh release proof failed");
        println!("  evidence: {}", report.evidence_path);
        if let Some(error) = &report.error {
            println!("  error: {error}");
        }
    }

    if report.ok {
        Ok(())
    } else {
        Err(anyhow!(
            "{}",
            report
                .error
                .unwrap_or_else(|| "release proof failed".into())
        ))
    }
}

async fn run_release_proof_inner(
    opts: &PrivateMeshReleaseProofOpts,
    home: &Path,
    _evidence_root: &Path,
    evidence: &mut serde_json::Value,
) -> Result<()> {
    if opts.target_node.trim().is_empty() {
        return Err(anyhow!("--target-node is required"));
    }
    if !is_tailnet_ipv4(&opts.target_ip) {
        return Err(anyhow!(
            "--target-ip must be an IPv4 tailnet address in 100.64.0.0/10"
        ));
    }
    let source_config = read_private_mesh_config(&home.join(PRIVATE_MESH_CONFIG));
    assert_distinct_target_node(
        source_config
            .as_ref()
            .and_then(|config| config.mesh.node_name.as_deref()),
        &opts.target_node,
    )?;

    let mesh_status = build_status_report(home);
    assert_private_mesh_status(&mesh_status, opts.expected_control_server_url.as_deref())?;
    evidence["mesh_status"] = serde_json::to_value(&mesh_status)?;

    let mesh_verify = verify_target(home, &opts.target_ip, opts.bridge_port, false, false).await?;
    if !(mesh_verify.ping.found && mesh_verify.ping.exit_code == Some(0)) {
        return Err(anyhow!("musu mesh verify did not prove tailnet ping"));
    }
    if !mesh_verify.bridge_health_ok {
        return Err(anyhow!(
            "musu mesh verify did not prove target bridge /health"
        ));
    }
    evidence["mesh_verify"] = serde_json::to_value(&mesh_verify)?;

    let bridge_url = opts
        .source_bridge_url
        .as_deref()
        .map(normalize_bridge_url)
        .unwrap_or_else(|| crate::bridge::services::local_bridge_http_url(home));
    let token = resolve_release_bridge_token(home, opts.token.as_deref())?;
    evidence["musu_home"] = serde_json::Value::String(home.display().to_string());
    evidence["source_bridge_url"] = serde_json::Value::String(bridge_url.clone());

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?;
    let source_health_url = format!("{}/health", bridge_url.trim_end_matches('/'));
    let source_health_status = http_status(&client, &source_health_url).await?;
    evidence["source_bridge_health_status"] =
        serde_json::Value::Number(source_health_status.into());
    if source_health_status != 200 {
        return Err(anyhow!(
            "source bridge health returned HTTP {source_health_status}"
        ));
    }

    let effective_target_url = if let Some(target_url) = opts.target_url.as_deref() {
        Some(normalize_release_target_url(target_url, &opts.target_ip)?)
    } else if opts.bridge_port != 8070 {
        Some(normalize_release_target_url(
            &format!("http://{}:{}", opts.target_ip, opts.bridge_port),
            &opts.target_ip,
        )?)
    } else {
        None
    };
    evidence["effective_target_url"] = effective_target_url
        .as_ref()
        .map(|url| serde_json::Value::String(url.clone()))
        .unwrap_or(serde_json::Value::Null);
    let physical_peer_evidence_path = opts.physical_peer_evidence.as_deref().ok_or_else(|| {
        anyhow!(
            "--physical-peer-evidence is required for `musu mesh release-proof`; generate it on the separate target physical PC with `musu mesh physical-peer-evidence --json`"
        )
    })?;
    let physical_peer_evidence = read_physical_peer_evidence(
        physical_peer_evidence_path,
        &opts.target_node,
        &opts.target_ip,
        opts.expected_control_server_url.as_deref(),
    )?;
    let peer_identity = release_peer_identity_evidence(
        source_config.as_ref(),
        &opts.target_node,
        &opts.target_ip,
        effective_target_url.as_deref(),
        Some(&physical_peer_evidence),
    );
    if peer_identity
        .get("release_identity_bound")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err(anyhow!(
            "release identity is not bound to a distinct physical target PC; source and target node/IP/hostname evidence must all be distinct"
        ));
    }
    evidence["peer_identity"] = peer_identity;

    let registration = register_release_target(
        &client,
        &bridge_url,
        &token,
        &opts.target_node,
        effective_target_url.as_deref(),
        &opts.target_ip,
    )
    .await?;
    evidence["registration"] = registration;

    let expected = format!(
        "MUSU_REAL_PEER_ROUTE_PROOF_OK_{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S")
    );
    evidence["expected_output_token"] = serde_json::Value::String(expected.clone());
    let delegate =
        delegate_release_task(&client, &bridge_url, &token, &opts.target_node, &expected).await?;
    let task_id = delegate
        .get("task_id")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow!("delegate response did not include task_id"))?
        .to_string();
    evidence["delegate_response"] = delegate;
    evidence["source_task_id"] = serde_json::Value::String(task_id.clone());

    let task_status = poll_release_task(
        &client,
        &bridge_url,
        &token,
        &task_id,
        Duration::from_secs(opts.timeout_sec.clamp(1, 600)),
    )
    .await?;
    assert_release_task_status(&task_status, &opts.target_node, &expected)?;
    evidence["task_status"] = task_status.clone();

    let route_evidence_path = home
        .join("route-evidence")
        .join(format!("{task_id}.route-evidence.json"));
    let callback_proof_path = home
        .join("route-evidence")
        .join(format!("{task_id}.callback-proof.json"));
    evidence["route_evidence_path"] =
        serde_json::Value::String(route_evidence_path.display().to_string());
    evidence["callback_proof_path"] =
        serde_json::Value::String(callback_proof_path.display().to_string());
    if let Some(route_evidence) = read_json_file(&route_evidence_path) {
        evidence["route_evidence"] = route_evidence;
    }
    if let Some(callback_proof) = read_json_file(&callback_proof_path) {
        evidence["callback_proof"] = callback_proof;
    }

    let real_peer_evidence = serde_json::json!({
        "schema": "musu.real_peer_route_proof_smoke.v1",
        "target_node": opts.target_node,
        "tailscale_ip": opts.target_ip,
        "tailscale_bridge_port": opts.bridge_port,
        "expected_route_kind": "tailscale",
        "ok": true,
        "task_status": task_status
    });
    evidence["real_peer_evidence"] = real_peer_evidence;

    let post_callback_status = build_status_report(home);
    assert_private_mesh_status(
        &post_callback_status,
        opts.expected_control_server_url.as_deref(),
    )?;
    assert_bound_release_status(&post_callback_status, &opts.target_ip)?;
    evidence["post_callback_mesh_status"] = serde_json::to_value(&post_callback_status)?;
    evidence["ok"] = serde_json::Value::Bool(true);
    Ok(())
}

fn resolve_release_evidence_root(explicit: Option<&Path>, home: &Path) -> Result<PathBuf> {
    if let Some(path) = explicit {
        return Ok(path.to_path_buf());
    }
    Ok(home
        .join("private-mesh-release-proof")
        .join(chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string()))
}

fn normalize_bridge_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn normalize_release_target_url(value: &str, target_ip: &str) -> Result<String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(anyhow!("--target-url must not be empty"));
    }
    let url = reqwest::Url::parse(trimmed)
        .map_err(|e| anyhow!("--target-url must be a valid bridge URL: {e}"))?;
    if !(url.scheme() == "http" || url.scheme() == "https") {
        return Err(anyhow!("--target-url must start with http:// or https://"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| anyhow!("--target-url must include a host"))?;
    if host != target_ip.trim() {
        return Err(anyhow!(
            "release proof target URL host must match --target-ip; got {} for target {}",
            host,
            target_ip
        ));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(anyhow!(
            "--target-url must be a bridge origin URL without path, query, or fragment"
        ));
    }
    Ok(trimmed.to_string())
}

fn release_peer_identity_evidence(
    source_config: Option<&PrivateMeshConfig>,
    target_node: &str,
    target_ip: &str,
    target_url: Option<&str>,
    physical_peer_evidence: Option<&serde_json::Value>,
) -> serde_json::Value {
    let source_node_name = source_config
        .and_then(|config| config.mesh.node_name.clone())
        .filter(|name| !name.trim().is_empty());
    let source_tailnet_ip = source_config
        .and_then(|config| config.verification.local_tailnet_ip.clone())
        .filter(|ip| !ip.trim().is_empty());
    let source_hostname = local_os_hostname();
    let target_url_host = target_url.and_then(|url| {
        reqwest::Url::parse(url)
            .ok()
            .and_then(|parsed| parsed.host_str().map(str::to_string))
    });
    let node_distinct = source_node_name
        .as_deref()
        .map(|local| !local.trim().eq_ignore_ascii_case(target_node.trim()))
        .unwrap_or(true);
    let tailnet_ip_distinct = source_tailnet_ip
        .as_deref()
        .map(|local| local.trim() != target_ip.trim())
        .unwrap_or(true);
    let target_url_host_matches_target_ip = target_url_host
        .as_deref()
        .map(|host| host == target_ip.trim())
        .unwrap_or(true);
    let physical_peer_verified = physical_peer_evidence
        .and_then(|value| value.get("physical_peer_verified"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let target_hostname = physical_peer_evidence
        .and_then(|value| value.get("target_hostname"))
        .and_then(|value| value.as_str())
        .or_else(|| {
            physical_peer_evidence
                .and_then(|value| value.get("target_pc_evidence"))
                .and_then(|value| value.get("hostname"))
                .and_then(|value| value.as_str())
        })
        .filter(|hostname| !hostname.trim().is_empty())
        .map(|hostname| hostname.trim().to_string());
    let physical_host_distinct = source_hostname
        .as_deref()
        .zip(target_hostname.as_deref())
        .map(|(source, target)| !source.trim().eq_ignore_ascii_case(target.trim()))
        .unwrap_or(false);
    serde_json::json!({
        "schema": "musu.private_mesh_peer_identity.v1",
        "source_node_name": source_node_name,
        "source_tailnet_ip": source_tailnet_ip,
        "source_hostname": source_hostname,
        "target_node": target_node,
        "target_ip": target_ip,
        "target_hostname": target_hostname,
        "target_url": target_url,
        "target_url_host": target_url_host,
        "node_distinct": node_distinct,
        "tailnet_ip_distinct": tailnet_ip_distinct,
        "physical_host_distinct": physical_host_distinct,
        "target_url_host_matches_target_ip": target_url_host_matches_target_ip,
        "physical_peer_verified": physical_peer_verified,
        "physical_peer_evidence": physical_peer_evidence,
        "physical_peer_requirement": "Attach evidence from a separate physical host; distinct node/IP alone can be produced by two bridge instances on one host. Source and target OS hostnames must differ for release trust.",
        "release_identity_bound": node_distinct && tailnet_ip_distinct && physical_host_distinct && target_url_host_matches_target_ip,
    })
}

fn local_os_hostname() -> Option<String> {
    hostname::get()
        .ok()
        .and_then(|value| value.into_string().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn assert_distinct_target_tailnet_ip(
    local_tailnet_ip: Option<&str>,
    target_ip: &str,
) -> Result<()> {
    if local_tailnet_ip
        .map(|local_ip| local_ip.trim() == target_ip.trim())
        .unwrap_or(false)
    {
        return Err(anyhow!(
            "Private Mesh proof requires a distinct peer tailnet IP; target-ip {} is this machine",
            target_ip
        ));
    }
    Ok(())
}

fn assert_distinct_target_node(local_node_name: Option<&str>, target_node: &str) -> Result<()> {
    if local_node_name
        .map(|local| local.trim().eq_ignore_ascii_case(target_node.trim()))
        .unwrap_or(false)
    {
        return Err(anyhow!(
            "Private Mesh proof requires a distinct peer node; target-node '{}' is this machine",
            target_node
        ));
    }
    Ok(())
}

fn resolve_release_bridge_token(home: &Path, explicit: Option<&str>) -> Result<String> {
    if let Some(token) = explicit.map(str::trim).filter(|token| !token.is_empty()) {
        return Ok(token.to_string());
    }
    for name in ["MUSU_BRIDGE_TOKEN", "MUSU_TOKEN"] {
        if let Ok(token) = std::env::var(name) {
            let token = token.trim().to_string();
            if !token.is_empty() {
                return Ok(token);
            }
        }
    }
    crate::install::token::read_bridge_token(home).ok_or_else(|| {
        anyhow!(
            "Bridge token not found. Pass --token, set MUSU_BRIDGE_TOKEN/MUSU_TOKEN, or provide bridge.env."
        )
    })
}

fn assert_private_mesh_status(
    status: &PrivateMeshStatusReport,
    expected_control_server_url: Option<&str>,
) -> Result<()> {
    if status.schema != "musu.private_mesh_status.v1" {
        return Err(anyhow!("unexpected mesh status schema: {}", status.schema));
    }
    if status.mode != MeshMode::MusuHeadscale.as_str() {
        return Err(anyhow!(
            "Private Mesh proof requires mode=musu_headscale; got {}",
            status.mode
        ));
    }
    let Some(control_url) = status
        .control_server_url
        .as_deref()
        .map(str::trim)
        .filter(|url| !url.is_empty())
    else {
        return Err(anyhow!(
            "Private Mesh proof requires control_server_url in private_mesh.toml"
        ));
    };
    if !status.control_server_verified {
        return Err(anyhow!(
            "Private Mesh proof requires control_server_verified=true"
        ));
    }
    if status.derp_readiness != "declared_private" {
        return Err(anyhow!(
            "Private Mesh proof requires declared MUSU/operator DERP policy; got {}",
            status.derp_readiness
        ));
    }
    if let Some(expected) = expected_control_server_url
        .map(str::trim)
        .filter(|url| !url.is_empty())
    {
        if control_url.trim_end_matches('/') != expected.trim_end_matches('/') {
            return Err(anyhow!(
                "control server mismatch: expected {} got {}",
                expected,
                control_url
            ));
        }
    }
    Ok(())
}

fn assert_bound_release_status(status: &PrivateMeshStatusReport, target_ip: &str) -> Result<()> {
    if status.verified_target_tailnet_ip.as_deref() != Some(target_ip) {
        return Err(anyhow!(
            "verified target mismatch: expected {} got {}",
            target_ip,
            status
                .verified_target_tailnet_ip
                .as_deref()
                .unwrap_or("[none]")
        ));
    }
    if status.callback_tailnet_ip.as_deref() != Some(target_ip) {
        return Err(anyhow!(
            "callback target mismatch: expected {} got {}",
            target_ip,
            status.callback_tailnet_ip.as_deref().unwrap_or("[none]")
        ));
    }
    if !status.target_callback_match || !status.verification.target_callback_match {
        return Err(anyhow!(
            "Private Mesh status did not report bound target callback proof"
        ));
    }
    if !status.verification.callback_verified {
        return Err(anyhow!(
            "Private Mesh status did not record callback_verified=true after route proof"
        ));
    }
    if !status.verification.release_grade {
        return Err(anyhow!(
            "Private Mesh status did not reach release_grade=true after ping, health, and callback proof"
        ));
    }
    Ok(())
}

async fn http_status(client: &reqwest::Client, url: &str) -> Result<u16> {
    let resp = client
        .get(url)
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| anyhow!("cannot reach {url}: {e}"))?;
    Ok(resp.status().as_u16())
}

async fn post_bridge_json(
    client: &reqwest::Client,
    token: &str,
    url: String,
    body: serde_json::Value,
    timeout: Duration,
) -> Result<serde_json::Value> {
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| anyhow!("cannot reach bridge at {url}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("bridge error {status} at {url}: {text}"));
    }
    if text.trim().is_empty() {
        Ok(serde_json::Value::Null)
    } else {
        serde_json::from_str(&text).map_err(|e| anyhow!("invalid bridge JSON from {url}: {e}"))
    }
}

async fn get_bridge_json(
    client: &reqwest::Client,
    token: &str,
    url: String,
    timeout: Duration,
) -> Result<serde_json::Value> {
    let resp = client
        .get(&url)
        .bearer_auth(token)
        .timeout(timeout)
        .send()
        .await
        .map_err(|e| anyhow!("cannot reach bridge at {url}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("bridge error {status} at {url}: {text}"));
    }
    serde_json::from_str(&text).map_err(|e| anyhow!("invalid bridge JSON from {url}: {e}"))
}

async fn register_release_target(
    client: &reqwest::Client,
    bridge_url: &str,
    token: &str,
    target_node: &str,
    target_url: Option<&str>,
    target_ip: &str,
) -> Result<serde_json::Value> {
    let mut body = serde_json::Map::new();
    body.insert(
        "name".into(),
        serde_json::Value::String(target_node.to_string()),
    );
    if let Some(url) = target_url.map(str::trim).filter(|url| !url.is_empty()) {
        body.insert(
            "url".into(),
            serde_json::Value::String(normalize_bridge_url(url)),
        );
    }
    body.insert(
        "tailscale_ip".into(),
        serde_json::Value::String(target_ip.to_string()),
    );
    post_bridge_json(
        client,
        token,
        format!("{}/api/nodes/add", bridge_url.trim_end_matches('/')),
        serde_json::Value::Object(body),
        Duration::from_secs(15),
    )
    .await
}

async fn delegate_release_task(
    client: &reqwest::Client,
    bridge_url: &str,
    token: &str,
    target_node: &str,
    expected: &str,
) -> Result<serde_json::Value> {
    post_bridge_json(
        client,
        token,
        format!("{}/api/tasks/delegate", bridge_url.trim_end_matches('/')),
        serde_json::json!({
            "channel": "native-private-mesh-release-proof",
            "sender_id": "musu-mesh-release-proof",
            "text": format!("Reply exactly: {expected}"),
            "target_node": target_node,
            "adapter_type": "echo",
            "allow_duplicate": true
        }),
        Duration::from_secs(20),
    )
    .await
}

async fn poll_release_task(
    client: &reqwest::Client,
    bridge_url: &str,
    token: &str,
    task_id: &str,
    timeout: Duration,
) -> Result<serde_json::Value> {
    let deadline = Instant::now() + timeout;
    let url = format!("{}/api/tasks/{}", bridge_url.trim_end_matches('/'), task_id);
    let mut last_error: Option<String> = None;
    while Instant::now() < deadline {
        match get_bridge_json(client, token, url.clone(), Duration::from_secs(5)).await {
            Ok(value) => {
                let status = value.get("status").and_then(|v| v.as_str()).unwrap_or("");
                if matches!(status, "done" | "failed" | "cancelled") {
                    return Ok(value);
                }
            }
            Err(err) => {
                last_error = Some(err.to_string());
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(anyhow!(
        "source task status did not reach a terminal state before timeout{}",
        last_error
            .map(|err| format!("; last poll error: {err}"))
            .unwrap_or_default()
    ))
}

fn assert_release_task_status(
    task_status: &serde_json::Value,
    target_node: &str,
    expected: &str,
) -> Result<()> {
    let status = task_status
        .get("status")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if status != "done" {
        return Err(anyhow!("task status was not done: {status}"));
    }
    let output = task_status
        .get("output")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if !output.contains(expected) {
        return Err(anyhow!(
            "task output did not include expected token {}",
            expected
        ));
    }
    let proof = task_status
        .get("route_proof")
        .filter(|value| !value.is_null())
        .ok_or_else(|| anyhow!("task status did not include route_proof"))?;
    if proof.get("result").and_then(|value| value.as_str()) != Some("success") {
        return Err(anyhow!("route proof result was not success"));
    }
    if proof.get("route_kind").and_then(|value| value.as_str()) != Some("tailscale") {
        return Err(anyhow!("route proof route_kind was not tailscale"));
    }
    if proof
        .get("callback_delivered")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err(anyhow!("route proof did not show callback_delivered=true"));
    }
    if proof.get("callback_node").and_then(|value| value.as_str()) != Some(target_node) {
        return Err(anyhow!(
            "callback node mismatch: expected {} got {}",
            target_node,
            proof
                .get("callback_node")
                .and_then(|value| value.as_str())
                .unwrap_or("[none]")
        ));
    }
    Ok(())
}

fn read_json_file(path: &Path) -> Option<serde_json::Value> {
    let body = fs::read_to_string(path).ok()?;
    serde_json::from_str(&body).ok()
}

fn read_physical_peer_evidence(
    path: &Path,
    target_node: &str,
    target_ip: &str,
    expected_control_server_url: Option<&str>,
) -> Result<serde_json::Value> {
    let metadata = fs::metadata(path).map_err(|err| {
        anyhow!(
            "--physical-peer-evidence is not readable at {}: {err}",
            path.display()
        )
    })?;
    if !metadata.is_file() {
        return Err(anyhow!(
            "--physical-peer-evidence must point to a file, got {}",
            path.display()
        ));
    }
    if metadata.len() == 0 {
        return Err(anyhow!(
            "--physical-peer-evidence file is empty: {}",
            path.display()
        ));
    }
    let bytes = fs::read(path).map_err(|err| {
        anyhow!(
            "--physical-peer-evidence is not readable at {}: {err}",
            path.display()
        )
    })?;
    let verified_sha256 = verify_json_sha256_sidecar(path, &bytes, "--physical-peer-evidence")?;
    let body: serde_json::Value = serde_json::from_slice(&bytes).map_err(|err| {
        anyhow!(
            "--physical-peer-evidence must be JSON generated by `musu mesh physical-peer-evidence`: {err}"
        )
    })?;
    if body.get("schema").and_then(|value| value.as_str())
        != Some("musu.private_mesh_physical_peer_evidence.v1")
    {
        return Err(anyhow!(
            "--physical-peer-evidence schema is invalid; run `musu mesh physical-peer-evidence --json` on the target PC"
        ));
    }
    if body
        .get("physical_peer_verified")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err(anyhow!(
            "--physical-peer-evidence did not report physical_peer_verified=true"
        ));
    }
    let evidence_node = body
        .get("node_name")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim();
    if !evidence_node.eq_ignore_ascii_case(target_node.trim()) {
        return Err(anyhow!(
            "--physical-peer-evidence node_name mismatch: expected '{}' got '{}'",
            target_node,
            if evidence_node.is_empty() {
                "[missing]"
            } else {
                evidence_node
            }
        ));
    }
    let evidence_ip = body
        .get("tailnet_ip")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim();
    if evidence_ip != target_ip.trim() {
        return Err(anyhow!(
            "--physical-peer-evidence tailnet_ip mismatch: expected '{}' got '{}'",
            target_ip,
            if evidence_ip.is_empty() {
                "[missing]"
            } else {
                evidence_ip
            }
        ));
    }
    if body
        .get("control_server_verified")
        .and_then(|value| value.as_bool())
        != Some(true)
    {
        return Err(anyhow!(
            "--physical-peer-evidence requires control_server_verified=true"
        ));
    }
    if let Some(expected) = expected_control_server_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let actual = body
            .get("control_server_url")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim();
        if actual != expected {
            return Err(anyhow!(
                "--physical-peer-evidence control_server_url mismatch: expected '{}' got '{}'",
                expected,
                if actual.is_empty() {
                    "[missing]"
                } else {
                    actual
                }
            ));
        }
    }
    let evidence_hostname = body
        .get("hostname")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            anyhow!(
                "--physical-peer-evidence hostname is missing; regenerate it with the current `musu mesh physical-peer-evidence --json` on the target PC"
            )
        })?;
    if let Some(source_hostname) = local_os_hostname() {
        if source_hostname
            .trim()
            .eq_ignore_ascii_case(evidence_hostname.trim())
        {
            return Err(anyhow!(
                "--physical-peer-evidence was generated on the same host as this source PC; regenerate it on a separate target physical PC"
            ));
        }
    }
    let generated_at = body
        .get("generated_at")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            anyhow!(
                "--physical-peer-evidence generated_at is missing; regenerate it with `musu mesh physical-peer-evidence --json` on the target PC"
            )
        })?;
    let generated_at_utc = chrono::DateTime::parse_from_rfc3339(generated_at)
        .map_err(|err| {
            anyhow!("--physical-peer-evidence generated_at is not valid RFC3339: {err}")
        })?
        .with_timezone(&chrono::Utc);
    let now = chrono::Utc::now();
    if generated_at_utc < now - chrono::Duration::seconds(PHYSICAL_PEER_EVIDENCE_MAX_AGE_SECONDS) {
        return Err(anyhow!(
            "--physical-peer-evidence is stale; generated_at must be within 24 hours for final release proof"
        ));
    }
    if generated_at_utc
        > now + chrono::Duration::seconds(PHYSICAL_PEER_EVIDENCE_FUTURE_SKEW_SECONDS)
    {
        return Err(anyhow!(
            "--physical-peer-evidence generated_at is too far in the future; check both PCs' clocks and regenerate the evidence"
        ));
    }
    Ok(serde_json::json!({
        "schema": "musu.physical_peer_evidence.v1",
        "physical_peer_verified": true,
        "method": "target_pc_generated_json_sha256",
        "source_schema": "musu.private_mesh_physical_peer_evidence.v1",
        "path": path.display().to_string(),
        "sha256_path": sha256_sidecar_path(path).display().to_string(),
        "file_name": file_name_for_sidecar(path),
        "size_bytes": metadata.len(),
        "sha256": verified_sha256,
        "recorded_at": chrono::Utc::now().to_rfc3339(),
        "target_node": target_node,
        "target_ip": target_ip,
        "target_hostname": evidence_hostname,
        "generated_at": generated_at,
        "max_age_seconds": PHYSICAL_PEER_EVIDENCE_MAX_AGE_SECONDS,
        "control_server_url": body.get("control_server_url").cloned().unwrap_or(serde_json::Value::Null),
        "target_pc_evidence": body,
        "operator_warning": "This file was generated from target-local MUSU mesh state; it should be produced on the separate physical target PC, and target_hostname must differ from source_hostname."
    }))
}

fn write_json_with_sha256(path: &Path, value: &serde_json::Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let body = serde_json::to_string_pretty(value)?;
    fs::write(path, body.as_bytes())?;
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());
    let digest = hex::encode(hasher.finalize());
    let sidecar = serde_json::json!({
        "schema": "musu.evidence_integrity_sidecar.v1",
        "algorithm": "sha256",
        "evidence_file": file_name_for_sidecar(path),
        "sha256": digest,
        "recorded_at": chrono::Utc::now().to_rfc3339()
    });
    fs::write(
        sha256_sidecar_path(path),
        serde_json::to_string_pretty(&sidecar)?,
    )?;
    Ok(())
}

fn sha256_sidecar_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.sha256", path.display()))
}

fn verify_json_sha256_sidecar(path: &Path, bytes: &[u8], context: &str) -> Result<String> {
    let sidecar_path = sha256_sidecar_path(path);
    let sidecar_text = fs::read_to_string(&sidecar_path).map_err(|err| {
        anyhow!(
            "{context} SHA256 sidecar is not readable at {}: {err}",
            sidecar_path.display()
        )
    })?;
    let sidecar: serde_json::Value = serde_json::from_str(&sidecar_text).map_err(|err| {
        anyhow!(
            "{context} SHA256 sidecar must be JSON at {}: {err}",
            sidecar_path.display()
        )
    })?;
    if sidecar.get("schema").and_then(|value| value.as_str())
        != Some("musu.evidence_integrity_sidecar.v1")
    {
        return Err(anyhow!(
            "{context} SHA256 sidecar schema is invalid at {}",
            sidecar_path.display()
        ));
    }
    if sidecar.get("algorithm").and_then(|value| value.as_str()) != Some("sha256") {
        return Err(anyhow!(
            "{context} SHA256 sidecar algorithm must be sha256 at {}",
            sidecar_path.display()
        ));
    }
    let evidence_file = sidecar
        .get("evidence_file")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let expected_file = file_name_for_sidecar(path);
    if evidence_file != expected_file {
        return Err(anyhow!(
            "{context} SHA256 sidecar evidence_file mismatch: expected '{}' got '{}'",
            expected_file,
            if evidence_file.is_empty() {
                "[missing]"
            } else {
                evidence_file
            }
        ));
    }
    let expected_sha = sidecar
        .get("sha256")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if expected_sha.len() != 64 || !expected_sha.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(anyhow!(
            "{context} SHA256 sidecar sha256 is missing or invalid at {}",
            sidecar_path.display()
        ));
    }
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let actual = hex::encode(hasher.finalize());
    if actual != expected_sha {
        return Err(anyhow!(
            "{context} SHA256 sidecar does not match evidence file: {}",
            path.display()
        ));
    }
    Ok(actual)
}

fn file_name_for_sidecar(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("evidence.json")
        .to_string()
}

fn safe_file_stem(value: &str) -> String {
    let stem: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let stem = stem.trim_matches('-');
    if stem.is_empty() {
        "peer".to_string()
    } else {
        stem.to_string()
    }
}

fn write_bootstrap_bundle(
    opts: &PrivateMeshBootstrapOpts,
    musu_home: &Path,
) -> Result<PrivateMeshBootstrapReport> {
    let server_url = normalize_control_server_url(&opts.server_url, opts.allow_insecure_http)?;
    validate_private_mesh_tailnet_name(&opts.tailnet_name)?;
    validate_private_mesh_base_domain(&opts.base_domain)?;
    let embedded_derp_enabled = !opts.disable_embedded_derp;
    if embedded_derp_enabled && server_url.starts_with("http://") {
        return Err(anyhow!(
            "embedded DERP requires an https:// server_url; pass --disable-embedded-derp only for local lab http:// bundles"
        ));
    }
    if !embedded_derp_enabled && !opts.keep_tailscale_derp {
        return Err(anyhow!(
            "Headscale requires at least one DERP map entry; keep embedded DERP enabled for MUSU Private Mesh or pass --keep-tailscale-derp only for explicit temporary/lab fallback"
        ));
    }
    let derp_public_ipv4 = parse_optional_derp_ipv4(opts.derp_ipv4.as_deref())?;
    let derp_public_ipv6 = parse_optional_derp_ipv6(opts.derp_ipv6.as_deref())?;
    let caddy_site = if server_url.starts_with("https://") && !opts.expose_public {
        Some(caddy_site_for_server_url(&server_url)?)
    } else {
        None
    };
    let output_dir = opts
        .output
        .clone()
        .unwrap_or_else(|| musu_home.join("private-mesh-control-plane"));
    if output_dir.exists() && !opts.force && directory_has_entries(&output_dir)? {
        return Err(anyhow!(
            "output directory is not empty: {}; pass --force to overwrite generated files",
            output_dir.display()
        ));
    }

    let config_dir = output_dir.join("config");
    let lib_dir = output_dir.join("lib");
    fs::create_dir_all(&config_dir)?;
    fs::create_dir_all(&lib_dir)?;

    let compose = render_headscale_compose(opts, embedded_derp_enabled, caddy_site.as_ref());
    let config = render_headscale_config(
        &server_url,
        &opts.base_domain,
        opts.expose_public,
        embedded_derp_enabled,
        derp_public_ipv4.as_deref(),
        derp_public_ipv6.as_deref(),
        opts.keep_tailscale_derp,
    );
    let policy = render_headscale_policy();
    let readme = render_bootstrap_readme(&server_url, opts);
    let caddyfile = caddy_site
        .as_ref()
        .map(|site| render_caddyfile(&site.site_address));
    let public_check_ps1 = render_check_public_endpoint_ps1(&server_url);
    let public_check_sh = render_check_public_endpoint_sh(&server_url);
    let create_key_ps1 = render_create_join_key_ps1(&server_url, opts);
    let create_key_sh = render_create_join_key_sh(&server_url, opts);
    let notice = render_headscale_notice();

    let mut files = vec![
        ("docker-compose.yaml", compose),
        ("config/config.yaml", config),
        ("config/policy.json", policy),
    ];
    if let Some(caddyfile) = caddyfile {
        files.push(("Caddyfile", caddyfile));
    }
    files.extend([
        ("scripts/check-public-endpoint.ps1", public_check_ps1),
        ("scripts/check-public-endpoint.sh", public_check_sh),
        ("scripts/create-join-key.ps1", create_key_ps1),
        ("scripts/create-join-key.sh", create_key_sh),
        ("README.md", readme),
        ("NOTICE.headscale.md", notice),
    ]);
    let mut generated_files = Vec::new();
    for (relative, body) in files {
        let path = output_dir.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, body)?;
        generated_files.push(path.display().to_string());
    }

    let commands = vec![
        format!("cd {}", output_dir.display()),
        "docker compose config --quiet".to_string(),
        "docker compose up -d".to_string(),
        "docker compose exec -T headscale headscale health".to_string(),
        "powershell -ExecutionPolicy Bypass -File .\\scripts\\check-public-endpoint.ps1"
            .to_string(),
        "./scripts/check-public-endpoint.sh".to_string(),
        "powershell -ExecutionPolicy Bypass -File .\\scripts\\create-join-key.ps1".to_string(),
        "./scripts/create-join-key.sh".to_string(),
    ];
    let mut warnings = vec![
        "Do not run the Headscale control server on a node that is only reachable through the same tailnet it controls.".to_string(),
        "Headscale is single-tailnet/small-organization scoped; isolate owners with separate control-plane instances until multi-tenant isolation is proven.".to_string(),
    ];
    if caddy_site.is_some() {
        warnings.push("Default HTTPS bundle includes Caddy. Point DNS for the server_url host at this control host before enrolling machines.".to_string());
    } else {
        warnings.push(
            "Expose the control server through HTTPS before enrolling non-local machines."
                .to_string(),
        );
    }
    if embedded_derp_enabled {
        warnings.push("Embedded DERP is enabled and UDP 3478 is exposed; verify it with `tailscale debug derp headscale` from a joined client.".to_string());
        if derp_public_ipv4.is_none() && derp_public_ipv6.is_none() {
            warnings.push("Set --derp-ipv4 and/or --derp-ipv6 for stronger embedded DERP stability on public deployments.".to_string());
        }
    }
    if opts.keep_tailscale_derp {
        warnings.push("Upstream Tailscale DERP map is enabled as an explicit temporary fallback; this is not a fully self-contained MUSU mesh dependency posture.".to_string());
    }

    Ok(PrivateMeshBootstrapReport {
        schema: "musu.private_mesh_bootstrap.v1",
        product_name: "MUSU Private Mesh",
        server_url,
        output_dir: output_dir.display().to_string(),
        tailnet_name: opts.tailnet_name.clone(),
        base_domain: opts.base_domain.clone(),
        embedded_derp_enabled,
        derp_public_ipv4,
        derp_public_ipv6,
        upstream_tailscale_derp_enabled: opts.keep_tailscale_derp,
        caddy_reverse_proxy_enabled: caddy_site.is_some(),
        caddy_https_port: caddy_site.as_ref().map(|site| site.https_port),
        generated_files,
        commands,
        warnings,
        next_steps: vec![
            "Deploy this bundle on a stable Linux/BSD host with public HTTPS.".to_string(),
            "Create a one-use device-add pass with `scripts/create-join-key.ps1` or `scripts/create-join-key.sh`; save the printed `musu.device_add.v1` JSON on the target PC.".to_string(),
            "Join each MUSU machine with `musu mesh join --device-add-pass <musu.device_add.v1.json>`; the command rechecks `<url>/health` and never uses plain Tailscale.com login as the default.".to_string(),
            "Verify embedded DERP with `tailscale debug derp headscale` if machines are behind restrictive NAT.".to_string(),
            "Run `musu mesh verify --target-ip <peer-100.x.y.z>` and then the Private Mesh route-proof smoke before release claims.".to_string(),
        ],
    })
}

pub fn build_status_report(musu_home: &Path) -> PrivateMeshStatusReport {
    let config_path = musu_home.join(PRIVATE_MESH_CONFIG);
    let config = read_private_mesh_config(&config_path);
    let ip_command = run_tail_command(&["ip", "-4"]);
    let status_command = run_tail_command(&["status", "--json"]);
    let local_tailnet_ip =
        parse_tailnet_ipv4(ip_command.stdout.as_deref().unwrap_or("")).or_else(|| {
            config
                .as_ref()
                .and_then(|cfg| cfg.verification.local_tailnet_ip.clone())
        });
    let compatible_client_found = ip_command.found || status_command.found;

    let mode = classify_mesh_mode(config.as_ref(), local_tailnet_ip.as_deref());
    let (route_label, account_requirement) = route_label_and_account_requirement(mode);
    let control_server_url = config
        .as_ref()
        .and_then(|cfg| cfg.mesh.control_server_url.clone());
    let derp_policy = config.as_ref().and_then(|cfg| cfg.mesh.derp_policy.clone());
    let derp_readiness = derp_readiness_for(mode, derp_policy.as_deref());
    let verified_target_tailnet_ip = config
        .as_ref()
        .and_then(|cfg| cfg.verification.verified_target_tailnet_ip.clone());
    let callback_tailnet_ip = config
        .as_ref()
        .and_then(|cfg| cfg.verification.callback_tailnet_ip.clone());
    let verification = verification_status(config.as_ref());
    let mut warnings = Vec::new();
    let mut next_steps = Vec::new();

    if !compatible_client_found {
        warnings.push("compatible mesh client CLI not found".into());
        next_steps.push("Install the compatible mesh client, then join MUSU Private Mesh with --login-server; do not default to Tailscale.com signup.".into());
    }
    if mode == MeshMode::MusuHeadscale && control_server_url.is_none() {
        warnings.push("MUSU Private Mesh mode is configured without control_server_url".into());
        next_steps.push("Set mesh.control_server_url in private_mesh.toml or run the future `musu mesh join --login-server <url>` flow.".into());
    }
    if mode == MeshMode::MusuHeadscale
        && !config
            .as_ref()
            .and_then(|cfg| cfg.verification.control_server_verified)
            .unwrap_or(false)
    {
        warnings.push("MUSU Private Mesh control server has not been verified".into());
        next_steps.push("Rejoin with `musu mesh join --login-server <headscale-url> --authkey <key>` or run a future control-server identity verification before release claims.".into());
    }
    if mode == MeshMode::ExternalTailscaleOptIn {
        warnings
            .push("external managed tailnet is opt-in and not MUSU's default product path".into());
    }
    if mode == MeshMode::MusuHeadscale && derp_readiness == "missing" {
        warnings.push(
            "MUSU Private Mesh DERP policy is missing; hard-NAT machines may fail physical proof."
                .into(),
        );
        next_steps.push("Configure MUSU/operator DERP capacity and verify it from a joined client with `tailscale debug derp headscale` before release claims.".into());
    } else if mode == MeshMode::MusuHeadscale && derp_readiness == "external_dependency" {
        warnings.push("Private Mesh is using an external DERP dependency; this is not the fully self-contained default posture.".into());
        next_steps.push("Replace external DERP fallback with MUSU/operator DERP capacity before claiming no third-party network dependency.".into());
    }
    if config.is_none() && local_tailnet_ip.is_some() {
        warnings.push("tailnet IP detected but MUSU Private Mesh config is missing".into());
        next_steps.push("Classify this machine as MUSU Headscale or explicit external tailnet before claiming Private Mesh readiness.".into());
    }
    if !verification.release_grade {
        next_steps.push("Release-grade proof still requires ping, target bridge /health, delegated route proof, and callback reconciliation.".into());
    }
    if next_steps.is_empty() {
        next_steps.push(
            "Run a two-physical-machine delegated task proof before making release claims.".into(),
        );
    }

    PrivateMeshStatusReport {
        schema: "musu.private_mesh_status.v1",
        product_name: "MUSU Private Mesh",
        mode: mode.as_str().into(),
        route_label: route_label.into(),
        account_requirement: account_requirement.into(),
        config_path: config_path.display().to_string(),
        config_present: config.is_some(),
        control_server_url,
        control_server_verified: config
            .as_ref()
            .and_then(|cfg| cfg.verification.control_server_verified)
            .unwrap_or(false),
        derp_policy,
        derp_readiness: derp_readiness.to_string(),
        derp_probe_command: None,
        derp_probe_ok: false,
        local_tailnet_ip,
        verified_target_tailnet_ip,
        callback_tailnet_ip,
        target_callback_match: verification.target_callback_match,
        compatible_client_found,
        client_ip_command: ip_command,
        client_status_command: status_command,
        verification,
        warnings,
        next_steps,
    }
}

pub fn mark_callback_verified(musu_home: &Path, proof: &serde_json::Value) -> Result<bool> {
    let config_path = musu_home.join(PRIVATE_MESH_CONFIG);
    let Some(mut config) = read_private_mesh_config(&config_path) else {
        return Ok(false);
    };
    if config.mesh.mode != MeshMode::MusuHeadscale {
        return Ok(false);
    }
    let control_server_url_present = config
        .mesh
        .control_server_url
        .as_deref()
        .map(|url| !url.trim().is_empty())
        .unwrap_or(false);
    if !control_server_url_present || config.verification.control_server_verified != Some(true) {
        return Ok(false);
    }
    let verified_target_ip = config
        .verification
        .verified_target_tailnet_ip
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_string();
    if !is_tailnet_ipv4(&verified_target_ip) {
        return Ok(false);
    }
    let callback_tailnet_ip = proof
        .get("candidate_addr")
        .and_then(|v| v.as_str())
        .and_then(extract_tailnet_ipv4_from_addr)
        .unwrap_or_default();
    if callback_tailnet_ip != verified_target_ip {
        return Ok(false);
    }

    config.verification.callback_tailnet_ip = Some(callback_tailnet_ip);
    config.verification.callback_verified = Some(true);
    config.mesh.last_verified_at = Some(chrono::Utc::now().to_rfc3339());
    write_private_mesh_config(&config_path, &config)?;
    Ok(true)
}

fn directory_has_entries(path: &Path) -> Result<bool> {
    Ok(fs::read_dir(path)?.next().transpose()?.is_some())
}

fn normalize_control_server_url(value: &str, allow_insecure_http: bool) -> Result<String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(anyhow!("--server-url is required"));
    }
    let url = reqwest::Url::parse(trimmed)
        .map_err(|e| anyhow!("--server-url must be a valid URL: {e}"))?;
    match url.scheme() {
        "https" => {}
        "http" if allow_insecure_http => {}
        "http" => {
            return Err(anyhow!(
                "--server-url must use https:// for production; pass --allow-insecure-http only for local lab use"
            ));
        }
        other => {
            return Err(anyhow!(
                "--server-url must use https://{}",
                if other.is_empty() {
                    ""
                } else {
                    " or explicit lab http://"
                }
            ));
        }
    }
    if url.host_str().is_none() {
        return Err(anyhow!("--server-url must include a host"));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(anyhow!(
            "--server-url must be an origin URL without path, query, or fragment"
        ));
    }
    Ok(trimmed.to_string())
}

fn validate_private_mesh_tailnet_name(value: &str) -> Result<()> {
    if value.trim() != value || value.is_empty() {
        return Err(anyhow!("--tailnet-name must be a non-empty identifier"));
    }
    if value.len() > 63 {
        return Err(anyhow!("--tailnet-name must be at most 63 characters"));
    }
    let Some(first) = value.chars().next() else {
        return Err(anyhow!("--tailnet-name must be a non-empty identifier"));
    };
    let Some(last) = value.chars().last() else {
        return Err(anyhow!("--tailnet-name must be a non-empty identifier"));
    };
    if !first.is_ascii_alphanumeric() || !last.is_ascii_alphanumeric() {
        return Err(anyhow!(
            "--tailnet-name must start and end with an ASCII letter or digit"
        ));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err(anyhow!(
            "--tailnet-name may contain only ASCII letters, digits, '-', '_', and '.'"
        ));
    }
    Ok(())
}

fn validate_private_mesh_base_domain(value: &str) -> Result<()> {
    if value.trim() != value || value.is_empty() {
        return Err(anyhow!("--base-domain must be a non-empty DNS name"));
    }
    if value.len() > 253 {
        return Err(anyhow!("--base-domain must be at most 253 characters"));
    }
    if value.ends_with('.') {
        return Err(anyhow!("--base-domain must not include a trailing dot"));
    }
    for label in value.split('.') {
        if label.is_empty() {
            return Err(anyhow!("--base-domain must not contain empty labels"));
        }
        if label.len() > 63 {
            return Err(anyhow!(
                "--base-domain labels must be at most 63 characters"
            ));
        }
        let Some(first) = label.chars().next() else {
            return Err(anyhow!("--base-domain must not contain empty labels"));
        };
        let Some(last) = label.chars().last() else {
            return Err(anyhow!("--base-domain must not contain empty labels"));
        };
        if !first.is_ascii_alphanumeric() || !last.is_ascii_alphanumeric() {
            return Err(anyhow!(
                "--base-domain labels must start and end with an ASCII letter or digit"
            ));
        }
        if !label
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
        {
            return Err(anyhow!(
                "--base-domain may contain only ASCII letters, digits, '-' and dots"
            ));
        }
    }
    Ok(())
}

fn read_private_mesh_config(path: &Path) -> Option<PrivateMeshConfig> {
    let body = std::fs::read_to_string(path).ok()?;
    toml::from_str(&body).ok()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CaddySite {
    site_address: String,
    https_port: u16,
}

fn caddy_site_for_server_url(server_url: &str) -> Result<CaddySite> {
    let url = reqwest::Url::parse(server_url)?;
    if url.scheme() != "https" {
        return Err(anyhow!(
            "Caddy reverse proxy requires an https:// server_url"
        ));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(anyhow!(
            "--server-url must be an origin URL without path, query, or fragment"
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| anyhow!("--server-url must include a host"))?;
    let https_port = url.port_or_known_default().unwrap_or(443);
    let site_address = if https_port == 443 {
        host.to_string()
    } else {
        format!("{host}:{https_port}")
    };
    Ok(CaddySite {
        site_address,
        https_port,
    })
}

fn render_headscale_compose(
    opts: &PrivateMeshBootstrapOpts,
    embedded_derp_enabled: bool,
    caddy_site: Option<&CaddySite>,
) -> String {
    let client_bind = if opts.expose_public {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    let derp_port = if embedded_derp_enabled {
        "      - \"0.0.0.0:3478:3478/udp\"\n"
    } else {
        ""
    };
    let caddy_service = caddy_site
        .map(|site| {
            format!(
                r#"
  caddy:
    image: caddy:2.9.1
    container_name: musu-headscale-caddy
    restart: unless-stopped
    ports:
      - "0.0.0.0:80:80"
      - "0.0.0.0:{https_port}:{https_port}"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - headscale
"#,
                https_port = site.https_port
            )
        })
        .unwrap_or_default();
    let caddy_volumes = if caddy_site.is_some() {
        r#"
volumes:
  caddy_data:
  caddy_config:
"#
    } else {
        ""
    };
    format!(
        r#"services:
  headscale:
    image: {image}
    container_name: musu-headscale
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /var/run/headscale
    ports:
      - "{client_bind}:8080:8080"
      - "127.0.0.1:9090:9090"
{derp_port}    volumes:
      - ./config:/etc/headscale:ro
      - ./lib:/var/lib/headscale
    command: serve
    healthcheck:
      test: ["CMD", "headscale", "health"]
      interval: 30s
      timeout: 10s
      retries: 5
{caddy_service}{caddy_volumes}
"#,
        image = opts.image.as_str(),
        client_bind = client_bind,
        derp_port = derp_port,
        caddy_service = caddy_service,
        caddy_volumes = caddy_volumes
    )
}

fn render_headscale_config(
    server_url: &str,
    base_domain: &str,
    expose_public: bool,
    embedded_derp_enabled: bool,
    derp_public_ipv4: Option<&str>,
    derp_public_ipv6: Option<&str>,
    keep_tailscale_derp: bool,
) -> String {
    let listen_addr = if expose_public {
        "0.0.0.0:8080"
    } else {
        "0.0.0.0:8080"
    };
    let derp_urls = if keep_tailscale_derp {
        "  urls:\n    - https://controlplane.tailscale.com/derpmap/default"
    } else {
        "  urls: []"
    };
    let derp_ipv4 = derp_public_ipv4
        .map(|ip| format!("    ipv4: {ip}\n"))
        .unwrap_or_default();
    let derp_ipv6 = derp_public_ipv6
        .map(|ip| format!("    ipv6: {ip}\n"))
        .unwrap_or_default();
    format!(
        r#"server_url: {server_url}
listen_addr: {listen_addr}
metrics_listen_addr: 0.0.0.0:9090
grpc_listen_addr: 127.0.0.1:50443
grpc_allow_insecure: false
trusted_proxies:
  - 127.0.0.1/32
  - ::1/128

tls_cert_path: ""
tls_key_path: ""

noise:
  private_key_path: /var/lib/headscale/noise_private.key

prefixes:
  v4: 100.64.0.0/10
  v6: fd7a:115c:a1e0::/48
  allocation: sequential

derp:
  server:
    enabled: {embedded_derp_enabled}
    region_id: 999
    region_code: "musu"
    region_name: "MUSU Private Mesh DERP"
    verify_clients: true
    stun_listen_addr: "0.0.0.0:3478"
    private_key_path: /var/lib/headscale/derp_server_private.key
    automatically_add_embedded_derp_region: true
{derp_ipv4}{derp_ipv6}{derp_urls}
  paths: []
  auto_update_enabled: true
  update_frequency: 3h

node:
  expiry: 0
  ephemeral:
    inactivity_timeout: 30m

database:
  type: sqlite
  sqlite:
    path: /var/lib/headscale/db.sqlite

policy:
  path: /etc/headscale/policy.json

dns:
  magic_dns: true
  base_domain: {base_domain}
  override_local_dns: false
  nameservers:
    global: []
    split: {{}}
  search_domains: []
  extra_records: []
"#,
        server_url = server_url,
        listen_addr = listen_addr,
        embedded_derp_enabled = embedded_derp_enabled,
        derp_ipv4 = derp_ipv4,
        derp_ipv6 = derp_ipv6,
        derp_urls = derp_urls,
        base_domain = base_domain
    )
}

fn render_caddyfile(site_address: &str) -> String {
    format!(
        r#"{site_address} {{
  reverse_proxy headscale:8080
}}
"#,
        site_address = site_address
    )
}

fn render_check_public_endpoint_ps1(server_url: &str) -> String {
    format!(
        r#"# MUSU Private Mesh public endpoint check.
# Run after `docker compose up -d` and before creating join keys.

param(
  [string]$ServerUrl = '{server_url}'
)

$ErrorActionPreference = "Stop"
$uri = [Uri]$ServerUrl
$hostName = $uri.Host
$port = if ($uri.Port -gt 0) {{ $uri.Port }} else {{ 443 }}

Write-Host "Resolving $hostName..."
Resolve-DnsName $hostName -ErrorAction Stop | Out-Host

Write-Host "Checking tcp/$port on $hostName..."
$tcp = Test-NetConnection -ComputerName $hostName -Port $port -WarningAction SilentlyContinue
if (-not $tcp.TcpTestSucceeded) {{
  throw "tcp/$port is not reachable on $hostName. Check DNS, firewall, and Caddy port mapping."
}}

Write-Host "Checking Headscale public health endpoint..."
$healthUrl = "$($uri.Scheme)://$($uri.Authority)/health"
$response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 -Uri $healthUrl
if ([int]$response.StatusCode -ne 200) {{
  throw "Unexpected public health status $($response.StatusCode) from $healthUrl"
}}

Write-Host "MUSU Private Mesh public endpoint is reachable: $healthUrl"
"#,
        server_url = powershell_single_quoted(server_url)
    )
}

fn render_check_public_endpoint_sh(server_url: &str) -> String {
    format!(
        r#"#!/usr/bin/env sh
set -eu

# MUSU Private Mesh public endpoint check.
# Run after `docker compose up -d` and before creating join keys.

DEFAULT_SERVER_URL={server_url}
SERVER_URL="${{1:-$DEFAULT_SERVER_URL}}"
HOST="$(printf '%s\n' "$SERVER_URL" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:]+).*#\1#')"
PORT="$(printf '%s\n' "$SERVER_URL" | sed -nE 's#^[a-zA-Z][a-zA-Z0-9+.-]*://[^/:]+:([0-9]+).*#\1#p')"
if [ -z "$PORT" ]; then
  PORT=443
fi

echo "Resolving $HOST..."
if command -v getent >/dev/null 2>&1; then
  getent hosts "$HOST" >/dev/null
elif command -v nslookup >/dev/null 2>&1; then
  nslookup "$HOST" >/dev/null
else
  echo "No getent/nslookup found; skipping DNS resolver command."
fi

echo "Checking tcp/$PORT on $HOST..."
if command -v nc >/dev/null 2>&1; then
  nc -z "$HOST" "$PORT"
else
  echo "nc not found; relying on curl for tcp/tls reachability."
fi

HEALTH_URL="$SERVER_URL/health"
echo "Checking Headscale public health endpoint..."
curl --fail --silent --show-error --max-time 20 "$HEALTH_URL" >/dev/null
echo "MUSU Private Mesh public endpoint is reachable: $HEALTH_URL"
"#,
        server_url = shell_single_quoted(server_url)
    )
}

fn render_headscale_policy() -> String {
    // Headscale's own docs define an empty policy object as allow-all. Keep the
    // generated bundle bootable across policy parser differences, then let
    // operators harden ACL/Grants after the control plane is healthy.
    "{}\n".to_string()
}

fn render_create_join_key_ps1(server_url: &str, opts: &PrivateMeshBootstrapOpts) -> String {
    format!(
        r#"# MUSU Private Mesh join-key helper.
# Can be run from any working directory after `docker compose up -d`.

param(
  [string]$Tailnet = '{tailnet}',
  [string]$ServerUrl = '{server_url}'
)

$ErrorActionPreference = "Stop"
$BundleRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $BundleRoot
try {{

function Invoke-Headscale {{
  & docker compose exec -T headscale headscale @args
}}

function Resolve-HeadscaleUserId([string]$Name) {{
  $jsonText = (& docker compose exec -T headscale headscale users list --output json 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -eq 0 -and $jsonText) {{
    try {{
      $users = $jsonText | ConvertFrom-Json
      foreach ($user in @($users)) {{
        $candidateName = $user.name
        if (-not $candidateName) {{ $candidateName = $user.username }}
        if (-not $candidateName) {{ $candidateName = $user.Name }}
        if ($candidateName -eq $Name) {{
          $candidateId = $user.id
          if (-not $candidateId) {{ $candidateId = $user.ID }}
          if ($candidateId) {{ return [string]$candidateId }}
        }}
      }}
    }} catch {{
      # Fall through to table parsing for older/changed CLI output.
    }}
  }}

  $tableText = (& docker compose exec -T headscale headscale users list | Out-String)
  foreach ($line in ($tableText -split "`r?`n")) {{
    if ($line -notmatch [regex]::Escape($Name)) {{ continue }}
    foreach ($part in ($line -split "\s+")) {{
      if ($part -match "^\d+$") {{ return $part }}
    }}
  }}
  throw "Could not resolve Headscale user id for '$Name'. Run: docker compose exec -T headscale headscale users list"
}}

function Redact-HeadscaleSecrets([string]$Text) {{
  return ($Text -replace "hskey-auth-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+", "hskey-auth-<redacted>")
}}

Write-Host "Checking Headscale health..."
Invoke-Headscale health | Out-Host

Write-Host "Ensuring MUSU owner namespace exists: $Tailnet"
try {{
  Invoke-Headscale users create $Tailnet | Out-Host
}} catch {{
  Write-Host "User may already exist; continuing."
}}

$userId = Resolve-HeadscaleUserId $Tailnet
$keyArgs = @("preauthkeys", "create", "--user", $userId)

Write-Host "Creating a Headscale preauth key for user id $userId..."
$keyOutput = & docker compose exec -T headscale headscale @keyArgs
$keyText = ($keyOutput | Out-String)
$key = [regex]::Match($keyText, "hskey-auth-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+").Value

if (-not $key) {{
  Write-Output (Redact-HeadscaleSecrets $keyText)
  throw "Could not find hskey-auth-* in headscale output. Check the Headscale version and run `docker compose exec -T headscale headscale preauthkeys create --user <USER_ID>` manually."
}}

Write-Host ""
Write-Host "Writing MUSU device-add pass file..."
$createdAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$deviceAddPass = [ordered]@{{
  schema = "musu.device_add.v1"
  product_name = "MUSU Private Mesh"
  login_server = $ServerUrl
  tailnet = $Tailnet
  one_time_key = $true
  reusable = $false
  created_at_utc = $createdAtUtc
  expires_after_seconds = 3600
  authkey = $key
  join_command = "musu mesh join --device-add-pass <musu.device_add.v1.json>"
  operator_instruction = "Save this pass on the target PC, then run: musu mesh join --device-add-pass <musu.device_add.v1.json>. MUSU consumes the embedded join tuple and rechecks the control server /health endpoint."
}}
$passDir = Join-Path $BundleRoot "device-add-passes"
New-Item -ItemType Directory -Force -Path $passDir | Out-Null
$safeTailnet = $Tailnet -replace "[^A-Za-z0-9_.-]", "_"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$passPath = Join-Path $passDir "musu.device_add.$safeTailnet.$stamp.json"
# Write UTF-8 WITHOUT a BOM. Windows PowerShell's `Set-Content -Encoding UTF8`
# prepends a BOM, which makes the pass file fail JSON parsing on read
# ("expected value at line 1 column 1"). WriteAllText is BOM-free on every
# PowerShell version.
[System.IO.File]::WriteAllText($passPath, ($deviceAddPass | ConvertTo-Json -Compress))
try {{
  $acl = Get-Acl -LiteralPath $passPath
  $acl.SetAccessRuleProtection($true, $false)
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, "FullControl", "Allow")
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $passPath -AclObject $acl
}} catch {{
  Write-Host "Warning: could not restrict pass file ACL; move the pass securely and delete it after use."
}}
Write-Host "MUSU device-add pass file:"
Write-Output $passPath
Write-Host "Copy this file to the target PC, then delete stale copies after it is used."

Write-Host ""
Write-Host "Target PC command:"
Write-Output "musu mesh join --device-add-pass <musu.device_add.v1.json>"
}} finally {{
  Pop-Location
}}
"#,
        server_url = powershell_single_quoted(server_url),
        tailnet = powershell_single_quoted(&opts.tailnet_name)
    )
}

fn render_create_join_key_sh(server_url: &str, opts: &PrivateMeshBootstrapOpts) -> String {
    format!(
        r#"#!/usr/bin/env sh
set -eu

# MUSU Private Mesh join-key helper.
# Can be run from any working directory after `docker compose up -d`.

BUNDLE_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$BUNDLE_ROOT"

DEFAULT_TAILNET={tailnet}
DEFAULT_SERVER_URL={server_url}
TAILNET="${{1:-$DEFAULT_TAILNET}}"
SERVER_URL="${{MUSU_MESH_SERVER_URL:-$DEFAULT_SERVER_URL}}"

echo "Checking Headscale health..."
docker compose exec -T headscale headscale health

echo "Ensuring MUSU owner namespace exists: $TAILNET"
docker compose exec -T headscale headscale users create "$TAILNET" || echo "User may already exist; continuing."

USER_LIST="$(docker compose exec -T headscale headscale users list || true)"
USER_ID="$(printf '%s\n' "$USER_LIST" | awk -v user="$TAILNET" '$0 ~ user {{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+$/) {{ print $i; exit }} }}')"
if [ -z "$USER_ID" ]; then
  printf '%s\n' "$USER_LIST"
  echo "Could not resolve Headscale user id for '$TAILNET'. Run 'docker compose exec -T headscale headscale users list' and then 'docker compose exec -T headscale headscale preauthkeys create --user <USER_ID>' manually." >&2
  exit 1
fi

echo "Creating a Headscale preauth key..."
KEY_OUTPUT="$(docker compose exec -T headscale headscale preauthkeys create --user "$USER_ID")"
KEY="$(printf '%s\n' "$KEY_OUTPUT" | grep -Eo 'hskey-auth-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+' | head -n 1 || true)"

if [ -z "$KEY" ]; then
  printf '%s\n' "$KEY_OUTPUT" | sed -E 's/hskey-auth-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+/hskey-auth-<redacted>/g'
  echo "Could not find hskey-auth-* in headscale output. Check the Headscale version and run 'docker compose exec -T headscale headscale preauthkeys create --user <USER_ID>' manually." >&2
  exit 1
fi

echo ""
echo "Writing MUSU device-add pass file..."
PASS_DIR="$BUNDLE_ROOT/device-add-passes"
mkdir -p "$PASS_DIR"
SAFE_TAILNET="$(printf '%s' "$TAILNET" | tr -c 'A-Za-z0-9_.-' '_')"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
PASS_PATH="$PASS_DIR/musu.device_add.$SAFE_TAILNET.$STAMP.json"
CREATED_AT_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
umask 077
printf '{{"schema":"musu.device_add.v1","product_name":"MUSU Private Mesh","login_server":"%s","tailnet":"%s","one_time_key":true,"reusable":false,"created_at_utc":"%s","expires_after_seconds":3600,"authkey":"%s","join_command":"musu mesh join --device-add-pass <musu.device_add.v1.json>","operator_instruction":"Save this pass on the target PC, then run: musu mesh join --device-add-pass <musu.device_add.v1.json>. MUSU consumes the embedded join tuple and rechecks the control server /health endpoint."}}\n' "$SERVER_URL" "$TAILNET" "$CREATED_AT_UTC" "$KEY" > "$PASS_PATH"
chmod 600 "$PASS_PATH" 2>/dev/null || true
echo "MUSU device-add pass file:"
printf '%s\n' "$PASS_PATH"
echo "Copy this file to the target PC, then delete stale copies after it is used."

echo ""
echo "Target PC command:"
printf 'musu mesh join --device-add-pass <musu.device_add.v1.json>\n'
"#,
        server_url = shell_single_quoted(server_url),
        tailnet = shell_single_quoted(&opts.tailnet_name)
    )
}

fn render_bootstrap_readme(server_url: &str, opts: &PrivateMeshBootstrapOpts) -> String {
    format!(
        r#"# MUSU Private Mesh Control Plane

This bundle runs a Headscale-compatible control server for MUSU Private Mesh.
It is the MUSU default path for cross-network machines. It does not require a
Tailscale.com account.

## Preconditions

- Run this on a stable Linux/BSD host that is reachable before the tailnet exists.
- Do not run the control server only inside the tailnet it controls.
- Point DNS for the server_url host at this control host before starting it.
- The default HTTPS bundle includes Caddy as the public reverse proxy.
- Keep tcp/443 available for HTTPS and udp/3478 available for embedded DERP/STUN.
- Preserve Headscale BSD-3-Clause notices. See `NOTICE.headscale.md`.

## Start

```powershell
docker compose config --quiet
docker compose up -d
docker compose exec -T headscale headscale health
powershell -ExecutionPolicy Bypass -File .\scripts\check-public-endpoint.ps1
```

## Create a MUSU device-add pass

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-join-key.ps1
```

```bash
sh ./scripts/create-join-key.sh
```

Run `scripts/check-public-endpoint.ps1` or `scripts/check-public-endpoint.sh`
successfully before sharing a device-add pass with another PC. It verifies DNS,
tcp/443, and the public `/health` endpoint through Caddy.

The helper writes a `musu.device_add.v1` pass under `device-add-passes/` and
prints only the generated file path plus the target-side
`musu mesh join --device-add-pass <musu.device_add.v1.json>` command. Copy the
pass file to the target PC rather than asking the user to reason about
Headscale's raw preauth-key command shape. Headscale v0.28 displays preauth keys
only once, so use the generated pass immediately, delete stale copies after use,
or create another key.

## Join a MUSU machine

```powershell
musu mesh join --device-add-pass <musu.device_add.v1.json>
musu mesh status --json
```

`musu mesh join --device-add-pass` reads the MUSU pass, joins the embedded
Headscale login server with the one-use auth key, and checks `{server_url}/health`
before enrolling the local client. Dry-run or explicitly skipped health checks do not set
`control_server_verified=true`; those states are setup/debug only and cannot
produce release-grade proof.

## Verify release proof

```powershell
musu mesh verify --target-ip <peer-100.x.y.z> --json
musu mesh release-proof --target-node <node> --target-ip <peer-100.x.y.z> --expected-control-server-url {server_url} --json
scripts/windows/smoke-private-mesh-route-proof.ps1 -TargetNode <node> -TargetIp <peer-100.x.y.z> -ExpectedControlServerUrl {server_url} -Json
scripts/windows/verify-private-mesh-route-proof-evidence.ps1 -EvidencePath <evidence-root>\private-mesh-route-proof.evidence.json -ExpectedTargetIp <peer-100.x.y.z> -ExpectedControlServerUrl {server_url} -Json
tailscale debug derp headscale
```

Prefer the native `musu mesh release-proof` command for physical verification.
It runs overlay ping, bridge health, delegated execution, callback reconciliation,
and writes `private-mesh-release-proof.verification.json` plus a SHA256 sidecar.
The underlying proof must show `callback_verified=true` and `release_grade=true`
after ping, bridge health, delegated execution, and callback reconciliation. The
saved evidence verifier must pass
on the saved evidence file and its `.sha256` sidecar before treating the proof
as release evidence.

## Generated settings

- server_url: `{server_url}`
- tailnet/user: `{tailnet}`
- MagicDNS base domain: `{base_domain}`
- image: `{image}`
- embedded DERP enabled: `{embedded_derp}`
- DERP public IPv4: `{derp_ipv4}`
- DERP public IPv6: `{derp_ipv6}`
- keep upstream Tailscale DERP map: `{keep_derp}`
- Caddy HTTPS reverse proxy enabled: `{caddy_enabled}`
"#,
        server_url = server_url,
        tailnet = opts.tailnet_name.as_str(),
        base_domain = opts.base_domain.as_str(),
        image = opts.image.as_str(),
        embedded_derp = !opts.disable_embedded_derp,
        derp_ipv4 = opts.derp_ipv4.as_deref().unwrap_or("[not set]"),
        derp_ipv6 = opts.derp_ipv6.as_deref().unwrap_or("[not set]"),
        keep_derp = opts.keep_tailscale_derp,
        caddy_enabled = server_url.starts_with("https://") && !opts.expose_public
    )
}

fn render_headscale_notice() -> String {
    r#"# Headscale Notice

This MUSU Private Mesh bundle is designed to run Headscale as a compatible
control server.

Headscale is licensed under the BSD-3-Clause license. If MUSU redistributes
Headscale source or binaries, preserve the Headscale copyright notice, license
text, and disclaimer. Do not use Headscale contributor names to endorse MUSU
without permission.

Official project: https://github.com/juanfont/headscale
Local official-docs snapshot: docs/vendor/official-network-docs/headscale
"#
    .to_string()
}

fn powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn shell_single_quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn parse_optional_derp_ipv4(value: Option<&str>) -> Result<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    match value.parse::<IpAddr>()? {
        IpAddr::V4(ip) if !ip.is_unspecified() && !ip.is_loopback() => Ok(Some(ip.to_string())),
        IpAddr::V4(_) => Err(anyhow!(
            "--derp-ipv4 must be a public reachable IPv4 address"
        )),
        IpAddr::V6(_) => Err(anyhow!("--derp-ipv4 must be an IPv4 address")),
    }
}

fn parse_optional_derp_ipv6(value: Option<&str>) -> Result<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    match value.parse::<IpAddr>()? {
        IpAddr::V6(ip) if !ip.is_unspecified() && !ip.is_loopback() => Ok(Some(ip.to_string())),
        IpAddr::V6(_) => Err(anyhow!(
            "--derp-ipv6 must be a public reachable IPv6 address"
        )),
        IpAddr::V4(_) => Err(anyhow!("--derp-ipv6 must be an IPv6 address")),
    }
}

fn write_private_mesh_config(path: &Path, config: &PrivateMeshConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let body = toml::to_string_pretty(config)?;
    fs::write(path, body)?;
    Ok(())
}

fn normalize_login_server(value: &str) -> Result<String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(anyhow!("--login-server is required"));
    }
    let url = reqwest::Url::parse(trimmed)
        .map_err(|e| anyhow!("--login-server must be a valid URL: {e}"))?;
    if !(url.scheme() == "https" || url.scheme() == "http") {
        return Err(anyhow!(
            "--login-server must start with https:// or http://"
        ));
    }
    if url.host_str().is_none() {
        return Err(anyhow!("--login-server must include a host"));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err(anyhow!(
            "--login-server must be an origin URL without path, query, or fragment"
        ));
    }
    Ok(trimmed.to_string())
}

fn control_server_health_url(login_server: &str) -> Result<String> {
    let mut url = reqwest::Url::parse(login_server)
        .map_err(|e| anyhow!("--login-server must be a valid URL: {e}"))?;
    if url.host_str().is_none() {
        return Err(anyhow!("--login-server must include a host"));
    }
    url.set_path("/health");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

fn join_tail_args(login_server: &str, authkey: Option<&str>) -> Vec<String> {
    let mut args = vec![
        "up".into(),
        "--login-server".into(),
        login_server.to_string(),
    ];
    if let Some(authkey) = authkey {
        if !authkey.trim().is_empty() {
            args.push("--authkey".into());
            args.push(authkey.trim().into());
        }
    }
    args
}

fn classify_mesh_mode(
    config: Option<&PrivateMeshConfig>,
    local_tailnet_ip: Option<&str>,
) -> MeshMode {
    if let Some(config) = config {
        return config.mesh.mode;
    }
    if local_tailnet_ip.is_some() {
        return MeshMode::ExternalTailscaleOptIn;
    }
    MeshMode::LocalLan
}

fn route_label_and_account_requirement(mode: MeshMode) -> (&'static str, &'static str) {
    match mode {
        MeshMode::LocalLan => ("LAN", "none"),
        MeshMode::MusuHeadscale => ("Private Mesh", "no Tailscale.com account"),
        MeshMode::ExternalTailscaleOptIn => (
            "External Tailnet",
            "external Tailscale.com account only if explicitly chosen by user",
        ),
    }
}

fn verification_status(config: Option<&PrivateMeshConfig>) -> PrivateMeshVerificationStatus {
    let verification = config.map(|cfg| &cfg.verification);
    let control_server_verified = config
        .map(|cfg| {
            cfg.mesh.mode == MeshMode::MusuHeadscale
                && cfg
                    .mesh
                    .control_server_url
                    .as_deref()
                    .map(|url| !url.trim().is_empty())
                    .unwrap_or(false)
                && cfg.verification.control_server_verified.unwrap_or(false)
        })
        .unwrap_or(false);
    let tailscale_ping_verified = verification
        .and_then(|v| v.tailscale_ping_verified)
        .unwrap_or(false);
    let bridge_health_verified = verification
        .and_then(|v| v.bridge_health_verified)
        .unwrap_or(false);
    let callback_verified = verification
        .and_then(|v| v.callback_verified)
        .unwrap_or(false);
    let target_callback_match = config
        .map(|cfg| {
            let target = cfg
                .verification
                .verified_target_tailnet_ip
                .as_deref()
                .unwrap_or("");
            let callback = cfg
                .verification
                .callback_tailnet_ip
                .as_deref()
                .unwrap_or("");
            is_tailnet_ipv4(target) && target == callback
        })
        .unwrap_or(false);
    let derp_private_declared = config
        .map(|cfg| derp_readiness_for(cfg.mesh.mode, cfg.mesh.derp_policy.as_deref()))
        .map(|readiness| readiness == "declared_private")
        .unwrap_or(false);
    PrivateMeshVerificationStatus {
        tailscale_ping_verified,
        bridge_health_verified,
        callback_verified,
        target_callback_match,
        derp_private_declared,
        release_grade: control_server_verified
            && derp_private_declared
            && tailscale_ping_verified
            && bridge_health_verified
            && callback_verified
            && target_callback_match,
    }
}

fn derp_readiness_for(mode: MeshMode, policy: Option<&str>) -> &'static str {
    if mode != MeshMode::MusuHeadscale {
        return "not_applicable";
    }
    let policy = policy.unwrap_or("").trim().to_ascii_lowercase();
    if policy.is_empty() {
        return "missing";
    }
    if policy.contains("tailscale") || policy.contains("external") || policy.contains("upstream") {
        return "external_dependency";
    }
    if policy.contains("musu") || policy.contains("operator") || policy.contains("headscale") {
        return "declared_private";
    }
    "unknown"
}

fn attach_derp_doctor_probe(report: &mut PrivateMeshStatusReport) {
    if report.mode != MeshMode::MusuHeadscale.as_str()
        || report.derp_readiness != "declared_private"
        || !report.compatible_client_found
    {
        return;
    }
    let probe = run_tail_command_owned_with_timeout(
        vec!["debug".into(), "derp".into(), "headscale".into()],
        Duration::from_secs(8),
    );
    report.derp_probe_ok = probe.exit_code == Some(0);
    if !report.derp_probe_ok {
        report.warnings.push(
            "MUSU Private Mesh DERP probe failed; hard-NAT machines may not connect reliably."
                .into(),
        );
        report.next_steps.push(
            "Run `tailscale debug derp headscale` from this joined client and verify HTTPS/UDP 3478 reachability on the control host.".into(),
        );
    }
    report.derp_probe_command = Some(probe);
}

fn run_tail_command(args: &[&str]) -> PrivateMeshCommandReport {
    run_tail_command_owned(args.iter().map(|arg| (*arg).to_string()).collect())
}

fn run_tail_command_owned(args: Vec<String>) -> PrivateMeshCommandReport {
    match Command::new("tailscale").args(args).output() {
        Ok(output) => PrivateMeshCommandReport {
            found: true,
            exit_code: output.status.code(),
            stdout: decode_command_output(&output.stdout),
            stderr: decode_command_output(&output.stderr),
        },
        Err(_) => PrivateMeshCommandReport {
            found: false,
            exit_code: None,
            stdout: None,
            stderr: None,
        },
    }
}

fn run_tail_command_owned_with_timeout(
    args: Vec<String>,
    timeout: Duration,
) -> PrivateMeshCommandReport {
    let temp_dir = std::env::temp_dir();
    let nonce = format!(
        "musu-mesh-tail-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let stdout_path = temp_dir.join(format!("{nonce}.stdout.log"));
    let stderr_path = temp_dir.join(format!("{nonce}.stderr.log"));
    let stdout_file = match fs::File::create(&stdout_path) {
        Ok(file) => file,
        Err(_) => return command_not_found_report(),
    };
    let stderr_file = match fs::File::create(&stderr_path) {
        Ok(file) => file,
        Err(_) => return command_not_found_report(),
    };
    let mut child = match Command::new("tailscale")
        .args(&args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::from(stdout_file))
        .stderr(std::process::Stdio::from(stderr_file))
        .spawn()
    {
        Ok(child) => child,
        Err(_) => return command_not_found_report(),
    };
    let deadline = std::time::Instant::now() + timeout;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Ok(None) => {
                timed_out = true;
                let _ = child.kill();
                let _ = child.wait();
                break exit_status_after_timeout();
            }
            Err(_) => return command_not_found_report(),
        }
    };
    let mut stderr = read_optional_text_file(&stderr_path);
    if timed_out {
        let timeout_note = format!(
            "tailscale {} timed out after {}s",
            args.join(" "),
            timeout.as_secs()
        );
        stderr = Some(match stderr {
            Some(existing) if !existing.is_empty() => format!("{existing}\n{timeout_note}"),
            _ => timeout_note,
        });
    }
    let report = PrivateMeshCommandReport {
        found: true,
        exit_code: status.code(),
        stdout: read_optional_text_file(&stdout_path),
        stderr,
    };
    let _ = fs::remove_file(stdout_path);
    let _ = fs::remove_file(stderr_path);
    report
}

fn command_not_found_report() -> PrivateMeshCommandReport {
    PrivateMeshCommandReport {
        found: false,
        exit_code: None,
        stdout: None,
        stderr: None,
    }
}

fn read_optional_text_file(path: &Path) -> Option<String> {
    fs::read(path)
        .ok()
        .and_then(|bytes| decode_command_output(&bytes))
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

async fn check_bridge_health(url: &str) -> (bool, Option<u16>) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(client) => client,
        Err(_) => return (false, None),
    };
    match client.get(url).send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            (resp.status().is_success(), Some(status))
        }
        Err(_) => (false, None),
    }
}

fn decode_command_output(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn parse_tailnet_ipv4(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| is_tailnet_ipv4(line))
        .map(str::to_string)
        .next()
}

fn extract_tailnet_ipv4_from_addr(addr: &str) -> Option<String> {
    let trimmed = addr.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_tailnet_ipv4(trimmed) {
        return Some(trimmed.to_string());
    }
    let host = trimmed
        .strip_prefix("http://")
        .or_else(|| trimmed.strip_prefix("https://"))
        .unwrap_or(trimmed)
        .split('/')
        .next()
        .unwrap_or("")
        .rsplit_once(':')
        .map(|(host, _)| host)
        .unwrap_or(trimmed);
    if is_tailnet_ipv4(host) {
        Some(host.to_string())
    } else {
        None
    }
}

fn is_tailnet_ipv4(value: &str) -> bool {
    let Ok(ip) = value.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    let octets = ip.octets();
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

fn print_human_status(report: &PrivateMeshStatusReport, doctor: bool) {
    println!("MUSU Private Mesh");
    println!("  mode: {}", report.mode);
    println!("  route label: {}", report.route_label);
    println!("  account requirement: {}", report.account_requirement);
    println!("  config: {}", report.config_path);
    println!("  config present: {}", report.config_present);
    if let Some(url) = &report.control_server_url {
        println!("  control server: {url}");
    }
    println!("  DERP readiness: {}", report.derp_readiness);
    if let Some(probe) = &report.derp_probe_command {
        println!(
            "  DERP probe: {}",
            if report.derp_probe_ok {
                "ok"
            } else if probe.found {
                "failed"
            } else {
                "tailscale CLI not found"
            }
        );
    }
    println!(
        "  compatible client found: {}",
        report.compatible_client_found
    );
    println!(
        "  local tailnet ip: {}",
        report.local_tailnet_ip.as_deref().unwrap_or("[none]")
    );
    println!(
        "  release-grade proof: {}",
        report.verification.release_grade
    );

    if doctor || !report.warnings.is_empty() {
        println!();
        println!("Warnings:");
        if report.warnings.is_empty() {
            println!("  - none");
        } else {
            for warning in &report.warnings {
                println!("  - {warning}");
            }
        }
        println!();
        println!("Next steps:");
        for step in &report.next_steps {
            println!("  - {step}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_pc_backend_process_timeouts_are_bounded() {
        assert_eq!(CREATE_JOIN_KEY_HELPER_TIMEOUT.as_secs(), 45);
        assert_eq!(START_CONTROL_CONFIG_TIMEOUT.as_secs(), 15);
        assert_eq!(START_CONTROL_UP_TIMEOUT.as_secs(), 90);
        assert_eq!(START_CONTROL_HEALTH_TIMEOUT.as_secs(), 8);
        assert!(START_CONTROL_UP_TIMEOUT > CREATE_JOIN_KEY_HELPER_TIMEOUT);
    }

    #[test]
    fn parse_tailnet_ipv4_accepts_only_100_64_10() {
        assert_eq!(
            parse_tailnet_ipv4("fd7a:115c:a1e0::1\n100.64.0.1\n100.128.0.1"),
            Some("100.64.0.1".into())
        );
        assert_eq!(parse_tailnet_ipv4("100.63.255.255\n100.128.0.1"), None);
    }

    #[test]
    fn configured_headscale_mode_gets_private_mesh_label() {
        let cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: None,
                tailnet_id: None,
                node_name: None,
                client_kind: Some("tailscale_cli".into()),
                derp_policy: Some("musu_managed".into()),
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification {
                local_tailnet_ip: Some("100.100.1.2".into()),
                verified_target_tailnet_ip: Some("100.100.1.3".into()),
                callback_tailnet_ip: Some("100.100.1.3".into()),
                control_server_verified: Some(true),
                tailscale_ping_verified: Some(true),
                bridge_health_verified: Some(true),
                callback_verified: Some(true),
            },
        };
        assert_eq!(
            classify_mesh_mode(Some(&cfg), Some("100.100.1.2")),
            MeshMode::MusuHeadscale
        );
        assert_eq!(
            route_label_and_account_requirement(MeshMode::MusuHeadscale),
            ("Private Mesh", "no Tailscale.com account")
        );
        assert_eq!(
            derp_readiness_for(MeshMode::MusuHeadscale, cfg.mesh.derp_policy.as_deref()),
            "declared_private"
        );
        assert!(verification_status(Some(&cfg)).release_grade);
    }

    #[test]
    fn derp_readiness_flags_missing_or_external_dependencies() {
        assert_eq!(derp_readiness_for(MeshMode::MusuHeadscale, None), "missing");
        assert_eq!(
            derp_readiness_for(MeshMode::MusuHeadscale, Some("upstream_tailscale_derp")),
            "external_dependency"
        );
        assert_eq!(
            derp_readiness_for(
                MeshMode::ExternalTailscaleOptIn,
                Some("upstream_tailscale_derp")
            ),
            "not_applicable"
        );
    }

    #[test]
    fn release_grade_requires_private_derp_policy() {
        let mut cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: None,
                tailnet_id: None,
                node_name: Some("studio-pc".into()),
                client_kind: Some("tailscale_cli".into()),
                derp_policy: None,
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification {
                local_tailnet_ip: Some("100.64.0.10".into()),
                verified_target_tailnet_ip: Some("100.64.0.11".into()),
                callback_tailnet_ip: Some("100.64.0.11".into()),
                control_server_verified: Some(true),
                tailscale_ping_verified: Some(true),
                bridge_health_verified: Some(true),
                callback_verified: Some(true),
            },
        };

        let missing = verification_status(Some(&cfg));
        assert!(!missing.derp_private_declared);
        assert!(!missing.release_grade);

        cfg.mesh.derp_policy = Some("upstream_tailscale_derp".into());
        let external = verification_status(Some(&cfg));
        assert!(!external.derp_private_declared);
        assert!(!external.release_grade);

        cfg.mesh.derp_policy = Some("musu_or_operator_managed".into());
        let private = verification_status(Some(&cfg));
        assert!(private.derp_private_declared);
        assert!(private.release_grade);
    }

    #[test]
    fn verify_rejects_local_tailnet_ip_as_target() {
        let err = assert_distinct_target_tailnet_ip(Some("100.64.0.10"), "100.64.0.10")
            .expect_err("same local and target tailnet IP must be rejected");
        assert!(err
            .to_string()
            .contains("requires a distinct peer tailnet IP"));

        assert!(assert_distinct_target_tailnet_ip(Some("100.64.0.10"), "100.64.0.11").is_ok());
        assert!(assert_distinct_target_tailnet_ip(None, "100.64.0.11").is_ok());
    }

    #[test]
    fn release_proof_rejects_local_node_name_as_target() {
        let err = assert_distinct_target_node(Some("this-laptop"), "THIS-LAPTOP")
            .expect_err("local node name must not be accepted as target node");
        assert!(err.to_string().contains("requires a distinct peer node"));

        assert!(assert_distinct_target_node(Some("this-laptop"), "studio-pc").is_ok());
        assert!(assert_distinct_target_node(None, "studio-pc").is_ok());
    }

    #[test]
    fn release_target_url_must_match_target_ip() {
        assert_eq!(
            normalize_release_target_url("http://100.64.0.11:8070/", "100.64.0.11").unwrap(),
            "http://100.64.0.11:8070"
        );
        assert!(
            normalize_release_target_url("http://127.0.0.1:8070", "100.64.0.11")
                .unwrap_err()
                .to_string()
                .contains("host must match --target-ip")
        );
        assert!(
            normalize_release_target_url("http://100.64.0.12:8070", "100.64.0.11")
                .unwrap_err()
                .to_string()
                .contains("host must match --target-ip")
        );
        assert!(
            normalize_release_target_url("http://100.64.0.11:8070/health", "100.64.0.11")
                .unwrap_err()
                .to_string()
                .contains("without path, query, or fragment")
        );
    }

    #[test]
    fn release_peer_identity_evidence_records_bound_peer_tuple() {
        let distinct_target_hostname = "__musu_release_test_distinct_target__";
        let cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: None,
                tailnet_id: None,
                node_name: Some("this-laptop".into()),
                client_kind: Some("tailscale_cli".into()),
                derp_policy: Some("musu_or_operator_managed".into()),
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification {
                local_tailnet_ip: Some("100.64.0.10".into()),
                verified_target_tailnet_ip: None,
                callback_tailnet_ip: None,
                control_server_verified: Some(true),
                tailscale_ping_verified: None,
                bridge_health_verified: None,
                callback_verified: None,
            },
        };

        let evidence = release_peer_identity_evidence(
            Some(&cfg),
            "studio-pc",
            "100.64.0.11",
            Some("http://100.64.0.11:8070"),
            Some(&serde_json::json!({
                "schema": "musu.physical_peer_evidence.v1",
                "physical_peer_verified": true,
                "target_hostname": distinct_target_hostname,
            })),
        );
        assert_eq!(
            evidence.get("schema").and_then(|value| value.as_str()),
            Some("musu.private_mesh_peer_identity.v1")
        );
        assert_eq!(
            evidence
                .get("source_node_name")
                .and_then(|value| value.as_str()),
            Some("this-laptop")
        );
        assert_eq!(
            evidence
                .get("source_tailnet_ip")
                .and_then(|value| value.as_str()),
            Some("100.64.0.10")
        );
        assert_eq!(
            evidence
                .get("target_url_host")
                .and_then(|value| value.as_str()),
            Some("100.64.0.11")
        );
        assert_eq!(
            evidence.get("node_distinct").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            evidence
                .get("tailnet_ip_distinct")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            evidence
                .get("target_url_host_matches_target_ip")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            evidence
                .get("target_hostname")
                .and_then(|value| value.as_str()),
            Some(distinct_target_hostname)
        );
        assert_eq!(
            evidence
                .get("physical_host_distinct")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            evidence
                .get("release_identity_bound")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
        assert_eq!(
            evidence
                .get("physical_peer_verified")
                .and_then(|v| v.as_bool()),
            Some(true)
        );

        let weak = release_peer_identity_evidence(
            Some(&cfg),
            "THIS-LAPTOP",
            "100.64.0.10",
            Some("http://100.64.0.12:8070"),
            Some(&serde_json::json!({
                "schema": "musu.physical_peer_evidence.v1",
                "physical_peer_verified": true,
                "method": "operator_supplied_file_sha256",
                "sha256": "abc"
            })),
        );
        assert_eq!(
            weak.get("node_distinct").and_then(|v| v.as_bool()),
            Some(false)
        );
        assert_eq!(
            weak.get("tailnet_ip_distinct").and_then(|v| v.as_bool()),
            Some(false)
        );
        assert_eq!(
            weak.get("target_url_host_matches_target_ip")
                .and_then(|v| v.as_bool()),
            Some(false)
        );
        assert_eq!(
            weak.get("release_identity_bound").and_then(|v| v.as_bool()),
            Some(false)
        );
        assert_eq!(
            weak.get("physical_peer_verified").and_then(|v| v.as_bool()),
            Some(true)
        );

        let local_hostname = local_os_hostname().unwrap_or_else(|| "same-host".to_string());
        let same_host = release_peer_identity_evidence(
            Some(&cfg),
            "studio-pc",
            "100.64.0.11",
            Some("http://100.64.0.11:8070"),
            Some(&serde_json::json!({
                "schema": "musu.physical_peer_evidence.v1",
                "physical_peer_verified": true,
                "target_hostname": local_hostname,
            })),
        );
        assert_eq!(
            same_host
                .get("physical_host_distinct")
                .and_then(|v| v.as_bool()),
            Some(false)
        );
        assert_eq!(
            same_host
                .get("release_identity_bound")
                .and_then(|v| v.as_bool()),
            Some(false)
        );
    }

    #[test]
    fn physical_peer_evidence_requires_target_generated_json() {
        let dir = tempfile::tempdir().expect("temp dir should be created");
        let path = dir.path().join("studio-pc.physical-peer-evidence.json");
        let physical_evidence = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "product_name": "MUSU Private Mesh",
            "physical_peer_verified": true,
            "method": "target_pc_generated_local_mesh_state",
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "studio-pc",
            "os": "windows",
            "arch": "x86_64",
            "generated_at": chrono::Utc::now().to_rfc3339()
        });
        fs::write(&path, physical_evidence.to_string())
            .expect("physical evidence should be written");

        let missing_sidecar = read_physical_peer_evidence(
            &path,
            "studio-pc",
            "100.64.0.11",
            Some("https://mesh.example"),
        )
        .unwrap_err();
        assert!(missing_sidecar
            .to_string()
            .contains("SHA256 sidecar is not readable"));

        write_json_with_sha256(&path, &physical_evidence)
            .expect("physical evidence sidecar should be written");

        let evidence = read_physical_peer_evidence(
            &path,
            "studio-pc",
            "100.64.0.11",
            Some("https://mesh.example"),
        )
        .expect("physical peer evidence should be readable");

        assert_eq!(
            evidence.get("schema").and_then(|value| value.as_str()),
            Some("musu.physical_peer_evidence.v1")
        );
        assert_eq!(
            evidence
                .get("physical_peer_verified")
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            evidence
                .get("target_hostname")
                .and_then(|value| value.as_str()),
            Some("studio-pc")
        );
        assert_eq!(
            evidence.get("file_name").and_then(|value| value.as_str()),
            Some("studio-pc.physical-peer-evidence.json")
        );
        assert_eq!(
            evidence.get("sha256_path").and_then(|value| value.as_str()),
            Some(sha256_sidecar_path(&path).display().to_string().as_str())
        );
        assert_eq!(
            evidence
                .get("target_pc_evidence")
                .and_then(|value| value.get("node_name"))
                .and_then(|value| value.as_str()),
            Some("studio-pc")
        );
        assert!(
            evidence
                .get("sha256")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .len()
                == 64
        );

        let mismatch = read_physical_peer_evidence(
            &path,
            "other-pc",
            "100.64.0.11",
            Some("https://mesh.example"),
        )
        .unwrap_err();
        assert!(mismatch.to_string().contains("node_name mismatch"));

        if let Some(source_hostname) = local_os_hostname() {
            let same_host = serde_json::json!({
                "schema": "musu.private_mesh_physical_peer_evidence.v1",
                "product_name": "MUSU Private Mesh",
                "physical_peer_verified": true,
                "method": "target_pc_generated_local_mesh_state",
                "node_name": "studio-pc",
                "tailnet_ip": "100.64.0.11",
                "control_server_url": "https://mesh.example",
                "control_server_verified": true,
                "hostname": source_hostname,
                "os": "windows",
                "arch": "x86_64",
                "generated_at": chrono::Utc::now().to_rfc3339()
            });
            fs::write(&path, same_host.to_string()).expect("same-host evidence should be written");
            write_json_with_sha256(&path, &same_host)
                .expect("same-host evidence sidecar should be written");

            let same_host_result = read_physical_peer_evidence(
                &path,
                "studio-pc",
                "100.64.0.11",
                Some("https://mesh.example"),
            )
            .unwrap_err();
            assert!(same_host_result.to_string().contains("same host"));
        }
    }

    #[test]
    fn physical_peer_evidence_must_be_fresh() {
        let dir = tempfile::tempdir().expect("temp dir should be created");
        let path = dir.path().join("studio-pc.physical-peer-evidence.json");
        let stale = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "physical_peer_verified": true,
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "studio-pc",
            "generated_at": (chrono::Utc::now() - chrono::Duration::hours(25)).to_rfc3339()
        });
        fs::write(&path, stale.to_string()).expect("stale evidence should be written");
        write_json_with_sha256(&path, &stale).expect("stale sidecar should be written");
        let stale_result = read_physical_peer_evidence(
            &path,
            "studio-pc",
            "100.64.0.11",
            Some("https://mesh.example"),
        )
        .unwrap_err();
        assert!(stale_result.to_string().contains("is stale"));

        let future = serde_json::json!({
            "schema": "musu.private_mesh_physical_peer_evidence.v1",
            "physical_peer_verified": true,
            "node_name": "studio-pc",
            "tailnet_ip": "100.64.0.11",
            "control_server_url": "https://mesh.example",
            "control_server_verified": true,
            "hostname": "studio-pc",
            "generated_at": (chrono::Utc::now() + chrono::Duration::minutes(10)).to_rfc3339()
        });
        fs::write(&path, future.to_string()).expect("future evidence should be written");
        write_json_with_sha256(&path, &future).expect("future sidecar should be written");
        let future_result = read_physical_peer_evidence(
            &path,
            "studio-pc",
            "100.64.0.11",
            Some("https://mesh.example"),
        )
        .unwrap_err();
        assert!(future_result.to_string().contains("too far in the future"));
    }

    #[test]
    fn unconfigured_tailnet_is_external_until_classified() {
        assert_eq!(
            classify_mesh_mode(None, Some("100.100.1.2")),
            MeshMode::ExternalTailscaleOptIn
        );
        assert_eq!(
            route_label_and_account_requirement(MeshMode::ExternalTailscaleOptIn).0,
            "External Tailnet"
        );
    }

    #[test]
    fn join_tail_args_never_uses_plain_login() {
        assert_eq!(
            join_tail_args("https://mesh.example", Some("key-123")),
            vec![
                "up",
                "--login-server",
                "https://mesh.example",
                "--authkey",
                "key-123"
            ]
        );
        assert!(!join_tail_args("https://mesh.example", None).contains(&"login".to_string()));
    }

    #[test]
    fn normalize_login_server_requires_explicit_url() {
        assert_eq!(
            normalize_login_server("https://mesh.example/").unwrap(),
            "https://mesh.example"
        );
        assert_eq!(
            control_server_health_url("https://mesh.example:8443").unwrap(),
            "https://mesh.example:8443/health"
        );
        assert!(normalize_login_server("mesh.example").is_err());
        assert!(normalize_login_server("https://mesh.example/path").is_err());
        assert!(normalize_login_server("https://mesh.example?x=1").is_err());
    }

    #[tokio::test]
    async fn join_dry_run_does_not_claim_control_server_verified() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let opts = PrivateMeshJoinOpts {
            login_server: Some("https://mesh.example".into()),
            authkey: Some("hskey-auth-example".into()),
            device_add_pass: None,
            node_name: Some("studio-pc".into()),
            owner_id: None,
            tailnet_id: None,
            skip_control_health: false,
            dry_run: true,
            json: true,
            musu_home: Some(dir.clone()),
        };

        run_join(opts).await.unwrap();
        let cfg = read_private_mesh_config(&dir.join(PRIVATE_MESH_CONFIG)).unwrap();
        assert_eq!(cfg.mesh.mode, MeshMode::MusuHeadscale);
        assert_eq!(
            cfg.mesh.control_server_url.as_deref(),
            Some("https://mesh.example")
        );
        assert_eq!(cfg.verification.control_server_verified, Some(false));
        assert!(!verification_status(Some(&cfg)).release_grade);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn device_add_pass_resolves_join_tuple_and_rejects_ambiguous_flags() {
        let dir =
            std::env::temp_dir().join(format!("musu-device-add-pass-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pass_path = dir.join("musu.device_add.v1.json");
        std::fs::write(
            &pass_path,
            serde_json::json!({
                "schema": "musu.device_add.v1",
                "login_server": "https://mesh.example",
                "one_time_key": true,
                "reusable": false,
                "created_at_utc": chrono::Utc::now().to_rfc3339(),
                "expires_after_seconds": 3600,
                "authkey": "hskey-auth-pass",
                "join_command": "musu mesh join --device-add-pass <musu.device_add.v1.json>"
            })
            .to_string(),
        )
        .unwrap();

        let opts = PrivateMeshJoinOpts {
            login_server: None,
            authkey: None,
            device_add_pass: Some(pass_path.display().to_string()),
            node_name: None,
            owner_id: None,
            tailnet_id: None,
            skip_control_health: false,
            dry_run: true,
            json: true,
            musu_home: None,
        };
        let resolved = resolve_join_inputs(&opts).unwrap();
        assert_eq!(resolved.login_server, "https://mesh.example");
        assert_eq!(resolved.authkey.as_deref(), Some("hskey-auth-pass"));
        assert!(resolved.device_add_pass_used);
        assert_eq!(
            resolved.device_add_pass_path.as_deref(),
            Some(pass_path.as_path())
        );

        let consume_path = dir.join("consume.musu.device_add.v1.json");
        std::fs::write(
            &consume_path,
            "{\"schema\":\"musu.device_add.v1\",\"authkey\":\"hskey-auth-secret\"}",
        )
        .unwrap();
        let consumed_marker = consume_device_add_pass_file(&consume_path).unwrap();
        assert!(!consume_path.exists());
        assert!(consumed_marker.exists());
        assert!(consumed_marker
            .file_name()
            .and_then(|item| item.to_str())
            .is_some_and(|item| item.starts_with("consume.musu.device_add.v1.json.used-")));
        let consumed_marker_body = std::fs::read_to_string(&consumed_marker).unwrap();
        assert!(consumed_marker_body.contains("\"schema\": \"musu.device_add.consumed.v1\""));
        assert!(consumed_marker_body.contains("\"redacted\": true"));
        assert!(consumed_marker_body.contains("\"secret_material_retained\": false"));
        assert!(!consumed_marker_body.contains("hskey-auth-secret"));
        assert!(!consumed_marker_body.contains("authkey"));

        let reusable_pass = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": true,
            "reusable": true,
            "created_at_utc": chrono::Utc::now().to_rfc3339(),
            "expires_after_seconds": 3600,
            "authkey": "hskey-auth-reusable"
        }))
        .unwrap_err()
        .to_string();
        assert!(reusable_pass.contains("reusable=true is not allowed"));

        let not_one_time = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": false,
            "reusable": false,
            "created_at_utc": chrono::Utc::now().to_rfc3339(),
            "expires_after_seconds": 3600,
            "authkey": "hskey-auth-not-one-time"
        }))
        .unwrap_err()
        .to_string();
        assert!(not_one_time.contains("one_time_key=true"));

        let inline_secret = PrivateMeshJoinOpts {
            login_server: None,
            authkey: None,
            device_add_pass: Some(
                serde_json::json!({
                    "schema": "musu.device_add.v1",
                    "login_server": "https://mesh.example",
                    "authkey": "hskey-auth-inline"
                })
                .to_string(),
            ),
            node_name: None,
            owner_id: None,
            tailnet_id: None,
            skip_control_health: false,
            dry_run: true,
            json: true,
            musu_home: None,
        };
        assert!(resolve_join_inputs(&inline_secret)
            .unwrap_err()
            .to_string()
            .contains("must be a file path"));

        let expired = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": true,
            "reusable": false,
            "created_at_utc": (chrono::Utc::now() - chrono::Duration::hours(2)).to_rfc3339(),
            "expires_after_seconds": 3600,
            "authkey": "hskey-auth-expired"
        }))
        .unwrap_err()
        .to_string();
        assert!(expired.contains("expired at"));

        let future_created_at = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": true,
            "reusable": false,
            "created_at_utc": (chrono::Utc::now() + chrono::Duration::minutes(10)).to_rfc3339(),
            "expires_after_seconds": 3600,
            "authkey": "hskey-auth-future"
        }))
        .unwrap_err()
        .to_string();
        assert!(future_created_at.contains("too far in the future"));
        assert!(future_created_at.contains("300 seconds"));

        let legacy_command_only = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": true,
            "reusable": false,
            "join_command": "musu mesh join --login-server https://mesh.example --authkey hskey-auth-from-command"
        }))
        .unwrap_err()
        .to_string();
        assert!(legacy_command_only.contains("missing created_at_utc"));

        let missing_expires = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": true,
            "reusable": false,
            "created_at_utc": chrono::Utc::now().to_rfc3339(),
            "authkey": "hskey-auth-no-expiry"
        }))
        .unwrap_err()
        .to_string();
        assert!(missing_expires.contains("missing expires_after_seconds"));

        let wrong_expires = join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "musu.device_add.v1",
            "login_server": "https://mesh.example",
            "one_time_key": true,
            "reusable": false,
            "created_at_utc": chrono::Utc::now().to_rfc3339(),
            "expires_after_seconds": 7200,
            "authkey": "hskey-auth-long-expiry"
        }))
        .unwrap_err()
        .to_string();
        assert!(wrong_expires.contains("expires_after_seconds must be 3600"));

        let ambiguous = PrivateMeshJoinOpts {
            login_server: Some("https://mesh.example".into()),
            authkey: None,
            device_add_pass: opts.device_add_pass.clone(),
            node_name: None,
            owner_id: None,
            tailnet_id: None,
            skip_control_health: false,
            dry_run: true,
            json: true,
            musu_home: None,
        };
        assert!(resolve_join_inputs(&ambiguous)
            .unwrap_err()
            .to_string()
            .contains("must not be combined"));
        assert!(join_inputs_from_device_add_pass(&serde_json::json!({
            "schema": "wrong",
            "login_server": "https://mesh.example",
            "authkey": "hskey-auth-pass"
        }))
        .unwrap_err()
        .to_string()
        .contains("musu.device_add.v1"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn bootstrap_bundle_writes_headscale_control_plane_files() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let output = dir.join("bundle");
        let opts = PrivateMeshBootstrapOpts {
            server_url: "https://mesh.example".into(),
            output: Some(output.clone()),
            tailnet_name: "musu-lab".into(),
            base_domain: "musu.private".into(),
            image: "ghcr.io/juanfont/headscale:v0.28.0".into(),
            expose_public: false,
            disable_embedded_derp: false,
            derp_ipv4: Some("198.51.100.10".into()),
            derp_ipv6: Some("2001:db8::10".into()),
            keep_tailscale_derp: false,
            allow_insecure_http: false,
            force: false,
            json: true,
            musu_home: None,
        };

        let report = write_bootstrap_bundle(&opts, &dir).unwrap();
        assert_eq!(report.schema, "musu.private_mesh_bootstrap.v1");
        assert_eq!(report.server_url, "https://mesh.example");
        assert!(report
            .commands
            .iter()
            .any(|command| command == "docker compose config --quiet"));
        assert!(report
            .commands
            .iter()
            .any(|command| command == "docker compose exec -T headscale headscale health"));
        assert!(!report
            .commands
            .iter()
            .any(|command| command == "docker compose exec headscale headscale health"));
        assert!(report
            .commands
            .iter()
            .any(|command| command.contains("check-public-endpoint.ps1")));
        assert!(report.embedded_derp_enabled);
        assert_eq!(report.derp_public_ipv4.as_deref(), Some("198.51.100.10"));
        assert_eq!(report.derp_public_ipv6.as_deref(), Some("2001:db8::10"));
        assert!(!report.upstream_tailscale_derp_enabled);
        assert!(report.caddy_reverse_proxy_enabled);
        assert_eq!(report.caddy_https_port, Some(443));
        assert!(output.join("docker-compose.yaml").exists());
        assert!(output.join("Caddyfile").exists());
        assert!(output.join("config/config.yaml").exists());
        assert!(output.join("config/policy.json").exists());
        assert!(output.join("scripts/check-public-endpoint.ps1").exists());
        assert!(output.join("scripts/check-public-endpoint.sh").exists());
        assert!(output.join("scripts/create-join-key.ps1").exists());
        assert!(output.join("scripts/create-join-key.sh").exists());
        assert!(output.join("NOTICE.headscale.md").exists());

        let compose = std::fs::read_to_string(output.join("docker-compose.yaml")).unwrap();
        assert!(compose.contains("image: caddy:2.9.1"));
        assert!(compose.contains("0.0.0.0:80:80"));
        assert!(compose.contains("0.0.0.0:443:443"));
        assert!(compose.contains("caddy_data:"));
        assert!(compose.contains("0.0.0.0:3478:3478/udp"));
        let caddyfile = std::fs::read_to_string(output.join("Caddyfile")).unwrap();
        assert!(caddyfile.contains("mesh.example"));
        assert!(caddyfile.contains("reverse_proxy headscale:8080"));
        let config = std::fs::read_to_string(output.join("config/config.yaml")).unwrap();
        let policy = std::fs::read_to_string(output.join("config/policy.json")).unwrap();
        assert!(config.contains("server_url: https://mesh.example"));
        assert!(config.contains("enabled: true"));
        assert!(config.contains("ipv4: 198.51.100.10"));
        assert!(config.contains("ipv6: 2001:db8::10"));
        assert!(config.contains("urls: []"));
        assert!(config.contains("override_local_dns: false"));
        assert!(config.contains("nameservers:"));
        assert!(config.contains("global: []"));
        assert!(config.contains("split: {}"));
        assert!(config.contains("policy:"));
        assert_eq!(policy.trim(), "{}");
        let readme = std::fs::read_to_string(output.join("README.md")).unwrap();
        let check_ps1 =
            std::fs::read_to_string(output.join("scripts/check-public-endpoint.ps1")).unwrap();
        let check_sh =
            std::fs::read_to_string(output.join("scripts/check-public-endpoint.sh")).unwrap();
        let key_ps1 = std::fs::read_to_string(output.join("scripts/create-join-key.ps1")).unwrap();
        let key_sh = std::fs::read_to_string(output.join("scripts/create-join-key.sh")).unwrap();
        assert!(readme.contains("musu.device_add.v1"));
        assert!(readme.contains("MUSU device-add pass"));
        assert!(readme.contains("raw preauth-key command shape"));
        assert!(readme.contains("musu mesh join --device-add-pass <musu.device_add.v1.json>"));
        assert!(readme.contains("docker compose config --quiet"));
        assert!(readme.contains("docker compose exec -T headscale headscale health"));
        assert!(!readme.contains("docker compose exec headscale headscale health"));
        assert!(readme.contains("check-public-endpoint.ps1"));
        assert!(readme.contains("musu mesh release-proof --target-node"));
        assert!(readme.contains("verify-private-mesh-route-proof-evidence.ps1"));
        assert!(check_ps1.contains("/health"));
        assert!(check_ps1.contains("Test-NetConnection"));
        assert!(check_sh.contains("curl --fail"));
        assert!(check_sh.contains("/health"));
        assert!(readme.contains("default HTTPS bundle includes Caddy"));
        assert!(readme.contains("scripts\\create-join-key.ps1"));
        assert!(key_ps1.contains("docker compose exec -T headscale headscale @args"));
        assert!(key_ps1.contains("docker compose exec -T headscale headscale users list"));
        assert!(key_ps1.contains("docker compose exec -T headscale headscale @keyArgs"));
        assert!(!key_ps1.contains("docker compose exec headscale headscale"));
        assert!(key_ps1.contains("preauthkeys\", \"create\", \"--user\", $userId"));
        assert!(!key_ps1.contains("[switch]$Reusable"));
        assert!(!key_ps1.contains("--reusable"));
        assert!(key_ps1.contains("function Redact-HeadscaleSecrets"));
        assert!(key_ps1.contains("hskey-auth-<redacted>"));
        assert!(key_ps1.contains("Write-Output (Redact-HeadscaleSecrets $keyText)"));
        assert!(!key_ps1.contains("Write-Output $keyText"));
        assert!(key_ps1.contains("Resolve-HeadscaleUserId"));
        assert!(key_ps1.contains("Push-Location $BundleRoot"));
        assert!(key_ps1.contains("Pop-Location"));
        assert!(key_ps1.contains("Writing MUSU device-add pass file"));
        assert!(key_ps1.contains("device-add-passes"));
        assert!(key_ps1.contains("$createdAtUtc"));
        assert!(key_ps1.contains("created_at_utc = $createdAtUtc"));
        assert!(key_ps1.contains("expires_after_seconds = 3600"));
        // Pass file must be written BOM-free (WriteAllText), not via
        // Set-Content -Encoding UTF8 which prepends a BOM and breaks JSON parse.
        assert!(key_ps1.contains("[System.IO.File]::WriteAllText($passPath"));
        assert!(!key_ps1.contains("Set-Content -LiteralPath $passPath -Encoding UTF8"));
        assert!(key_ps1.contains("SetAccessRuleProtection($true, $false)"));
        assert!(key_ps1.contains("schema = \"musu.device_add.v1\""));
        assert!(key_ps1.contains("one_time_key = $true"));
        assert!(key_ps1.contains("reusable = $false"));
        assert!(key_ps1.contains("authkey = $key"));
        assert!(key_ps1.contains("ConvertTo-Json -Compress"));
        assert!(key_ps1.contains("Write-Output $passPath"));
        assert!(key_ps1.contains("Target PC command:"));
        assert!(key_ps1.contains("musu mesh join --device-add-pass <musu.device_add.v1.json>"));
        assert!(!key_ps1.contains("$deviceAddPass | ConvertTo-Json -Compress\n\nWrite-Host"));
        assert!(!key_ps1
            .contains("Write-Output \"musu mesh join --login-server $ServerUrl --authkey $key\""));
        assert!(!key_ps1.contains(
            "join_command = \"musu mesh join --login-server $ServerUrl --authkey $key\""
        ));
        assert!(key_sh.contains("docker compose exec -T headscale headscale health"));
        assert!(key_sh.contains("docker compose exec -T headscale headscale users list"));
        assert!(key_sh.contains("docker compose exec -T headscale headscale preauthkeys create"));
        assert!(!key_sh.contains("docker compose exec headscale headscale"));
        assert!(key_sh.contains("preauthkeys create --user \"$USER_ID\""));
        assert!(key_sh.contains("hskey-auth-<redacted>"));
        assert!(key_sh.contains(
            "sed -E 's/hskey-auth-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+/hskey-auth-<redacted>/g'"
        ));
        assert!(!key_sh.contains("printf '%s\\n' \"$KEY_OUTPUT\"\n  echo"));
        assert!(key_sh.contains("BUNDLE_ROOT=\"$(CDPATH= cd -- \""));
        assert!(key_sh.contains("cd \"$BUNDLE_ROOT\""));
        assert!(key_sh.contains("headscale users list"));
        assert!(key_sh.contains("Writing MUSU device-add pass file"));
        assert!(key_sh.contains("device-add-passes"));
        assert!(key_sh.contains("CREATED_AT_UTC=\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""));
        assert!(key_sh.contains("\"created_at_utc\":\"%s\""));
        assert!(key_sh.contains("\"expires_after_seconds\":3600"));
        assert!(key_sh.contains("umask 077"));
        assert!(key_sh.contains("> \"$PASS_PATH\""));
        assert!(key_sh.contains("chmod 600 \"$PASS_PATH\""));
        assert!(key_sh.contains("printf '%s\\n' \"$PASS_PATH\""));
        assert!(key_sh.contains("\"schema\":\"musu.device_add.v1\""));
        assert!(key_sh.contains("\"one_time_key\":true"));
        assert!(key_sh.contains("\"reusable\":false"));
        assert!(key_sh.contains("\"authkey\":\"%s\""));
        assert!(key_sh.contains("Target PC command:"));
        assert!(key_sh.contains("musu mesh join --device-add-pass <musu.device_add.v1.json>"));
        assert!(!key_sh.contains("printf 'musu mesh join --login-server %s --authkey %s"));
        assert!(
            !key_sh.contains("\"join_command\":\"musu mesh join --login-server %s --authkey %s\"")
        );
        assert!(readme.contains("tailscale debug derp headscale"));
        assert!(!readme.to_lowercase().contains("sign up for tailscale.com"));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn bootstrap_bundle_requires_https_unless_explicit_lab_override() {
        assert!(normalize_control_server_url("http://mesh.local:8080", false).is_err());
        assert!(normalize_control_server_url("https://mesh.local/path", false).is_err());
        assert_eq!(
            normalize_control_server_url("http://mesh.local:8080/", true).unwrap(),
            "http://mesh.local:8080"
        );
    }

    #[test]
    fn bootstrap_rejects_script_unsafe_tailnet_and_base_domain_inputs() {
        assert!(validate_private_mesh_tailnet_name("musu-lab").is_ok());
        assert!(validate_private_mesh_tailnet_name("musu.lab_1").is_ok());
        assert!(validate_private_mesh_tailnet_name("musu lab").is_err());
        assert!(validate_private_mesh_tailnet_name("musu'lab").is_err());
        assert!(validate_private_mesh_tailnet_name("musu\nlab").is_err());
        assert!(validate_private_mesh_tailnet_name("-musu").is_err());
        assert!(validate_private_mesh_tailnet_name("musu-").is_err());

        assert!(validate_private_mesh_base_domain("musu.private").is_ok());
        assert!(validate_private_mesh_base_domain("mesh-1.musu.private").is_ok());
        assert!(validate_private_mesh_base_domain("musu..private").is_err());
        assert!(validate_private_mesh_base_domain("_musu.private").is_err());
        assert!(validate_private_mesh_base_domain("musu.private/evil").is_err());
        assert!(validate_private_mesh_base_domain("-musu.private").is_err());
        assert!(validate_private_mesh_base_domain("musu.private.").is_err());
    }

    #[test]
    fn bootstrap_embedded_derp_requires_https_and_valid_public_ips() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let output = dir.join("bundle");
        let mut opts = PrivateMeshBootstrapOpts {
            server_url: "http://mesh.local:8080".into(),
            output: Some(output.clone()),
            tailnet_name: "musu-lab".into(),
            base_domain: "musu.private".into(),
            image: "ghcr.io/juanfont/headscale:v0.28.0".into(),
            expose_public: false,
            disable_embedded_derp: false,
            derp_ipv4: None,
            derp_ipv6: None,
            keep_tailscale_derp: false,
            allow_insecure_http: true,
            force: false,
            json: true,
            musu_home: None,
        };

        assert!(write_bootstrap_bundle(&opts, &dir).is_err());
        opts.disable_embedded_derp = true;
        assert!(write_bootstrap_bundle(&opts, &dir).is_err());
        opts.keep_tailscale_derp = true;
        assert!(write_bootstrap_bundle(&opts, &dir).is_ok());

        assert!(parse_optional_derp_ipv4(Some("127.0.0.1")).is_err());
        assert!(parse_optional_derp_ipv4(Some("2001:db8::1")).is_err());
        assert_eq!(
            parse_optional_derp_ipv6(Some("2001:db8::1"))
                .unwrap()
                .as_deref(),
            Some("2001:db8::1")
        );

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn write_and_read_private_mesh_config_round_trips() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join(PRIVATE_MESH_CONFIG);
        let cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: Some("owner-1".into()),
                tailnet_id: Some("tailnet-1".into()),
                node_name: Some("studio-pc".into()),
                client_kind: Some("tailscale_cli".into()),
                derp_policy: Some("musu_or_operator_managed".into()),
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification::default(),
        };
        write_private_mesh_config(&path, &cfg).unwrap();
        assert_eq!(read_private_mesh_config(&path), Some(cfg));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn mark_callback_verified_updates_only_private_mesh_configs() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join(PRIVATE_MESH_CONFIG);
        let cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: None,
                tailnet_id: None,
                node_name: Some("studio-pc".into()),
                client_kind: Some("tailscale_cli".into()),
                derp_policy: Some("musu_or_operator_managed".into()),
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification {
                local_tailnet_ip: Some("100.64.0.10".into()),
                verified_target_tailnet_ip: Some("100.64.0.11".into()),
                callback_tailnet_ip: None,
                control_server_verified: Some(true),
                tailscale_ping_verified: Some(true),
                bridge_health_verified: Some(true),
                callback_verified: Some(false),
            },
        };
        write_private_mesh_config(&path, &cfg).unwrap();

        assert!(mark_callback_verified(
            &dir,
            &serde_json::json!({"candidate_addr": "100.64.0.11:8070"})
        )
        .unwrap());
        let updated = read_private_mesh_config(&path).unwrap();
        assert_eq!(updated.verification.callback_verified, Some(true));
        assert_eq!(
            updated.verification.callback_tailnet_ip.as_deref(),
            Some("100.64.0.11")
        );
        assert!(updated.mesh.last_verified_at.is_some());
        assert!(verification_status(Some(&updated)).release_grade);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn callback_and_release_grade_require_verified_control_server() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join(PRIVATE_MESH_CONFIG);
        let mut cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: None,
                tailnet_id: None,
                node_name: Some("studio-pc".into()),
                client_kind: Some("tailscale_cli".into()),
                derp_policy: Some("musu_or_operator_managed".into()),
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification {
                local_tailnet_ip: Some("100.64.0.10".into()),
                verified_target_tailnet_ip: Some("100.64.0.11".into()),
                callback_tailnet_ip: None,
                control_server_verified: Some(false),
                tailscale_ping_verified: Some(true),
                bridge_health_verified: Some(true),
                callback_verified: Some(false),
            },
        };
        write_private_mesh_config(&path, &cfg).unwrap();

        assert!(!mark_callback_verified(
            &dir,
            &serde_json::json!({"candidate_addr": "100.64.0.11:8070"})
        )
        .unwrap());
        let updated = read_private_mesh_config(&path).unwrap();
        assert_eq!(updated.verification.callback_verified, Some(false));
        assert!(!verification_status(Some(&updated)).release_grade);

        cfg.verification.control_server_verified = Some(true);
        write_private_mesh_config(&path, &cfg).unwrap();
        assert!(mark_callback_verified(
            &dir,
            &serde_json::json!({"candidate_addr": "100.64.0.11:8070"})
        )
        .unwrap());
        let updated = read_private_mesh_config(&path).unwrap();
        assert_eq!(updated.verification.callback_verified, Some(true));
        assert!(verification_status(Some(&updated)).release_grade);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn callback_and_release_grade_require_same_verified_target() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join(PRIVATE_MESH_CONFIG);
        let mut cfg = PrivateMeshConfig {
            mesh: PrivateMeshConfigMesh {
                mode: MeshMode::MusuHeadscale,
                control_server_url: Some("https://mesh.example".into()),
                owner_id: None,
                tailnet_id: None,
                node_name: Some("studio-pc".into()),
                client_kind: Some("tailscale_cli".into()),
                derp_policy: Some("musu_or_operator_managed".into()),
                last_verified_at: None,
            },
            verification: PrivateMeshConfigVerification {
                local_tailnet_ip: Some("100.64.0.10".into()),
                verified_target_tailnet_ip: Some("100.64.0.11".into()),
                callback_tailnet_ip: None,
                control_server_verified: Some(true),
                tailscale_ping_verified: Some(true),
                bridge_health_verified: Some(true),
                callback_verified: Some(false),
            },
        };
        write_private_mesh_config(&path, &cfg).unwrap();

        assert!(!mark_callback_verified(
            &dir,
            &serde_json::json!({"candidate_addr": "100.64.0.12:8070"})
        )
        .unwrap());
        let updated = read_private_mesh_config(&path).unwrap();
        assert_eq!(updated.verification.callback_verified, Some(false));
        assert_eq!(updated.verification.callback_tailnet_ip, None);
        assert!(!verification_status(Some(&updated)).release_grade);

        assert!(mark_callback_verified(
            &dir,
            &serde_json::json!({"candidate_addr": "http://100.64.0.11:8070/health"})
        )
        .unwrap());
        let updated = read_private_mesh_config(&path).unwrap();
        assert_eq!(updated.verification.callback_verified, Some(true));
        assert_eq!(
            updated.verification.callback_tailnet_ip.as_deref(),
            Some("100.64.0.11")
        );
        assert!(verification_status(Some(&updated)).release_grade);

        cfg.verification.callback_tailnet_ip = Some("100.64.0.12".into());
        cfg.verification.callback_verified = Some(true);
        write_private_mesh_config(&path, &cfg).unwrap();
        let updated = read_private_mesh_config(&path).unwrap();
        assert!(!verification_status(Some(&updated)).release_grade);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn release_proof_sidecar_uses_verifier_json_schema() {
        let dir =
            std::env::temp_dir().join(format!("musu-private-mesh-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join("private-mesh-route-proof.evidence.json");
        write_json_with_sha256(&path, &serde_json::json!({"ok": true})).unwrap();

        let sidecar_path = sha256_sidecar_path(&path);
        let sidecar: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&sidecar_path).unwrap()).unwrap();
        assert_eq!(
            sidecar.get("schema").and_then(|value| value.as_str()),
            Some("musu.evidence_integrity_sidecar.v1")
        );
        assert_eq!(
            sidecar.get("algorithm").and_then(|value| value.as_str()),
            Some("sha256")
        );
        assert_eq!(
            sidecar
                .get("evidence_file")
                .and_then(|value| value.as_str()),
            Some("private-mesh-route-proof.evidence.json")
        );
        assert!(sidecar
            .get("sha256")
            .and_then(|value| value.as_str())
            .map(|value| value.len() == 64 && value.chars().all(|ch| ch.is_ascii_hexdigit()))
            .unwrap_or(false));

        let _ = std::fs::remove_dir_all(dir);
    }
}
