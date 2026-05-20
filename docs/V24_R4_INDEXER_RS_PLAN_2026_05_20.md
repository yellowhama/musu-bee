# V24-R4 INDEXER-RS — Phase 1 Plan

| Field | Value |
|---|---|
| Wiki ID | wiki/494 |
| Created | 2026-05-20 |
| Phase | 1 (plan) |
| Status | DRAFT — awaiting Phase 1.5 Critic (system-architect, single per master plan §5-R4) |
| Risk | MED (single Critic + single Auditor; no auth surface, no main schema change) |
| LOC est | ~1,100 implementation + ~250 tests = ~1,350 total |
| Predecessors | R1 bridge + R2 core + R5 writer + R6 installer + R3 control — all shipped at de5cb37 |
| Successor | R10 Python deletion + V24 close |
| Critic | `system-architect` (single, MED-risk per master plan §5-R4) |
| Auditor | `quality-engineer` (single) |

---

## §1 Scope

R4 (INDEXER-RS) is the **LAST native module** of R-cleanup before R10 Python deletion. It replaces the Python `musu-indexer` package (3,115 LOC + 252-line pre-built Go scanner binary) with native Rust per-workspace file/code indexing. Substrate is SQLite FTS5 (already in tree via `sqlx`; no new `tantivy` dep per [[feedback-no-yagni-architecture]]). Each company's index lives at `<work_dir>/.musu_dev.db` (per-workspace, matches Python — eliminates Const III gate firing on main musu.db).

**Frame correction**: Python `musu-indexer` is a hybrid package — 1,500 LOC of unrelated session/spy/PTY tooling + ~1,100 LOC of actual indexer logic. R4 ports ONLY the indexer logic. Session/spy/PTY surface is DROPPED (zero non-test usage signal; per [[feedback-no-yagni-architecture]] + master plan §8 out-of-scope).

### In scope

- **`musu indexer` subcommand** on `musu-rs` binary with sub-actions: `sync`, `search`, `init-profile`, `watch` (opt-in).
- **Native HTTP route** `GET /api/index-search?q=...&workspace=...&scope=all|code|doc&limit=20` returning `[{path, snippet, type}]` byte-compatible with Python schema (frontend consumers preserved).
- **Internal Rust API** `pub async fn sync_workspace_async(work_dir, profile) -> Result<...>` callable from R1's bridge company-create handler (post-R10 replacement for current subprocess.Popen).
- **SQLite FTS5 per-workspace** `.musu_dev.db` with `search_index` virtual table (path, title, content, type; tokenize unicode61). Content trimmed to 2000 chars per Python parity (F13).
- **Pure-Rust parallel scanner** using `ignore::WalkBuilder` (gitignore + custom globs) + `rayon` (or tokio JoinSet). Replaces Go scanner binary.
- **Symbol extraction regex tables** ported byte-for-byte from Python (.rs/.ts/.tsx/.py/.go + .md headers).
- **Workspace profile** `.musu-indexer.json` (ignore_globs + extensions) auto-provisioned by `init-profile` subcommand; called from R1 company-create handler.
- **R3 MCP T2 stub** `search_company` (single new tool, wraps `/api/index-search` HTTP route; +1 tool to R3's 13 → 14 total).
- **Facade fall-through removal** for `/api/index-search` only (NOT `/api/control/*` which doesn't exist).

### Out of scope (explicitly NOT in R4)

- **Session/spy/PTY tools** from Python musu-indexer (acp_spawn_session, acp_interact, get_spy_logs, session_start/stop/write/logs/history). Zero usage signal. Drop entirely at R10 alongside Python deletion.
- **MCP stdio singleton at :9701** (Python `start-indexer-http.sh` for shared sessions). SQLite FTS5 WAL handles concurrent readers; no need for HTTP-MCP transport.
- **Schema v3 on main musu.db**. Index DB is per-workspace separate file. No Const III gate.
- **Semantic embeddings / vector search**. Pure FTS5 keyword search only. V25 candidate.
- **File-watch as default**. `musu indexer watch` opt-in subcommand for power users; on-demand sync is the primary path (F6 — `notify` crate Windows quirks).
- **musu-bee TS changes**. Frontend consumes `/api/index-search` shape unchanged.
- **R10 Python deletion**. R4 ships Rust-side; R10 deletes Python `/api/index-search` + `_setup_company_workspace` + `musu-indexer/` directory in one bulk commit.

### §1.1 Locked decisions

| ID | Question | Locked answer | Source |
|---|---|---|---|
| Q1 | Substrate: FTS5 / tantivy / LIKE? | **SQLite FTS5**. Already used by Python; sqlx feature in tree; tantivy +5MB YAGNI. | F3 |
| Q2 | Storage location: musu.db v3 / per-workspace? | **Per-workspace `<work_dir>/.musu_dev.db`** (Python parity; no Const III). | F4 |
| Q3 | Trigger model: on-demand / file-watch / scheduled? | **On-demand primary** (`musu indexer sync`, `/api/index-search`); opt-in `musu indexer watch` for power users. | F6 |
| Q4 | Indexed surface: files / + symbols / + sections / + logs? | **files + code_symbols + doc_sections** (Python parity). Drop session/spy/raw_snapshots/wiki_pages. | F2 |
| Q5 | HTTP endpoints? | **Single native**: `GET /api/index-search?q=...&workspace=...&scope=...&limit=20` → `[{path, snippet, type}]`. Byte-compat with Python. | F9 |
| Q6 | R3 MCP tool integration? | **Yes — add `search_company` as T2-style HTTP-proxy tool** to R3 ControlServer. 13 → 14 tools. | F1 |
| Q7 | Go scanner replacement? | **Pure Rust** with `ignore::WalkBuilder` + parallel via `rayon` or tokio JoinSet. Benchmark on operator's land-os workspace before SHIP. | F5 |
| Q8 | R10 deletion order? | **R4 ships Rust-side only**; R10 bulk-deletes Python /api/index-search + setup_company_workspace + musu-indexer/. | F8 |

---

## §2 Stack

| Crate | Version | New? | Reason |
|---|---|---|---|
| tokio, axum, sqlx (sqlite feature), serde, serde_json, tracing, anyhow, thiserror, reqwest, chrono | existing | — | Reused R1-R6 baseline; sqlx sqlite already has FTS5 |
| **`ignore`** | `"0.4"` | **NEW** | ripgrep's gitignore-aware walker; battle-tested on Windows. Replaces Python `fnmatch` + Go custom walker. |
| **`rayon`** | `"1"` | **NEW** | Parallel scan (replace Go scanner's 64-way semaphore). Alternative: tokio JoinSet — Builder picks. |
| **`once_cell`** or std `OnceLock` | existing | — | Workspace profile cache |
| `notify` | `"6"` | NEW (opt-in only) | File-watch for `musu indexer watch` subcommand only; not compiled unless feature flag |

**Binary growth estimate**: ~500KB (`ignore` + `rayon`). Acceptable. No SaaS, no licensed runtime.

---

## §3 Module touch list

Target ~1,100 impl + ~250 tests.

### NEW under `musu-rs/src/indexer/`

| File | LOC | Purpose |
|---|---|---|
| `mod.rs` | ~80 | Module entry. `pub async fn run(action: IndexerAction) -> Result<()>` subcommand dispatch. Sub-actions: sync, search, init-profile, watch. |
| `db.rs` | ~120 | SQLite FTS5 schema management. Opens/creates `<work_dir>/.musu_dev.db`. `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(path, title, content, type, tokenize='unicode61')`. Plus regular tables for metadata (workspace_name, last_sync_at). |
| `scanner.rs` | ~250 | Pure-Rust walker. `ignore::WalkBuilder` + `rayon::ThreadPoolBuilder` (or tokio JoinSet). Per-file: detect type by extension, read content, apply 2000-char content trim, extract symbols via regex tables, insert into FTS5 in batches of 1000. |
| `symbols.rs` | ~80 | Regex tables for .rs/.ts/.tsx/.py/.go symbol parsing + .md section headers. Ported byte-for-byte from Python core.py:44-69. |
| `profile.rs` | ~100 | Workspace profile load/write. `.musu-indexer.json` reader; default ignore globs (18 entries from Python workspace.py:18-47). `init_profile_in(work_dir, name)` writes default. |
| `search.rs` | ~80 | FTS5 query. `pub async fn search(work_dir, q, scope, limit) -> Result<Vec<SearchHit>>`. `SearchHit { path, snippet, type }` — snippet uses FTS5 `snippet()` function with `<b>...</b>` markers. |
| `sync.rs` | ~120 | Sync orchestrator. `pub async fn sync_workspace_async(work_dir, profile_name) -> Result<SyncReport>`. Calls scanner, batches inserts, updates last_sync_at. SyncReport returns counts (files_indexed, symbols_extracted, duration_ms). |
| `watch.rs` | ~80 | `cfg(feature = "indexer-watch")` opt-in. `notify` crate watcher; debounce 2s (Python parity); ignores `*.db-wal`/`*-shm`. Skipped by default. |

**Subtotal**: ~910 LOC across 8 files.

### NEW under `musu-rs/src/bridge/handlers/`

| File | LOC | Purpose |
|---|---|---|
| `index_search.rs` | ~80 | `GET /api/index-search` handler. Parses `?q=&workspace=&scope=&limit=`. Looks up workspace work_dir via companies table (workspace = company.name OR company.id). Calls `indexer::search::search()`. Returns JSON `[{path, snippet, type}]`. No audit.write (read endpoint, R1 parity). |

### MODIFY

- `musu-rs/Cargo.toml` — add `ignore`, `rayon`, and `notify` (cfg gated).
- `musu-rs/src/main.rs` — `Cmd::Indexer => indexer::run(action).await` with new IndexerAction enum.
- `musu-rs/src/bridge/handlers/mod.rs` — register `GET /api/index-search`.
- `musu-rs/src/control/tools/params.rs` — add `SearchCompanyParams` struct.
- `musu-rs/src/control/mod.rs` — add `#[tool] fn search_company` calling the new HTTP route via bridge_client. T2-style (HTTP-proxy, not direct DB access).
- `musu-rs/src/control/bridge_client.rs` — add `pub async fn search_company(workspace, q, scope, limit)` method.

### NEW tests

| File | LOC | Purpose |
|---|---|---|
| `tests/r4_index_smoke.rs` | ~150 | End-to-end on tempdir-mocked workspace: seed files → `musu indexer sync` → `/api/index-search?q=keyword` → assert byte-compat shape `[{path, snippet, type}]` with `<b>` markers. |
| `tests/r4_scanner_perf.rs` | ~100 | Benchmark vs Python+Go: index a ~1000-file fixture, assert <5s on operator hardware. Defines perf-parity gate before SHIP. |

### Acceptance

1. `cargo build --release` clean.
2. `cargo clippy --workspace -- -D warnings` clean.
3. `cargo test --release` green incl. r4_*.
4. `musu indexer init-profile --work-dir <path> --name <company>` writes `.musu-indexer.json`.
5. `musu indexer sync --work-dir <path>` produces `.musu_dev.db` with `search_index` populated.
6. `curl 'http://127.0.0.1:8070/api/index-search?q=foo&workspace=land-os'` returns JSON array with `{path, snippet, type}` shape (snippet contains `<b>...</b>`).
7. R3 MCP tool `search_company` returns same data via stdio MCP transport (14 tools total now).
8. R1 bridge company-create handler invokes `indexer::sync_workspace_async` for new companies (R4 hooks into R1 for post-create indexing).
9. R4 scanner indexes 1000-file fixture in <5s (perf parity vs Go scanner; Q7 gate).
10. Phase 1.5 Critic resolved; Phase 5 Auditor SHIP-OK.

---

## §4 Contract (Builder constraints)

- **C1** — Frontend byte-compat: response shape `[{path: String, snippet: String, type: String}]` exact. Snippet uses **`snippet(search_index, 2, '<b>', '</b>', '…', 20)`** — col index 2 (content), `'…'` U+2026 ellipsis, maxchars=20. Per Critic C-R4-1: Python `server.py:2732` uses these exact bytes; existing 3 musu-bee consumers (SearchPanel.tsx, handleWikiCommand.ts, app/api/index-search/route.ts) MUST continue working unchanged. Builder asserts literal U+2026 byte sequence in test.
- **C2** — Content trim parity: 2000 chars for file content, 1000 for sections (Python core.py:212,228). Builder ports as `const MAX_CONTENT: usize = 2000;` + `const MAX_SECTION: usize = 1000;`.
- **C3** — Ignore globs parity: 18 default ignore patterns from Python workspace.py:18-47. Use `ignore` crate's gitignore matcher + custom add for binary extensions.
- **C4** — `.musu_dev.db` location: ALWAYS at `<work_dir>/.musu_dev.db`. NOT in `~/.musu/data/`. Per-workspace isolation by physical file (Q2).
- **C5** — No audit.write on `/api/index-search` (read endpoint; matches R1 GET list pattern; matches R3 C3 invariant for get_company).
- **C6** — Symbol regex tables: byte-for-byte port from Python core.py:44-69. Builder may NOT "improve" them without explicit Critic finding.
- **C7** — `notify` opt-in only via Cargo feature `indexer-watch`. Default build does NOT pull notify. `musu indexer watch` returns clear error if feature not compiled.

---

## §5 Const gates

- Const III: **NOT triggered** (per-workspace `.musu_dev.db` is separate file; main musu.db unchanged).
- Const VI: NOT triggered.
- Const VII: per-push, R-cleanup bundle approval via [[feedback-const-vii-batched-approval]].

---

## §6 Risks

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| R4-W1 | MED | Pure-Rust scan slower than Go scanner | Q7 perf gate: benchmark on land-os before SHIP; if fails, fall back to keeping Go binary call-out OR switch to rayon parallelism strategy |
| R4-W2 | MED | `ignore` crate gitignore semantics differ from Python fnmatch | Acceptance #9 includes representative .gitignore scenarios; F10 mitigation uses battle-tested crate |
| R4-W3 | MED | Schema drift between Python FTS5 and Rust FTS5 | C1+C2 contract enforces byte-compat; existing `.musu_dev.db` files from Python era will be re-indexed cleanly on first Rust sync (no migration) |
| R4-W4 | LOW | File-watch fragility (Windows AV, network drives) | Q3 lock: opt-in feature only; default = on-demand |
| R4-W5 | LOW | Index size growth on huge workspaces | C2 content trim (2000 chars); musu scale (2 companies × thousands of files) safe |
| R4-W6 | LOW | R10 Python /api/index-search deletion timing | Q8 lock: R4 ships Rust handler; facade still falls through Python until R10; both deleted in one R10 commit |

---

## §7 Critic seed (system-architect, single)

1. Verify Q1-Q8 locks remain sound post-Researcher.
2. Confirm `<work_dir>/.musu_dev.db` per-workspace storage doesn't break existing Python-era index files (re-index from scratch is acceptable).
3. Validate native `/api/index-search` handler routes correctly given existing facade fall-through (does it need facade exemption, or does native handler intercept first by route specificity?).
4. C6 symbol regex port — read Python core.py:44-69; confirm tables port cleanly to Rust regex crate (some PCRE features may not translate).
5. Q7 perf-parity gate — is <5s on 1000-file fixture a reasonable bar? Operator's land-os has roughly N files (Researcher to confirm).
6. R3 ControlServer `search_company` tool addition — does 14th tool fit cleanly in existing #[tool_router] structure (R3 ships 8 T1 + 5 T2 = 13)?

---

## §8 References

- wiki/494 plan (this doc)
- wiki/495c R5 + wiki/496c R6 + wiki/493c R3 closures (predecessors)
- wiki/490 master plan §5-R4
- GOAL.md §A.1.1 R-cleanup pivot
- Phase 0 Researcher envelope (F1-F14 + Q1-Q8)
- musu-indexer/src/musu_indexer/core.py:30-433 (substrate + schema reference)
- musu-indexer/src/musu_indexer/workspace.py:18-47 (ignore globs)
- musu-indexer/indexer_src/main.go (Go scanner reference)
- musu-bridge/server.py:2711-2743 (HTTP endpoint shape parity)
- musu-bridge/handlers.py:1648-1684 (R1 coupling point)
- musu-bee/src/components/SearchPanel.tsx + handleWikiCommand.ts + app/api/index-search/route.ts (frontend consumers)
- Memory tags: [[feedback-no-python]], [[decision-musu-backend-rust]], [[feedback-self-contained-product]], [[feedback-no-yagni-architecture]], [[feedback-plan-stage-auditor]], [[feedback-const-vii-batched-approval]], [[feedback-scribe-html-only]]

---

## §9 Critic Findings

Phase 1.5 `system-architect` Critic returned 2026-05-20. 3 HIGH + 4 MED + 3 LOW + 1 INFO. All HIGHs resolved as plan amendments.

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| **C-R4-1** | **HIGH** | snippet bytes | Plan §4 C1 wrote `snippet(table, col, '<b>', '</b>', '...', 32)`. Python (`server.py:2732`) uses `'…'` (U+2026) + col=2 + maxchars=20. Byte-incompat with musu-bee frontend. | **Plan amendment**: §4 C1 corrected — `snippet(search_index, 2, '<b>', '</b>', '…', 20)`. Acceptance #6 + new r4_index_smoke test asserts literal U+2026 byte in returned snippet. |
| **C-R4-2** | **HIGH** | perf gate | Q7 "1000 files <5s" is speculation, no measurement. Acceptance #9 fails if operator's land-os has different scale. | **Plan amendment**: Q7 gate revised — "Rust scanner within **2× Python+Go reference wall-clock** on the operator's land-os workspace". Builder's first commit measures Python+Go baseline first, then implements + benchmarks Rust. Fixture is synthetic 1000-file in tests/r4_scanner_perf.rs (~3000 symbols density per C-R4-9). |
| **C-R4-3** | **HIGH** | r3 smoke breakage | `r3_mcp_smoke.rs:319` hard-asserts `listed.len() == 13`. Adding 14th tool breaks first cargo test. | **Plan amendment**: §3 MODIFY list adds `tests/r3_mcp_smoke.rs` (bump 13→14; extend fixture with `search_company` case + wiremock mount for `/api/index-search`; update docstring "13 tools" → "14 tools"). Acceptance #3 explicitly: r3 smoke green AFTER 14th tool. |
| C-R4-4 | MED | metadata schema | `last_sync_at` placement unspecified — FTS5 virtual table can't hold metadata. | **Plan amendment**: §3 db.rs schema spec — `CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`; rows `('workspace_name', name)` + `('last_sync_at', ISO-8601 UTC)`. |
| C-R4-5 | MED | empty work_dir | R3 confirmed create_company accepts empty work_dir. Plan didn't handle. | **Plan amendment**: §4 C8 added — `sync_workspace_async` returns `Ok(SyncReport { files_indexed: 0, skipped_reason: "no_work_dir" })` on empty/missing path; R1 hook fires unconditionally as no-op. |
| C-R4-6 | MED | cfg-feature default | `indexer-watch` feature default unclear. | **Plan amendment**: §2 explicit Cargo.toml: `[features] default = []; indexer-watch = ["notify"]`. `notify = { version = "6", optional = true }`. `musu indexer watch` under `#[cfg(not(feature = "indexer-watch"))]` errors with "rebuild with --features indexer-watch". |
| C-R4-7 | MED | R1 surface modification | Plan didn't enumerate R1 file touched. | **Plan amendment**: §3 MODIFY explicit: `musu-rs/src/bridge/handlers/companies.rs::create` — post-INSERT `tokio::spawn(async move { let _ = indexer::sync_workspace_async(work_dir, name).await; })` fire-and-forget. Does NOT block 201 response. Does NOT remove Python `_setup_company_workspace` Popen (R10 deletion). |
| C-R4-8 | LOW | regex port | Builder confirmation that Python patterns translate to Rust regex cleanly. | **Builder constraint**: §3 symbols.rs spec — iterate lines per Python parity, no `(?m)` flag, `regex::Regex::captures(line)` per pattern. |
| C-R4-9 | LOW | fixture spec | Acceptance #9 didn't specify 1000-file fixture authoring. | **Plan amendment**: §3 tests/r4_scanner_perf.rs spec — `fn make_synthetic_workspace(n_files=1000)` writes ~2KB .rs files each with 1 struct + 3 fns (~3000 symbols total). Wall-time measured including FTS5 inserts. |
| C-R4-10 | LOW | R10 deletion checklist | Q8 R10 enumeration thin. | **Plan amendment**: §1.1 Q8 expanded — closure HTML appendix lists EVERY R10 delete: `musu-bridge/server.py:2711-2743`, `handlers.py:1648-1684`, `musu-indexer/` directory, `scripts/musu-control-mcp.sh` (already handled R3), `scripts/start-indexer-http.sh`, `musu-indexer/indexer_src/main.go` + `bin/*` binaries. |
| C-R4-11 | INFO | rayon vs tokio | Builder picks parallelism substrate. | **Builder constraint**: §3 scanner.rs — soft recommend rayon for walk+regex (CPU); mpsc channel to tokio runtime for batched sqlx FTS5 inserts. Avoids rayon/tokio mixing footgun. |

**Open Questions for orchestrator**:
- C-R4-2 alternative: should R4 ship a Python+Go baseline measurement script as part of Builder Phase 3? Recommended yes — eliminates perf-gate ambiguity.
- C-R4-7 follow-up: Python `_setup_company_workspace` keeps firing post-R4 (double-sync) until R10. Idempotent? Researcher confirmed FTS5 `INSERT OR REPLACE`-style on path key — yes, idempotent.

**Builder readiness**: with C-R4-1+2+3 resolved as plan amendments + C-R4-4..11 as Builder constraints, plan is READY FOR BUILD.

## §10 Auditor Findings

Phase 5 `quality-engineer` Auditor returned 2026-05-20. 1 NEW HIGH + 3 MED + 4 LOW/INFO. All Critic HIGHs (C-R4-1, C-R4-2, C-R4-3) confirmed resolved at file:line. NEW HIGH (QA1) audit-fixed in-place.

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| **QA1** | **HIGH** | frontend-regression | R4 native handler returned 400 BadRequest on missing `workspace`, but live `SearchPanel.tsx` calls `/api/bridge/index-search?q=...` with NO workspace param → ship-day regression. | **Resolved audit-fix** in `bridge/handlers/index_search.rs:54-63`: missing/empty workspace now returns `Ok(Json(Vec::new()))` (parity with Python "no data → []" + matches `search.rs:60` empty-q convention). r4_index_smoke + r3_mcp_smoke still pass. |
| QA2 | MED | perf-gate-deferred | C-R4-2 baseline measurement deferred (Python+Go binary not in dev env); 30s absolute fallback is generous. | **ACK** — gate catches catastrophic regressions; recommend R10 prerequisite: capture Python+Go baseline on operator's land-os before Python deletion. |
| QA3 | MED | parallel index path | musu-bee Next.js `app/api/index-search/route.ts` uses different snippet bytes (ASCII `...` + maxchars=24, wraps `{results:[...]}`). Independent surface. | **ACK** — out of R4 scope. V25 harmonization or leave as separate UX flow. |
| QA4 | LOW | plan-doc drift | Plan said "18 default ignore globs" but Python source + Rust code both have 24. | ACK — closure HTML notes corrected count. |
| QA5 | LOW | dead-code | `watch.rs` `let _ = &work_dir_for_filter` cosmetic. | ACK — V25 cleanup. |
| QA6 | LOW | empty-q vs missing-workspace symmetry | QA1 audit-fix resolves the asymmetry — both now return `Ok([])`. | RESOLVED via QA1. |
| QA7 | INFO | drift-rebuild observability | DROP-then-recreate is debug-level only. | ACK — V25 observability polish. |
| QA8 | INFO | dead public API | `scanner.rs::count_candidates` unused. | ACK — V25 wire to `musu indexer count` or delete. |

**Auditor verdict**: SHIP-OK after QA1 audit-fix. R4 ships native `/api/index-search` with frontend-compatible request contract; all 11 Critic resolutions stand.
