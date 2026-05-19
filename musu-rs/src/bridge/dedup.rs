//! In-memory + DB-replay dedup cache for /api/tasks/delegate.
//!
//! wiki/491 §5.6.1 (A-4 freeze):
//!   - Key: sha256(channel + "\0" + sender_id + "\0" + text), hex first 16 bytes
//!   - TTL: 60 seconds
//!   - Backing: DashMap<String, Instant>
//!   - LRU cap: 1024 entries; evict on insert when at cap
//!   - Restart replay: SELECT input_hash FROM route_executions WHERE
//!     created_at >= NOW - 3600 AND status IN ('pending','queued','running')
//!   - Bypass: body `allow_duplicate=true`
//!   - On hit: 409 Conflict + existing_task_id

use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

const TTL: Duration = Duration::from_secs(60);
const LRU_CAP: usize = 1024;

#[derive(Debug, Clone)]
pub struct DedupCache {
    inner: Arc<DashMap<String, (String, Instant)>>, // key -> (task_id, inserted_at)
}

impl DedupCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(DashMap::new()),
        }
    }

    /// Compute the cache key per spec.
    pub fn key(channel: &str, sender_id: &str, text: &str) -> String {
        let mut h = Sha256::new();
        h.update(channel.as_bytes());
        h.update([0u8]);
        h.update(sender_id.as_bytes());
        h.update([0u8]);
        h.update(text.as_bytes());
        let digest = h.finalize();
        // First 16 bytes hex = 32 chars.
        hex::encode(&digest[..16])
    }

    /// Probe + insert. Returns `Some(existing_task_id)` if a fresh duplicate
    /// exists; returns `None` and inserts the new task_id otherwise.
    pub fn check_and_insert(&self, key: &str, new_task_id: &str) -> Option<String> {
        let now = Instant::now();

        // Lazy purge: drop expired matches we observe.
        if let Some(e) = self.inner.get(key) {
            let (existing_id, inserted) = e.value().clone();
            if now.duration_since(inserted) < TTL {
                return Some(existing_id);
            }
            // Expired; drop entry and fall through.
            drop(e);
            self.inner.remove(key);
        }

        // LRU eviction when at cap.
        if self.inner.len() >= LRU_CAP {
            // Drop the oldest entry by `inserted_at`.
            let oldest = self
                .inner
                .iter()
                .min_by_key(|e| e.value().1)
                .map(|e| e.key().clone());
            if let Some(k) = oldest {
                self.inner.remove(&k);
            }
        }

        self.inner
            .insert(key.to_string(), (new_task_id.to_string(), now));
        None
    }

    /// Populate from `route_executions` rows created within the last hour
    /// that are still in-flight. Best-effort; failure is warn-logged.
    /// wiki/491 §5.6.1 restart-replay.
    pub async fn warmup(&self, pool: &SqlitePool) {
        let cutoff = chrono::Utc::now().timestamp() - 3600;
        let rows: Result<Vec<(String, String)>, _> = sqlx::query_as(
            "SELECT input_hash, task_id FROM route_executions \
             WHERE created_at >= ? AND status IN ('pending', 'queued', 'running')",
        )
        .bind(cutoff)
        .fetch_all(pool)
        .await;

        match rows {
            Ok(rows) => {
                let now = Instant::now();
                for (hash, task_id) in rows {
                    self.inner.insert(hash, (task_id, now));
                }
                tracing::info!(
                    entries = self.inner.len(),
                    "dedup cache warmed from route_executions"
                );
            }
            Err(e) => {
                // R2 schema may not be applied yet; not fatal.
                tracing::warn!(error = %e, "dedup warmup skipped (schema-not-applied?)");
            }
        }
    }

    #[allow(dead_code)] // Exposed for Prometheus exporter / health diagnostics in R-cleanup.
    pub fn len(&self) -> usize {
        self.inner.len()
    }
}

impl Default for DedupCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_deterministic() {
        let k1 = DedupCache::key("ch", "alice", "hello");
        let k2 = DedupCache::key("ch", "alice", "hello");
        assert_eq!(k1, k2);
        assert_eq!(k1.len(), 32, "first 16 bytes hex = 32 chars");
    }

    #[test]
    fn key_differs_on_channel() {
        let k1 = DedupCache::key("ch1", "alice", "hello");
        let k2 = DedupCache::key("ch2", "alice", "hello");
        assert_ne!(k1, k2);
    }

    #[test]
    fn key_differs_on_text() {
        let k1 = DedupCache::key("ch", "alice", "hello");
        let k2 = DedupCache::key("ch", "alice", "world");
        assert_ne!(k1, k2);
    }

    #[test]
    fn first_insert_returns_none() {
        let cache = DedupCache::new();
        let k = DedupCache::key("ch", "u", "msg");
        assert_eq!(cache.check_and_insert(&k, "task-1"), None);
    }

    #[test]
    fn duplicate_returns_existing_id() {
        let cache = DedupCache::new();
        let k = DedupCache::key("ch", "u", "msg");
        cache.check_and_insert(&k, "task-1");
        let existing = cache.check_and_insert(&k, "task-2");
        assert_eq!(existing, Some("task-1".to_string()));
    }
}
