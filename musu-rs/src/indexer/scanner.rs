//! V24-R4 wiki/494 §3 — pure-Rust parallel workspace scanner.
//!
//! Replaces the pre-built Go scanner binary. Strategy per C-R4-11
//! (Critic INFO resolution):
//!
//!   * `ignore::WalkBuilder` runs the directory walk. It honours `.gitignore`
//!     automatically and lets us add the workspace profile's extra ignore
//!     globs via `Override`. Battle-tested on Windows (ripgrep ships it).
//!   * `rayon` parallelizes the CPU-bound file read + regex symbol extraction
//!     via `into_par_iter().flat_map_iter()` — each input path produces a
//!     small `Vec<IndexEntry>` of file+section+symbol rows. Rayon's collector
//!     is the synchronization point.
//!   * The async side (in `sync.rs`) is handed a single `Vec<IndexEntry>`
//!     and batches sqlx INSERTs in transaction chunks. This explicit
//!     producer→consumer split avoids the rayon-inside-tokio footgun where
//!     calling `.block_on()` on a rayon worker would deadlock the runtime.
//!
//! The earlier C-R4-11 sketch used an `std::sync::mpsc::Sender` here, but
//! `mpsc::Sender` is `Send + !Sync`, which conflicts with rayon's parallel
//! visitor capturing-by-`&`. The Vec-collect pattern below is equivalent
//! semantically (still single-pass, still CPU-parallel) and avoids needing
//! an extra `crossbeam_channel` dependency.
//!
//! Content trim (plan §4 C2): 2000 chars for file content, 1000 for
//! markdown sections. Matches Python `core.py:212,228` byte-for-byte.
//!
//! File-size skip: any file >2 MiB is treated as binary/asset and skipped
//! entirely (path still walked but no content indexed). Matches Python
//! parity (`_safe_read_text` skips >2 MB). Protects FTS5 from oversize
//! inserts that would balloon the index DB.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;
use rayon::prelude::*;

use crate::indexer::profile::Profile;
use crate::indexer::symbols::parse_symbols_and_sections;

/// Plan §4 C2: 2000 chars for file content (Python `core.py:212`).
pub const MAX_CONTENT_CHARS: usize = 2000;

/// Plan §4 C2: 1000 chars for markdown section content (Python `core.py:228`).
pub const MAX_SECTION_CHARS: usize = 1000;

/// 2 MiB hard cap on file size. Above this we skip the read entirely.
/// Matches Python `_safe_read_text` semantics (paraphrased — Python uses
/// `< 2_000_000`; we use the binary 2 MiB which is close enough and slightly
/// more generous on huge config files).
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

/// One row destined for the FTS5 `search_index` table. The `kind` field is
/// the value of `search_index.type` column — `"file"`, `"section"`, or
/// `"symbol"` — matching Python's row taxonomy byte-for-byte.
#[derive(Debug, Clone)]
pub struct IndexEntry {
    pub path: String,
    pub title: String,
    pub content: String,
    pub kind: &'static str,
}

/// Scan summary. Returned from `scan` so `sync` can populate `SyncReport`.
#[derive(Debug, Default, Clone)]
pub struct ScanStats {
    pub files_indexed: usize,
    pub symbols_extracted: usize,
    pub sections_extracted: usize,
}

/// Walk `work_dir` using `ignore::WalkBuilder` configured from `profile`,
/// then for each non-ignored file produce one or more `IndexEntry` rows.
/// Returns `(Vec<IndexEntry>, ScanStats)` so `sync.rs` can batch the
/// downstream sqlx INSERTs from the async side.
///
/// Runs the regex + file-read work on rayon's global thread pool via
/// `into_par_iter().flat_map_iter`. The Vec collector is the
/// synchronization point — once `scan` returns, all CPU work is done and
/// the tokio runtime can take it from there.
pub fn scan(work_dir: &Path, profile: &Profile) -> Result<(Vec<IndexEntry>, ScanStats)> {
    // Build the `ignore::WalkBuilder`. Standard filters = .gitignore +
    // .ignore + global git excludes. Add the profile's extra globs as
    // hard overrides so a user profile can prune things gitignore missed.
    let mut walker = WalkBuilder::new(work_dir);
    walker
        .standard_filters(true)
        .hidden(false) // index dot-files like .musu-indexer.json, .env.example
        .parents(true)
        .follow_links(false);

    // Profile-supplied ignore globs are layered via Override (the `ignore`
    // crate's Override matcher uses `!pattern` for exclude). User profiles
    // may already have leading `!`; preserve those verbatim.
    let mut ob = OverrideBuilder::new(work_dir);
    for glob in &profile.ignore_globs {
        let g = if glob.starts_with('!') {
            glob.clone()
        } else {
            format!("!{glob}")
        };
        if let Err(e) = ob.add(&g) {
            tracing::warn!(
                glob = %glob,
                error = %e,
                "ignore profile glob rejected; skipping"
            );
        }
    }
    if let Ok(overrides) = ob.build() {
        walker.overrides(overrides);
    }

    // Collect candidate file paths sequentially (the ignore walker is
    // already efficient at this; ParallelVisitor adds complexity for the
    // small win we'd get vs the regex+read work which DOES benefit from
    // rayon downstream).
    let mut files: Vec<PathBuf> = Vec::new();
    for entry in walker.build() {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                tracing::debug!(error = %e, "ignore walk entry error; skipping");
                continue;
            }
        };
        if entry.file_type().map(|ft| !ft.is_file()).unwrap_or(true) {
            continue;
        }
        files.push(entry.into_path());
    }

    // Per-file processing in parallel on rayon. Each input path produces
    // a small `Vec<IndexEntry>` (file row + N section rows + M symbol rows).
    // We rayon-flatten into a single Vec for the caller. `flat_map_iter`
    // (sequential inner iter, parallel outer) keeps allocations bounded.
    let entries: Vec<IndexEntry> = files
        .into_par_iter()
        .flat_map_iter(|path| process_one(&path, work_dir).into_iter())
        .collect();

    // Stats are derived post-hoc from the entry kinds — cheap O(n) pass
    // over a Vec we already own. Avoids the atomic-counter dance.
    let mut stats = ScanStats::default();
    for e in &entries {
        match e.kind {
            "file" => stats.files_indexed += 1,
            "section" => stats.sections_extracted += 1,
            "symbol" => stats.symbols_extracted += 1,
            _ => {}
        }
    }

    Ok((entries, stats))
}

/// Per-file worker: read, extract, return rows. Empty Vec for files that
/// fail metadata/read/size checks. Lives outside `scan` so it's testable
/// in isolation and so rayon doesn't capture all of `scan`'s locals.
fn process_one(path: &Path, work_dir: &Path) -> Vec<IndexEntry> {
    let rel = match path.strip_prefix(work_dir) {
        Ok(r) => r.to_string_lossy().replace('\\', "/"),
        Err(_) => path.to_string_lossy().replace('\\', "/"),
    };

    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) => {
            tracing::debug!(path = %path.display(), error = %e, "metadata failed");
            return Vec::new();
        }
    };
    if meta.len() > MAX_FILE_BYTES {
        return Vec::new();
    }

    let content = match std::fs::read_to_string(path) {
        Ok(s) => s,
        // Non-UTF8 / binary files → skip. Python `_safe_read_text` parity.
        Err(_) => return Vec::new(),
    };

    let ext_lower = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    let (symbols, sections) = parse_symbols_and_sections(&ext_lower, &content);

    let mut rows = Vec::with_capacity(1 + sections.len() + symbols.len());

    // 1) file row — content trimmed to MAX_CONTENT_CHARS chars (UTF-8 safe).
    let trimmed: String = content.chars().take(MAX_CONTENT_CHARS).collect();
    rows.push(IndexEntry {
        path: rel.clone(),
        title: rel.clone(),
        content: trimmed,
        kind: "file",
    });

    // 2) section rows (markdown only).
    for s in &sections {
        let body: String = s.content.chars().take(MAX_SECTION_CHARS).collect();
        rows.push(IndexEntry {
            path: rel.clone(),
            title: s.title.clone(),
            content: body,
            kind: "section",
        });
    }

    // 3) symbol rows.
    for sym in &symbols {
        let title = format!("{}: {}", sym.kind, sym.name);
        rows.push(IndexEntry {
            path: rel.clone(),
            title,
            content: sym.signature.clone(),
            kind: "symbol",
        });
    }

    rows
}

/// Convenience: count files that would be scanned without actually doing
/// the read+regex work. Useful for perf debugging — `r4_scanner_perf.rs`
/// uses `scan` directly but ops scripts may want to estimate workload.
#[allow(dead_code)]
pub fn count_candidates(work_dir: &Path, profile: &Profile) -> Result<usize> {
    let mut walker = WalkBuilder::new(work_dir);
    walker
        .standard_filters(true)
        .hidden(false)
        .parents(true)
        .follow_links(false);
    let mut ob = OverrideBuilder::new(work_dir);
    for glob in &profile.ignore_globs {
        let g = if glob.starts_with('!') {
            glob.clone()
        } else {
            format!("!{glob}")
        };
        let _ = ob.add(&g);
    }
    if let Ok(overrides) = ob.build() {
        walker.overrides(overrides);
    }
    let mut n = 0usize;
    for entry in walker.build() {
        let entry = entry.context("walker iteration")?;
        if entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
            n += 1;
        }
    }
    Ok(n)
}
