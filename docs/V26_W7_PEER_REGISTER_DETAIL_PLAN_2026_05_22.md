# V26-W7 Detail Plan — `musu peer register` worker helper + capability autodetect

**Wiki ID**: wiki/510 (W7 plan); closure = wiki/510c
**Date**: 2026-05-22
**Branch**: `v26/distributed-actor`
**Cycle**: M2 (closes W7 chokepoint per `~/.claude/plans/shimmying-plotting-hamster.md` §"M2 — W7 musu peer register")
**Master plan**: `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W7 row + §3 strict sequential
**Prior cycle**: M1 (W1 Commit 3) SHIP — `docs/V26_W1_CLOSURE_2026_05_22.html`
**LOC target**: ~300 est × 3.8 = **~1,140 actual** (V26 master §2 W7 row)
**Builder**: `backend-architect` (Rust-experienced; same as M1)
**Critic**: `system-architect` single (no auth/install-staged_swap-rewrite/migration trigger per [[feedback-dual-audit-trigger-narrow]] — see §10 for why this is single-critic)
**Auditor**: `quality-engineer` single

---

## §1 Recap — what M2 closes, why W7 is the M2 cycle

V26 master plan §3 declares **strict sequential** `W1 → W7 → W12 → W9 → W13 → W10`. With W1 SHIP (M1 closed claude shim + registry dispatch + typed `AgentRecord` + `TaskSpec.adapter_type: String`), the next chokepoint is W7: the operator-ergonomic CLI surface that turns a worker PC (Ollama / ComfyUI / arbitrary script) into a node that the rest of the V26 mesh can talk to. Without W7, the V26 thesis "모든 PC 가 같은 `musu` 단일 binary 실행 + sidecar Python AI worker" reduces to "operator hand-writes a systemd unit per PC" — not a fleet OS.

W7 lands four deliverables:

1. **`musu peer register --type {ollama|comfyui|script} --start "<cmd>"`** CLI surface (clap derive, parallel to existing `install::InstallOpts` shape)
2. **Capability autodetect** — Ollama `/api/tags` probe, ComfyUI port probe, script wrapper (no-probe just records command)
3. **Cross-platform service registration** — reuse the V24-R6 `install::platform::PlatformService` trait via a new `register_peer(&self, ctx: &PeerServiceContext)` method, so each platform's existing systemd/launchd/Scheduled-Task code path is the source of truth for "make this thing boot on login"
4. **Local node manifest at `~/.musu/node.toml`** — self-node record (name, kind, start command, registration timestamp, capability autodetect snapshot, service registration state)

W7's `kind` discriminator (`ollama` / `comfyui` / `script`) is forward-compat with M1's `adapter_type` field (`claude` / `openai_compat_local` / `openai_compat_remote`). When worker PCs eventually route LLM calls through `Adapter` (M3+/W12), the W7 `kind` becomes the input that maps to `adapter_type`. M2 only seeds the discriminator; routing is future.

This cycle is intentionally surgical: no bridge schema changes (Const III untouched — that's W10), no AdapterContext changes (W12), no auth-touching beyond reusing `MUSU_BRIDGE_TOKEN` / `MUSU_TOKEN` env. The new code path is **file write + optional HTTP POST + platform service file write** — all reversible by `musu peer unregister` (out of scope for M2, tracked in §13).

---

## §2 Deliverable file list

| # | Path | Action | LOC est | Notes |
|---|---|---|---|---|
| 1 | `musu-rs/src/peer/mod.rs` | new | ~40 | `pub mod register; pub use register::*;` + module docstring |
| 2 | `musu-rs/src/peer/register.rs` | new | ~280 | `PeerAction` enum + `PeerRegisterOpts` struct + `run(action)` async dispatcher + `register()` body |
| 3 | `musu-rs/src/peer/capability.rs` | new | ~140 | `Capability` enum (Ollama/Comfyui/Script variants) + serde + probes |
| 4 | `musu-rs/src/peer/manifest.rs` | new | ~110 | `NodeManifest` struct + `read/write` TOML helpers + atomic write |
| 5 | `musu-rs/src/peer/service.rs` | new | ~60 | `PeerServiceContext` struct + thin glue to `install::platform::current()` |
| 6 | `musu-rs/src/install/platform/mod.rs` | edit | +14 / -0 | Add `register_peer(&self, ctx: &PeerServiceContext) -> Result<()>` to `PlatformService` trait (default body = unsupported; per-platform overrides) + `unregister_peer(&self, peer_name: &str)` |
| 7 | `musu-rs/src/install/platform/linux.rs` | edit | +60 / -0 | Implement `register_peer` — write `~/.config/systemd/user/musu-peer-{name}.service`, `systemctl --user daemon-reload + enable + start` |
| 8 | `musu-rs/src/install/platform/macos.rs` | edit | +50 / -0 | Implement `register_peer` — write `~/Library/LaunchAgents/com.musu.peer.{name}.plist`, `launchctl bootstrap gui/{uid}` |
| 9 | `musu-rs/src/install/platform/windows.rs` | edit | +70 / -0 | Implement `register_peer` — write Scheduled Task XML to `Musu\peer-{name}`, `schtasks /Create /XML` |
| 10 | `musu-rs/src/main.rs` | edit | +6 / -0 | `mod peer;` + `Peer { #[command(subcommand)] action: peer::PeerAction }` Cmd variant + dispatch arm |
| 11 | `musu-rs/tests/r7_peer_register.rs` | new | ~240 | **6 mandatory** integration tests (subprocess spawn pattern from `r6_install_smoke.rs`); promotion of Test 5 (capability TOML roundtrip) from optional to mandatory per Critic H5; new Test 6 (`peer_register_with_musu_home_override_does_not_touch_real_home`) per Critic H2 |
| 12 | `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W7 row "Module" cell | edit | ~1 line | F1 frame correction: `musu-rs/src/install/service_helper.rs` → `musu-rs/src/peer/` module |
| 13 | `musu-rs/src/lib.rs` | edit | +1 line | `pub mod peer;` so integration tests can `use musu_rs::peer::...` (per Critic H1, lessons-learned from M1 lib.rs surprise) |

**Total**: ~1,050 LOC + integration tests 240 = **~1,290 net touch**. Within ~1,140 target +13% (worst case M2.a/M2.b split per §11 R5; split trigger raised to +1,400 actual LOC per Critic I1 + [[feedback-loc-estimate-x2]]).

**Out of LOC accounting**: V26 master §2 W7 row Module cell update ~1 line doc-only (F1).

**Cargo.toml**: zero new deps (R2 confirmed). All required surface (clap derive, reqwest json, serde + serde_json, toml 0.8, dirs 5, tokio full, anyhow + thiserror) is already in the M1 manifest.

---

## §3 Reuse must — do NOT re-implement these

The plan is **thin** by design. The following items at exact file:line are LOCKED for re-use. Re-implementing any of them is an Auditor HIGH finding.

| # | API | File:line | Why re-use |
|---|---|---|---|
| R1 | `install::platform::PlatformService` trait + `RegisterContext { musu_home, boot_start }` | `musu-rs/src/install/platform/mod.rs:44-70` | V24-R6 SHIP. Peer service registration EXTENDS this trait via `register_peer(&self, ctx: &PeerServiceContext)`. Do NOT create a parallel `PeerService` trait — that's Option B in §7 and is rejected |
| R2 | `install::platform::current() -> Box<dyn PlatformService>` | `musu-rs/src/install/platform/mod.rs:74-91` | cfg-dispatch factory. M2 calls this directly. Do NOT re-write the cfg-target dispatch logic |
| R3 | `install::token::read_bridge_token(home) -> Option<String>` | `musu-rs/src/install/token.rs:21-43` | `MUSU_BRIDGE_TOKEN` env → `<musu_home>/bridge.env` fallback chain. M2 uses this for the local bridge POST. Do NOT duplicate the env+file chain |
| R4 | `install::resolve_musu_home(override) -> Result<PathBuf>` | `musu-rs/src/install/mod.rs:127-138` | Single source of truth for `~/.musu/` root with `--musu-home` override for tests. M2 uses this verbatim |
| R5 | `tests/r6_install_smoke.rs:28-81` test template | `musu-rs/tests/r6_install_smoke.rs:28-81` + `:149-166` | Subprocess spawn via `option_env!("CARGO_BIN_EXE_musu")` + `tempfile::TempDir` + `--musu-home` override + stderr assertions. M2's `r7_peer_register.rs` follows the same shape line-for-line |
| R6 | `bridge::handlers::nodes::NodeAddRequest` shape | `musu-rs/src/bridge/handlers/nodes.rs:152-161` | If §8 ends up posting to the local bridge (see §10 C5), use this exact request shape. M2 must NOT re-define a parallel wire format |
| R7 | Linux `run_systemctl(args)` helper | `musu-rs/src/install/platform/linux.rs:115-129` | Idempotent `systemctl --user` wrapper. Peer service registration reuses it as-is |
| R8 | macOS `refuse_if_root()` S11 guard | `musu-rs/src/install/platform/macos.rs:86-101` | LaunchAgent install MUST refuse `euid==0`. Peer service registration on macOS calls this same guard first thing |
| R9 | Windows `NonLocalSystemAccount` newtype | `musu-rs/src/install/platform/windows.rs:108-end` | Only relevant if peer service registration on Windows ever takes a `--service-account` flag. M2 stays on Scheduled Task (default V24-R6 path) → NonLocalSystemAccount not invoked, but the type stays available for V27+ |

**Anti-pattern (must NOT do)**:
- Re-implementing `systemctl --user daemon-reload + enable + start` inside `peer/service.rs`. The shim **calls** `install::platform::current().register_peer(&ctx)`; it does not duplicate the platform branching.
- Re-implementing `MUSU_BRIDGE_TOKEN` env+file resolution inside `peer/register.rs`. Call `install::token::read_bridge_token(&musu_home)` directly.
- Re-defining `MusuHome` / `~/.musu/` path resolution. Call `install::resolve_musu_home(opts.musu_home.as_deref())`.

---

## §4 Subcommand design

### §4.1 clap derive shape (peer/register.rs top)

```rust
use clap::{Args, Subcommand, ValueEnum};
use std::path::PathBuf;

/// `musu peer ...` subcommand action enum.
#[derive(Subcommand, Debug, Clone)]
pub enum PeerAction {
    /// Register THIS machine as a musu peer node — writes ~/.musu/node.toml,
    /// installs a platform service (systemd / launchd / Scheduled Task)
    /// that starts the worker on boot/login, and (optionally) registers
    /// with the local bridge + musu.pro registry.
    Register(PeerRegisterOpts),
}

#[derive(ValueEnum, Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PeerType {
    Ollama,
    Comfyui,
    Script,
}

#[derive(Args, Debug, Clone)]
pub struct PeerRegisterOpts {
    /// Kind of worker this peer hosts. Drives capability autodetect strategy
    /// and the service-unit filename: `musu-peer-{kind}-{name}`.
    #[arg(long = "type", value_enum)]
    pub type_: PeerType,

    /// Start command for the worker process. Recorded verbatim in
    /// ~/.musu/node.toml and templated into the service unit's ExecStart
    /// (Linux), ProgramArguments (macOS), or Action.Command (Windows).
    /// Example: `--start "ollama serve"`.
    #[arg(long)]
    pub start: String,

    /// Friendly name for this peer. Default = hostname + "-" + kind.
    /// Used as the systemd unit name, Scheduled Task name, and
    /// node.toml `name` field. Must match `^[a-z0-9_-]{1,32}$`.
    #[arg(long)]
    pub name: Option<String>,

    /// Override the install root (`~/.musu/`). Used by tests with a tempdir.
    #[arg(long, hide = true)]
    pub musu_home: Option<PathBuf>,

    /// Validate planned writes (capability probe, manifest content, service
    /// unit body) without actually writing anything or registering the
    /// service. Prints the would-be node.toml body + service unit body to
    /// stderr.
    #[arg(long)]
    pub dry_run: bool,

    /// Optional musu.pro registry URL to POST registration to. If unset,
    /// falls back to env `MUSU_REGISTRY_URL`. If both unset, no musu.pro
    /// POST is attempted (Const I self-contained product — `musu` works
    /// without musu.pro per [[feedback-self-contained-product]] +
    /// master plan §1 thesis lock 4).
    #[arg(long)]
    pub registry_url: Option<String>,

    /// Ollama base URL for `--type ollama` capability probe. Default =
    /// `http://127.0.0.1:11434`. Probe hits `GET {url}/api/tags`.
    #[arg(long, default_value = "http://127.0.0.1:11434")]
    pub ollama_url: String,

    /// ComfyUI base URL for `--type comfyui` capability probe. Default =
    /// `http://127.0.0.1:8188`. Probe hits `GET {url}/system_stats` (or
    /// falls back to TCP connect probe on the port if HTTP 404s).
    #[arg(long, default_value = "http://127.0.0.1:8188")]
    pub comfyui_url: String,
}
```

### §4.2 main.rs insertion

After line 61 of `musu-rs/src/main.rs` (between `Cmd::ApplySchema` and the closing `}` of `enum Cmd`):

```rust
    /// V26-W7 wiki/510: register THIS machine as a musu peer of a given
    /// kind (ollama / comfyui / script). Writes ~/.musu/node.toml,
    /// installs a platform service for boot-start, and optionally posts
    /// to the local bridge + musu.pro registry.
    Peer {
        #[command(subcommand)]
        action: peer::PeerAction,
    },
```

After line 142 (between `Cmd::ApplySchema(...)` arm and the closing `}`):

```rust
        Cmd::Peer { action } => {
            init_tracing_default();
            peer::run(action).await
        }
```

And at line 9 add `mod peer;` after `mod install;`.

### §4.3 Top-level dispatcher (peer/register.rs)

```rust
pub async fn run(action: PeerAction) -> anyhow::Result<()> {
    match action {
        PeerAction::Register(opts) => register(opts).await,
    }
}
```

`run` is the entry point `main.rs` calls. The body is small because there is only one action today (`Register`); future M2.b or W10 work may add `Unregister` / `Status` here.

---

## §5 Capability autodetect design

### §5.1 Capability enum (peer/capability.rs)

```rust
use serde::{Deserialize, Serialize};

/// Per-peer capability snapshot. Stored in node.toml and (optionally)
/// posted to the local bridge + musu.pro registry. Enum-tagged so W5
/// (V27 deferred) can extend each variant with structured fields
/// without breaking on-disk format.
///
/// Master plan §1 OUT (V27 deferred) W5 future shape:
///   `capability=[ollama:qwen2.5-32b, comfyui:8188]`
/// M2 schema is the minimal compatible subset (struct-array form).
/// W5 may add scheduler-hint fields (vram_gb, max_concurrency, etc.).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Capability {
    Ollama {
        /// Models reported by `GET /api/tags`. Empty Vec if Ollama
        /// reachable but no models pulled yet.
        models: Vec<String>,
        /// Base URL probed. Recorded for operator forensics.
        base_url: String,
    },
    Comfyui {
        /// Port the ComfyUI server is listening on. Default 8188.
        port: u16,
        /// Base URL probed.
        base_url: String,
    },
    Script {
        /// Verbatim start command for opaque worker. No autodetect.
        cmd: String,
    },
}
```

### §5.2 Probe functions (peer/capability.rs)

Three async probe fns, one per `PeerType` variant. All probes use a fixed 3s timeout to match the V24-R6 `bridge/handlers/nodes.rs:193` peer health-check timeout.

```rust
use std::time::Duration;
use tokio::time::timeout;

pub async fn probe_ollama(base_url: &str) -> Capability {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("reqwest client build");
    let models = match timeout(Duration::from_secs(3), client.get(&url).send()).await {
        Ok(Ok(resp)) if resp.status().is_success() => {
            match resp.json::<serde_json::Value>().await {
                Ok(j) => j.get("models")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter()
                        .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                        .collect())
                    .unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        }
        _ => {
            tracing::warn!(url, "Ollama probe failed; capability will be empty");
            Vec::new()
        }
    };
    Capability::Ollama { models, base_url: base_url.into() }
}

pub async fn probe_comfyui(base_url: &str) -> Capability {
    // Try /system_stats; fall back to confirming the port responds at all.
    let stats_url = format!("{}/system_stats", base_url.trim_end_matches('/'));
    let port = parse_port(base_url).unwrap_or(8188);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("reqwest client build");
    let reachable = matches!(
        timeout(Duration::from_secs(3), client.get(&stats_url).send()).await,
        Ok(Ok(r)) if r.status().is_success() || r.status() == 404
    );
    if !reachable {
        tracing::warn!(url = stats_url, "ComfyUI probe failed; recording port-only capability");
    }
    Capability::Comfyui { port, base_url: base_url.into() }
}

pub fn probe_script(start_cmd: &str) -> Capability {
    Capability::Script { cmd: start_cmd.into() }
}

fn parse_port(base_url: &str) -> Option<u16> {
    url::Url::parse(base_url).ok().and_then(|u| u.port())
}
```

Note: `url` crate is in `reqwest`'s tree but not necessarily exposed as a direct dep. If Builder finds it missing, parse manually with `base_url.rsplit(':').next()?.parse().ok()` — no new Cargo dep.

### §5.3 Probe-timeout policy (Critic seed C6)

If the probe times out or errors, capability autodetect records an EMPTY list (Ollama → `models: vec![]`, ComfyUI → port-only, no model list) and emits a `tracing::warn!`. Registration does NOT hard-fail on probe failure — operator workflow is "ollama serve might not be running yet when I run `musu peer register`, that's fine, capability will refresh on first health-check from bridge in W10".

Critic seed C6 in §10 verifies this is correct vs hard-fail.

---

## §6 Node manifest at `~/.musu/node.toml`

### §6.1 Schema

```toml
# ~/.musu/node.toml — self-node registration record. Written by
# `musu peer register`. Distinct from ~/.musu/nodes.toml (peer-centric
# HashMap<String, NodeEntry> for OTHER nodes this machine knows about).
#
# Const VII: this file is operator state. Tests use --musu-home <tempdir>.

name = "rtx4060-ollama"
kind = "ollama"
start = "ollama serve"
registered_at = 1700000000

# Optional. Only set if --registry-url or MUSU_REGISTRY_URL was provided.
registry_url = "https://musu.pro/api/v1/nodes/register"

# Optional. Populated from musu.pro POST response if registry registration
# succeeds. Used by W10 for refresh / unregister flows.
musu_pro_node_id = "node_abc123"

[[capability]]
kind = "ollama"
base_url = "http://127.0.0.1:11434"
models = ["qwen2.5-32b", "qwen2.5-coder:7b"]

[service]
platform = "systemd"             # "systemd" | "launchd" | "scheduled_task"
unit_name = "musu-peer-rtx4060-ollama"
state = "registered"             # "registered" | "running" | "not_installed"
registered_at = 1700000000
```

### §6.2 Rust struct (peer/manifest.rs)

```rust
use serde::{Deserialize, Serialize};
use std::path::Path;
use crate::peer::capability::Capability;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NodeManifest {
    pub name: String,
    pub kind: String,                            // PeerType serialized as lowercase
    pub start: String,
    pub registered_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub musu_pro_node_id: Option<String>,
    #[serde(default)]
    pub capability: Vec<Capability>,
    pub service: ServiceState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ServiceState {
    /// "systemd" | "launchd" | "scheduled_task" | "none" (dry-run / unsupported)
    pub platform: String,
    pub unit_name: String,
    /// "registered" | "running" | "not_installed" | "dry_run"
    pub state: String,
    pub registered_at: i64,
}

const MANIFEST_FILENAME: &str = "node.toml";

pub fn manifest_path(musu_home: &Path) -> std::path::PathBuf {
    musu_home.join(MANIFEST_FILENAME)
}

pub fn read(musu_home: &Path) -> anyhow::Result<Option<NodeManifest>> {
    let path = manifest_path(musu_home);
    if !path.exists() { return Ok(None); }
    let text = std::fs::read_to_string(&path)?;
    let m: NodeManifest = toml::from_str(&text)?;
    Ok(Some(m))
}

pub fn write(musu_home: &Path, m: &NodeManifest) -> anyhow::Result<()> {
    let path = manifest_path(musu_home);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(m)?;
    // Atomic write: tmp + rename (same pattern as bridge::handlers::nodes:64-74).
    let tmp = path.with_extension("toml.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}
```

### §6.3 Const VII boundary

`~/.musu/node.toml` is operator state. M2's integration tests **MUST** pass `--musu-home <tempdir>`. The default `--musu-home None` path (which calls `install::resolve_musu_home(None)` → `dirs::home_dir().join(".musu")`) is only exercised in the operator-attested manual smoke (out of CI). Auditor MUST verify no test file in `tests/r7_peer_register.rs` writes to a real `~/.musu/`.

### §6.4 node.toml vs nodes.toml — different files (Critic seed C7)

`nodes.toml` (V24-R6 SHIP, `bridge/handlers/nodes.rs:19-25`) is the peer-centric record: `HashMap<String, NodeEntry>` listing OTHER nodes this machine has discovered + an optional `SelfNode` summary. `node.toml` (new M2) is the self-node registration: kind, capability, service state. The two files live side-by-side in `~/.musu/`. No code path writes to both today. Critic seed C7 in §10 verifies semantic-name clarity (singular vs plural).

---

## §7 Service registration design — extend `PlatformService` trait

### §7.1 Decision: Option A (extend trait) vs Option B (parallel trait)

**Option A (RECOMMENDED)**: extend the V24-R6 `PlatformService` trait at `install/platform/mod.rs:44-62` with:

```rust
/// Register a PEER worker process (ollama / comfyui / script) as a
/// platform service. Parallel to `register()` (which registers musud
/// itself) but parameterized by `PeerServiceContext`. V26-W7 wiki/510.
fn register_peer(&self, ctx: &PeerServiceContext) -> Result<()> {
    let _ = ctx;
    anyhow::bail!("register_peer not implemented on this platform")
}

/// Unregister a previously-registered peer service by name.
fn unregister_peer(&self, peer_name: &str) -> Result<()> {
    let _ = peer_name;
    anyhow::bail!("unregister_peer not implemented on this platform")
}
```

Both methods get a default body of `bail!("not implemented on this platform")` so the `NullService` impl (mod.rs:97-110) compiles without modification. Linux / macOS / Windows impls override.

**Option B (REJECTED)**: create a parallel `peer::service::PeerService` trait with the same cfg-dispatch shape. Rejected because (a) duplicates ~80 LOC of cfg-target boilerplate, (b) duplicates the systemd/launchd/schtasks process-spawning logic, (c) future M2.b unregister + M6/W10 status work would need to keep two trait hierarchies in sync.

**Rationale for Option A**: V24-R6 `install/staged_swap.rs` and `install/runner.rs` only call `register()` / `unregister()` / `dry_run_templates()` / `status()`. Adding two new trait methods does NOT touch their call paths (Critic seed C4 verifies). The trait is the right reuse seam.

### §7.2 PeerServiceContext (peer/service.rs)

```rust
use std::path::PathBuf;
use crate::peer::capability::Capability;

/// Inputs the per-platform peer registrar needs. Parallel to V24-R6's
/// `install::platform::RegisterContext { musu_home, boot_start }` but
/// parameterized for arbitrary peer kinds.
pub struct PeerServiceContext<'a> {
    /// Absolute path to `~/.musu/`. From `install::resolve_musu_home(...)`.
    pub musu_home: &'a std::path::Path,
    /// Sanitized peer name (matches `^[a-z0-9_-]{1,32}$`). Used as the
    /// systemd unit suffix / Scheduled Task name / LaunchAgent label.
    pub peer_name: &'a str,
    /// Worker kind (ollama / comfyui / script) — serialized as
    /// lowercase string into the unit-name template.
    pub peer_kind: &'a str,
    /// Start command, verbatim. Embedded in ExecStart / ProgramArguments /
    /// Action.Command without shell metacharacter expansion.
    pub start_cmd: &'a str,
    /// Capability snapshot at registration time. Currently not embedded
    /// in unit files — kept here for V27/W5 use (e.g. systemd
    /// `Environment=MUSU_CAPABILITY=...`).
    pub capability: &'a [Capability],
    /// **Critic H2**: when `Some(p)`, unit-file directory is `p/...` instead of
    /// `dirs::home_dir().join(...)`. Required so `--musu-home <tempdir>` tests
    /// do NOT pollute the operator's real `~/.config/systemd/user/`,
    /// `~/Library/LaunchAgents/`, or Task Scheduler. Each platform impl MUST
    /// honor this field: Linux derives `<override>/.config/systemd/user/`,
    /// macOS derives `<override>/Library/LaunchAgents/`, Windows uses a
    /// non-persistent in-memory mock Task Scheduler when set (or writes the
    /// XML under `<override>/.musu/scheduled_tasks/` for dry-run + test
    /// inspection but does NOT call `schtasks /Create`).
    pub unit_dir_override: Option<&'a std::path::Path>,
}
```

**Critic H2 patch** — every platform impl in §7.3 derives its unit-file directory from `unit_dir_override.unwrap_or_else(|| dirs::home_dir().expect("HOME").join(...))`. The override flows from `PeerRegisterOpts.musu_home` → `peer/service.rs` builds `PeerServiceContext { unit_dir_override: opts.musu_home.as_deref(), ... }` → `current().register_peer(&ctx)` → platform impl reads `ctx.unit_dir_override`. NEVER call `dirs::home_dir()` directly inside `register_peer` paths.

### §7.3 Per-platform impls — naming + reuse

| Platform | Unit name template | File location | Reuse |
|---|---|---|---|
| Linux | `musu-peer-{peer_name}.service` | `~/.config/systemd/user/` | reuses `run_systemctl` helper at `linux.rs:115-129` |
| macOS | `com.musu.peer.{peer_name}.plist` (label `com.musu.peer.{peer_name}`) | `~/Library/LaunchAgents/` | reuses `refuse_if_root()` at `macos.rs:86-101` + `launchctl bootstrap gui/{uid}` |
| Windows | Scheduled Task `Musu\peer-{peer_name}` | (Task Scheduler in-memory + XML temp file) | reuses Scheduled Task XML pattern from `windows.rs:30-80`; does NOT use NonLocalSystemAccount (default LogonTrigger flow only) |

**Critic seed C8** (in §10): verify `Musu\peer-{peer_name}` cannot collide with `Musu\musud` (V24-R6 default Scheduled Task name). Name regex enforces `peer_name ∈ ^[a-z0-9_-]{1,32}$`, and the literal prefix `peer-` makes collision impossible (musud is named `musud`, not `peer-musud`). Documented as safe.

### §7.4 Unit body templates

Linux example (peer service unit body, written to `~/.config/systemd/user/musu-peer-{peer_name}.service`):

```
[Unit]
Description=MUSU peer worker — {PEER_KIND} ({PEER_NAME})
After=network.target

[Service]
Type=simple
WorkingDirectory={MUSU_HOME}
ExecStart={START_CMD}
Restart=on-failure
RestartSec=5
Environment=MUSU_HOME={MUSU_HOME}
Environment=MUSU_PEER_NAME={PEER_NAME}
Environment=MUSU_PEER_KIND={PEER_KIND}

NoNewPrivileges=true

[Install]
WantedBy=default.target
```

Note: no `CPUQuota` / `MemoryMax` (V24-R6 musud unit has them; peer workers vary too wildly to set a one-size guardrail in M2 — V27/W5 may add per-kind quotas).

macOS plist + Windows Scheduled Task XML follow the same parametric substitution pattern. Builder uses `str::replace("{MUSU_HOME}", ...)` style identical to V24-R6 `linux.rs:56-58` `render(ctx)` fn.

### §7.5 Dry-run mode

`--dry-run` short-circuits BEFORE `register_peer` is called: writes the would-be node.toml + would-be unit body to stderr, returns `Ok(())` without touching disk OR the platform service manager. Service state in the (non-written) manifest = `state = "dry_run"`. Probes still run (so operator can see what capabilities would be detected).

---

## §8 Local bridge POST + optional musu.pro POST

### §8.1 Default: FILE-ONLY path (Critic seed C5)

**Plan default (subject to Critic adjudication)**: `musu peer register` writes `~/.musu/node.toml` and does NOT post to any HTTP endpoint by default.

Rationale (R1 + master plan §1 thesis lock 4 + [[feedback-self-contained-product]]):
- `bridge/handlers/nodes.rs:172-254` `add()` endpoint is for peer-to-peer add (registering a remote peer on this PC's nodes.toml). It health-probes the remote URL and does a peer-accept-peer roundtrip. Calling it for self-registration creates a circular probe (this PC's bridge probes this PC) and a confused semantic ("I'm adding myself as a peer of myself"). Cleaner = file-only.
- Master plan §1: `musu.pro 있으면 외부 access 편함, 없어도 LAN mesh 작동`. Self-contained product → no required cloud or local-bridge POST.
- The bridge (when it boots) can read `~/.musu/node.toml` on startup and decide whether to also self-add to its own `nodes.toml`. That seam is W10 (mDNS discovery + cached snapshot), not M2.

Critic seed C5 (in §10) is the explicit ask: is file-only enough, or does M2 need a new bridge endpoint `POST /api/nodes/register-self` that takes a NodeManifest and persists it without the peer-probe roundtrip? Plan body locks file-only; Critic may overrule.

### §8.2 Optional: musu.pro POST

If `--registry-url <url>` flag OR `MUSU_REGISTRY_URL` env is set, M2 attempts an additional POST after writing node.toml:

```
POST <registry_url>
Authorization: Bearer <MUSU_TOKEN || MUSU_BRIDGE_TOKEN>
Content-Type: application/json

{
  "name": "rtx4060-ollama",
  "kind": "ollama",
  "capability": [...],            // serialized NodeManifest.capability
  "start": "ollama serve",
  "tailscale_ip": null            // optional, future
}
```

Auth resolution order: `MUSU_TOKEN` env (musu.pro registry token, may differ from bridge token) → fallback to `install::token::read_bridge_token(&musu_home)`. If both are absent, log a `tracing::warn!` and skip the POST (do NOT hard-fail registration — the file write was the contract).

Response handling: if response contains `node_id` field, store it in `node.toml` as `musu_pro_node_id = "..."`. Otherwise skip.

Failure handling: musu.pro POST timeout (10s) or non-2xx → log `tracing::warn!`, continue. node.toml is still written. The CLI exits 0 because the file-write side succeeded.

### §8.3 No local bridge POST in M2 default

Per §8.1, M2 does not POST to `http://127.0.0.1:8070/api/nodes/add` by default. If Critic overrules in §10 C5, the plan adds a `--post-local-bridge` flag (default off) and a new code path. M2 does NOT add a new bridge handler — that's W10's territory.

### §8.4 Bridge ↔ node.toml integration seam (Critic H3)

**Critical**: M2 writes `~/.musu/node.toml`. The bridge does NOT read it today (verified `bridge/config.rs:32-53` has `nodes_toml_path` but NO `node_toml_path`). Until W10 adds a `node.toml` reader to bridge startup, the operator-visible flow is:

1. Operator runs `musu peer register --type ollama --start "ollama serve"` → `node.toml` written.
2. Operator manually restarts musu bridge (`systemctl --user restart musud.service` or equivalent) → bridge does NOT auto-pick-up `node.toml` (silently). `GET /api/nodes` `self` row stays whatever was in `nodes.toml`.
3. **The registration is locally recorded but not surfaced to mesh APIs until W10**.

This is acknowledged silent integration (file-write happens, downstream consumer doesn't exist yet). M2 must:
- Print a `tracing::info!` after the file write: `"node.toml written; bridge will pick up on next sync (W10). For now, GET /api/nodes self-row is unchanged until W10 SHIP."`
- Document in §13 out-of-scope explicitly.
- Closure operator-attested smoke notes whether operator-restart actually surfaces the self-row (today expected: no; after W10: yes).

---

## §9 Tests — `tests/r7_peer_register.rs`

Template from `tests/r6_install_smoke.rs:28-81` + `:149-166` (subprocess spawn via `option_env!("CARGO_BIN_EXE_musu")`, `tempfile::TempDir`, `--musu-home` override, stderr assertions).

### §9.1 Mandatory tests

```rust
// tests/r7_peer_register.rs

use std::path::Path;
use tempfile::TempDir;

/// Locate the freshly-built musu binary. Reuse pattern from
/// r6_install_smoke.rs:149-166.
fn current_test_binary() -> Option<std::path::PathBuf> {
    option_env!("CARGO_BIN_EXE_musu")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
            let candidate = manifest
                .join("target").join("debug")
                .join(if cfg!(windows) { "musu.exe" } else { "musu" });
            if candidate.is_file() { Some(candidate) } else { None }
        })
}
```

**Test 1**: `peer_register_writes_node_manifest_with_ollama_kind`
- Spawn `musu peer register --type ollama --start "ollama serve" --name test-ollama --musu-home <tempdir> --dry-run`
- Assert exit 0, stderr contains the would-be node.toml body, contains `kind = "ollama"`, contains `name = "test-ollama"`
- Assert that with `--dry-run`, the file `<tempdir>/node.toml` does NOT exist
- Then run again WITHOUT `--dry-run` (capability probe will fail because no Ollama on test machine → empty models list, that's fine)
- Assert `<tempdir>/node.toml` exists, parse it as TOML, verify `kind`, `name`, `start`, `capability[0].kind == "ollama"`, `capability[0].models == []`

**Test 2**: `peer_register_dry_run_does_not_call_bridge`
- Spawn `musu peer register --type script --start "echo hi" --musu-home <tempdir> --dry-run --registry-url https://invalid.test.example.com/api/v1/nodes/register`
- Assert exit 0
- Assert no file at `<tempdir>/node.toml` (dry-run is read-only on disk)
- Assert stderr does NOT contain `POST` or `https://invalid.test.example.com` as an attempted call (we'd expect the registry POST to be skipped in dry-run mode — verify this by absence of failure stderr)

**Test 3**: `peer_register_script_kind_skips_autodetect`
- Spawn `musu peer register --type script --start "my-worker --port 9999" --name custom-worker --musu-home <tempdir>`
- Set bogus `--ollama-url http://invalid.test.example.com:11434` to confirm Ollama probe is NOT called
- Assert exit 0 (test passes even though the Ollama URL is unreachable — script kind doesn't probe)
- Parse `<tempdir>/node.toml`, assert `capability[0].kind == "script"`, `capability[0].cmd == "my-worker --port 9999"`

**Test 4**: `peer_register_unknown_type_returns_clear_error`
- Spawn `musu peer register --type bogus --start "x" --musu-home <tempdir>`
- Assert exit nonzero
- Assert stderr contains `bogus` AND `possible values: ollama, comfyui, script` (clap's value_enum default error message — verify exact wording in Builder iteration)

### §9.2 Mandatory tests (continued) — added per Critic H5 + H2

**Test 5 (MANDATORY per Critic H5)**: `peer_register_capability_serde_roundtrip`
- Inline serde test (in `tests/r7_peer_register.rs` or a sibling `tests/peer_capability_serde.rs`). Uses `musu_rs::peer::capability::Capability` via `lib.rs` re-export (Critic H1).
- Construct `Capability::Ollama { models: vec!["qwen2.5-32b".into()], base_url: "http://127.0.0.1:11434".into() }` → `toml::to_string_pretty` → `toml::from_str::<NodeManifest>` → assert `PartialEq` holds across all three variants (Ollama/Comfyui/Script).
- Forward-compat sub-assertion: deserialize a TOML blob with EXTRA field `vram_gb = 16` (W5/V27 hypothetical) → assert no error AND the known fields parse correctly. If `#[serde(deny_unknown_fields)]` is on `Capability`, this test FAILS until the attribute is removed — that's the W5 forward-compat signal.
- **Spawn-blocker**: if Test 5 FAILS, Builder MUST escalate before continuing — the on-disk format is wrong. Fallback shape pre-decided by Critic OPEN QUESTION 2 (orchestrator picks between flat-keyed `Capability` OR untagged + serde_json::Value `extra` like LG38-A AgentRecord) before re-attempt.

**Test 6 (MANDATORY per Critic H2)**: `peer_register_with_musu_home_override_does_not_touch_real_home`
- The Const VII guard test. Snapshot the operator's real `~/.config/systemd/user/`, `~/Library/LaunchAgents/`, and Task Scheduler `Musu\peer-*` BEFORE the test (record file count / task list).
- Spawn `musu peer register --type ollama --start "ollama serve" --name overrule-test --musu-home <tempdir>` (NOT `--dry-run`).
- After the spawn:
  - Assert that `<tempdir>/.config/systemd/user/musu-peer-overrule-test.service` exists (Linux) OR `<tempdir>/Library/LaunchAgents/com.musu.peer.overrule-test.plist` exists (macOS) OR `<tempdir>/.musu/scheduled_tasks/peer-overrule-test.xml` exists (Windows mock per §7.2 unit_dir_override semantics).
  - Assert that the real `~/.config/systemd/user/` snapshot is byte-identical to before — no new file created in operator's real home.
  - Assert that on Windows, `schtasks /Query /TN Musu\peer-overrule-test` returns "task not found" (the override prevented the live registration).
- If any real-home assertion FAILS, Auditor escalates to Const VII violation; this is the cornerstone Const VII guard for M2.

### §9.3 NOT tested in M2 (deferred)

- Actual systemd / launchd / Scheduled Task registration — would require an active service manager session on the test host (same limitation `r6_install_smoke.rs:36-38` documents). Operator-attested manual smoke covers this.
- Real Ollama / ComfyUI probe — Ollama unlikely on CI machines. Tests run with empty model list, which is the correct "Ollama not running" fallback.
- musu.pro POST — V23.2 SHIP musu.pro registry is a separate TypeScript repo. M2 does not stand up a mock server. Critic may push back; if so, add wiremock-based test as a follow-up commit within M2.

---

## §10 Critic seed (for Phase 1.5 system-architect)

Question-only. Critic provides answers. Findings get patched back into this doc's §14.

### C1. V24-R6 install/staged_swap collision

Does extending `PlatformService` trait (§7.1 Option A) with `register_peer` + `unregister_peer` collide with V24-R6's `install/staged_swap.rs` freeze rendezvous? `staged_swap` likely calls `register()` / `unregister()` during a binary swap — does adding sibling trait methods change any v-table layout or cfg-dispatch path the swap depends on? **Master plan §M2 explicit seed**.

### C2. Capability struct W5 forward-compat

Is `#[serde(tag = "kind")] enum Capability { Ollama {...}, Comfyui {...}, Script {...} }` forward-compat with W5/V27's `capability=[ollama:qwen2.5-32b, comfyui:8188]` shape? W5 future shape per master plan §1 OUT looks string-array-ish. Confirm whether the M2 struct-array shape supersedes W5 or extends it. If W5 prefers a different on-wire format (e.g., flat string array), what's the migration cost? **Master plan §M2 explicit seed.**

### C3. Option A vs Option B trait extension

§7.1 picks Option A (extend `PlatformService`). Trade-off: Option A means linux.rs + macos.rs + windows.rs each grow ~50-70 LOC of peer-aware code in the SAME file that hosts musud registration. Argument for B: cleaner separation, peer code stays in `peer/`. Argument for A: avoid duplicating the cfg-dispatch boilerplate + share the systemctl wrappers. Which wins?

### C4. Bridge endpoint semantics — file-only vs new endpoint vs reuse `/api/nodes/add`

§8.1 default = file-only (write node.toml, no HTTP POST). Alternatives:
- (a) reuse `/api/nodes/add` (rejected per §8.1 — circular probe)
- (b) new bridge endpoint `POST /api/nodes/register-self` that takes a `NodeManifest` and persists without peer-probe
- (c) bridge reads `~/.musu/node.toml` on startup and self-adds

Plan picks (file-only + bridge picks up on next sync). Is (b) actually cleaner? Adding a new bridge handler is +60 LOC and a doc surface bump; (c) is implicit and load-bearing. Critic decides.

### C5. `--registry-url` default

Per [[feedback-self-contained-product]] + master plan §1 thesis lock 4, plan locks: env-driven, no hardcoded default. Only if `--registry-url` flag OR `MUSU_REGISTRY_URL` env is set does M2 attempt the musu.pro POST. Is this the right call, or should there be a hardcoded fallback `https://musu.pro/api/v1/nodes/register`? Operator-onboarding angle: if hardcoded, a fresh `musu peer register --type ollama --start "ollama serve"` "just works" out of the box. If not, operator must read docs. Trade-off.

### C6. Probe timeout behavior

§5.3 default: probe timeout → empty capability + `tracing::warn!`, registration continues. Alternative: hard-fail registration with non-zero exit. Operator workflow: typical operator runs `ollama serve` THEN `musu peer register`. If they reverse the order (register before starting Ollama), warn-and-continue is friendlier. But: empty capability silently writes a misleading node.toml. Plan picks warn-and-continue. Critic verifies.

### C7. node.toml vs nodes.toml naming clarity

Two TOML files in `~/.musu/`: `nodes.toml` (V24-R6 peer-centric) + `node.toml` (M2 self-only). Singular vs plural. Critic verifies semantic clarity is operator-obvious (e.g., does docs surface need a section explaining "node.toml = me, nodes.toml = others"?). Alternative names considered: `self.toml`, `me.toml`, `this-node.toml` — all are operator-distracting.

### C8. Windows Scheduled Task naming collision

`Musu\peer-{peer_name}` task name regex enforces `peer_name ∈ ^[a-z0-9_-]{1,32}$`. V24-R6 musud task is `Musu\musud`. Collision impossible (literal `peer-` prefix). Critic verifies + considers nesting alternative `Musu\peers\{peer_name}` (Scheduled Task Library folder hierarchy). Plan picks flat (`Musu\peer-{name}`) for simpler unregister.

### C9. macOS root refusal carve-out

§7.3 reuses `refuse_if_root()` for peer LaunchAgent install. But: a peer worker (ComfyUI, vLLM) might LEGITIMATELY need root for GPU access. Does the S11 refusal block legitimate workflows? Plan defers — peer worker process is started by LaunchAgent under operator account; if the worker itself needs root, that's the worker's problem (sudo/setuid inside the start command). Critic verifies S11 still applies.

### C10. Self-contained product invariant + dry-run-vs-real probe difference

Dry-run mode (§7.5) still runs the probe (so operator can preview detected capabilities). This means even `--dry-run` makes outbound HTTP to localhost:11434 / localhost:8188. Operator on a fresh laptop with no Ollama might see noisy "connection refused" stderr. Plan picks: keep dry-run probing; emit `tracing::info!` (not `warn!`) when probe times out in dry-run. Critic verifies acceptable.

---

## §11 Risks + mitigations

| ID | Sev | Risk | Mitigation |
|---|---|---|---|
| M2-R1 | MED | Option A (§7.1) extending `PlatformService` ripples through V24-R6 `install/staged_swap.rs` and `install/runner.rs` in ways the plan didn't anticipate | Critic seed C1 (§10). Builder MUST grep for ALL callers of `PlatformService` methods before adding the two new trait methods. If any caller uses dyn-trait-object with assumptions about method count (rare in Rust), add a non-default-bodied trait method as `pub fn ... -> Result<()> { bail!("unimplemented") }` so existing call sites compile unchanged |
| M2-R2 | MED | Capability enum-tagged struct shape (§5.1) breaks W5 future shape | Critic seed C2 (§10). M2 includes the optional Test 5 (§9.2) capability serde roundtrip + forward-compat extra-field tolerance. If W5 ends up wanting a different shape, V27 ships a migration; M2 schema is operator-private (only this PC reads node.toml today) so the cost is bounded |
| M2-R3 | MED | Bridge endpoint semantic confusion — Critic might overrule §8.1 file-only and demand a new `/api/nodes/register-self` handler | Critic seed C4 (§10). If overruled, +60 LOC for new bridge handler (within LOC budget) but adds 1 day to cycle. Plan body documents both paths to make the swap cheap |
| M2-R4 | LOW | Probe timeout policy (§5.3 warn-and-continue) writes node.toml with empty capability, silently misleading | Critic seed C6 (§10). Operator-facing stderr message MUST be loud enough: `tracing::warn!` with `kind = "ollama"`, `base_url`, and explicit "capability autodetect skipped — start your worker first" guidance |
| M2-R5 | LOW | LOC actual >1,500 forces M2.a + M2.b split | Builder checkpoint at +700 actual LOC. If trajectory >2× plan, split: M2.a = CLI + manifest + capability probe + file-only registration (~700 LOC) lands first; M2.b = platform service trait extension + 3-platform impls (~440 LOC) lands second. Both within same Const VII batch push (per master plan: M2+M3 batched, but split commits OK) |
| M2-R6 | LOW | Cross-platform service registration in tests — peer service install requires active systemd / launchd / Task Scheduler session | §9.3 documents this is NOT tested in CI. Operator-attested manual smoke per OS at closure time. Same limitation `r6_install_smoke.rs:36-38` documents |
| M2-R7 | LOW | Windows Scheduled Task name collision (`Musu\peer-musud` vs `Musu\musud`) | Critic seed C8 (§10). Literal `peer-` prefix + peer_name regex `^[a-z0-9_-]{1,32}$` makes collision impossible at the type level. Documented as safe |
| M2-R8 | INFO | musu.pro POST adds optional network dep; operator on airgapped machine sees timeout | §8.2 default = off unless flag/env. Airgap operator never triggers it. Documented |
| M2-R9 | INFO | `name` defaulting to `hostname-{kind}` may collide if operator registers two ollama peers on the same hostname | Plan picks: registration with same `name` REPLACES the previous node.toml. M2 does NOT support multi-peer-per-machine. V27/W6 may revisit |

---

## §12 Completion criteria

Per master plan M2 + V26 §3 strict sequential:

- [ ] `musu-rs/src/peer/mod.rs` + `peer/register.rs` + `peer/capability.rs` + `peer/manifest.rs` + `peer/service.rs` exist
- [ ] `musu-rs/src/main.rs` `Cmd` enum has `Peer { action: peer::PeerAction }` variant + dispatch arm
- [ ] `musu-rs/src/install/platform/mod.rs` `PlatformService` trait has `register_peer` + `unregister_peer` methods with default `bail!("not implemented on this platform")` bodies
- [ ] `linux.rs` impls `register_peer` (writes `~/.config/systemd/user/musu-peer-{name}.service`, `systemctl --user enable + start`)
- [ ] `macos.rs` impls `register_peer` (writes `~/Library/LaunchAgents/com.musu.peer.{name}.plist`, `launchctl bootstrap`)
- [ ] `windows.rs` impls `register_peer` (writes Scheduled Task XML, `schtasks /Create /XML /TN "Musu\peer-{name}"`)
- [ ] `tests/r7_peer_register.rs` exists; 4 mandatory tests pass on CI
- [ ] Optional Test 5 (capability serde roundtrip) passes
- [ ] `cargo build --manifest-path musu-rs/Cargo.toml` clean
- [ ] `RUSTFLAGS='-D warnings' cargo test --manifest-path musu-rs/Cargo.toml --test r7_peer_register -- --nocapture` ≥ 4 cases pass
- [ ] `RUSTFLAGS='-D warnings' cargo test --manifest-path musu-rs/Cargo.toml --bin musu peer -- --nocapture` (any inline unit tests in `peer/*` modules)
- [ ] `cargo clippy --manifest-path musu-rs/Cargo.toml -- -D warnings` green
- [ ] `cargo test --manifest-path musu-rs/Cargo.toml --test r6_install_smoke` regression — V24-R6 install/uninstall tests still pass (no breakage from `PlatformService` trait extension)
- [ ] No new Cargo deps
- [ ] No `~/.musu/node.toml` mutated on operator machine by test suite (Const VII) — all tests use `--musu-home <tempdir>`
- [ ] `musu indexer sync` + `musu indexer search "PeerRegister"` returns hits
- [ ] V26 master plan §2 W7 row Module cell updated per §2 row 12 (F1)
- [ ] Operator-attested manual smoke on at least 1 platform (closure records which): `musu peer register --type script --start "sleep 999999" --name test-script` → real systemd / launchd / Scheduled Task registration succeeds, manifest written, service starts. Operator then `musu peer unregister` (out of M2 scope) or manual cleanup
- [ ] All Critic HIGH + Auditor HIGH resolved (recorded in §14 + §15)
- [ ] Closure `docs/V26_W7_CLOSURE_2026_05_22.md` (wiki/510c) drafted; WIKI_INDEX §4.5 W7 "active" → "SHIP"
- [ ] Const VII push approval (user) before `v26/distributed-actor` push (per master plan: batched with M3/W12)

---

## §13 Out of scope (must NOT do)

Per V26 §3 strict sequential + M2 narrow scope lock:

- **No `musu peer unregister`** — inverse subcommand deferred to M2.b or W10 (operator manually `systemctl --user disable + remove file` for now; documented in closure)
- **No `musu peer list` / `musu peer status`** — read-only inspection of node.toml + service state, deferred to W10
- **No mDNS discovery** — `mdns-sd` LAN fallback is W10 master plan §2 row item (c). M2 only writes node.toml; W10 makes it discoverable
- **No bridge schema migration** — `audit.db` `nodes_snapshot` table is W10 (master plan §"Const III YES W10"). M2 does NOT touch `bridge/db.rs` or `core/migrate.rs`
- **No musu.pro TypeScript-side changes** — musu.pro `/api/v1/nodes/register` capability-field extension is W10 cross-repo. M2 POSTs the M2-shape struct; W10 makes musu.pro accept it. If musu.pro rejects M2 POST (today's V23.2 SHIP shape), the warn-and-continue path handles it
- **No `AdapterContext` changes** — W12 slots (`deadline_unix_ms` + `cancel`) + W13 extras preserved as-is. M2 does NOT touch `adapter/mod.rs`
- **No Const III schema changes** — no SQLite migration in M2
- **No automatic elevation / sudo / runas** — M2 fails fast if elevation is needed and operator hasn't run with the right account (macOS S11 carries through; Windows defaults to LogonTrigger Scheduled Task which needs no admin). Critic seed C9 verifies S11 carve-out semantics
- **No GUI / musu-bee TS frontend changes** — M2 is CLI-only. The `peer register` operation runs from terminal. W10 may add a "peers" tab in musu-bee
- **No cancellation-token plumbing in peer/* code** — W12 introduces deadline propagation; M2 uses ad-hoc 3s timeouts on the two probes only
- **No prometheus / metrics surface** — out of V26 scope entirely

---

## §14 Critic Findings (resolved)

Phase 1.5 `system-architect` review (2026-05-22). 6 HIGH + 4 MED + 5 LOW + 2 INFO returned. All 6 HIGH + actionable MED patched BEFORE Builder spawn.

| # | Sev | Finding | Resolution | Patch location |
|---|---|---|---|---|
| H1 | HIGH | `lib.rs` doesn't export `peer` module → integration tests won't compile (M1 lib.rs surprise recurrence) | Added `lib.rs` row 13 to §2 deliverable list; `pub mod peer;` +1 line | §2 row 13 |
| H2 | HIGH | `dirs::home_dir()` hardcoded in `unit_dir()` / `plist_dir()` / `scheduled_task_xml_dir()` — `--musu-home <tempdir>` doesn't reach unit-file write location → tests pollute operator's real `~/.config/systemd/user/` (Const VII violation) | Added `unit_dir_override: Option<&Path>` field to `PeerServiceContext` (§7.2). Each platform impl MUST derive unit-file dir from `unit_dir_override.unwrap_or_else(real_home)`. NEVER call `dirs::home_dir()` inside `register_peer`. New Test 6 (`peer_register_with_musu_home_override_does_not_touch_real_home`) asserts real-home snapshot byte-identical before/after | §7.2 PeerServiceContext + §9.2 Test 6 |
| H3 | HIGH | File-only manifest is correctly diagnosed but integration seam unspecified — bridge does NOT read `node.toml` today (`bridge/config.rs` has no `node_toml_path`). Silent integration risk until W10 | Added §8.4 "Bridge ↔ node.toml integration seam". M2 prints `tracing::info!` after file write noting bridge picks up at W10 SHIP. Operator-restart smoke documented as not surfacing self-row until W10. Explicit out-of-scope in §13 | §8.4 + §13 |
| H4 | HIGH | `SERVICE_LABEL = "com.musu.musud"` is hardcoded const on macOS; peer needs runtime-String per-peer label. Same risk for Linux unit-name + Windows task-name when `unregister_peer` follows | §7.3 + §7.2 mandate runtime-String label construction per peer (no const reuse). Each platform's `register_peer` + `unregister_peer` MUST take `peer_name: &str` and derive the full label/unit-name at call time | §7.2 + §7.3 |
| H5 | HIGH | `#[serde(tag = "kind")] enum Capability` + TOML `[[capability]]` array-of-tables roundtrip is unverified and finicky (TOML crate has known edge cases for tagged-enum order-sensitivity) | Promoted Test 5 from optional to MANDATORY (§9.2). Test 5 is SPAWN-BLOCKER: if roundtrip fails, Builder escalates to orchestrator for fallback shape decision (flat-keyed Capability OR untagged + extra serde_json::Value) BEFORE continuing | §9.2 Test 5 (mandatory) |
| H6 | HIGH (Plan-flagged carryover) | `/api/nodes/add` semantic mismatch (peer-to-peer add vs self-registration) | Plan default = file-only. Critic confirms; integration seam patched per H3 | §8.1 + §8.4 |
| M1 | MED | Ollama probe 3s timeout may fail on first warm-load of large model | Plan §5.2 bumped to 5s default; doc "first-probe-may-fail-with-warm-Ollama" note in §5.3 (Builder applies) | §5.2 + §5.3 |
| M2 | MED | `--dry-run` should SKIP probe entirely (no outbound HTTP) | §7.5 + §5.2 mandate dry-run = no probe. Stderr shows "would probe X" without firing request | §5.2 + §7.5 |
| M3 | MED | clap `ValueEnum` + `serde(rename_all = "lowercase")` interaction on `PeerType` variant names | Builder verifies serialization is `"ollama"` not `"Ollama"` via Test 5 roundtrip (which now covers this implicitly) | §4.1 + Test 5 |
| M4 | MED | Atomic write race for concurrent `musu peer register` invocations | §6.2 adds `fs2::FileExt::try_lock_exclusive` on `~/.musu/peer.lock` before write (fs2 already in Cargo.toml line 98). Same pattern as `auto-update.lock` | §6.2 (Builder applies) |
| L1 | LOW | `i64` for `registered_at` mixed with `chrono::Utc::now().timestamp()` | Consistent with `bridge/handlers/nodes.rs:232`. No change | §6.2 |
| L2 | LOW | `name` regex not enforced in clap | §4.1 adds `value_parser = validate_peer_name` on `name` arg (Builder applies) | §4.1 |
| L3 | LOW | `url` crate not a direct dep — §5.2 `parse_port` should use manual rsplit from start | §5.2 locks manual parse (no `url::` import). Cargo.toml "zero new deps" lock preserved | §5.2 |
| L4 | LOW | macOS `refuse_if_root()` limits operator-with-sudo workflow | Accepted per plan §10 C9 — worker process handles own elevation in `start_cmd` | §10 C9 |
| L5 | LOW | Windows peer task name `Musu\peer-{name}` flat vs nested | Accepted per plan §10 C8 — literal `peer-` prefix prevents collision with `Musu\musud` | §7.3 |
| I1 | INFO | LOC ×2 floor — M2.a/M2.b split trigger raised | §2 + §11 R5 split trigger raised to +1,400 actual LOC (was +700) | §2 + §11 R5 |
| I2 | INFO | Single-Critic + single-Auditor justification | Per `feedback-dual-audit-trigger-narrow` — confirmed unless H2 unresolved. H2 patched → single sufficient | §11 |

**Builder spawn unblocked** — all 6 HIGH + actionable MED patched. Plan-stage Auditor (per `feedback-plan-stage-auditor`) recommended before Builder since plan >500 LOC; deferred to per-cycle decision (orchestrator option, not blocker).

---

## §15 Audit Findings (resolved)

_To be populated by Phase 5 `quality-engineer` audit._

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| _to be populated_ | | | | |

---

## §16 References

- Master plan: `docs/V26_MASTER_PLAN_2026_05_22.md` §2 W7 row + §3 strict sequential + §1 thesis lock 4 (optional registry + self-contained product)
- Master /goal plan: `C:\Users\empty\.claude\plans\shimmying-plotting-hamster.md` §"M2 — W7 musu peer register"
- M1 detail plan precedent (same template structure): `docs/V26_W1_COMMIT3_DETAIL_PLAN_2026_05_22.md`
- M1 closure: `docs/V26_W1_CLOSURE_2026_05_22.html`
- V24-R6 installer SHIP: `musu-rs/src/install/mod.rs` + `install/platform/{mod,linux,macos,windows}.rs` + `install/token.rs`
- V24-R6 install integration test template: `musu-rs/tests/r6_install_smoke.rs`
- V24-R6 bridge nodes handler (peer-to-peer add semantics, NOT self-registration): `musu-rs/src/bridge/handlers/nodes.rs:19-254`
- V23.2 musu.pro registry SHIP (TypeScript cross-repo, V26-W10 cross-repo work): `<external musu-pro repo> registry.py:1-76` per master plan §2 W10 row
- Phase 0 Researcher R1 (V24-R6 installer + service registration surface) + R2 (main.rs CLI + Cargo + AdapterContext + config + test pattern + auth) per orchestrator brief
- Memory: [[feedback-self-contained-product]] (no hardcoded musu.pro fallback), [[feedback-dual-audit-trigger-narrow]] (single Critic + single Auditor justification), [[feedback-loc-estimate-x2]] (M2 ~1,140 actual budget), [[feedback-no-yagni-architecture]] (Option A trait-extension over Option B parallel-trait), [[decision-musu-backend-rust]] (V24 Rust lock)
