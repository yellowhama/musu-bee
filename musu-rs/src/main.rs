use clap::{Parser, Subcommand};

mod bridge;
mod core;
mod control;
mod indexer;
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
    }
}
