use clap::{Parser, Subcommand};

mod bridge;
mod control;
mod core;
mod indexer;
mod install;
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
    Indexer,
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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();
    match cli.command {
        Cmd::Bridge => bridge::run().await,
        Cmd::Indexer => indexer::run().await,
        Cmd::Writer => writer::run().await,
        Cmd::Control => control::run().await,
        Cmd::Core => core::run().await,

        // R6 wiki/496:
        Cmd::Install(opts) => install::run_install(opts).await,
        Cmd::Uninstall(opts) => install::run_uninstall(opts).await,
        Cmd::AutoUpdate(opts) => install::run_auto_update(opts).await,
        Cmd::Supervise { musu_home } => install::run_supervise(musu_home).await,
        Cmd::SchemaPrecheck(opts) => install::run_schema_precheck(opts).await,
        Cmd::ApplySchema(opts) => install::run_apply_schema(opts).await,
    }
}
