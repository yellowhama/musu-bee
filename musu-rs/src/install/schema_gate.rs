//! Const III gate preservation across auto-update.
//!
//! wiki/496 F16/Q7. Auto-update MUST NOT silently apply a schema migration.
//! Process:
//!
//!   1. `musu schema-precheck` reads `~/.musu/db/musu.db`'s `PRAGMA
//!      user_version` and compares it against the embedded
//!      `EXPECTED_SCHEMA_VERSION`. Exits 0 if equal, 75 (TEMPFAIL) if a
//!      delta exists. auto_update.rs treats any non-zero exit as "stage
//!      the new binary, don't restart bridge, write PENDING_SCHEMA_GATE.txt".
//!
//!   2. `musu apply-schema` is the operator-acknowledged migration apply.
//!      Prints the Const III banner, calls `core::apply`, removes
//!      `PENDING_SCHEMA_GATE.txt`. It then swaps the staged binary
//!      (`musu.new` -> `musu` via staged_swap::perform_swap) and the next
//!      bridge start uses the new code path.

use std::path::Path;

use anyhow::{Context, Result};

use super::staged_swap;
use super::SchemaGateOpts;

/// Filename written to `~/.musu/` when auto-update stages a schema-bearing
/// release. Content shape (S10): commit hash, target schema version,
/// human description, operator instruction. NO raw SQL.
pub const PENDING_SCHEMA_GATE_FILENAME: &str = "PENDING_SCHEMA_GATE.txt";

/// `musu schema-precheck` — non-zero exit if the on-disk schema version
/// differs from EXPECTED_SCHEMA_VERSION.
pub async fn precheck(opts: SchemaGateOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let db_path = home.join("db").join("musu.db");
    if !db_path.exists() {
        // No DB yet — install will create it via core::apply. Treat as
        // matched (exit 0) so auto-update can proceed on a fresh box.
        tracing::info!(
            path = %db_path.display(),
            "schema-precheck: db not yet created, treating as matched"
        );
        return Ok(());
    }

    let current = read_current_version(&db_path).await?;
    let expected = crate::core::EXPECTED_SCHEMA_VERSION;
    if current == expected {
        tracing::info!(version = current, "schema-precheck: matched");
        return Ok(());
    }

    // Mismatch — auto-update will see the non-zero exit and stage rather
    // than swap. We exit with a specific code so timer-driven invocations
    // don't spam systemd's "service failed" status.
    eprintln!(
        "schema-precheck: db at v{current}, expected v{expected} — apply-schema gate required"
    );
    std::process::exit(75);
}

/// `musu apply-schema` — operator-acknowledged migration apply. Prints
/// Const III banner, runs `core::apply`, removes PENDING_SCHEMA_GATE.txt,
/// promotes any staged `musu.new` candidate.
pub async fn apply(opts: SchemaGateOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let db_path = home.join("db").join("musu.db");

    eprintln!(
        "\n\
================================================================\n\
 musu apply-schema (Const III gate — operator-acknowledged apply)\n\
================================================================\n\
 - DB:          {}\n\
 - target ver:  v{}\n\
\n\
 This will modify your SQLite database. Backups are recommended.\n\
 - Backup with: cp {} {}.pre-apply\n\
================================================================\n",
        db_path.display(),
        crate::core::EXPECTED_SCHEMA_VERSION,
        db_path.display(),
        db_path.display(),
    );

    if !db_path.exists() {
        // First-install path: apply against a fresh DB.
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let url = format!("sqlite://{}", db_path.display());
    let opts_sqlx: sqlx::sqlite::SqliteConnectOptions = url.parse()?;
    let opts_sqlx = opts_sqlx.create_if_missing(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(opts_sqlx)
        .await?;

    let post = crate::core::apply(&pool).await?;
    pool.close().await;

    tracing::info!(version = post, "apply-schema: success");

    // Remove the pending gate marker if present.
    let pending = home.join(PENDING_SCHEMA_GATE_FILENAME);
    if pending.exists() {
        std::fs::remove_file(&pending)
            .with_context(|| format!("remove pending marker {}", pending.display()))?;
    }

    // Promote the staged binary if one is waiting.
    // Auditor QA1: Path::with_extension(".new") on a Unix binary with no extension
    // produces `<name>..new` (double-dot) because with_extension inserts its own dot.
    // Use staged_swap::with_suffix to match the writer side (auto_update.rs + perform_swap).
    let target = home.join("bin").join(super::musu_binary_name());
    let staged = staged_swap::with_suffix(&target, ".new")
        .with_context(|| format!("compute staged path for {}", target.display()))?;
    if staged.exists() {
        eprintln!(
            "\napply-schema: promoting staged binary at {}",
            staged.display()
        );
        match staged_swap::perform_swap(&target) {
            Ok(_) => {
                eprintln!("apply-schema: binary swap complete");
            }
            Err(e) => {
                tracing::error!(error = %e, "staged-swap failed during apply-schema");
                eprintln!("WARNING: schema applied but binary swap failed: {e}");
            }
        }
    }

    Ok(())
}

/// Write `PENDING_SCHEMA_GATE.txt` with the required S10 fields.
///
/// Fields:
///   - target schema version
///   - commit hash (optional — populated by auto_update when available)
///   - human description (the Const III banner from core::apply)
///   - operator instruction (run `musu apply-schema`)
pub fn write_pending_marker(
    musu_home: &Path,
    target_version: u32,
    commit_hash: Option<&str>,
    description: &str,
) -> Result<()> {
    let path = musu_home.join(PENDING_SCHEMA_GATE_FILENAME);
    let commit_line = commit_hash
        .map(|c| format!("Commit: {c}\n"))
        .unwrap_or_default();
    let body = format!(
        "PENDING SCHEMA MIGRATION — operator action required\n\
=========================================================\n\
Target schema version: v{target_version}\n\
{commit_line}\n\
Description:\n\
{description}\n\
\n\
To apply, run:\n\
\n\
    musu apply-schema\n\
\n\
This file is informational only. NO raw SQL is included by design (S10).\n\
=========================================================\n"
    );
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    // Informational only; default perms (0644-ish on Unix, inherited ACL
    // on Windows) are fine.
    Ok(())
}

/// Read `PRAGMA user_version` from a SQLite file without going through
/// our full sqlx pool. Used by precheck so the timer-driven path stays
/// fast and doesn't touch WAL.
async fn read_current_version(db_path: &Path) -> Result<u32> {
    let url = format!("sqlite://{}", db_path.display());
    let opts: sqlx::sqlite::SqliteConnectOptions = url.parse()?;
    // Open read-only.
    let opts = opts.read_only(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .with_context(|| format!("open {}", db_path.display()))?;
    let v = crate::core::schema_version(&pool).await;
    pool.close().await;
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn write_pending_marker_contains_no_sql() {
        let tmp = TempDir::new().unwrap();
        write_pending_marker(
            tmp.path(),
            7,
            Some("abc123"),
            "Adds 3 columns to widgets table",
        )
        .unwrap();
        let body = std::fs::read_to_string(tmp.path().join(PENDING_SCHEMA_GATE_FILENAME)).unwrap();
        assert!(body.contains("v7"));
        assert!(body.contains("abc123"));
        assert!(body.contains("widgets table"));
        // S10: NO raw SQL in marker.
        let upper = body.to_uppercase();
        assert!(!upper.contains("ALTER "));
        assert!(!upper.contains("CREATE "));
        assert!(!upper.contains("DROP "));
        assert!(!upper.contains("SELECT "));
    }
}
