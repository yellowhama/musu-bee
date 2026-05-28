//! V24-R4 wiki/494 — native Rust per-workspace indexer.
//!
//! Replaces Python `musu-indexer` (core.py + workspace.py + Go scanner binary)
//! with pure Rust per `feedback-no-python` + `decision-musu-backend-rust`.
//!
//! Storage substrate: SQLite FTS5 at `<work_dir>/.musu_dev.db` (per-workspace,
//! NOT main musu.db — no Const III gate). Schema matches Python's
//! `search_index` table byte-for-byte so the existing musu-bee frontend
//! consumers (SearchPanel.tsx, handleWikiCommand.ts, app/api/index-search/route.ts)
//! keep working unchanged. See §4 C1 in the plan: `snippet(search_index, 2,
//! '<b>', '</b>', '…', 20)` — literal U+2026 ellipsis, col=2 (content),
//! maxchars=20.
//!
//! Subcommand surface (`musu indexer <action>`):
//!   * `sync`        — re-index a workspace from disk (on-demand path)
//!   * `search`      — FTS5 query against an existing index (debugging aid)
//!   * `init-profile` — write a default `.musu-indexer.json` profile
//!   * `watch`       — opt-in (feature `indexer-watch`) `notify`-based watcher
//!
//! Internal API for R1 bridge hook (C-R4-7): see `sync::sync_workspace_async`.
//! Called fire-and-forget from `bridge::handlers::companies::create` so the
//! 201 response isn't blocked on disk scan.

use std::path::PathBuf;

use anyhow::Result;
use clap::Subcommand;

pub mod db;
pub mod profile;
pub mod scanner;
pub mod search;
pub mod symbols;
pub mod sync;
pub mod watch;

/// `musu indexer <action>` enum. Parsed by clap in `main.rs`.
#[derive(Subcommand, Debug)]
pub enum IndexerAction {
    /// Sync the workspace into `<work_dir>/.musu_dev.db`.
    Sync {
        /// Workspace root. If omitted, uses CWD.
        #[arg(long)]
        work_dir: Option<PathBuf>,
        /// Profile name (logical label stored in `index_meta`). Defaults to
        /// the workspace directory basename.
        #[arg(long)]
        name: Option<String>,
    },

    /// FTS5 keyword search against an existing `<work_dir>/.musu_dev.db`.
    /// Useful for ops debugging without the bridge HTTP route.
    Search {
        /// Workspace root.
        #[arg(long)]
        work_dir: PathBuf,
        /// Query string. Plain-text input is accepted; if raw FTS5 parsing
        /// fails (for example on hyphenated literals), MUSU retries as a
        /// quoted phrase query.
        #[arg(long, short = 'q')]
        query: String,
        /// `all` | `code` | `doc` — currently advisory; FTS5 matches all
        /// row types and filtering happens client-side. Reserved for V25.
        #[arg(long, default_value = "all")]
        scope: String,
        /// Cap result count. Default 20 (Python parity).
        #[arg(long, default_value_t = 20)]
        limit: u32,
    },

    /// Write a default `.musu-indexer.json` into `<work_dir>` so subsequent
    /// `sync` calls pick up the user-tweakable ignore globs.
    InitProfile {
        #[arg(long)]
        work_dir: PathBuf,
        #[arg(long)]
        name: String,
    },

    /// Watch the workspace for changes and re-sync on quiescence.
    /// Opt-in via the `indexer-watch` Cargo feature (C-R4-6).
    Watch {
        #[arg(long)]
        work_dir: PathBuf,
        #[arg(long)]
        name: Option<String>,
    },
}

/// Subcommand dispatcher. Wired from `main.rs Cmd::Indexer { action }`.
pub async fn run(action: IndexerAction) -> Result<()> {
    match action {
        IndexerAction::Sync { work_dir, name } => {
            let work_dir = work_dir
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
            let name = name.unwrap_or_else(|| {
                work_dir
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "workspace".into())
            });

            let report = sync::sync_workspace_async(work_dir.clone(), name).await?;
            // Tracing for operators; the bridge fire-and-forget call also
            // goes through this path but ignores the return value.
            tracing::info!(
                work_dir = %work_dir.display(),
                files = report.files_indexed,
                symbols = report.symbols_extracted,
                duration_ms = report.duration_ms,
                skipped_reason = ?report.skipped_reason,
                "musu indexer sync complete"
            );
            // Also emit a human line to stdout so ops can see the result
            // without enabling tracing.
            println!(
                "indexed {} files ({} symbols) in {} ms{}",
                report.files_indexed,
                report.symbols_extracted,
                report.duration_ms,
                report
                    .skipped_reason
                    .as_deref()
                    .map(|r| format!(" (skipped: {r})"))
                    .unwrap_or_default()
            );
            Ok(())
        }
        IndexerAction::Search {
            work_dir,
            query,
            scope,
            limit,
        } => {
            let hits = search::search(&work_dir, &query, &scope, limit).await?;
            // Emit JSON byte-compat with the HTTP route so callers can
            // shell-pipe through `jq` and get the same shape.
            let body = serde_json::to_string(&hits)?;
            println!("{body}");
            Ok(())
        }
        IndexerAction::InitProfile { work_dir, name } => {
            profile::init_profile_in(&work_dir, &name)?;
            println!(
                "wrote default profile to {}",
                work_dir.join(profile::PROFILE_FILE_NAME).display()
            );
            Ok(())
        }
        IndexerAction::Watch { work_dir, name } => {
            let name = name.unwrap_or_else(|| {
                work_dir
                    .file_name()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "workspace".into())
            });
            watch::run_watch(work_dir, name).await
        }
    }
}
