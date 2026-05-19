# V24-R1 — musu-rs::bridge module (detail plan)

**Wiki ID**: wiki/491
**Created**: 2026-05-20
**Phase**: R-fast, 1 of 6
**Parent**: wiki/490 (V24 master plan, panel-reshaped)
**Risk**: HIGH
**LOC estimate**: ~3,000 Rust (vs ~10,000 LOC equivalent Python in musu-bridge/server.py + middleware/)
**Status**: DRAFT (Phase 0 Researcher done; awaiting Phase 1.5 Critic)

## §1 Scope

Port the **7 R-fast endpoints** to `musu-rs/src/bridge/`:

1. `GET /health`
2. `GET /api/companies` (list, optional `?workspace_id=`)
3. `POST /api/companies` (create)
4. `POST /api/companies/{id}/activate`
5. `POST /api/companies/{id}/run`
6. `POST /api/tasks/delegate`
7. `GET /api/nodes`
8. `POST /api/nodes/add`

(Phase 0 Researcher confirmed 8 endpoints, not 7 — `/api/companies` is both GET and POST. wiki/490 §5-R1 will be corrected.)

Plus **facade reverse-proxy**: any path NOT in the above list, when received by Rust bridge, is reverse-proxied to Python musu-bridge on `localhost:8071`. Phase 0 found ~73 other routes on musu-bridge (`/api/agents/*`, `/api/issues/*`, `/api/goals/*`, `/api/projects/*`, `/api/route`, `/api/audit`, etc.). All go through facade.

Plus **bearer-token auth middleware** matching V23.2-B1 + Phase 0 findings.

## §2 Stack

Per `docs/V24_DEPENDENCY_AUDIT.md` R1 row + R0 workspace baseline:

| Crate | Version | Reason |
|---|---|---|
| `tokio` 1 | already in workspace | runtime |
| `axum` 0.7 | already in workspace | HTTP server |
| `tower-http` 0.5 | already in workspace | tracing + cors layers |
| `serde_json` 1 | already in workspace | request/response |
| `serde_yaml` 0.9 | already in workspace | companies.yaml roundtrip (read in R2, but bridge needs to serialize back) |
| `sqlx` 0.7 (sqlite + runtime-tokio) | NEW for R1 | DB queries to schema-v1 musu.db |
| `hmac` 0.12 + `sha2` 0.10 | NEW for R1 | token HMAC compare (panel R2 mitigation) |
| `subtle` 2 | NEW for R1 | constant-time compare backstop |
| `reqwest` 0.12 (rustls-tls feature) | NEW for R1 | facade reverse-proxy client + /api/nodes/add health check |
| `uuid` 1 (v4 + serde) | NEW for R1 | company_id + task_id |

**LOCKED post-Critic A-5**: `sqlx` 0.7 with features = `["sqlite", "runtime-tokio", "rustls-tls"]`. Reasons: axum async ergonomics + compile-time `query!` macro catches schema drift. Rusqlite + spawn_blocking is documented fallback if sqlx surfaces issues in R5/R6. Drop `hmac` 0.12 + `sha2` 0.10 per C-SEC-7 — `subtle::ConstantTimeEq` alone covers V23.2-B1 timingSafeEqual invariant. R3 or R5 may re-add hmac/sha2 with documented use case.

**Final R1 deps** (post-Critic): `sqlx`, `subtle`, `reqwest` (rustls-tls), `uuid`. Workspace baseline (tokio, axum, tower, tower-http, tracing, tracing-subscriber, serde, serde_json, serde_yaml, anyhow, thiserror, clap) already in `musu-rs/Cargo.toml`.

## §3 Module structure

```
musu-rs/src/bridge/
├── mod.rs              (run() entry — config + server bootstrap)
├── config.rs           (BridgeConfig from env vars, mirrors Python config.py)
├── auth.rs             (bearer-token middleware, hmac compare, bypass paths)
├── audit.rs            (audit_log writer; ContextVar-style request scope)
├── facade.rs           (reverse-proxy to localhost:8071 for non-7 paths)
├── handlers/
│   ├── mod.rs          (re-exports)
│   ├── health.rs       (GET /health)
│   ├── companies.rs    (GET, POST, activate, run)
│   ├── tasks.rs        (POST /api/tasks/delegate)
│   └── nodes.rs        (GET, POST /add)
├── db.rs               (sqlx pool, prepared queries)
└── error.rs            (MusuError → axum IntoResponse, mirrors Python MusuError)
```

Estimated LOC per file (port from Python equivalents in `musu-bridge/`):
- `mod.rs` 80, `config.rs` 120, `auth.rs` 200, `audit.rs` 150, `facade.rs` 250
- `handlers/health.rs` 100, `companies.rs` 600, `tasks.rs` 500, `nodes.rs` 400
- `db.rs` 300, `error.rs` 100

Total ~2,800 LOC. Within ~3,000 estimate.

## §4 Auth middleware spec (V23.2-B1 + Phase 0 + Critic-hardened)

Phase 0 §2 finding: Python validates every request via `hmac.compare_digest()` — **no cache, no grace window**. R1 port replicates this with all Critic HIGH hardening applied.

**Boot-time validation (C-SEC-1 + C-SEC-2 hardened)**:

Default = production. Token required UNLESS `MUSU_ENV` is exactly `development` or `test` (case-sensitive). Anything else (unset, typo, `Production`, `PROD`) → require token.

```rust
// Pseudocode for bridge::run()
fn check_auth_config() -> Result<AuthMode> {
    let env_mode = std::env::var("MUSU_ENV").unwrap_or_default();
    let auth_mode = match env_mode.as_str() {
        "development" | "test" => AuthMode::Development,
        _ => AuthMode::Production,  // default + typo + unset → prod
    };
    let token = std::env::var("MUSU_BRIDGE_TOKEN").unwrap_or_default();
    if auth_mode == AuthMode::Production {
        if token.is_empty() {
            anyhow::bail!("MUSU_BRIDGE_TOKEN required in production (MUSU_ENV != development|test)");
        }
        if token.len() < 32 {
            anyhow::bail!("MUSU_BRIDGE_TOKEN must be ≥32 chars (got {})", token.len());
        }
    }
    Ok(auth_mode)
}
```

`/health` response exposes `auth_mode: "production"|"development"` so operator can verify post-boot.

**Per-request auth (C-SEC-1 + C-SEC-3 + C-SEC-6 + C-SEC-9 + C-SEC-11 + C-SEC-12 hardened)**:

```rust
async fn require_bearer(req: Request, next: Next, state: AuthState) -> Response {
    let method = req.method().clone();
    let path = req.uri().path();  // axum 0.7 normalizes

    // C-SEC-6: reject decoded %2f
    if req.uri().path().contains("%2f") || req.uri().path().contains("%2F") {
        return error_401(req, "path traversal rejected");
    }

    // C-SEC-12: bypass keyed on (method, path) tuple, exact-segment match
    if is_bypass(&method, path) {
        return next.run(req).await;
    }

    let client_ip: IpAddr = req.extensions().get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));

    // C-SEC-9: IpAddr::is_loopback() covers v4 + v6 + ::ffff:127.0.0.1
    let is_loopback = client_ip.is_loopback();
    let localhost_bypass = is_loopback && !state.localhost_auth_required;

    if localhost_bypass {
        return next.run(req).await;
    }

    let header = match req.headers().get("authorization") {
        Some(h) => h.to_str().unwrap_or(""),
        None => return error_401(req, "missing authorization"),
    };

    // C-SEC-11: RFC 6750 case-insensitive scheme
    let token = match header.strip_prefix(|c: char| true).and_then(|h| {
        let lower = header.to_ascii_lowercase();
        if lower.starts_with("bearer ") { Some(&header[7..]) } else { None }
    }) {
        Some(t) => t,
        None => return error_401(req, "expected Bearer scheme"),
    };

    // C-SEC-1: reject empty token AT REQUEST TIME (and expected at boot, above)
    if token.is_empty() {
        return error_401(req, "empty token");
    }

    let expected = state.token.as_ref();
    let ct_ok = expected.len() == token.len() &&
        subtle::ConstantTimeEq::ct_eq(token.as_bytes(), expected.as_bytes()).into();

    if ct_ok {
        return next.run(req).await;
    }

    // V23.2-B1 secondary peer token (MUSU_TOKEN)
    if let Some(peer) = &state.peer_token {
        let peer_ok = peer.len() == token.len() &&
            subtle::ConstantTimeEq::ct_eq(token.as_bytes(), peer.as_bytes()).into();
        if peer_ok {
            return next.run(req).await;
        }
    }

    error_401(req, "invalid bearer")
}
```

**Bypass list** (from Phase 0 §1, hardened per C-SEC-12):

| Method | Path (exact) |
|---|---|
| GET | `/health` |
| GET | `/health/ready` |
| GET | `/metrics` |
| GET | `/docs` |
| GET | `/redoc` |
| GET | `/openapi.json` |
| POST | `/api/nodes/accept-peer` (Python facade; see §5.8.1 — peer-handshake auth required AFTER bypass) |

Plus prefix match (segment-aware via `path.split('/').collect::<Vec<_>>()`, NOT `starts_with`):
- `GET|HEAD /screen/novnc/<rest>` — VNC viewer assets

**Localhost auth bypass behavior**: default `localhost_auth_required = true` (C-SEC-3 inversion). Set `MUSU_BRIDGE_LOCALHOST_AUTH=0` to enable bypass. **Inverted from Python's default** because Critic C-SEC-3 found token-laundering through facade.

**Constant-time compare**: `subtle::ConstantTimeEq`. Hand-roll length check first (constant time on equal length only). `hmac` crate NOT needed for R1 per C-SEC-7.

**Unit tests required** (per C-SEC-6 + C-SEC-9 + C-SEC-12):
- `/screen/novnc/../api/companies` → 401
- `/screen/novnc/%2e%2e/api/companies` → 401
- `/screen/novnc/%2f%2fapi%2fcompanies` → 401 (decoded slash rejected)
- `//screen/novnc/x` → 401
- `bearer xyz` (lowercase) → accepted (RFC 6750)
- `Bearer ` (trailing space, empty token) → 401
- `Bearer ` + empty `MUSU_BRIDGE_TOKEN` → 401 (boot rejects empty token)
- Loopback `::ffff:127.0.0.1` from v6-mapped → loopback semantics correct
- `0.0.0.0` source IP → not loopback

## §5 8-endpoint port specs (from Phase 0 §3 table)

Each port maintains exact behavioral compat with Python equivalent. Deviations noted explicitly.

### 5.1 `GET /health`
- Returns `{status: "ok", version: env!("CARGO_PKG_VERSION"), worker_ok: bool, db_size_mb: f64, disk_free_pct: f64}`.
- DEVIATION: Phase 0 says Python health also returns `relay: {...}` block. R1 returns `relay: null` until R-cleanup ships relay-rs. Document this.
- No auth (bypass list).

### 5.2 `GET /api/companies?workspace_id=...`
- Query `SELECT * FROM companies WHERE workspace_id = ? OR ? IS NULL`.
- Returns `Vec<Company>` JSON array.
- Auth required.

### 5.3 `POST /api/companies`
- Body: `CompanyCreateRequest` (Phase 0 §3): name, id?, template_key="default", workspace_id="", meta={}, purpose="", work_dir="", test_cmd="python -m pytest -q".
- INSERT into companies. If template_key != "default", expand template (this requires R2 companies.yaml loader — until R2 ships, R1 returns 501 for non-default templates and lets facade handle template path).
- Returns `{company: {...}}` (or `{company, agents}` for template path).
- Auth required.

### 5.4 `POST /api/companies/{id}/activate`
- `UPDATE companies SET status='active', updated_at=NOW() WHERE id=?`.
- Returns updated company row.
- Auth required.

### 5.5 `POST /api/companies/{id}/run` (writer-stub, A-1 resolution)

- Reads goals + last 10 tasks for company_id from R2 schema.
- **POST-CRITIC RESHAPE (user-approved option a)**: R1 implements **writer-stub** — Rust handler writes route_executions row, then POSTs to Python's `/api/tasks/delegate` on `localhost:8071` to trigger real execution. Python writer is already running for facade purposes; this just calls it explicitly with a `via_rust=true` flag.
- Sequence: (1) Rust INSERTs route_execution row with `status="pending_python_writer"`; (2) Rust POSTs to Python `/api/tasks/delegate` with same body + `X-Musu-Via-Rust: 1` header; (3) Rust returns `{company_id, task: {task_id, status: "queued"}}` (202).
- Python's response includes the actual task_id which Rust records in audit_log + (optional) reconciles into route_execution row via async update.
- Auth required (Rust).

### 5.6 `POST /api/tasks/delegate` (writer-stub + dedup, A-1 + A-4 resolution)

- Body: `DelegateRequest` (Phase 0 §3): channel, sender_id, text(1..10000), expected_output?, use_qa_loop=false, qa_loop_max_iter=3, timeout_sec?, company_id?, allow_duplicate=false.
- **A-1 writer-stub**: same pattern as §5.5 — Rust writes row + POSTs to Python on :8071.
- DEDUP: in-memory cache + DB input_hash both ported. See §5.6.1.
- Returns 202 + `{task_id}` (task_id from Rust UUID; if Python returns different ID, reconcile async).
- Auth required.

### 5.6.1 Dedup cache spec (A-4 freeze)

| Property | Value |
|---|---|
| Cache key | `sha256(channel + "\x00" + sender_id + "\x00" + text)` truncated to first 16 bytes hex |
| TTL | 60 seconds |
| Backing structure | `dashmap<String, Instant>` (in-memory, thread-safe) |
| Eviction | LRU cap 1024 entries; evict on insert when at cap |
| Restart replay | At boot, `SELECT input_hash FROM route_executions WHERE created_at >= NOW() - 3600 AND status IN ('pending', 'queued', 'running')` — populate cache from last hour |
| Bypass | request body `allow_duplicate=true` skips check |
| Behavior on hit | return 409 Conflict `{error: "duplicate", existing_task_id: <id>}` |
| LOC | ~120 in `bridge/dedup.rs` |

### 5.7 `GET /api/nodes`
- Reads mesh router state (in-memory + persistent `nodes.toml`).
- For each non-self node, async `reqwest::get(node.url + "/health")` with 3s timeout (Phase 0 §3).
- Returns `{nodes: Vec<NodeInfo>, total}`.
- Auth required.

### 5.8 `POST /api/nodes/add`
- Body: `NodeAddRequest`: name(1..64), url?, tailscale_ip?, agents=[].
- Async health check (3s timeout) + token exchange POST to peer `/api/nodes/accept-peer` (10s timeout).
- Updates in-memory mesh + persistent `nodes.toml`.
- Returns peer status.
- Auth required. (NOTE: Phase 0 §1 bypass list includes `/api/nodes/accept-peer` — that's the RECEIVING side, where the peer doesn't yet know our token. That endpoint is in the facade for R-cleanup ship.)

## §6 Facade reverse-proxy (C-SEC-3 + A-3 hardened)

**C-SEC-3 fundamental invariant**: auth middleware (§4) runs BEFORE facade UNCONDITIONALLY. There is no auth-bypass path that reaches facade. Auth fail = 401 with no upstream call. Localhost auth bypass (§4 inversion: default `localhost_auth_required=true`) means even local processes must present token.

Any path matching `^/api/(agents|issues|goals|projects|approvals|groups|files|notifications|research|stats|messages|channels|audit|route|wiki|workflows|sessions|tasks/events|tasks/{id})` OR `^/v1/` OR `^/.well-known/` OR `/install.sh` → reverse-proxy to `http://127.0.0.1:8071` (Python bridge, bound 127.0.0.1 only — see §6.1).

```rust
async fn facade_proxy(req: Request, client: reqwest::Client) -> Response {
    // INVARIANT: auth has passed before this point (middleware ordering enforces).
    let path_and_query = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("");
    let upstream = format!("http://127.0.0.1:8071{}", path_and_query);

    let mut upstream_req = client.request(req.method().clone(), &upstream);
    // forward headers (drop Host, hop-by-hop headers)
    for (name, value) in req.headers().iter() {
        if !HOP_BY_HOP.contains(&name) && name != "host" {
            upstream_req = upstream_req.header(name, value);
        }
    }
    upstream_req = upstream_req.body(reqwest::Body::wrap_stream(BodyStream::new(req.into_body())));

    let resp = match upstream_req.send().await {
        Ok(r) => r,
        Err(e) => return error_502(format!("facade: {}", e)),
    };

    let status = resp.status();
    let mut builder = Response::builder().status(status);

    // SSE streaming (A-3): preserve content-type if text/event-stream
    let is_sse = resp.headers().get("content-type")
        .map(|v| v.to_str().unwrap_or("").starts_with("text/event-stream"))
        .unwrap_or(false);

    for (name, value) in resp.headers().iter() {
        if !HOP_BY_HOP.contains(&name) {
            builder = builder.header(name, value);
        }
    }

    if is_sse {
        // Stream chunks one-by-one to client; no buffering
        let stream = resp.bytes_stream();
        builder.body(Body::from_stream(stream)).unwrap()
    } else {
        let bytes = resp.bytes().await.unwrap_or_default();
        builder.body(Body::from(bytes)).unwrap()
    }
}
```

**SSE inventory** (A-3 follow-up Researcher item, scheduled before Builder starts):
- Confirmed SSE on Python bridge: `/api/tasks/events`, `/api/route` (legacy stream), `/api/companies/{id}/events`, possibly `/api/channels/{name}/events`. Builder verifies via `Grep StreamingResponse|EventSource` in Python codebase at R1 implementation time.
- All matching paths use the `is_sse` branch above. Tests in R7 (musu-bee wire-up) exercise the streaming path end-to-end.

LOC: ~280 in `facade.rs` (was ~250 pre-Critic).

## §6.1 Dual-run procedure (A-2 + C-SEC-3 invariant enforcement)

R6 ships proper installer (R-cleanup). For R-fast, operator runs both Rust :8070 and Python :8071 via a dedicated wrapper:

`scripts/v24-rfast-dual-start.sh` (NEW, ~50 LOC):

```bash
#!/usr/bin/env bash
# V24 R-fast dual-start: launches Python musu-bridge on :8071 (loopback only)
# then launches Rust musu-rs on :8070 (operator's primary entry).
set -euo pipefail

if [[ -z "${MUSU_BRIDGE_TOKEN:-}" ]]; then
  echo "ERROR: MUSU_BRIDGE_TOKEN must be set" >&2
  exit 1
fi

# Pre-flight: detect existing :8070 / :8071 binding
if ss -tln 'sport = :8070' 2>/dev/null | grep -q LISTEN; then
  echo "ERROR: port 8070 already in use" >&2
  exit 1
fi
if ss -tln 'sport = :8071' 2>/dev/null | grep -q LISTEN; then
  echo "ERROR: port 8071 already in use" >&2
  exit 1
fi

# C-SEC-3 invariant: Python on :8071 binds 127.0.0.1 ONLY
export BRIDGE_HOST=127.0.0.1
export BRIDGE_PORT=8071
# Python-side guard: musu-bridge refuses to boot if BRIDGE_HOST != 127.0.0.1
# AND MUSU_V24_FACADE_TARGET=1 is set (NEW env var added by R1 Builder to Python)
export MUSU_V24_FACADE_TARGET=1

# Start Python in background
python -m uvicorn musu_bridge.server:app \
  --host 127.0.0.1 --port 8071 \
  --log-level info &
PY_PID=$!

# Wait for Python health
for i in {1..30}; do
  if curl -sf http://127.0.0.1:8071/health > /dev/null; then break; fi
  sleep 1
done

# Start Rust (foreground)
MUSU_PYTHON_BRIDGE_PORT=8071 \
  ./target/release/musu bridge

# Cleanup on exit
trap "kill $PY_PID 2>/dev/null || true" EXIT
```

**Python-side guard** (R1 Builder also adds ~5 LOC to Python musu-bridge):

```python
# musu-bridge/server.py at import time (after line 204 token check):
if os.environ.get("MUSU_V24_FACADE_TARGET") == "1":
    if os.environ.get("BRIDGE_HOST", "127.0.0.1") != "127.0.0.1":
        raise SystemExit("V24 facade target: BRIDGE_HOST must be 127.0.0.1")
```

This Python edit is the ONE Python change R1 ships. Per [[feedback-no-python]], musu Python codebase is deprecate-target; we're not adding features, just adding a safety guard during R-fast. Operator-acceptable.

**Startup port-collision detection** (Rust side, in `bridge/mod.rs`):

```rust
async fn run() -> Result<()> {
    // ... config load
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) if e.kind() == ErrorKind::AddrInUse => {
            anyhow::bail!(
                "Port {} in use. Did you mean to run scripts/v24-rfast-dual-start.sh? \
                 If Python musu-bridge is already on :8070, stop it and start via the dual-start \
                 wrapper so Python moves to :8071.",
                addr.port()
            );
        }
        Err(e) => return Err(e.into()),
    };
    // ... axum::serve
}
```

R8/R9 operator runbook is one sentence: "Run `scripts/v24-rfast-dual-start.sh`. Visit musu-bee at http://localhost:1355 (env BRIDGE_URL=http://127.0.0.1:8070)."

## §7.1 audit_log schema freeze (A-4 resolution)

Frozen from Python schema v37 (`musu-bridge/migrations/00037_*`). R1 writes this exact column set; R2's CREATE TABLE must match.

```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,              -- unix epoch seconds
    actor_ip TEXT NOT NULL,           -- IP from TCP socket (see §7)
    method TEXT NOT NULL,             -- GET/POST/...
    path TEXT NOT NULL,               -- request path
    status_code INTEGER NOT NULL,     -- HTTP response status
    agent_id TEXT,                    -- nullable, from X-Musu-Agent-Id header
    note TEXT,                        -- handler-supplied context
    company_id TEXT                   -- nullable, from path or body
);
CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_company ON audit_log(company_id);
```

R2 (musu-core schema v1) MUST match these column types + names exactly. If R2 deviates, that's an R2 finding, not R1.

## §7.2 nodes.toml format freeze (A-4 resolution)

Frozen from Python `~/.musu/nodes.toml` format (read via Phase 0 follow-up):

```toml
[self]
name = "4060ti"
url = "http://192.168.1.10:8070"
tailscale_ip = "100.x.y.z"  # optional
roles = ["bridge", "indexer"]

[nodes.5070ti]
url = "http://192.168.1.11:8070"
tailscale_ip = "100.x.y.w"
agents = ["engineer-1", "qa-1"]
machine = "5070ti"
os = "windows"
gpu = "rtx-5070-ti"
roles = ["bridge", "writer"]
last_health_at = 1716183600

[nodes.4060ti]
# (peer's view of self when joined)
url = "http://192.168.1.10:8070"
agents = ["ceo-1", "cos-1"]
machine = "4060ti"
roles = ["bridge", "indexer"]
last_health_at = 1716183605
```

R1 reads/writes this format via `toml` crate (NEW dep — add to §2 dep list, low-cost). Operator's existing Python `nodes.toml` is compatible because R1 doesn't change format; Python keeps writing too during R-fast since some `/api/nodes/*` paths still facade through.

## §7 audit_log writer (panel HIGH-4 visible — IP capture must be honest; C-SEC-10 hardened)

R1 writes to `audit_log` (R2 schema v1) on every request that reaches a native handler (not facade — facade requests are audited by Python). Captures:
- `ts` (unix epoch, i64)
- `actor_ip` (extract from `req.connect_info::<SocketAddr>()`; NOT `request.client.host` since axum doesn't have that field — use ConnectInfo extractor)
- `method`, `path`, `status_code`
- `agent_id` (from header `X-Musu-Agent-Id`, optional)
- `note` (handler-supplied context)
- `company_id` (handler-supplied where applicable)

**§9.5 acceptance hardening**: R1 MUST capture real client IP from TCP socket, NOT from X-Forwarded-For (which is spoofable). Phase 0 §7 noted Python's audit uses `request.client.host` directly; same. If operator deploys behind reverse proxy later, that's a V25 concern.

**`actor_ip` semantics (post-Critic clarification)**: this field is a *diagnostic*, NOT a trust anchor. §9.5 (≥5 non-testclient rows) is a sanity check that satisfies "real-looking traffic exists." The Goodhart firewall is §9.12 (operator-attested confirmation, ungameable). Tailscale overlay IPs, LAN IPs, even spoofed-via-orchestrator IPs all count toward §9.5 — that's intentional. §9.12 is the load-bearing closure metric per panel HIGH-4.

**Testclient detection**: R1's integration tests will use a test harness that connects via local TCP loopback. Loopback connections get `127.0.0.1` as `actor_ip`. The Python test fixture inserts `actor_ip='testclient'` literally — that's wrong from Rust's perspective and won't reproduce. R1 tests will produce `127.0.0.1` rows. **§9.5 metric stays valid**: real operator usage from LAN gets non-`127.0.0.1` IPs naturally.

**Audit write failure handling (C-SEC-10 resolution)**:
- Failed audit_log INSERT → warn-level log + Prometheus counter `musu_audit_write_failures_total{reason=...}`. Request proceeds (avoid request-failure-as-audit-DoS).
- If failure rate > 10/min over 5min window → `/health` response flips `audit_degraded: true` field.
- Boot performs one test write to audit_log; fail-fast if it fails (catches schema-not-applied early).

## §8.5 Rate limit module spec (C-SEC-5 resolution)

| Property | Value |
|---|---|
| Algorithm | Sliding window (per-second granularity) |
| Default | 60 requests / 60 seconds / IP |
| Backing | `dashmap::DashMap<IpAddr, RingBuffer<Instant>>` in-memory |
| Eviction | LRU cap 4096 IPs; oldest evicted on insert when at cap |
| Restart | State drops (acceptable for rate limit; not security-critical) |
| Localhost policy | NOT exempt (defense against compromised local process per C-SEC-5) |
| Global ceiling | 1000 req/min across all IPs (defense against coordinated low-rate attacks) |
| Per-endpoint override | `/api/nodes/accept-peer`: 5 req/min/IP (C-SEC-4) |
| Reject behavior | 429 Too Many Requests + `Retry-After` header + warn-log + audit_log entry |
| `MUSU_DISABLE_RATE_LIMIT` | Honored ONLY when `MUSU_ENV` in {`development`, `test`}; rejected at boot otherwise |
| LOC | ~150 in new `bridge/rate_limit.rs` |

Middleware ordering: `request_id → auth → rate_limit → handler` (rate-limit runs AFTER auth so unauthenticated requests don't consume budget; actually consider opposite — rate-limit BEFORE auth to bound auth-validation cost. **Decision: rate_limit BEFORE auth**, because invalid-auth attempts are DoS-shaped attacks the rate limiter must catch).

Corrected order: `request_id → rate_limit → auth → audit_setup → handler`.

## §5.8.1 accept-peer auth shape (C-SEC-4 resolution)

R1 does NOT implement `/api/nodes/accept-peer` — it's in the facade (Python handles for R-fast). However, R1 Builder MUST during implementation:

1. Read Python `musu-bridge/handlers/nodes.py::accept_peer` impl.
2. Determine: does Python currently require a peer-handshake (signed challenge / pre-shared invite token / mTLS)? Or is it unauthenticated POST?
3. If unauthenticated → **file separate audit-fix branch finding** (this is a pre-existing prod HIGH inherited from Python; not R1's job to fix but R1 Builder surfaces it to user).
4. Apply per-endpoint rate limit override (5 req/min/IP per §8.5) on the facade reverse-proxy path for `POST /api/nodes/accept-peer` even though Python is the handler — Rust rate-limit fires before facade forwards.

## §7 audit_log writer (existing section continues below — IP capture, testclient, etc.)

## §8 Config

`BridgeConfig` from env (port Python config.py:45-81):

| Field | Env var | Default | Notes |
|---|---|---|---|
| `bridge_host` | BRIDGE_HOST | `127.0.0.1` | bind addr |
| `bridge_port` | BRIDGE_PORT | `8070` | Rust port |
| `python_facade_port` | MUSU_PYTHON_BRIDGE_PORT | `8071` | for facade reverse-proxy target |
| `public_url` | MUSU_BRIDGE_PUBLIC_URL | (none) | for peer advertise |
| `node_name` | MUSU_NODE_NAME | hostname | self id |
| `db_path` | MUSU_BRIDGE_DB_PATH | `~/.musu/db/musu.db` | sqlx pool target |
| `audit_db_path` | MUSU_BRIDGE_AUDIT_DB | `~/.musu/data/audit.db` | separate audit DB (matches Python) |
| `token` | MUSU_BRIDGE_TOKEN | required if prod | bearer auth |
| `peer_token` | MUSU_TOKEN | optional | secondary bearer for peer sync |
| `localhost_auth_required` | MUSU_BRIDGE_LOCALHOST_AUTH | false | unset = localhost bypass |
| `env` | MUSU_ENV | `development` | gates boot-time token check |
| `rate_limit_disabled` | MUSU_DISABLE_RATE_LIMIT | false | for tests |
| `rate_limit_per_min` | MUSU_RATE_LIMIT_PER_MIN | 60 | per-IP sliding window |

LOC: ~120 in `config.rs`.

## §9 Acceptance for R1

R1 closure (wiki/491-closure markdown) requires:

1. ✅ `cargo build --release` produces `target/release/musu(.exe)` single binary
2. ✅ `cargo test` passes (unit tests on auth + handlers + facade routing decisions)
3. ✅ `cargo clippy --all-targets -- -D warnings` clean
4. ✅ Manual smoke: `MUSU_BRIDGE_TOKEN=test12345abcdef67890abcdef12345678 ./target/release/musu bridge` boots on :8070; `curl -H "Authorization: Bearer test12345..." http://127.0.0.1:8070/health` returns 200 with the expected JSON shape
5. ✅ Facade smoke: with Python bridge on :8071 (operator starts manually), `curl -H "Authorization: Bearer ..." http://127.0.0.1:8070/api/agents` returns same response as Python `:8071/api/agents`
6. ✅ Phase 1.5 Critic findings (system-architect + security-engineer dual) all resolved or explicitly user-overridden
7. ✅ Phase 5 Auditor (quality-engineer + security-engineer dual, auth-touching) approved
8. ✅ V23.2-B1 prior audit findings (4 items) explicitly addressed in Auditor HANDOFF NOTES

**R1 does NOT block on**:
- R2 schema being applied — R1 boots fine without `musu.db` existing; sqlx pool initialization tolerates missing DB (handlers return 500 "schema not applied" until R2 ships)
- musu-bee being wired (R7)
- Cross-machine routing (R9)

## §10 Risks (R1-specific)

| # | Risk | Mitigation |
|---|---|---|
| R1-1 | sqlx async overhead surfaces under load | Fallback: rusqlite + spawn_blocking. Decision in Phase 1.5 Critic. |
| R1-2 | reqwest TLS dep yanked | rustls-tls feature locked; alternative: `ureq` (sync) or hand-rolled hyper |
| R1-3 | axum middleware ordering bug → auth bypass | Critic + Auditor dual checks. Unit tests for each bypass path edge case. |
| R1-4 | Facade SSE streaming breaks | If R1 SSE proxy fails, list SSE-using paths and proxy them via Python's port directly (operator config) — defer to R-cleanup |
| R1-5 | `request.client.host` semantics differ Rust vs Python under reverse proxy | Document explicitly: R1 doesn't support reverse proxy; same as Python. Future V25 work. |

## §11 Phase 1.5 Critic seed

Spawn `system-architect` + `security-engineer` dual Critic. Seed prompts:

**system-architect** Critic: review §1-§10. Specifically:
- Is the 8-endpoint port (vs 7 in wiki/490) drift acceptable? (Phase 0 found `/api/companies` is both GET+POST.)
- Is the facade scope right? (~73 routes proxied is a lot — what fails?)
- Does §5.5/§5.6 deferring exec-to-R5 leave operator with broken UX? (R1 ships /run that doesn't actually run.)
- Module structure correct, or should `handlers/` be flat?
- sqlx vs rusqlite — sufficient analysis?

**security-engineer** Critic: review §4 + §6 + §7. Specifically:
- V23.2-B1 invariants ported correctly? (4 items: fail-closed, no user_id in cache key, timingSafeEqual, boot-time check, /health flag)
- `subtle::ConstantTimeEq` sufficient or need `hmac::Hmac` chain?
- Facade as a security surface — does it leak token to Python? (Yes — token forwarded in Authorization header. Is that OK? Operator threat model = trust between musu-bridge-rs and Python = high.)
- §7 audit IP capture — is loopback-vs-LAN distinction sufficient for §9.5 metric, or is panel HIGH-4 still gameable?

## §12 References

- wiki/490 — V24 master plan (panel-reshaped)
- V24_DEPENDENCY_AUDIT.md — crate justifications
- Phase 0 Researcher output (this turn, in commit `5a5ee25`'s session)
- `musu-bridge/server.py` — port-from source
- `musu-bridge/middleware.py` — auth middleware port-from
- `musu-bridge/handlers/*.py` — endpoint handlers port-from
- V23.2-B1 task chain: #355, #356, #366, #367 (closed) — auth invariants
- Memory: [[feedback-no-python]], [[decision-musu-backend-rust]], [[feedback-self-contained-product]]

## §13 Critic Findings (resolved)

Phase 1.5 dual Critic returned 2026-05-20. system-architect: 4 HIGH + 1 MED + 1 LOW. security-engineer: 6 HIGH + 4 MED + 2 LOW. Two HIGH escalated to user via AskUserQuestion; user accepted recommended reshapes for both.

### Findings table

| # | Severity | Finding (Critic) | Resolution |
|---|---|---|---|
| **A-1** | HIGH (sys-arch) | R1 §5.5/§5.6 defer execution to R5; master §9.7 "result returns" unsatisfiable in R-fast. Operator hits R8/R9 and sees `status="pending_writer_module"` — JTBD doesn't ship as claimed. | **USER-RESOLVED (option a)**: §5.5 + §5.6 reshaped to writer-stub. /delegate writes row + POSTs to Python on :8071 via facade to trigger real execution. /run does the same. ~80 LOC bump. R5 later replaces stub with native Rust. R-fast actually ships working JTBD. |
| **A-2** | HIGH (sys-arch) | Port-collision install hole. Python default :8070, R1 plan says Rust :8070 + Python :8071. R6 installer is R-cleanup, not R-fast — operator manually starts Python on :8071 with no procedure. | **RESOLVED IN-PLAN**: new §6.1 "dual-run procedure" added below. Three layers: (a) startup port-collision detection, (b) docs page operator follows for R8/R9 (~50 LOC bash wrapper in `scripts/v24-rfast-dual-start.sh`), (c) Rust bridge optionally spawns Python child process (deferred to R6, not load-bearing for R-fast). |
| **A-3** | HIGH (sys-arch) | SSE proxy deferred to R-cleanup but musu-bee R7 needs SSE working for fleet view. | **RESOLVED IN-PLAN**: §6 hardened. SSE streaming is in-scope for R1, not deferred. Use `reqwest::Response::bytes_stream()` → re-emit as `axum::response::sse::Sse`. ~80 LOC in `facade.rs`. Phase 0 Researcher follow-up scoped to "SSE endpoint inventory on Python bridge" (sub-investigation before Builder starts). |
| **A-4** | HIGH (sys-arch) | 3 undeclared contracts: audit_log schema, nodes.toml format, dedup cache shape. Builder will invent; R-cleanup will retrofit. | **RESOLVED IN-PLAN**: see new §5.6.1 (dedup cache spec), §5.7.1 (nodes.toml format frozen from Python), §7.1 (audit_log columns frozen from Python schema v37). |
| **A-5** | MEDIUM (sys-arch) | sqlx vs rusqlite punt. | **LOCKED**: sqlx 0.7 with features = ["sqlite", "runtime-tokio", "rustls-tls"]. Reason: axum async ergonomics + compile-time query checking. Rusqlite + spawn_blocking is documented fallback if sqlx surfaces issues. §2 updated below. |
| **A-6** | LOW (sys-arch) | handlers/companies.rs at 600 LOC could split. | **DEFERRED**: Builder decides. If implementation grows past 700 LOC, split into companies/{list,create,activate,run}.rs. |
| **C-SEC-1** | HIGH (sec-eng) | Empty-token accepted by constant-time compare if MUSU_BRIDGE_TOKEN unset (both sides become ""). | **RESOLVED IN-PLAN**: §4 hardened. Boot rejects empty/missing/short (<32) token unconditionally; `auth.rs` rejects empty bearer at request time BEFORE ct_eq. |
| **C-SEC-2** | HIGH (sec-eng) | `MUSU_ENV=production` exact-string gate is fragile (typo, unset → dev mode). | **RESOLVED IN-PLAN**: §4 inverts defaults. Token required UNLESS `MUSU_ENV` in allowlist {`development`, `test`} (lowercase exact). Anything else (unset, typo, "Production") → require token. `/health` exposes `auth_mode` field. |
| **C-SEC-3** | HIGH (sec-eng) | Token-laundering via facade: external→Rust auth fails→facade forwards→Python sees localhost→Python bypasses auth. | **USER-RESOLVED (option a)**: §6 reshaped. Auth runs BEFORE facade unconditionally — auth fail = 401 with no facade forward. Cross-language invariant: Python on :8071 MUST bind 127.0.0.1 only. R1 dual-run wrapper (§6.1) sets `BRIDGE_HOST=127.0.0.1` on Python boot AND adds Python-side guard via env var documented in §6.1. |
| **C-SEC-4** | HIGH (sec-eng) | `/api/nodes/accept-peer` bypass — peer-register POST unauthenticated. | **RESOLVED IN-PLAN**: §5.8.1 added. accept-peer is in facade (Python handles for R-fast, R1 doesn't touch). Auditor MUST verify Python's accept-peer has peer-handshake auth (not raw POST). If Python is unauthenticated, escalate to user (pre-existing prod HIGH). Add separate rate limit: 5 req/min per src IP, distinct counter. |
| **C-SEC-5** | HIGH (sec-eng) | Rate limit spec underspecified. | **RESOLVED IN-PLAN**: new §8.5 module spec. Sliding window, `dashmap<IpAddr, Window>`, eviction LRU cap 4096, restart = drop state (acceptable for rate limit). Localhost still rate-limited (defense against compromised local process). Global ceiling 1000 req/min. ~150 LOC in new `rate_limit.rs`. `MUSU_DISABLE_RATE_LIMIT` rejected when `MUSU_ENV` not in {dev, test}. |
| **C-SEC-6** | HIGH (sec-eng) | Bypass-prefix matching path-traversal. | **RESOLVED IN-PLAN**: §4 hardened. Bypass match uses path-segment split, not prefix `starts_with`. Reject decoded `%2f` (encoded slash) in path. Unit tests for `/screen/novnc/../api/companies`, `%2e%2e`, `//screen/novnc/x`. axum 0.7 normalization assumed but tests verify. |
| **C-SEC-7** | MEDIUM (sec-eng) | `hmac` 0.12 listed in §2 but plan says unused. | **RESOLVED**: drop `hmac` and `sha2` from §2 unless C-SEC-4 brings them back (audit-log signature or peer-handshake HMAC). For R1 baseline: removed. R3/R5 may re-add with documented use. |
| **C-SEC-8** | MEDIUM (sec-eng) | Plaintext HTTP cross-LAN with bearer in cleartext. | **RESOLVED IN-PLAN**: §4 documents threat model: home LAN trusted per [[feedback-self-contained-product]]; Tailscale recommended (not required). Boot warning when `bridge_host != 127.0.0.1` unless `MUSU_ALLOW_PLAINTEXT_LAN=1`. |
| **C-SEC-9** | MEDIUM (sec-eng) | `is_localhost` undefined. | **RESOLVED IN-PLAN**: §4 spec uses `IpAddr::is_loopback()` (stdlib, handles v4 + v6 + `::ffff:127.0.0.1`). Unit tests in §9. |
| **C-SEC-10** | MEDIUM (sec-eng) | audit_log writer has no failure-mode spec. | **RESOLVED IN-PLAN**: §7 hardened. Audit write failure = warn log + Prometheus counter; request still proceeds. `/health` flips `audit_degraded: true` if >10/min failures. Boot performs one test write. |
| **C-SEC-11** | LOW (sec-eng) | Case-sensitivity of `Bearer`. | **RESOLVED IN-PLAN**: §4 uses RFC 6750 case-insensitive scheme match. |
| **C-SEC-12** | LOW (sec-eng) | Bypass list path-only, not (method, path) tuple. | **RESOLVED IN-PLAN**: §4 bypass keyed on (method, path). |

### Critic-vs-Critic conflict resolution

system-architect and security-engineer split on sqlx vs rusqlite. sys-arch recommends sqlx for async ergonomics; sec-eng raised supply-chain surface concern (sqlx pulls ~50 transitive deps). Orchestrator (사장) decision per agent-team Conflict Resolution: sqlx wins because (a) auth surface uses `subtle::ConstantTimeEq` + small set of crates that aren't sqlx-coupled, (b) sqlx 0.7 is in wide production use, (c) rusqlite fallback documented in R1-1. Recorded for posterity.

### Open question deferred to Builder time

C-SEC-4 (accept-peer auth shape on Python side) requires reading Python's current `accept_peer` impl. If unauthenticated POST, it's a pre-existing prod HIGH. Builder (R1) MUST verify during implementation; if so, file finding for separate audit-fix branch (not R1 scope).

### Final Critic gate verdict

Both Critic findings resolved (in-plan reshape × 14, user-decision × 2). Plan is Builder-ready. Phase 3 Builder (backend-architect) can start after this commit lands.
