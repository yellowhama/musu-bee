# V26 Handoff (CURRENT) — 2026-05-23

## §1 Summary

- **Working Dir**: `F:\workspace\musu-bee`
- **Branch**: `v26/distributed-actor`
- **Cargo.toml version**: `1.15.0-dev`
- **Status**: **V26 ALL 6 sub-WS SHIP** — 236 tests green, clippy clean
- **Closure**: `docs/V26_CLOSURE_2026_05_23.html` (wiki/515)
- **CHANGELOG**: `[1.15.0]` entry in both root `CHANGELOG.md` and `musu-rs/CHANGELOG.md`
- **Phase**: 7-day soak 대기 → V27 trigger measurement (14-day)

## §2 V26 Deliverable Matrix

| Sub-WS | Status | Tests | Key Files | Wiki |
|--------|--------|-------|-----------|------|
| W1 OpenAI-compat adapter | ✅ SHIP | lib | `adapter/{openai_compat,claude,registry}.rs` | 509c |
| W7 peer register | ✅ SHIP | 6/6 (r7) | `peer/{register,capability,manifest,service}.rs` | 510c |
| W12 deadline middleware | ✅ SHIP | lib | `bridge/middleware/deadline.rs` | 511c |
| W9 LLM DAG builder | ✅ SHIP | 14/14 (r9) | `workflow/{workflow_spec,llm_dag_builder}.rs`, `handlers/workflow.rs` | 512c |
| W13 MCP HTTP+SSE | ✅ SHIP | 14/14 (r13) | `control/http_server.rs` | 513c |
| W10 registry hardening | ✅ SHIP | 12/12 (r10) | `peer/discovery.rs` | 514c |

Total: **190 lib + 46 integration = 236 tests ALL GREEN**

## §3 Final Session Deliverables (2026-05-23)

### Code changes
- `http_server.rs` — H5 fix: hardcoded `tools_count: 14` → `tool_definitions().len()`
- `discovery.rs` — D2 fix: corrupt cache `tracing::warn` + D4 fix: corrupt TOML `tracing::warn` + D5 fix: `validate_peer_addr()` function
- `register.rs` — R2 fix: addr validation in `run_add`/`run_remove`

### Documents created/updated
- `docs/V26_CLOSURE_2026_05_23.html` (NEW) — V26 master closure, wiki/515
- `docs/V26_QUAL_EVAL_2026_05_23.md` (NEW) — 정성적 평가 (9.1/10, audit 0 CRITICAL)
- `CHANGELOG.md` — `[1.15.0]` V26 entry inserted (50-line block)
- `musu-rs/CHANGELOG.md` (NEW) — standalone Rust-era changelog
- `musu-rs/Cargo.toml` — version `1.14.0-dev` → `1.15.0-dev`
- `docs/WIKI_INDEX.md` — wiki/511~515 entries `reserved` → `complete`
- `docs/PRODUCT_CHARTER/SSOT_1PAGE_2026-04-09.md` — V26 status "W1 SHIP + pending" → "ALL 6 SHIP"

## §4 Code Audit Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH | 1 | T1: R13 test coverage (structural only, no handler execution) — tracked, V27 |
| MED | 7 | 4 fixed (H5, D2, D4, D5/R2), 3 tracked (H2, H3, H4) |
| LOW | 10 | Accepted as tech debt |
| INFO | 4 | No action |

### Unfixed MED (V27 tech debt)
- **H2**: `BridgeClient` recreated per MCP HTTP request (should be `Arc<BridgeClient>` in AppState)
- **H3**: HTTP tool dispatch bypasses `deny_unknown_fields` param validation
- **H4**: `notifications/initialized` returns response body (JSON-RPC 2.0 notifications should not reply)
- **D1/R1**: `run_add`/`run_remove` skip `PeerLock` (TOCTOU on concurrent CLI invocation)

## §5 Verification (run yourself)

```powershell
cd F:\workspace\musu-bee

# 1. Build
cargo build --manifest-path musu-rs\Cargo.toml

# 2. Clippy
cargo clippy --manifest-path musu-rs\Cargo.toml -- -D warnings

# 3. Full integration test suite (46 tests)
cargo test --manifest-path musu-rs\Cargo.toml --test r13_mcp_http --test r10_registry --test r9_workflow_dag --test r7_peer_register

# 4. Lib tests (190 tests)
cargo test --manifest-path musu-rs\Cargo.toml --lib

# 5. Expected: 236 total, 0 failed
```

### Verification results captured (2026-05-23)
- `cargo clippy -- -D warnings`: CLEAN (zero warnings)
- `r10_registry`: 12/12 passed (0.03s)
- `r13_mcp_http`: 14/14 passed (0.00s)
- `r7_peer_register`: 6/6 passed (3.99s)
- `r9_workflow_dag`: 14/14 passed (0.01s)
- lib: 190/190 passed

## §6 Architecture State (for next session context)

### Module tree (V26 additions highlighted)
```
musu-rs/src/
├── adapter/          ← W1: openai_compat.rs, claude.rs, registry.rs
├── bridge/
│   ├── handlers/
│   │   └── workflow.rs  ← W9: 8 CRUD API handlers
│   └── middleware/
│       └── deadline.rs  ← W12: X-Musu-Deadline-Unix-Ms
├── control/
│   └── http_server.rs   ← W13: MCP JSON-RPC 2.0 / HTTP+SSE
├── core/             ← schema v4 (workflows + workflow_steps)
├── peer/             ← W7: register, capability, manifest, service
│   └── discovery.rs  ← W10: 3-source peer resolver
├── workflow/         ← W9: workflow_spec.rs, llm_dag_builder.rs
└── ...
```

### Key invariants
1. **Single-port 8070**: All traffic through one axum router (bridge + MCP merged)
2. **Bearer auth shared**: MCP HTTP inherits `bridge/auth.rs` middleware
3. **§9.12 Goodhart firewall**: `attestation_required = true` at type level (W9)
4. **3-state mesh invariant**: Healthy / Degraded / Absent (W10)
5. **Schema v4**: `workflows` + `workflow_steps` tables + `cross_machine` column

## §7 Operator Actions Required (7-day soak → V27)

| # | Action | Criteria |
|---|--------|----------|
| 1 | Deploy `musu` 1.15.0 on primary machine | Bridge starts, health OK |
| 2 | W9 DAG: create ≥3 companies | `musu workflow create` + `run` |
| 3 | W13 MCP: external calls from Claude Code | ≥10 `POST /mcp/v1/messages` |
| 4 | W10 offline E2E | Kill musu.pro → `musu peer add` → delegate |
| 5 | V27 trigger measurement | Cross-machine delegation ≥5/week over 14d |
| 6 | §9.12 Goodhart attestation | Operator-authored text in wiki/515 |
| 7 | #436 main-merge | V24+V25+V26 bundle (operator decision) |

## §8 V27 Channel (measurement-gated)

**진입 기준**: cross-machine task delegation ≥5/week over 14-day soak
- ≥5 → V27 (W2 agent tool use + W5 capability labels + W6 GPU telemetry + W8 musu.pro dashboard)
- <5 → V27 보류, 다른 thesis 시작

**V27 candidate sub-WS**:
- W2: Agent tool-use harness
- W5: Capability-based scheduling labels
- W6: GPU telemetry + health reporting
- W8: musu.pro remote dashboard integration

## §9 Const VII Push Gate (PENDING USER APPROVAL)

V26 전체 코드 + docs가 uncommitted 상태. 다음 push:

```powershell
cd F:\workspace\musu-bee
git add -A
git commit -m "V26 distributed actor mesh: 6/6 sub-WS SHIP (W1+W7+W12+W9+W13+W10), 236 tests, closure wiki/515"
git push origin v26/distributed-actor
```

## §10 Score (V26 전체, self-evaluated)

**9.1 / 10 — PASS (V26 thesis complete)**

Details: `docs/V26_QUAL_EVAL_2026_05_23.md`

Highest-value moves:
1. gRPC REJECT (W11) — 16-source fact-check이 불필요한 복잡성 방지
2. 3-state mesh invariant (W10) — musu.pro 없어도 mesh 동작 보장
3. §9.12 Goodhart firewall type-level enforcement (W9) — 구조적으로 우회 불가
4. Single-port 8070 multiplex (W13) — axum Content-Type routing으로 포트 증식 방지
5. Audit-then-fix cycle — H5/D2/D4/D5 4건 즉시 수정, 피드백 루프 <1시간

Watches (V27):
- R13 test coverage (HIGH T1): handler execution tests 필요 (tower::ServiceExt)
- H2 BridgeClient per-request: `Arc<BridgeClient>` 공유 전환 필요
- D1/R1 TOCTOU: PeerLock 적용 필요 (concurrent CLI 시나리오)
