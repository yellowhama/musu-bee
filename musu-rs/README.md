# Musu (무수) — Autonomous Distributed AI Agent Ecosystem

## 🎯 궁극적인 3대 목표와 비전 (Product Vision)

### 1. 완벽한 집사 (기기 및 설비의 완전한 제어)
무수는 단순한 텍스트 답변기가 아닙니다. `musu-rs`의 `io/kvm.rs`와 `webrtc.rs` 구조를 보면 알 수 있듯, 무수는 사용자의 컴퓨터나 서버의 키보드, 마우스, 화면을 직접 보고 제어할 수 있는 **'물리적 실행력'**을 갖추도록 설계되었습니다. 사용자가 명령하면 단순히 코드를 짜주는 것에 그치지 않고, 직접 환경을 세팅하고 기기를 제어하는 완벽한 디지털 집사(Butler)가 되는 것이 첫 번째 목표입니다.

### 2. 스스로 판단하는 CEO (목표 설정과 플래닝)
`musu-brainai`와 `musu-crawl-ai`의 연동(SSOT 및 자율 사전 학습)에서 보았듯, 무수는 주어진 단편적인 명령만 수행하는 수동적인 존재가 아닙니다. 회사(Company) 단위로 스스로 목표를 설정하고, 방대한 과거의 기억(Semantic Vector DB)을 되짚어 보며, 어떻게 문제를 해결할지 스스로 플랜을 짜고(Planner) 의사결정을 내리는 뇌(Brain) 역할을 하는 것이 두 번째 목표입니다.

### 3. 유기적인 분산 조직 (에이전트 간의 협업 ㅡ A2A Mesh)
하나의 거대한 AI가 모든 것을 다 하는 것이 아니라, 무수 프로(`musu-pro`) 대시보드를 통해 여러 에이전트 노드들이 서로 소통합니다. 작업이 막히면 `/api/ai/direct_message`를 통해 다른 특화된 사원(에이전트)이나 중간관리자에게 작업을 위임(Delegation)하고 결과를 보고(Report) 받습니다. 수많은 무수 노드들이 WebRTC와 P2P로 연결되어 하나의 거대한 지능형 기업(Virtual Company)처럼 동작하는 것이 최종 목표입니다.

---

## musu-rs — V24 single-binary musu control plane

V24 Rust replacement for the Python `musu-bridge` + `musu-core` + `musu-control`
+ `musu-indexer` + `musu-writer` stack. Single binary, four subcommands.

## Status

| Phase | Component | Status |
|---|---|---|
| R0 | Workspace bootstrap | shipped (5a5ee25) |
| R1 | `musu bridge` | shipped — see wiki/491 |
| R2 | `musu core` (schema v1 + companies.yaml) | shipped — see wiki/492 |
| R3 | `musu indexer` | pending |
| R4 | `musu writer` | pending |
| R5 | Replace bridge writer-stub with native Rust | pending |
| R6 | `musu control` + installer | pending (R-cleanup) |
| R7 | musu-bee BRIDGE_URL wire-up | pending |

## Build

```bash
cd musu-rs
cargo build --release
# → target/release/musu(.exe)
```

## Run (R-fast dual mode)

R1 ships the bridge module + facade reverse-proxy to Python. R-fast requires
both Rust :8070 and Python :8071 running together. Use the wrapper:

```bash
export MUSU_BRIDGE_TOKEN=$(head -c 24 /dev/urandom | base64)   # ≥32 chars
scripts/v24-rfast-dual-start.sh
```

Or manually for development:

```bash
export MUSU_BRIDGE_TOKEN=$(printf 'a%.0s' {1..32})
export MUSU_ENV=development
./target/release/musu bridge
```

## Endpoints (R1 native)

| Method | Path | Source |
|---|---|---|
| GET | `/health` | bridge/handlers/health.rs |
| GET | `/health/ready` | bridge/handlers/health.rs |
| GET, POST | `/api/companies` | bridge/handlers/companies.rs |
| POST | `/api/companies/{id}/activate` | bridge/handlers/companies.rs |
| POST | `/api/companies/{id}/run` | bridge/handlers/run.rs (writer-stub) |
| POST | `/api/tasks/delegate` | bridge/handlers/tasks.rs (writer-stub) |
| GET | `/api/nodes` | bridge/handlers/nodes.rs |
| POST | `/api/nodes/add` | bridge/handlers/nodes.rs |

All other paths are reverse-proxied to Python `127.0.0.1:8071` via the facade
(bridge/facade.rs) with SSE streaming preserved for `text/event-stream`.

## Environment variables (wiki/491 §8)

| Var | Default | Notes |
|---|---|---|
| `MUSU_BRIDGE_TOKEN` | required in prod | ≥32 chars in prod |
| `MUSU_ENV` | (prod) | only exact `development` or `test` downgrades |
| `BRIDGE_HOST` | `127.0.0.1` | bind address |
| `BRIDGE_PORT` | `8070` | bind port |
| `MUSU_PYTHON_BRIDGE_PORT` | `8071` | facade target port |
| `MUSU_TOKEN` | (none) | secondary bearer for peer sync |
| `MUSU_BRIDGE_LOCALHOST_AUTH` | (auth required) | set `0` to bypass localhost auth |
| `MUSU_DISABLE_RATE_LIMIT` | off | only honored in dev/test |
| `MUSU_RATE_LIMIT_PER_MIN` | `60` | per-IP sliding window |
| `MUSU_ALLOW_PLAINTEXT_LAN` | off | suppresses non-loopback bind warning |
| `MUSU_BRIDGE_DB_PATH` | `~/.musu/db/musu.db` | sqlx pool target |
| `MUSU_BRIDGE_AUDIT_DB` | `~/.musu/data/audit.db` | reserved (R-cleanup) |
| `MUSU_NODES_TOML_PATH` | `~/.musu/nodes.toml` | nodes mesh state |
| `MUSU_V24_FACADE_TARGET` | off | Python-side guard — `1` enforces `BRIDGE_HOST=127.0.0.1` |

## R2: `musu core` (schema v1 + companies.yaml)

R2 lands the `core` module per wiki/492. Single-binary, four subcommands now
include a fifth: `musu core` provisions the SQLite schema without booting
the bridge — useful for first-install / CI bootstrap.

| Subcommand | Purpose |
|---|---|
| `musu bridge` | Native bridge + facade reverse-proxy (R1). Auto-applies schema during boot. |
| `musu core` | Apply schema v1 against the default DB path; exit. Idempotent. |
| `musu indexer` | Pending (R3). |
| `musu writer` | Pending (R4). |
| `musu control` | Pending (R6). |

Schema v1 ships 4 tables (`companies`, `route_executions`, `audit_log`,
`machines`) in `STRICT` mode with `foreign_keys=ON` and WAL journalling.
First apply on a machine emits a Const III gate message; subsequent boots
are silent. Override behavior:

| Var | Effect |
|---|---|
| `MUSU_COMPANIES_DIR` | Override `~/.musu/companies/` path (used by tests). |
| `MUSU_CONST_III_REQUIRE_ACK` | Set `1` to require `MUSU_CONST_III_ACK=1` before applying. |
| `MUSU_CONST_III_ACK` | Pair with the above. |

`companies.yaml` files live in `~/.musu/companies/<id>.yaml`. The DB is
canonical; YAML files are derived state written atomically (tempfile +
rename) on every POST/UPDATE.

## Tests

```bash
cargo test
cargo clippy --all-targets -- -D warnings
```

R2 ships 68 unit tests + 1 integration smoke test. The smoke test
(`tests/r2_smoke.rs`) boots the actual binary against a tempfile DB and
verifies the wiki/492 §11 acceptance flow end-to-end (boot → ready=true →
POST companies → YAML file written → GET lists it). R1's 41 security-
critical auth/config/rate-limit/dedup tests still apply — see wiki/491 §4.
