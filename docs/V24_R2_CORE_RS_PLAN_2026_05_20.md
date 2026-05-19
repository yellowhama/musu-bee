# V24-R2 — musu-rs::core module (SQLite schema v1 + companies.yaml loader)

**Wiki ID**: wiki/492
**Created**: 2026-05-20
**Phase**: R-fast, 2 of 6
**Parent**: wiki/490 (V24 master plan, panel-reshaped)
**Predecessor**: wiki/491 + wiki/491c (R1 musu-rs::bridge shipped 2026-05-20 @ ac1c994)
**Risk**: HIGH (Const III gate fires; schema-apply on operator machine is one-way)
**LOC estimate**: ~2,000 Rust (per wiki/490 §2 sub-WS table)
**Status**: DRAFT (Phase 0 Researcher done; awaiting Phase 1.5 Critic)
**Critic**: `system-architect`
**Auditor**: `quality-engineer` (single, NOT dual — no auth surface, schema-only)

## §1 Scope

Port the `musu-rs::core` module from anyhow-bail stub (`src/core/mod.rs:2`) to a working schema-applier + companies.yaml loader. Concretely R2 SHIPS:

1. **Schema v1 freeze**: fresh `CREATE TABLE` DDL for 4 load-bearing tables matching R1 handler expectations byte-exactly. Tables: `companies`, `route_executions`, `audit_log`, `machines`. Plus FK declarations + indexes.
2. **Migration runner**: `PRAGMA user_version` detection + idempotent apply-if-missing. Resets versioning to v1 per GOAL.md §A.3 ("schema stable — semver reset for SQLite migrations to v1"). Python's schema v37 is NOT carried forward.
3. **PRAGMA + connection policy**: WAL + foreign_keys=ON + busy_timeout=5s + synchronous=NORMAL + temp_store=MEMORY applied at pool-init time AND in migration. R2 hardens what R1's `bridge/db.rs:17-39` started.
4. **Readiness probe**: `core::probe::is_ready(pool)` checks `PRAGMA user_version == EXPECTED_SCHEMA_VERSION`. R1's `/health/ready` (`handlers/health.rs:54-63`) calls this.
5. **companies.yaml format + loader + writer**: spec for `~/.musu/companies/<id>.yaml` files; read into `CompanyRecord` struct; write atomically (tempfile + rename like R1 nodes.toml).
6. **Default template (the only one R2 ships)**: embedded in binary via `const DEFAULT_TEMPLATE_YAML: &str`. Non-default templates stay `NotImplemented` (R1 already returns 501 — `handlers/companies.rs:126-131`).
7. **Const III gate UX**: operator-facing message at first `apply_schema_v1()` call.

What R2 UNBLOCKS (currently returning 500 "schema not applied" from R1):
- `GET /api/companies` → returns `[]` then real rows
- `POST /api/companies` → creates row + writes `~/.musu/companies/<id>.yaml`
- `POST /api/companies/{id}/activate` → updates row
- `POST /api/companies/{id}/run` → INSERT route_executions row
- `POST /api/tasks/delegate` → INSERT route_executions + dedup-from-restart warmup
- All audit writes (currently degrading silently per `mod.rs:71-82`)
- `GET /api/nodes` already works (reads `nodes.toml` from filesystem, not DB) — no DB unblock needed

What R2 does NOT ship (deferred per Phase 0):
- `heartbeat_runs` / `heartbeat_run_events` (no R1 handler consumes; R3+)
- `agents`, `agent_sessions` (R3+ MCP work)
- `workflows`, `goals`, `projects`, `issues`, etc. (still proxied to Python via R1 facade)
- Migration FROM v37 (GOAL.md §A.3: fresh, no carry-forward)

## §2 Stack

Per V24_DEPENDENCY_AUDIT.md R2 row: inherit R1's `sqlx` 0.7 with `["sqlite", "runtime-tokio-rustls"]`. NO new top-level crates needed — `serde_yaml`, `serde`, `serde_json`, `chrono`, `uuid` are already in R1's Cargo.toml. R2 adds **zero new deps**.

Per audit doc's "Pre-commit check" rule: if Builder discovers a need for a new crate during R2 implementation, that's a Critic finding and requires plan amendment. Default Builder posture: hand-roll over add-a-crate.

## §3 Module structure

```
musu-rs/src/core/
├── mod.rs            (~120 LOC; pub async fn apply(&pool) entry + orchestrator)
├── schema.rs         (~280 LOC; const SCHEMA_V1_STATEMENTS: &[&str] with all CREATE TABLE + indexes)
├── migrate.rs        (~100 LOC; user_version detect + apply loop + watermark — Critic M-2 LOC cap)
├── pragma.rs         (~90 LOC;  apply_pragmas(&pool); idempotent; called from migrate + pool init)
├── companies.rs      (~440 LOC; YAML <-> DB roundtrip + atomic write + load_dir w/ orphan-tmp cleanup per Critic M-4)
├── templates.rs      (~180 LOC; const DEFAULT_TEMPLATE_YAML + lookup function)
├── probe.rs          (~80 LOC;  is_ready() readiness check + schema_version() getter)
└── error.rs          (~60 LOC;  CoreError variants, IntoResponse via thiserror)
```

Total ~1,350 LOC implementation + ~650 LOC unit tests = ~2,000 LOC, matching wiki/490 §5 estimate.

**Critic M-2 LOC cap**: `migrate.rs` ≤ 100 LOC for R2. Reject any schema_v2 stub in R2 — R3 plan owns v2.

**Critic M-4 .tmp recovery**: `core::companies::load_dir()` (new function) scans `~/.musu/companies/*.yaml.tmp` on startup, logs each, removes them. ~10 LOC. Documented in §7.5.

Public surface (exported from `core::mod.rs`):
- `pub async fn apply(pool: &SqlitePool) -> Result<SchemaVersion>` — main entry, called from `bridge::run()` after `db::init_pool`
- `pub async fn schema_version(pool: &SqlitePool) -> Result<u32>` — for /health/ready
- `pub use companies::{CompanyRecord, load_yaml, write_yaml, companies_dir}`
- `pub use templates::DEFAULT_TEMPLATE`
- `pub use probe::is_ready`

R1 integration point: **between line 66 and line 67** of `src/bridge/mod.rs` (i.e., AFTER `let pool = db::init_pool(&cfg.db_path).await?;` returns, BEFORE `let audit = AuditState::new(pool.clone());`). This sequencing is load-bearing per Critic H-2: the schema MUST exist by the time `audit.boot_check()` runs at line 71.

```rust
// musu-rs/src/bridge/mod.rs, between current lines 66 and 67:
let pool = db::init_pool(&cfg.db_path).await?;
musu_rs::core::apply(&pool).await?;  // R2 INSERT POINT: idempotent schema apply BEFORE audit.boot_check
let audit = AuditState::new(pool.clone());
```

Builder MUST verify the exact line numbers at implementation time (mod.rs has been edited since R1 ship); the semantic position is "after pool init, before AuditState construction."

## §4 Schema v1 freeze (matches R1 handler expectations byte-exactly)

Each column below was verified against R1's actual INSERT/SELECT statements. Cross-references are file:line pairs from R1 source. **Drift = HIGH Critic finding.**

### 4.1 `companies` (10 cols + 2 indexes)

Verified against `handlers/companies.rs:148-160` INSERT and `companies.rs:34-50` row_to_company.

```sql
CREATE TABLE IF NOT EXISTS companies (
    id            TEXT    NOT NULL PRIMARY KEY,
    name          TEXT    NOT NULL,
    workspace_id  TEXT    NOT NULL DEFAULT '',
    status        TEXT    NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'archived'
    created_at    INTEGER NOT NULL,                  -- unix epoch seconds
    updated_at    INTEGER NOT NULL,
    meta          TEXT    NOT NULL DEFAULT '{}',     -- JSON object as string
    purpose       TEXT    NOT NULL DEFAULT '',
    work_dir      TEXT    NOT NULL DEFAULT '',
    test_cmd      TEXT    NOT NULL DEFAULT 'python -m pytest -q'
) STRICT;

CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_companies_status    ON companies(status);
```

Notes:
- `STRICT` mode on (SQLite 3.37+, available in sqlx-bundled libsqlite3).
- `meta` stored as JSON string. R1 deserializes via `serde_json::from_str`.

### 4.2 `route_executions` (7 cols + 3 indexes)

Verified against `handlers/tasks.rs:96-108` and `handlers/run.rs:75-87` INSERTs and `dedup.rs:104-110` warmup SELECT.

```sql
CREATE TABLE IF NOT EXISTS route_executions (
    task_id      TEXT    NOT NULL PRIMARY KEY,        -- UUID v4 from Rust
    company_id   TEXT,                                -- nullable
    channel      TEXT    NOT NULL,
    sender_id    TEXT    NOT NULL,
    input_hash   TEXT    NOT NULL,                    -- dedup cache key (32-char hex)
    status       TEXT    NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_route_exec_created   ON route_executions(created_at);
CREATE INDEX IF NOT EXISTS idx_route_exec_status    ON route_executions(status);
CREATE INDEX IF NOT EXISTS idx_route_exec_hash      ON route_executions(input_hash);
```

Notes:
- **Q2 RESOLVED**: PK is `task_id` only (no legacy id INTEGER).
- FK uses `ON DELETE SET NULL`.
- Index on `input_hash` for dedup warmup hot path.
- Status values documented in code comment; R2 does NOT enforce via CHECK (R5 may add).

### 4.3 `audit_log` (9 cols + 2 indexes — V37-SHAPE, NOT closure HTML's "v6-mapped")

Verified against `audit.rs:65-77` INSERT. **Plan wiki/491 §7.1 specifies the same set.**

**CRITICAL DISCREPANCY** (logged as R2-5 risk): V24_R1_BRIDGE_RS_CLOSURE_2026_05_20.html §8 claims "v6-mapped" columns. This contradicts the actually-shipped R1 code. **R2 follows the SHIPPED CODE.** R-cleanup may amend closure HTML.

```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    ts           INTEGER NOT NULL,
    actor_ip     TEXT    NOT NULL,
    method       TEXT    NOT NULL,
    path         TEXT    NOT NULL,
    status_code  INTEGER NOT NULL,
    agent_id     TEXT,
    note         TEXT,
    company_id   TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_audit_ts      ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id);
```

Notes:
- **No FK on `company_id` — INTENTIONAL** (Critic H-1 hardening). audit_log.company_id is a **string ref only**, not a foreign key. Audit rows must outlive their company per forensics principle ([[feedback-self-contained-product]]). Builder MUST NOT add `FOREIGN KEY (company_id) REFERENCES companies(id)` even if "consistency" tempts it. Integration test §11 verifies: writing audit_log with company_id="nonexistent-id" succeeds without FK violation. With `PRAGMA foreign_keys = ON` (§5.2), adding a FK here would silently 5xx audit writes whenever a company_id refers to a deleted/missing row — and per C-SEC-10 audit failures are warn-only, so the operator would never see it.
- `id` AUTOINCREMENT is the one exception to "no legacy IDs".

### 4.4 `machines` (8 cols + 1 index — ships for R3+ readiness)

R1 reads/writes `~/.musu/nodes.toml` (filesystem), NOT this table. Ships in v1 to avoid future v2 migration.

```sql
CREATE TABLE IF NOT EXISTS machines (
    id              TEXT    NOT NULL PRIMARY KEY,
    name            TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    tailscale_ip    TEXT,
    capacity_json   TEXT    NOT NULL DEFAULT '{}',
    last_seen_at    INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_machines_last_seen ON machines(last_seen_at);
```

`capacity_json` minimal schema (Q6 RESOLVED — full scheduler shape deferred to R4):
```json
{ "cpu_count": 16, "ram_mb": 65536, "gpus": [{"model":"RTX 4060 Ti","vram_mb":16384}] }
```

### 4.5 Tables NOT in schema v1 (explicit deferrals)

| Table | Defer to | Reason |
|---|---|---|
| `heartbeat_runs` | R3+ | No R1 handler writes. Day-2 doesn't need. |
| `heartbeat_run_events` | R3+ | Same |
| `agents`, `agent_sessions` | R3 (control module) | MCP work |
| `goals`, `projects`, `issues`, `messages`, `workflows`, etc. (22+ tables) | R5+ or V25 | Proxied to Python via R1 facade |

## §5 PRAGMA + connection policy (Q1, Q5, Q10 resolved)

### 5.1 Q1 RESOLVED: unified `musu.db` (NOT separate audit.db)

Decision: R2 uses a single `musu.db` for all 4 schema-v1 tables.

Justification:
- R1 already wired `AuditState::new(pool.clone())` at `bridge/mod.rs:67` — same `SqlitePool`. The `audit_db_path` field in `BridgeConfig` is marked `#[allow(dead_code)]` and never opened.
- Reversing requires an R1 amendment, expanding scope.
- WAL + busy_timeout already serialize writes.
- Backup story simpler.

`audit_db_path` config field stays as dead code (R-cleanup may purge).

### 5.2 Q5 + Q10 RESOLVED: PRAGMAs applied at every connection

```rust
// core/pragma.rs
pub async fn apply_pragmas(pool: &SqlitePool) -> Result<()> {
    sqlx::query("PRAGMA journal_mode = WAL").execute(pool).await?;
    sqlx::query("PRAGMA synchronous = NORMAL").execute(pool).await?;
    sqlx::query("PRAGMA temp_store = MEMORY").execute(pool).await?;
    sqlx::query("PRAGMA foreign_keys = ON").execute(pool).await?;
    sqlx::query("PRAGMA busy_timeout = 5000").execute(pool).await?;
    Ok(())
}
```

R1's `bridge/db.rs:17-39` stays untouched — R2 calls `core::apply(&pool)` AFTER init_pool returns.

### 5.3 FK enforcement risk (Critic H-1 hardened)

`PRAGMA foreign_keys = ON` may cause R1 INSERTs to fail with FK violation if `company_id` references nonexistent company. Audit of R1 INSERT paths binding company_id:

**Paths with FK declared (route_executions.company_id → companies.id, §4.2)**:
- `tasks.rs:96-108` binds `req.company_id: Option<String>` — `None` → NULL → FK passes. `Some(id)` → FK requires existence.
- `run.rs:75-87` binds `&id` from URL — but `run_company` first verifies company exists at `run.rs:55-62`. So by INSERT time, company exists.

**Paths with FK NOT declared (audit_log.company_id, §4.3)**:
- `audit.rs:65-77` binds `entry.company_id.as_deref()` with NO existence check. Per Critic H-1: this is intentional. audit_log.company_id has NO FK declaration in §4.3 DDL. Writing a non-existent company_id succeeds (it's just a TEXT field).

**Invariant (Critic H-1)**: Only `route_executions.company_id` has FK declared. `audit_log.company_id` is a forensic string ref with no FK. Builder MUST preserve this asymmetry.

**Verdict**: FK ON is safe for R1's existing handlers given the asymmetry above. Integration test §11-4 verifies route_executions FK happy path; §11-new verifies audit_log non-FK path.

If integration test FAILS, fallback: drop FK ON for R2, document as R-cleanup TODO.

## §6 Migration runner (Q7 resolved)

### 6.1 Versioning scheme — semver reset to v1

Per GOAL.md §A.3 hard constraint #4. Fresh-install opens with `PRAGMA user_version = 0`. R2 sets to 1.

```rust
pub const EXPECTED_SCHEMA_VERSION: u32 = 1;

pub async fn apply(pool: &SqlitePool) -> Result<u32> {
    let current = current_version(pool).await?;
    if current >= EXPECTED_SCHEMA_VERSION {
        return Ok(current);
    }
    emit_schema_apply_notice(pool).await;  // Const III gate UX
    for v in (current + 1)..=EXPECTED_SCHEMA_VERSION {
        apply_migration(pool, v).await?;
        set_version(pool, v).await?;
    }
    Ok(EXPECTED_SCHEMA_VERSION)
}
```

### 6.2 Idempotency

Every CREATE uses `IF NOT EXISTS`. PRAGMA user_version is the single source of truth.

### 6.3 Locking + concurrency

sqlx's `busy_timeout = 5000` sufficient. Race window: both processes see user_version=0, both apply, both set to 1 → identical state. Acceptable.

### 6.4 Failure mode

Transaction rollback on apply_v1 failure. user_version stays 0. /health/ready reports false until success.

## §7 companies.yaml format (Q4 + Q9 resolved)

### 7.1 Path resolution

`$HOME/.musu/companies/<id>.yaml` (Windows: `%USERPROFILE%\.musu\companies\<id>.yaml`).

### 7.2 YAML schema

```yaml
schema_version: 1
id: land-os-dev
name: "land-os 개발팀"
workspace_id: ""
status: active
created_at: 1716183600
updated_at: 1716183700
purpose: "Land-OS development team — operator's primary R&D workspace"
work_dir: F:\Aisaak\Projects\land-os
test_cmd: pytest -q
template_key: default
meta:
  language: python
  primary_branch: main
  tags: [land-os, primary]
agents: []
```

### 7.3 Field-by-field spec

| Field | Type | Required? | Default | Maps to DB |
|---|---|---|---|---|
| `schema_version` | int | YES | — | (file metadata, frozen at 1) |
| `id` | string | YES | uuid::Uuid::new_v4() | companies.id |
| `name` | string | YES | — | companies.name |
| `workspace_id` | string | NO | `""` | companies.workspace_id |
| `status` | enum | NO | `"draft"` | companies.status |
| `created_at` | int | YES | unix epoch | companies.created_at |
| `updated_at` | int | YES | unix epoch | companies.updated_at |
| `purpose` | string | NO | `""` | companies.purpose |
| `work_dir` | string | NO | `""` | companies.work_dir |
| `test_cmd` | string | NO | `"python -m pytest -q"` | companies.test_cmd |
| `template_key` | string | NO | `"default"` | (load-time only) |
| `meta` | map | NO | `{}` | companies.meta (JSON serialized) |
| `agents` | list | NO | `[]` | (R3 territory) |

### 7.4 Validation rules

- `schema_version == 1` or error
- `id` matches `^[a-zA-Z0-9._-]{1,64}$` (filesystem-safe)
- `name.trim().is_empty()` → error
- `status in {"draft", "active", "archived"}`
- File path `id` field matches filename

### 7.5 Atomic write

```rust
pub fn write_yaml(record: &CompanyRecord) -> Result<()> {
    let dir = companies_dir();
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.yaml", record.id));
    let tmp = path.with_extension("yaml.tmp");
    let yaml = serde_yaml::to_string(record)?;
    std::fs::write(&tmp, yaml)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}
```

Mirrors `bridge/handlers/nodes.rs:64-76` pattern. No fsync (single-operator scale).

### 7.6 Roundtrip + DB sync

R1 handler delta (R2 adds 2 lines total):
- After `companies.rs:170` INSERT: call `core::companies::write_yaml(&record)`.
- After `companies.rs:237` UPDATE: read row + call `write_yaml`.

DB is canonical; YAML files are derived state.

## §8 Template resolution (Q4 RESOLVED — embed in binary)

Per [[feedback-self-contained-product]]: templates compiled into binary.

```rust
pub const DEFAULT_TEMPLATE_YAML: &str = r#"
schema_version: 1
template_key: default
status: draft
test_cmd: python -m pytest -q
meta:
  language: ""
  tags: []
"#;

pub fn resolve(template_key: &str) -> Option<TemplateBlueprint> {
    match template_key {
        "default" => Some(parse_blueprint(DEFAULT_TEMPLATE_YAML).expect("default template malformed")),
        _ => None,
    }
}
```

Non-default templates stay 501 (R1 already returns this — `handlers/companies.rs:126-131`).

## §9 R1 integration — what unblocks (Critic H-3 expanded)

Currently failing R1 paths (500 "schema not applied" or silent degrade) → working post-R2:

| R1 file:line | What it does | R2 fix |
|---|---|---|
| `handlers/companies.rs:58-62, 133-137, 198-202` | schema check on list/create/activate | §4.1 ships companies |
| `handlers/run.rs:48-52, 55-62` | schema check + SELECT id FROM companies | §4.1 |
| `handlers/run.rs:75-87` | INSERT route_executions | §4.2 |
| `handlers/tasks.rs:65-69, 96-108` | schema check + INSERT | §4.2 |
| `audit.rs:65-77` | INSERT audit_log | §4.3 |
| `audit.rs:148-159` | `boot_check` (per Critic H-3 — was missing from this table) | §4.3 — boot_check transitions from warn-degrade to silent-pass |
| `dedup.rs:104-110` | warmup SELECT | §4.2 |
| `handlers/health.rs:39-50, 54-63` | /health + /health/ready flags | §4 + §6 |

**R1 code amendments R2 ships** (per Critic H-3 — actually 4 lines, not 3):

1. `bridge/mod.rs` between current lines 66 and 67: insert `musu_rs::core::apply(&pool).await?;` (§3 integration point).
2. `bridge/handlers/companies.rs:170` (post-INSERT): insert `core::companies::write_yaml(&record);` (§7.6).
3. `bridge/handlers/companies.rs:237` (post-UPDATE): insert `core::companies::write_yaml(&record);` (§7.6).
4. `bridge/config.rs` annotation: `BridgeConfig.audit_db_path` field (currently lines 41, 110, 163) STAYS as `#[allow(dead_code)]` per §5.1 unified-DB decision. **Builder MUST NOT remove this field in R2** — that would be an R1 amendment expanding scope. R-cleanup purges.

Post-R2 operator workflow:
1. `MUSU_BRIDGE_TOKEN=... ./target/release/musu bridge`
2. `core::apply` runs FIRST → schema v1 applied (Const III message emitted once per §10)
3. Then `audit.boot_check` runs → silent pass (schema exists; no degrade warning)
4. Then `dedup.warmup` runs → empty result set (no rows yet)
5. `curl /api/companies` returns `[]` (200)
6. `curl -X POST /api/companies '{"name":"land-os 개발팀", ...}'` creates row + writes YAML
7. R1's writer-stub now has real DB to write to.

**Boot sequence ordering invariant** (Critic H-2): the Const III message from §10 MUST emit BEFORE `audit.boot_check` warning. R2 places `core::apply` ahead of `audit.boot_check` in mod.rs flow. If Builder reorders, Auditor flags HIGH.

## §10 Const III gate UX

```
========================================================================
musu-rs core: applying schema v1 to: /home/user/.musu/db/musu.db
========================================================================

This is the FIRST schema application on this machine (Const III gate).

  - Tables created: companies, route_executions, audit_log, machines
  - Pragmas set: WAL, foreign_keys=ON, busy_timeout=5s
  - Existing musu-bridge (Python) on :8071 is UNAFFECTED — different DB.

Backup recommendation: copy ~/.musu/db/musu.db to ~/.musu/db/musu.db.pre-v1
before any further writes. Rollback path: delete musu.db, restart bridge,
DB regenerates from any committed YAML files in ~/.musu/companies/.

Confirm with: curl http://127.0.0.1:8070/health/ready
Expected:    {"ready":true,"schema_applied":true,"audit_schema_applied":true}

========================================================================
```

Emission rule: ONLY on `current=0 → 1` transition. Subsequent boots silent.

Const III autonomous: log + apply immediately. Override `MUSU_CONST_III_REQUIRE_ACK=1` + `MUSU_CONST_III_ACK=1` for paranoid mode (operator R8 first install).

## §11 Acceptance criteria for R2 SHIP-OK

1. ✅ `cargo build --release` produces single binary
2. ✅ `cargo test -p musu-rs` passes — at minimum:
   - `core::schema::tests::all_v1_tables_create`
   - `core::migrate::tests::fresh_db_user_version_starts_at_0`
   - `core::migrate::tests::apply_sets_user_version_to_1`
   - `core::migrate::tests::idempotent_double_apply`
   - `core::migrate::tests::concurrent_apply_race_is_idempotent` (Critic L-3: two pools open same DB, both call apply, both succeed, user_version==1)
   - `core::companies::tests::yaml_roundtrip_preserves_all_fields`
   - `core::companies::tests::yaml_rejects_unsupported_schema_version`
   - `core::companies::tests::yaml_rejects_id_with_traversal`
   - `core::companies::tests::load_dir_removes_orphaned_tmp` (Critic M-4: startup scan removes .yaml.tmp leftovers)
   - `core::pragma::tests::foreign_keys_enabled_after_apply`
   - `core::pragma::tests::foreign_keys_actually_enforces` (Critic L-3a: SELECT * FROM pragma_foreign_keys + actual FK violation test, not just sqlx OK return)
   - `core::schema::tests::strict_mode_rejects_type_mismatch` (Critic L-3b: INSERT string into INTEGER col → error)
   - `core::schema::tests::audit_log_company_id_is_not_fk` (Critic H-1: INSERT audit_log row with nonexistent company_id succeeds)
   - `core::probe::tests::is_ready_false_before_apply_true_after`
3. ✅ Integration test `tests/r2_smoke.rs`: boot bridge fresh DB, /health/ready=false → apply → /health/ready=true → POST companies → 200 + YAML file → GET companies returns row.
4. ✅ Integration test: FK ON does NOT break R1 INSERT order (route_executions with FK to companies + audit_log without FK both work in same boot).
5. ✅ `cargo clippy --all-targets --all-features -- -D warnings` clean
6. ✅ Manual smoke (operator on 4060Ti) per §10 sequence.
7. ✅ Phase 1.5 Critic findings all resolved or explicitly user-overridden.
8. ✅ Phase 5 Auditor approved.
9. ✅ Const III gate verified per §10.

## §12 Risks + mitigations (R2-specific)

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| **R2-1** | HIGH | Schema column drift vs R1 expectations. Typo silently breaks R1 handlers (500 at runtime instead of compile error). | Unit tests bind every R1-expected column. Critic dry-run reviews each table vs R1 INSERT/SELECT at file:line. |
| **R2-2** | MED | heartbeat_runs deferral may block R5. | Explicit deferral §4.5. R3 or R5 adds as schema v2. R2 ships migration runner specifically for this. |
| **R2-3** | MED | `PRAGMA foreign_keys = ON` surfaces latent FK issues. | Integration test §11-4 verifies. R1 TOCTOU window empty (no DELETE today). R-cleanup hardens. |
| **R2-4** | MED | companies.yaml format incompat with Python's prior. | Per wiki/471 v3 ground-truth: zero Python-side YAML exists. R2 rejects schema_version != 1 with helpful error. |
| **R2-5** | MED | R1 closure HTML §8 contradicts shipped code re: audit_log columns. | §4.3 explicitly calls out. Shipped code (audit.rs:65-77 + wiki/491 §7.1) is canonical. R-cleanup may amend closure HTML. |
| **R2-6** | LOW | sqlx STRICT-mode unsupported on older bundled sqlite. | sqlx 0.7 bundles libsqlite3 ≥ 3.41; STRICT is 3.37+. Margin OK. |
| **R2-7** | LOW | Const III autonomous looks "manual" but applies autonomously. | Per operator approval + reshape lock; §10 documents rollback. R8 E2E is operator-attested. |
| **R2-8** | LOW | machines table ships unused. | Trade-off documented §4.4. Critic may override to defer. |

## §13 Phase 1.5 Critic seed

Spawn `system-architect` Critic (single — no auth surface). Seed prompts:

1. **§4 column freeze**: walk every R1 INSERT/SELECT, confirm every bound column exists in §4 DDL with compatible type:
   - companies.rs:148-160 → §4.1 has 10 cols match?
   - tasks.rs:96-108 → §4.2 has 7 cols match?
   - run.rs:75-87 → same?
   - audit.rs:65-77 → §4.3 has 9 cols match?
   - dedup.rs:104-110 → §4.2 indexed?

2. **§4.3 audit_log discrepancy**: is Planner correct that closure HTML is wrong and shipped code is canonical? If shipped code is bug, Critic must escalate (R1 amendment).

3. **§4.4 machines table ship-now vs defer**: trade-off schema stability vs YAGNI.

4. **§5.1 unified DB**: is dead-code `audit_db_path` a problem? R1 amendment or R-cleanup?

5. **§5.3 FK enforcement**: any R1 INSERT path violates FK ON? Walk every handler.

6. **§6 migration runner**: over-engineered for single migration? Could be `apply_schema_v1_if_missing` function. Trade-off: V25 cost vs current LOC.

7. **§7 companies.yaml format**: matches operator's day-2 use case (land-os + vibecode-town)? Missing required fields?

8. **§8 templates-in-binary**: one "default" sufficient for R2? Both land-os + vibecode-town fit. Don't push for more.

9. **§10 Const III autonomous**: acceptable, or must require explicit ack?

10. **§11 acceptance tests**: sufficient? Missing edge cases?

11. **§12 risk register**: complete?

## §14 References

- **wiki/490** — V24 master plan (panel-reshaped)
- **wiki/491** — V24-R1 musu-rs::bridge detail plan
- **wiki/491c** — V24-R1 closure HTML
- **GOAL.md §A.3** — semver reset hard constraint
- **V24_DEPENDENCY_AUDIT.md** — R2 row (zero new deps)
- **Phase 0 Researcher output** — schema archaeology (this turn)
- **R1 source ground truth**:
  - `musu-rs/src/bridge/handlers/companies.rs` — 10-col INSERT/SELECT
  - `musu-rs/src/bridge/handlers/tasks.rs` — 7-col INSERT
  - `musu-rs/src/bridge/handlers/run.rs` — 7-col INSERT
  - `musu-rs/src/bridge/audit.rs` — 8-col INSERT
  - `musu-rs/src/bridge/dedup.rs` — warmup SELECT
  - `musu-rs/src/bridge/db.rs` — pool init
  - `musu-rs/src/bridge/mod.rs:66-67` — integration point
- **Memory tags**:
  - `[[feedback-no-python]]` — backend ban
  - `[[decision-musu-backend-rust]]` — Rust lock
  - `[[feedback-self-contained-product]]` — drives templates-in-binary
  - `[[feedback-no-yagni-architecture]]` — drives no-fsync, no-migration-from-v37
  - `[[feedback-plan-stage-auditor]]` — Critic gate per ≥MED-risk sub-WS
  - `[[feedback-scribe-html-only]]` — R2 closure HTML
- **V23.5 wiki/471 v3** — ground-truth zero real Python-side companies

## §15 Critic Findings (resolved)

Phase 1.5 `system-architect` Critic returned 2026-05-20: **RESHAPE-REQUIRED** with 3 HIGH + 4 MED + 3 LOW. **§4 column freeze byte-exact PASS** (verified against every R1 source file). All findings resolved in-plan via text amendments — no architectural change. No user escalation required.

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| **§4 PASS** | — | Column freeze byte-exact verified vs all 6 R1 source files | No action; Critic confirms §4 ships untouched. |
| **H-1** | HIGH | FK ON could break audit writes silently if audit_log.company_id had FK. | **RESOLVED**: §4.3 hardened with explicit "audit_log.company_id is NOT FK, INTENTIONAL" note. §5.3 expanded with FK-asymmetry invariant. §11 adds `audit_log_company_id_is_not_fk` test. Builder MUST NOT add FK to audit_log.company_id. |
| **H-2** | HIGH | Boot sequencing race: audit.boot_check ran BEFORE schema apply on fresh-install → confusing warning order. §3 integration point ambiguous. | **RESOLVED**: §3 now specifies exact insertion point (between line 66 `let pool = init_pool` and line 67 `let audit = AuditState::new`). §9 adds "Boot sequence ordering invariant": Const III message MUST emit BEFORE audit.boot_check warning. |
| **H-3** | HIGH | §9 R1-integration table missing `audit.rs:148-159` boot_check + `audit_db_path` dead-code annotation. Claim of "3 line delta" was actually 4 lines. | **RESOLVED**: §9 table expanded with boot_check row; §9 amendment list now explicitly enumerates 4 amendments including config.rs `#[allow(dead_code)]` retention. |
| **M-1** | MED | Closure HTML §8 "v6-mapped audit row writer" phrasing is sloppy but non-load-bearing. | **RESOLVED-INFORMATIONAL**: §4.3 + R2-5 risk row already document. R-cleanup amends closure HTML; no R2 action. |
| **M-2** | MED | Migration runner could be over-engineered. | **RESOLVED**: §3 caps `migrate.rs` at 100 LOC for R2. Builder rejects schema_v2 stub. R3 plan owns v2. |
| **M-3** | MED | machines table ship-now vs defer. | **PLANNER PICKS SHIP** (originally §4.4 decision). Critic mild preference DEFER. Trade-off documented; Builder may override if Phase 5 Auditor finds it dead weight. |
| **M-4** | MED | .tmp recovery missing — operator-visible debris if write crashes mid-rename. | **RESOLVED**: §3 module structure adds `core::companies::load_dir()` (~10 LOC); §7.5 documents recovery; §11 adds `load_dir_removes_orphaned_tmp` test. |
| **L-1** | LOW | Single template fine for day-2. | No action. |
| **L-2** | LOW | Const III autonomous (log + apply) acceptable. | No action. |
| **L-3** | LOW | Missing acceptance tests: FK actually enforces, STRICT mode rejects type mismatch, concurrent apply race. | **RESOLVED**: §11 adds `foreign_keys_actually_enforces`, `strict_mode_rejects_type_mismatch`, `concurrent_apply_race_is_idempotent`. WAL-on-network-FS test skipped (out of scope). |

**Final Critic gate verdict**: Plan is Builder-ready post-amendments. Phase 3 Builder (`backend-architect`) can start.
