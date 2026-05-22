use clap::{Parser, Subcommand};

mod adapter;
mod bridge;
mod control;
mod core;
mod indexer;
mod install;
mod peer;
mod writer;

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
    }
}
