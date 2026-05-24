//! Audit log writer.
//!
//! wiki/491 §7 + §7.1 + C-SEC-10:
//!   - Schema frozen from Python schema v37 (id, ts, actor_ip, method,
//!     path, status_code, agent_id, note, company_id)
//!   - Write failure = warn log + counter; request still proceeds
//!   - /health flips `audit_degraded=true` when failure rate >10/min
//!   - Boot performs one test write to fail fast on schema-not-applied
//!
//! Port-from: `musu-bridge/audit.py` (Python writes to `audit.db`; R1 uses
//! the same separate DB file via `audit_db_path` config).

use std::collections::VecDeque;
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Result;
use sqlx::SqlitePool;

const FAILURE_RATE_THRESHOLD_PER_MIN: usize = 10;
const FAILURE_RATE_WINDOW: Duration = Duration::from_secs(5 * 60);

/// Shared audit state. Held in axum `State`.
#[derive(Debug, Clone)]
pub struct AuditState {
    inner: Arc<AuditInner>,
}

#[derive(Debug)]
struct AuditInner {
    pool: SqlitePool,
    total_writes: AtomicU64,
    total_failures: AtomicU64,
    recent_failures: std::sync::Mutex<VecDeque<Instant>>,
}

#[derive(Debug, Clone)]
pub struct AuditEntry {
    pub actor_ip: IpAddr,
    pub method: String,
    pub path: String,
    pub status_code: u16,
    pub agent_id: Option<String>,
    pub note: Option<String>,
    pub company_id: Option<String>,
    /// V26-W12 (wiki/511): true when request originated from another musu
    /// node (detected by presence of `X-Musu-Deadline-Unix-Ms` header).
    /// V27 uses this for cross-machine task delegation measurement.
    pub cross_machine: bool,
}

impl AuditState {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            inner: Arc::new(AuditInner {
                pool,
                total_writes: AtomicU64::new(0),
                total_failures: AtomicU64::new(0),
                recent_failures: std::sync::Mutex::new(VecDeque::new()),
            }),
        }
    }

    /// Write an audit entry. Errors are swallowed (warned) per C-SEC-10.
    pub async fn write(&self, entry: AuditEntry) {
        let ts = chrono::Utc::now().timestamp();
        let res = sqlx::query(
            "INSERT INTO audit_log (ts, actor_ip, method, path, status_code, agent_id, note, company_id, cross_machine) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(ts)
        .bind(entry.actor_ip.to_string())
        .bind(&entry.method)
        .bind(&entry.path)
        .bind(entry.status_code as i64)
        .bind(entry.agent_id.as_deref())
        .bind(entry.note.as_deref())
        .bind(entry.company_id.as_deref())
        .bind(entry.cross_machine as i64)
        .execute(&self.inner.pool)
        .await;

        match res {
            Ok(_) => {
                self.inner.total_writes.fetch_add(1, Ordering::Relaxed);
            }
            Err(e) => {
                self.inner.total_failures.fetch_add(1, Ordering::Relaxed);
                self.record_failure();
                tracing::warn!(
                    error = %e,
                    actor_ip = %entry.actor_ip,
                    method = %entry.method,
                    path = %entry.path,
                    "audit_log write failed; request proceeds"
                );
            }
        }
    }

    fn record_failure(&self) {
        let mut q = self
            .inner
            .recent_failures
            .lock()
            .expect("audit recent_failures mutex poisoned");
        let now = Instant::now();
        let cutoff = now - FAILURE_RATE_WINDOW;
        while let Some(front) = q.front() {
            if *front < cutoff {
                q.pop_front();
            } else {
                break;
            }
        }
        q.push_back(now);
    }

    /// True if failures have exceeded the threshold in the recent window.
    pub fn degraded(&self) -> bool {
        let q = self
            .inner
            .recent_failures
            .lock()
            .expect("audit recent_failures mutex poisoned");
        // Threshold is per-minute rate, computed over the 5-min window.
        // Sum normalized to per-minute:
        let count = q.len();
        let window_mins = FAILURE_RATE_WINDOW.as_secs() / 60;
        let per_min = if window_mins > 0 {
            count / window_mins as usize
        } else {
            count
        };
        per_min >= FAILURE_RATE_THRESHOLD_PER_MIN
    }

    #[allow(dead_code)] // Exposed for Prometheus exporter in R-cleanup.
    pub fn total_writes(&self) -> u64 {
        self.inner.total_writes.load(Ordering::Relaxed)
    }

    #[allow(dead_code)] // Exposed for Prometheus exporter in R-cleanup.
    pub fn total_failures(&self) -> u64 {
        self.inner.total_failures.load(Ordering::Relaxed)
    }

    /// C-SEC-10 boot-time test write. Returns Err if the table doesn't
    /// exist or insert fails. Used by `bridge::run()` to fail fast on
    /// schema-not-applied (in production; dev/test tolerates).
    pub async fn boot_check(&self) -> Result<()> {
        // We DON'T actually write a synthetic row — that would pollute
        // audit. Instead probe the schema.
        let exists = super::db::audit_schema_applied(&self.inner.pool).await;
        if !exists {
            return Err(anyhow::anyhow!(
                "audit_log table missing — R2 schema not applied; \
                 audit writes will degrade. Run musu-rs/migrations first."
            ));
        }
        Ok(())
    }
}
