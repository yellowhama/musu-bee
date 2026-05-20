//! musu-rs `core` module — wiki/492.
//!
//! Responsibilities:
//!   1. Apply schema v1 (4 tables + indexes) — `schema.rs` + `migrate.rs`.
//!   2. Set per-DB pragma policy (WAL, FK ON, busy_timeout) — `pragma.rs`.
//!   3. companies.yaml load / write + .tmp recovery — `companies.rs`.
//!   4. Embedded default template — `templates.rs`.
//!   5. Readiness probe for /health/ready — `probe.rs`.
//!   6. Const III gate UX at first apply — `apply_with_gate`.
//!
//! Entry point: `apply(&pool)` — called from `bridge::run()` between
//! `db::init_pool` and `AuditState::new` (Critic H-2 boot-order invariant).

pub mod companies;
pub mod error;
pub mod migrate;
pub mod pragma;
pub mod probe;
pub mod schema;
pub mod templates;

use anyhow::Result;
use sqlx::SqlitePool;

// Re-exports for downstream callers (bridge handlers + tests + R3+).
// Some are unused at R2 ship time — they form the stable public surface
// future modules will consume. `#[allow(unused_imports)]` lets us declare
// the surface without polluting clippy.
#[allow(unused_imports)]
pub use companies::{
    companies_dir, load_dir, load_yaml, record_from_create, write_yaml, CompanyRecord,
};
#[allow(unused_imports)]
pub use error::CoreError;
#[allow(unused_imports)]
pub use migrate::EXPECTED_SCHEMA_VERSION;
#[allow(unused_imports)]
pub use probe::{is_ready, schema_version};
#[allow(unused_imports)]
pub use templates::{resolve as resolve_template, TemplateBlueprint, DEFAULT_TEMPLATE_YAML};

/// Apply schema v1 + pragmas. Idempotent.
///
/// Returns the post-apply schema version (always EXPECTED_SCHEMA_VERSION
/// on success). Emits Const III gate UX on `current=0 → 1` transition only.
///
/// **Boot-order invariant (Critic H-2)**: callers MUST invoke this AFTER
/// `db::init_pool` and BEFORE `AuditState::new`. The audit boot-check
/// expects the audit_log table to exist by the time it runs.
pub async fn apply(pool: &SqlitePool) -> Result<u32> {
    pragma::apply_pragmas(pool).await?;

    let current = migrate::current_version(pool).await?;
    let needs_v1_gate = current == 0;
    let needs_v2_gate = current == 1;

    if needs_v1_gate {
        emit_const_iii_notice_v1().await?;
    } else if needs_v2_gate {
        emit_const_iii_notice_v2().await?;
    }

    // Recovery side-effect: clear any orphan .yaml.tmp from a previous
    // crashed write. This is cheap (single directory scan); it makes the
    // first /health/ready response surface a clean state.
    if let Err(e) = scrub_orphan_tmps() {
        tracing::warn!(error = %e, "companies dir orphan-tmp scrub failed");
    }

    let post = migrate::run(pool).await?;

    if needs_v1_gate {
        tracing::info!(version = post, "schema v1 applied (first time on this DB)");
    } else if needs_v2_gate {
        tracing::info!(version = post, "schema v1→v2 migration applied");
    } else {
        tracing::debug!(version = post, "schema already at expected version");
    }

    Ok(post)
}

/// Quietly walk `companies_dir()` once for orphan `*.yaml.tmp` files and
/// remove them. Doesn't load records; we just want the side effect.
fn scrub_orphan_tmps() -> std::io::Result<()> {
    let dir = companies::companies_dir();
    if !dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.ends_with(".yaml.tmp"))
            .unwrap_or(false)
        {
            tracing::warn!(path = %path.display(), "removing orphan company yaml tempfile");
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Emit the Const III "first schema apply on this machine" message.
///
/// Behavior:
///   - Always logged via `tracing::info!` for ops-log capture.
///   - If `MUSU_CONST_III_REQUIRE_ACK=1`, requires `MUSU_CONST_III_ACK=1`
///     to proceed; otherwise errors out with operator-facing guidance.
///   - Subsequent boots (where current_version >= 1) skip this entirely.
async fn emit_const_iii_notice_v1() -> Result<()> {
    let msg = "\n\
================================================================\n\
 musu-rs core: applying schema v1 (Const III gate)\n\
================================================================\n\
 - Tables created: companies, route_executions, audit_log, machines\n\
 - Pragmas set:    WAL, foreign_keys=ON, busy_timeout=5000ms\n\
 - This is the FIRST schema apply on this machine.\n\
 - Existing Python musu-bridge on :8071 is UNAFFECTED (separate DB).\n\
\n\
 Backup recommendation: copy ~/.musu/db/musu.db to musu.db.pre-v1\n\
 Confirm with: curl http://127.0.0.1:8070/health/ready\n\
 Expected:    {\"ready\":true, ...}\n\
================================================================\n";
    require_ack_or_log(msg)
}

/// R5 (wiki/495 §4.3) — emit Const III banner for v1 → v2 transition.
async fn emit_const_iii_notice_v2() -> Result<()> {
    let msg = "\n\
================================================================\n\
 musu-rs core: applying schema v2 (Const III gate, additive)\n\
================================================================\n\
 - Adds 6 NULLable columns to route_executions:\n\
     output, error, exit_code, duration_sec, started_at, updated_at\n\
 - Existing rows preserved (no row rewrite; ALTER ADD COLUMN is\n\
   metadata-only on SQLite).\n\
 - Native Rust writer (R5) populates these columns on each task run.\n\
\n\
 Backup recommendation: copy ~/.musu/db/musu.db to musu.db.pre-v2\n\
================================================================\n";
    require_ack_or_log(msg)
}

fn require_ack_or_log(msg: &str) -> Result<()> {
    tracing::info!("{msg}");

    let require_ack = std::env::var("MUSU_CONST_III_REQUIRE_ACK")
        .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);

    if require_ack {
        let ack = std::env::var("MUSU_CONST_III_ACK")
            .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);
        if !ack {
            anyhow::bail!(
                "MUSU_CONST_III_REQUIRE_ACK=1 is set but MUSU_CONST_III_ACK!=1. \
                 Re-run with MUSU_CONST_III_ACK=1 to acknowledge the schema apply."
            );
        }
    }

    Ok(())
}

/// Admin-mode entry for `musu core` CLI subcommand.
///
/// Apply the schema against the default DB path (same resolution as
/// `BridgeConfig::db_path`). Useful for ops who want to provision the DB
/// without booting the full bridge.
#[allow(dead_code)] // Wired in main.rs when `Cmd::Core` lands; harmless if unused.
pub async fn run() -> Result<()> {
    let db_path = default_db_path();
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let url = format!("sqlite://{}", db_path.display());
    let opts: sqlx::sqlite::SqliteConnectOptions = url.parse()?;
    let opts = opts.create_if_missing(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(opts)
        .await?;
    let v = apply(&pool).await?;
    tracing::info!(
        path = %db_path.display(),
        version = v,
        "core admin: schema apply complete"
    );
    Ok(())
}

fn default_db_path() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("MUSU_BRIDGE_DB_PATH") {
        return std::path::PathBuf::from(p);
    }
    let home = if let Ok(h) = std::env::var("HOME") {
        std::path::PathBuf::from(h)
    } else if let Ok(u) = std::env::var("USERPROFILE") {
        std::path::PathBuf::from(u)
    } else {
        std::path::PathBuf::from(".")
    };
    home.join(".musu").join("db").join("musu.db")
}
