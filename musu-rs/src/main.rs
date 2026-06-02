use clap::{Parser, Subcommand};

mod adapter;
mod brain;
mod bridge;
mod cloud;
mod control;
mod core;
mod indexer;
mod install;
mod io;
mod mesh;
mod peer;
mod workflow;
mod writer;

// V27: re-export CLI option structs from their canonical home in
// `install::cli_commands` so the `Cmd` enum can reference them.
use install::cli_commands::{
    DoctorOpts, GetOpts, LsOpts, PutOpts, RelayAction, RouteOpts, ShareOpts, StopOpts, UnshareOpts,
    UpOpts,
};

#[derive(Parser)]
#[command(name = "musu", version, about = "musu control plane (Rust)")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    Bridge,
    /// V24-R4 wiki/494: native Rust per-workspace file/code indexer.
    /// Sub-actions: sync, search, init-profile, watch.
    Indexer {
        #[command(subcommand)]
        action: indexer::IndexerAction,
    },
    Writer,
    Control,
    /// Apply the schema to the default DB path without booting the bridge.
    /// Use for first-install provisioning and CI bootstrap.
    Core,

    // ── R6 (wiki/496) — installer + auto-update + supervisor surface ─────
    /// Fresh-install musu onto this machine. Seeds `~/.musu/`, generates
    /// a 32-byte bridge token, copies the binary, and registers the
    /// platform service (systemd user unit / Scheduled Task / LaunchAgent).
    Install(install::InstallOpts),

    /// Stop the bridge, deregister the platform service, and (with
    /// `--purge`) delete `~/.musu/` after a typed-string confirmation.
    Uninstall(install::UninstallOpts),

    /// Hybrid auto-update: probe GitHub release first, source-build fallback.
    /// Invoked by the platform's update timer or `POST /api/system/update`.
    AutoUpdate(install::AutoUpdateOpts),

    /// Thin wrapper that execs `~/.musu/bin/musud` (the supervisor binary).
    Supervise {
        #[arg(long, hide = true)]
        musu_home: Option<std::path::PathBuf>,
    },

    /// Compare the on-disk SQLite schema version against this binary's
    /// expected version. Exit 75 (TEMPFAIL) on mismatch — auto-update
    /// uses this as the Const III gate.
    SchemaPrecheck(install::SchemaGateOpts),

    /// Operator-acknowledged schema migration. Prints the Const III banner,
    /// runs the migration, removes PENDING_SCHEMA_GATE.txt, and promotes
    /// any staged `musu.new` candidate via staged_swap.
    ApplySchema(install::SchemaGateOpts),

    /// V26-W7 wiki/510: register THIS machine as a musu peer of a given
    /// kind (ollama / comfyui / script). Writes ~/.musu/node.toml,
    /// installs a platform service for boot-start, and optionally posts
    /// to the local bridge + musu.pro registry.
    Peer {
        #[command(subcommand)]
        action: peer::PeerAction,
    },

    // ── V27 file-sharing + task-routing CLI ──────────────────────────────
    /// Share a directory with connected peers.
    Share(ShareOpts),
    /// Stop sharing a directory.
    Unshare(UnshareOpts),
    /// List currently shared directories.
    Shares,
    /// Send a task to a specific peer or let musu auto-route.
    Route(RouteOpts),
    /// Inspect MUSU-assisted rendezvous/relay readiness.
    Relay {
        #[command(subcommand)]
        action: RelayAction,
    },
    /// List files on a peer machine.
    Ls(LsOpts),
    /// Download a file from a peer.
    Get(GetOpts),
    /// Upload a file to a peer.
    Put(PutOpts),

    /// V27-F2: Discover musu peers on the local network via mDNS.
    Discover {
        /// How long to scan in seconds.
        #[arg(long, default_value = "5")]
        timeout: u64,
    },

    /// Show fleet status across all connected nodes.
    Status,
    /// List recent tasks across the fleet.
    Tasks,

    /// V27-F5: Execute a workflow.
    WorkflowRun {
        /// Workflow ID to execute.
        id: String,
    },

    /// V27-F7: Generate a pairing code for another machine to join.
    Pair,
    /// V27-F7: Join another machine using a pairing code.
    Join {
        /// The pairing code (e.g., 123-456).
        code: String,
    },

    /// V27-F9: Start watching shared directories and sync to peers.
    Sync,

    /// V27-F10: Mount a remote node's shared directory (shows WebDAV URL).
    Mount {
        /// Remote node name or addr.
        #[arg(long)]
        node: Option<String>,
    },

    /// V27 Account: Login to musu.pro to enable automatic peer discovery.
    Login,
    /// V27 Account: Logout from musu.pro.
    Logout,
    /// V27 Account: Show current login status.
    Whoami,
    /// Diagnose local install, login, bridge, dashboard, and package state.
    Doctor(DoctorOpts),
    /// First-run helper: seed token, start bridge, and hand off to dashboard.
    Up(UpOpts),
    /// Stop the local bridge runtime registered in ~/.musu/services/bridge.json.
    Stop(StopOpts),
    /// Alias for `musu stop`.
    Down(StopOpts),
    /// Show package/runtime status, including Windows startup-task state
    /// when running with package identity.
    PackageStatus,
}

/// V24-R3 wiki/493 Critic C1 (HIGH): per-subcommand `tracing` init.
///
/// Previously `tracing_subscriber::fmt().init()` ran in `main()` BEFORE
/// `Cli::parse`, locking the global subscriber to stdout for the lifetime of
/// the process. That makes `Cmd::Control`'s "stderr-only writer" structurally
/// impossible — by the time `control::run()` ran, the global subscriber was
/// already wired to stdout, and `tracing_subscriber::set_global_default` panics
/// on re-init.
///
/// Fix: each `Cmd::*` arm now calls one of these init fns BEFORE its `run`.
/// Non-control arms preserve the original stdout sink. Control routes to
/// stderr explicitly — `r3_stdout_clean.rs` is the regression gate.
fn init_tracing_default() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init();
}

/// Control-only: identical filter but writes to stderr so MCP JSON-RPC frames
/// on stdout stay byte-clean (C2 invariant — `r3_stdout_clean.rs` asserts 0
/// stdout bytes with empty stdin).
fn init_tracing_control() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .try_init();
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    install::package_status::best_effort_prime_packaged_startup_task();
    match cli.command {
        Cmd::Bridge => {
            init_tracing_default();
            bridge::run().await
        }
        Cmd::Indexer { action } => {
            init_tracing_default();
            indexer::run(action).await
        }
        Cmd::Writer => {
            init_tracing_default();
            writer::run().await
        }
        Cmd::Control => {
            // C1: stderr-only init MUST happen BEFORE control::run() so any
            // tracing call inside rmcp serve also lands on stderr.
            init_tracing_control();
            control::run().await
        }
        Cmd::Core => {
            init_tracing_default();
            core::run().await
        }

        // R6 wiki/496:
        Cmd::Install(opts) => {
            init_tracing_default();
            install::run_install(opts).await
        }
        Cmd::Uninstall(opts) => {
            init_tracing_default();
            install::run_uninstall(opts).await
        }
        Cmd::AutoUpdate(opts) => {
            init_tracing_default();
            install::run_auto_update(opts).await
        }
        Cmd::Supervise { musu_home } => {
            init_tracing_default();
            install::run_supervise(musu_home).await
        }
        Cmd::SchemaPrecheck(opts) => {
            init_tracing_default();
            install::run_schema_precheck(opts).await
        }
        Cmd::ApplySchema(opts) => {
            init_tracing_default();
            install::run_apply_schema(opts).await
        }
        Cmd::Peer { action } => {
            init_tracing_default();
            peer::run(action).await
        }

        // V27 file-sharing + task-routing CLI:
        Cmd::Share(opts) => {
            init_tracing_default();
            install::cli_commands::run_share(opts).await
        }
        Cmd::Unshare(opts) => {
            init_tracing_default();
            install::cli_commands::run_unshare(opts).await
        }
        Cmd::Shares => {
            init_tracing_default();
            install::cli_commands::run_shares().await
        }
        Cmd::Route(opts) => {
            init_tracing_default();
            install::cli_commands::run_route(opts).await
        }
        Cmd::Relay { action } => {
            init_tracing_default();
            install::cli_commands::run_relay(action).await
        }
        Cmd::Ls(opts) => {
            init_tracing_default();
            install::cli_commands::run_ls(opts).await
        }
        Cmd::Get(opts) => {
            init_tracing_default();
            install::cli_commands::run_get(opts).await
        }
        Cmd::Put(opts) => {
            init_tracing_default();
            install::cli_commands::run_put(opts).await
        }

        Cmd::Discover { timeout } => {
            init_tracing_default();
            println!("Scanning local network for musu peers ({timeout}s)...");
            let peers = peer::mdns::discover_peers(std::time::Duration::from_secs(timeout)).await;
            if peers.is_empty() {
                println!("No peers found. Make sure musu bridge is running on other machines.");
            } else {
                println!("Found {} peer(s):\n", peers.len());
                for p in &peers {
                    println!("  {} ({})", p.name, p.addr);
                    println!("     version: {}", p.version);
                }
            }
            Ok(())
        }

        Cmd::Status => {
            init_tracing_default();
            install::cli_commands::run_status().await
        }
        Cmd::Tasks => {
            init_tracing_default();
            install::cli_commands::run_tasks().await
        }

        Cmd::WorkflowRun { id } => {
            init_tracing_default();
            install::cli_commands::run_workflow_execute(&id).await
        }

        Cmd::Pair => {
            init_tracing_default();
            install::cli_commands::run_pair().await
        }
        Cmd::Join { code } => {
            init_tracing_default();
            install::cli_commands::run_join(&code).await
        }

        Cmd::Sync => {
            init_tracing_default();
            install::cli_commands::run_sync().await
        }

        Cmd::Mount { node } => {
            init_tracing_default();
            install::cli_commands::run_mount(node.as_deref()).await
        }

        Cmd::Login => {
            init_tracing_default();
            install::cli_commands::run_login().await
        }
        Cmd::Logout => {
            init_tracing_default();
            install::cli_commands::run_logout().await
        }
        Cmd::Whoami => {
            init_tracing_default();
            install::cli_commands::run_whoami().await
        }
        Cmd::Doctor(opts) => {
            init_tracing_default();
            install::cli_commands::run_doctor(opts).await
        }
        Cmd::Up(opts) => {
            init_tracing_default();
            install::cli_commands::run_up(opts).await
        }
        Cmd::Stop(opts) | Cmd::Down(opts) => {
            init_tracing_default();
            install::cli_commands::run_stop(opts).await
        }
        Cmd::PackageStatus => {
            init_tracing_default();
            install::run_package_status().await
        }
    }
}
