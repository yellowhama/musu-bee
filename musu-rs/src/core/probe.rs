//! Readiness probe — wiki/492 §3 + §11.
//!
//! `is_ready` compares actual user_version against EXPECTED_SCHEMA_VERSION.
//! Returned by /health/ready (delegating from bridge::handlers::health).
//!
//! Cheap (single PRAGMA read). No allocation, no transaction.

use sqlx::SqlitePool;

use crate::core::migrate::{current_version, EXPECTED_SCHEMA_VERSION};

/// True iff this DB has schema v1 (or later) applied.
///
/// Returns `false` on any error (treating "we can't tell" as "not ready")
/// — /health/ready is best-effort by design (C-SEC-10 audit-degraded
/// philosophy applies).
pub async fn is_ready(pool: &SqlitePool) -> bool {
    match current_version(pool).await {
        Ok(v) => v >= EXPECTED_SCHEMA_VERSION,
        Err(e) => {
            tracing::debug!(error = %e, "is_ready: user_version read failed");
            false
        }
    }
}

/// Return the actual schema version (for /health detail output).
/// 0 = fresh / unapplied. Errors map to 0 (treated as unapplied).
pub async fn schema_version(pool: &SqlitePool) -> u32 {
    current_version(pool).await.unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::migrate::run;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn mem_pool() -> SqlitePool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .create_if_missing(true);
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn is_ready_false_before_apply_true_after() {
        let pool = mem_pool().await;
        assert!(!is_ready(&pool).await, "fresh DB should not be ready");
        run(&pool).await.unwrap();
        assert!(is_ready(&pool).await, "post-apply DB should be ready");
    }

    #[tokio::test]
    async fn schema_version_zero_before_one_after() {
        let pool = mem_pool().await;
        assert_eq!(schema_version(&pool).await, 0);
        run(&pool).await.unwrap();
        assert_eq!(schema_version(&pool).await, 1);
    }
}
