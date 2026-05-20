//! V24-R4 wiki/494 §3 — FTS5 keyword search.
//!
//! Plan §4 C1 — byte-compat with Python `musu-bridge/server.py:2732`:
//!
//! ```sql
//! SELECT path,
//!        snippet(search_index, 2, '<b>', '</b>', '…', 20) AS snippet,
//!        type
//! FROM   search_index
//! WHERE  search_index MATCH ?
//! ORDER  BY rank
//! LIMIT  ?
//! ```
//!
//! Notes on the `snippet` call (C-R4-1 HIGH resolution):
//!   * Column index `2` = `content` (FTS5 columns are 0-indexed across
//!     `path, title, content, type` — so 0=path, 1=title, 2=content, 3=type).
//!   * Open / close markers `'<b>'` / `'</b>'` match Python verbatim — three
//!     of the musu-bee frontend consumers strip / restyle these tags.
//!   * Ellipsis literal is U+2026 (`…`), NOT three ASCII dots. Python sources
//!     and the `r4_index_smoke` test both assert the literal codepoint.
//!   * `maxchars=20` matches Python; smaller windows feel cramped in the
//!     panel UI but matching Python keeps the diff zero.

use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::indexer::db;

/// One row in the JSON array returned by `GET /api/index-search`.
/// Byte-compatible with Python's `[{path, snippet, type}]` shape — DO NOT
/// add fields without explicit Critic sign-off (plan §4 C1).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SearchHit {
    pub path: String,
    pub snippet: String,
    #[serde(rename = "type")]
    pub kind: String,
}

/// FTS5 search over `<work_dir>/.musu_dev.db`. If the DB doesn't exist
/// yet (workspace was never synced), returns `Ok(vec![])` — matches Python
/// behavior where `sqlite3.connect` on a missing file would still create
/// the empty file and `search_index MATCH` would just return no rows.
///
/// `scope` is currently advisory ("all" | "code" | "doc"). FTS5 itself
/// matches all row types; we plumb the param for V25 forward-compat with
/// row-type filtering. Today, anything other than "all" still returns the
/// full set — the UI does any further client-side filtering.
pub async fn search(
    work_dir: &Path,
    query: &str,
    _scope: &str,
    limit: u32,
) -> Result<Vec<SearchHit>> {
    // Empty query → empty result. Mirrors Python's `if not q: return []`.
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    // If the DB file doesn't exist, return empty rather than creating one
    // implicitly. A search against an un-synced workspace should be quiet,
    // not a side-effecting "now you have an empty index" surprise.
    let db_path = work_dir.join(db::DB_FILE);
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let pool = db::open_index_db(work_dir)
        .await
        .with_context(|| format!("open index db at {}", work_dir.display()))?;

    // Cap the limit at a reasonable upper bound; FTS5 supports negative
    // limits but the bridge route caller sets 20 default.
    let lim = limit.clamp(1, 200) as i64;

    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT path, \
                snippet(search_index, 2, '<b>', '</b>', '…', 20) AS snippet, \
                type \
         FROM search_index \
         WHERE search_index MATCH ? \
         ORDER BY rank \
         LIMIT ?",
    )
    .bind(q)
    .bind(lim)
    .fetch_all(&pool)
    .await
    .context("FTS5 search query")?;

    Ok(rows
        .into_iter()
        .map(|(path, snippet, kind)| SearchHit {
            path,
            snippet,
            kind,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn search_missing_db_returns_empty() {
        let dir = TempDir::new().unwrap();
        let hits = search(dir.path(), "anything", "all", 20).await.unwrap();
        assert!(hits.is_empty());
    }

    #[tokio::test]
    async fn empty_query_returns_empty() {
        let dir = TempDir::new().unwrap();
        // Even if the DB existed, an empty query should short-circuit.
        let hits = search(dir.path(), "   ", "all", 20).await.unwrap();
        assert!(hits.is_empty());
    }
}
