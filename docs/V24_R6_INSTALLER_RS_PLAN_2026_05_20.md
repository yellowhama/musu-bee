# V24-R6 INSTALLER-RS — Phase 1 Plan

| Field | Value |
|---|---|
| Wiki ID | wiki/496 |
| Created | 2026-05-20 |
| Phase | 1 (plan) |
| Status | DRAFT — awaiting dual-Critic (devops-architect + security-engineer) |
| Risk | MED-HIGH (one-way blast radius via platform service registration; master plan §5-R6 mandates dual-audit) |
| LOC est | ~1,800-2,200 implementation + ~270 tests = ~2,070-2,470 total (recalibrated up per Researcher F14) |
| Predecessor | wiki/495 (R5 WRITER-RS — closed wiki/495c) |
| Successor | R7 per master plan §5 |

---

## §1 Scope

R6 (INSTALLER-RS) is the second of the two R-cleanup ranges in V24. It restores the operator-ergonomic install + auto-update + cross-platform supervisor surface that was intentionally deleted at the start of R8 (per wiki/498c §3 "the install-clean delta", 11 systemd unit templates were dropped + the Python install/update scripts were stripped). R6 brings back **only the load-bearing subset**, implemented as native Rust subcommands of the single `musu-rs` binary, with platform-service registration and a hybrid (pre-built binary first, source fallback) auto-update flow.

### In scope

- **`musu-rs install`** — fresh-install on a clean machine. Generates a 32-byte bridge token, seeds `~/.musu/` layout, writes `bridge.env` with 0600 / icacls perms, copies the binary into `~/.musu/bin/`, writes `update.toml`, and registers the platform service (systemd user unit on Linux, Scheduled Task on Windows by default with optional `--boot-start` Windows Service, launchd LaunchAgent on macOS).
- **`musu-rs uninstall`** — inverse of install. Stops the running bridge via supervisor IPC, deregisters the platform service, and (default) preserves `~/.musu/`. The `--purge` flag deletes `~/.musu/` after an interactive operator confirmation prompt (operator gate per Q6).
- **`musu-rs auto-update`** — invoked by the `musu-autoupdate.timer` (or its Windows / macOS equivalent). Hybrid channel logic per Q2: probes GitHub release artifact for the current platform first, falls back to `git pull && cargo build --release` only when no platform release matches **or** when invoked with `--build-from-source`. Const III gate-preserving (per F16/Q7). Atomic swap with `.bak` rollback slot, post-swap `/health` verification within 30s, automatic rollback on failure.
- **`musu-rs schema-precheck`** + **`musu-rs apply-schema`** subcommands — Const III gate preservation surface (per F16/Q7). Auto-update never auto-applies schema deltas; it stages the binary, writes `~/.musu/PENDING_SCHEMA_GATE.txt`, and waits for the operator to explicitly invoke `musu-rs apply-schema`.
- **`musu-rs supervise`** — thin subcommand that either invokes `musu-supervisor-core::Supervisor::start` in-process (small embedded form) **or** execs the separately-built `musud` binary at `~/.musu/bin/musud` (per Q3 — musud-separate-binary lock). R6 ships the separate `musud` binary as a new workspace member at `apps/musud/`.
- **`musu-supervisor-core` cross-platform fixes**:
  - F3 fix: replace `env::var("HOME").unwrap_or("/root")` at `config.rs:207,255` with `dirs::home_dir()`.
  - F4 fix: add a Windows Named Pipe IPC transport (`\\.\pipe\musu`) alongside the existing Unix socket IPC. All `supervisor.rs` IPC functions that are currently `#[cfg(unix)]`-gated gain a `#[cfg(windows)]` sibling implementation behind a unified trait.
- **Three platform-service templates**:
  - `scripts/systemd/musud.service` (already exists; installer reuses with placeholder substitution)
  - `scripts/launchd/com.musu.musud.plist.tmpl` (new — derived from existing `com.musu.bridge.plist.example`)
  - `scripts/windows/musud_task.xml.tmpl` (new — Scheduled Task XML; the `--boot-start` opt-in path uses `windows-service` crate + `sc.exe create` instead, NOT this template)
- **Bridge HTTP endpoint** `POST /api/system/update` — small handler in `musu-rs/src/bridge/handlers/` that shells out to `musu-rs auto-update` (background spawn). Replaces the Python-era `system_routes.py:467-475` `sh -c "systemctl --user restart"` hack (F2).

### Out of scope (explicitly NOT in R6)

- **musu-bee build** — Q9 lock; out of R6. R6 only installs the `musu-bee.service` unit (kept as-is from existing template); musu-bee itself remains built by the existing `scripts/install-musu-bee.sh` shell helper.
- **External services**: `musu-tunnel`, `musu-forgejo`, `musu-connectsd` units are NOT installed by R6 (they exist as scripts but are outside the V24 master plan).
- **`musu-backup.timer`, `musu-cleanup.timer`** — deferred to V25 (per F13).
- **Forgejo `~/.git-credentials` bake-in** — explicitly excluded (F1). R6's default channel is GitHub release URLs over HTTPS with no embedded auth.
- **Supabase / Caddy install steps** — dropped permanently (F18; violates self-contained-product feedback `[[feedback-self-contained-product]]`).
- **Boot-start by default on Windows** — F19 lock; default install path requires no admin elevation. Boot-start needs `--boot-start` opt-in which prompts UAC.
- **Auto-application of Const III schema deltas during auto-update** — F16/Q7 lock; operator-gated only.

### §1.1 Locked decisions

The following nine Open Questions were resolved by the Researcher envelope and the operator. They are **locked** for Phase 1 and not to be re-litigated in dual-Critic.

| ID | Question | Locked answer | Source |
|---|---|---|---|
| Q1 | How is the installer surfaced? | **Single Rust binary subcommand** on `musu-rs`. Subcommands: `install`, `uninstall`, `auto-update`, `supervise`, `schema-precheck`, `apply-schema`. Shell wrappers (if any) are one-screen thin helpers that exec the binary. | Researcher §summary, F11 |
| Q2 | Auto-update strategy under cargo build 3m 28s wall-clock stall? | **Hybrid: pre-built binary first, source fallback.** Default `update.toml` channel is `github-release`. Source fallback (`git pull && cargo build --release`) engages only when no platform release artifact matches OR when invoked with `--build-from-source`. Requires GitHub Actions CI publishing per-platform tarballs to releases. | Researcher F7 (USER DECISION 2026-05-20) |
| Q3 | musud subsume into musu-rs or separate binary? | **Separate binary** at new workspace member `apps/musud/`. Smaller diff to `musu-rs`. R6 wires `~/.musu/bin/musu-rs bridge` as the musud-supervised service. | Researcher F11 |
| Q4 | Which platform-service units in scope? | **Three units only**: `musud` (load-bearing — supervises the bridge), `musu-bee` (TS UI, reuse existing template), `musu-autoupdate.timer` + `.service`. Dropped: `musu-bridge.service` (subsumed by musud), `musu-worker.service` (rolled into bridge per R5), `musu-tunnel`/`musu-forgejo`/`musu-connectsd` (external). Deferred to V25: `musu-backup.timer`, `musu-cleanup.timer`. | Researcher F13 |
| Q5 | Bridge token generation + storage? | `rand::random::<[u8; 32]>()` → lowercase hex → `~/.musu/bridge.env` (`MUSU_BRIDGE_TOKEN=<hex>`) with `chmod 600` (Unix) / `icacls /grant:r ${USER}:F /inheritance:r` (Windows). Never logged. | Researcher §summary |
| Q6 | Uninstall shipped? | **Yes** — `musu-rs uninstall`. Default preserves `~/.musu/`. `--purge` deletes `~/.musu/` after interactive y/N prompt (operator gate). | Researcher §summary |
| Q7 | How is Const III preserved across auto-update? | **`musu-rs schema-precheck`** runs as part of auto-update pre-flight. Non-zero exit = schema delta detected. Auto-update then stages the new binary into `~/.musu/bin/musu-rs.new`, does NOT swap, does NOT restart bridge, writes `~/.musu/PENDING_SCHEMA_GATE.txt` with the planned migration banner. Operator runs `musu-rs apply-schema` to acknowledge gate, run migration, swap binary, restart bridge. | Researcher F16 |
| Q8 | Update config file shape? | **`~/.musu/update.toml`**: `source = "github-release" \| "git" \| "none"`; `github_repo = "<owner>/musu-bee"`; `channel = "stable"`; `check_interval_minutes = 60`. `source = "none"` opts out of auto-update entirely. | Researcher §summary |
| Q9 | musu-bee in R6? | **No** — out of R6 scope. R6 installs the `musu-bee.service` unit file but assumes `musu-bee` is built separately by existing `scripts/install-musu-bee.sh`. | Researcher §summary |

---

## §2 Stack

R6 reuses the R1-R5 baseline (`tokio`, `axum`, `sqlx`, `serde`, `clap`, `rand`, `sha2` already pulled by `musu-rs`) and adds six new dependencies for cross-platform installer and auto-update behaviour.

| Crate | Version | New for R6? | Cfg gate | Reason |
|---|---|---|---|---|
| `tokio`, `axum`, `sqlx`, `serde`, `clap`, `rand`, `sha2` | existing | — | — | Reused from R1-R5 baseline |
| `dirs` | `5` | NEW | unconditional | Cross-platform `home_dir()` — **F3 fix** for `musu-supervisor-core/src/config.rs:207,255` plus all `~/.musu/` path resolution in new `install` module |
| `ureq` | latest | NEW | unconditional | Blocking HTTPS GET of GitHub release tarballs. Chosen over `reqwest` for smaller binary footprint (~150KB vs ~1.2MB) since auto-update only needs blocking single-shot downloads |
| `flate2` + `tar` | latest | NEW | `cfg(unix)` | Unpack `.tar.gz` release artifacts (Linux + macOS) |
| `zip` | latest | NEW | `cfg(windows)` | Unpack `.zip` release artifact (Windows) |
| `fs2` | latest | NEW | unconditional | Advisory file lock for `~/.musu/auto-update.lock` — **F15 update-during-update race** mitigation |
| `windows-service` | latest | NEW | `cfg(windows)` | Optional opt-in: only compiled-in via feature flag `boot-start`; only invoked when operator passes `--boot-start` to `musu-rs install`. Microsoft-blessed crate for Windows Service registration. |
| Existing `musu-supervisor-core` workspace | — | — | — | Supervisor substrate (V21.D) reused per Q3 lock; F3/F4 fixes applied in-place |

**Binary growth estimate**: ~300KB compiled-in (release, stripped) per Researcher F20. Acceptable.

**New workspace member**: `apps/musud/` (~50 LOC `main.rs` wrapping `musu-supervisor-core::Supervisor::start`) — does NOT add net new deps beyond what `musu-supervisor-core` already pulls.

---

## §3 Module touch list

Target LOC: ~1,800-2,200 implementation + ~270 tests (per F14 recalibration; the master plan's ~600 LOC estimate was low).

### NEW: `musu-rs/src/install/` (new module)

| File | LOC est | Purpose |
|---|---|---|
| `mod.rs` | ~80 | Module entry, re-exports, subcommand dispatch glue for `install` / `uninstall` / `auto-update` / `supervise` / `schema-precheck` / `apply-schema` |
| `install.rs` | ~250 | Fresh-install flow: token gen (Q5), `~/.musu/` directory seed, `bridge.env` write with 0600/icacls, `nodes.toml` + `update.toml` seed, binary copy to `~/.musu/bin/`, delegate to `platform::*` for service registration |
| `uninstall.rs` | ~150 | Reverse: IPC stop bridge via `musu-supervisor-core`, deregister platform service, optional `--purge` with interactive confirm (Q6) |
| `auto_update.rs` | ~300 | Hybrid channel logic (Q2): read `update.toml`, probe GitHub release URL for `{owner}/{repo}/releases/latest` matching `{os}-{arch}.{tar.gz\|zip}`, download via `ureq`, verify sha256 against release manifest, run `schema-precheck`, stage via `staged_swap.rs`, IPC stop bridge, swap, IPC start, poll `/health` for 30s, rollback on failure |
| `staged_swap.rs` | ~120 | Atomic file-replace dance: write new binary to `musu-rs.new`, rename current `musu-rs` → `musu-rs.bak`, rename `musu-rs.new` → `musu-rs`. On Windows: when target is locked, fall back to `MoveFileEx` with `MOVEFILE_DELAY_UNTIL_REBOOT` AND surface a clear "restart required" message (F6) |
| `update_lock.rs` | ~50 | Wraps `fs2::FileExt::try_lock_exclusive` on `~/.musu/auto-update.lock`. Exits with code 75 ("temporary failure") if lock is held (F15) |
| `schema_gate.rs` | ~80 | `schema-precheck` subcommand: compare embedded schema version against `db/musu.db`'s `PRAGMA user_version`. Non-zero exit on mismatch. `apply-schema` subcommand: prints Const III banner, runs migration, deletes `PENDING_SCHEMA_GATE.txt` (F16/Q7) |

**Subtotal**: ~1,030 LOC across 7 files.

### NEW: `musu-rs/src/install/platform/`

| File | LOC est | Purpose |
|---|---|---|
| `mod.rs` | ~30 | Trait `PlatformService { fn register(&self) -> Result<()>; fn unregister(&self) -> Result<()>; fn status(&self) -> Result<ServiceStatus>; }` + `pub fn current() -> Box<dyn PlatformService>` |
| `linux.rs` | ~150 | Systemd user unit: write `~/.config/systemd/user/musud.service` (template substitution from `scripts/systemd/musud.service`), run `systemctl --user daemon-reload`, `systemctl --user enable musud`, `systemctl --user start musud`. Unregister: `disable --now` + remove file |
| `windows.rs` | ~250 | Default path: Scheduled Task via `schtasks.exe /Create /TN Musu\musud /XML <tmpl>` with `LogonType Interactive` (no admin). `--boot-start` opt-in path: `windows-service` crate + `sc.exe create musud binPath= "..." obj= "<DOMAIN>\<USER>" password= <prompt>` (explicitly NOT `LocalSystem` per F5 — Claude CLI reads `~/.claude/.credentials.json` from operator profile) |
| `macos.rs` | ~150 | LaunchAgent: write `~/Library/LaunchAgents/com.musu.musud.plist` from template, run `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.musu.musud.plist`, `launchctl kickstart -k gui/$(id -u)/com.musu.musud` |

**Subtotal**: ~580 LOC across 4 files.

### NEW: workspace member `apps/musud/`

| File | LOC est | Purpose |
|---|---|---|
| `Cargo.toml` | ~20 | New workspace member; depends on `musu-supervisor-core` |
| `src/main.rs` | ~50 | Reads `~/.musu/musu.toml` (supervisor config: which services to supervise), calls `musu_supervisor_core::Supervisor::start()`, blocks on its run loop |

**Subtotal**: ~70 LOC across 2 files.

### NEW: service templates under `scripts/`

| File | LOC est | Purpose |
|---|---|---|
| `scripts/systemd/musud.service` | exists | Reused as-is (already present) — installer substitutes `${HOME}`, `${USER}`, `${MUSU_HOME}` placeholders at write time |
| `scripts/launchd/com.musu.musud.plist.tmpl` | ~30 | New; derived from existing `com.musu.bridge.plist.example`. `KeepAlive` set to `false` so launchd does NOT double-restart against musud's own supervision loop (Critic seed bullet) |
| `scripts/windows/musud_task.xml.tmpl` | ~50 | New; Scheduled Task XML with `LogonTrigger`, `UserId` = operator SID placeholder, no elevation requested |

**Subtotal**: ~80 LOC of templates (non-Rust).

### MODIFY: existing files

| File | LOC delta | Change |
|---|---|---|
| `musu-rs/src/main.rs` | ~+40 | Register six new clap subcommands; route to `install::*` |
| `musu-rs/Cargo.toml` | ~+10 | Add the six new deps from §2 |
| `musu-supervisor/crates/musu-supervisor-core/src/config.rs` | ~+20 / -10 | **F3 fix**: replace both `env::var("HOME").unwrap_or("/root")` sites at lines 207 and 255 with `dirs::home_dir().ok_or(...)`. Add `dirs` to crate's `Cargo.toml` |
| `musu-supervisor/crates/musu-supervisor-core/src/supervisor.rs` | ~+150 | **F4 fix**: introduce `trait IpcTransport` abstracting `send_command` / `recv_command`. Existing `#[cfg(unix)]` `UnixSocketTransport` impl stays. New `#[cfg(windows)]` `NamedPipeTransport` impl using `\\.\pipe\musu` with bearer-token auth (token read from `~/.musu/bridge.env`). All public IPC fns become transport-agnostic |
| `musu-supervisor/crates/musu-supervisor-core/src/ipc.rs` | ~+30 | Surface the new transport trait |
| `musu-supervisor/crates/musu-supervisor-core/Cargo.toml` | ~+5 | Add `dirs`; conditionally add Windows named-pipe deps under `[target.'cfg(windows)'.dependencies]` |
| `musu-rs/src/bridge/handlers/mod.rs` (or similar) | ~+30 | Add `POST /api/system/update` handler — spawns `musu-rs auto-update` as a detached background task. Replaces Python-era F2 `sh -c systemctl --user restart` hack |
| `Cargo.toml` (workspace root) | ~+1 | Add `apps/musud` to `[workspace] members` |

**Subtotal**: ~+286 LOC across 8 files modified.

### NEW: tests under `musu-rs/tests/`

| File | LOC est | Purpose |
|---|---|---|
| `tests/r6_install_smoke.rs` | ~150 | End-to-end test on a tempdir-mocked `$HOME`: run `musu-rs install` → verify `~/.musu/` tree (bridge.env perms, update.toml content, binary copied to `bin/`) → verify platform service registered (per-OS: `systemctl --user status musud`, `schtasks /Query /TN Musu\musud`, `launchctl list com.musu.musud`) → run `musu-rs uninstall` → verify clean |
| `tests/r6_auto_update.rs` | ~120 | Mock GitHub release via `wiremock`: serve a known-good tarball + checksum, verify staged swap → `/health` poll → success. Second test variant: serve an intentionally-broken binary, verify rollback to `.bak` within 30s |

**Subtotal**: ~270 LOC across 2 test files.

### Totals

| Bucket | LOC |
|---|---|
| New Rust source (install + platform + apps/musud) | ~1,680 |
| Modified Rust source | ~+286 |
| Service templates (non-Rust) | ~80 |
| Tests | ~270 |
| **GRAND TOTAL** | **~2,316 LOC** |

Within F14 recalibrated range (1,500-2,500).

---

## §4 Install layout / supervisor architecture

### Cross-platform `~/.musu/` layout (post-install)

```
~/.musu/
├── bin/
│   ├── musu-rs(.exe)         # the binary (downloaded from GitHub release OR built from source)
│   ├── musu-rs.bak(.exe)     # previous version, kept for rollback (F8)
│   └── musud(.exe)           # supervisor binary (from apps/musud/, Q3)
├── bridge.env                # MUSU_BRIDGE_TOKEN=<64-hex>; perms 0600 Unix / icacls operator-only Windows (Q5)
├── update.toml               # source/github_repo/channel/check_interval_minutes (Q8)
├── musu.toml                 # musud config: services to supervise (default: just "bridge")
├── companies.yaml            # operator config (from R-earlier ranges)
├── companies/*.yaml
├── db/
│   └── musu.db               # SQLite (from R2/R5 baseline)
├── data/                     # writer outputs, audit logs (from R5)
├── logs/
│   └── <svc>.log             # supervised-service logs (F17 — musud's own log goes to journald / Event Log / launchd default, NOT here)
├── auto-update.lock          # advisory file lock (F15); created on demand by auto-update
└── PENDING_SCHEMA_GATE.txt   # written by auto-update only when Const III gate fires (F16/Q7)
```

### Supervisor architecture (musud)

```
                  Platform Service Manager
                  (systemd / Scheduled Task / launchd)
                            │
                            │ starts on logon (default) or boot (--boot-start)
                            ▼
                  ~/.musu/bin/musud
                  (apps/musud workspace member, Q3)
                  │
                  │ reads ~/.musu/musu.toml
                  │ calls Supervisor::start()
                  │
                  ├──► spawns ~/.musu/bin/musu-rs bridge (supervised, restart-on-fail with backoff)
                  │    │
                  │    │ exposes :3000 HTTP
                  │    │ exposes IPC (Unix socket / Named Pipe — F4)
                  │
                  │  ┌──────────────────────────────────────────────┐
                  │  │ IPC commands (musud ←→ musu-rs):             │
                  │  │   stop      — graceful shutdown for swap     │
                  │  │   start     — restart after swap             │
                  │  │   status    — health probe                   │
                  │  │   reload    — config reread (no restart)     │
                  │  └──────────────────────────────────────────────┘
                  │
                  └──► (optional, future) spawns other supervised services
                       per musu.toml — V25 hook, NOT in R6 scope
```

Auto-update flow (invoked by `musu-autoupdate.timer` or `POST /api/system/update`):

```
musu-rs auto-update
  ├── acquire ~/.musu/auto-update.lock (F15)
  ├── read update.toml
  ├── if source=github-release:
  │     GET https://api.github.com/.../latest
  │     download {os}-{arch}.{tar.gz|zip}
  │     verify sha256 from release manifest
  ├── elif source=git:
  │     git pull && cargo build --release
  ├── run schema-precheck
  │   ├── exit==0: continue
  │   └── exit!=0: stage to musu-rs.new,
  │       write PENDING_SCHEMA_GATE.txt, exit
  ├── IPC: musud → bridge: stop
  ├── staged_swap (atomic rename to .bak)
  ├── IPC: musud → bridge: start
  ├── poll /health for 30s
  │   ├── 200 within 30s: SUCCESS
  │   └── fail: rollback .bak → main, restart
  └── release lock
```

### Service unit shape (Linux — `musud.service`, reused from existing template)

```ini
[Unit]
Description=Musu supervisor (musud)
After=network.target

[Service]
Type=simple
ExecStart=%h/.musu/bin/musud
Restart=on-failure
RestartSec=5
Environment=MUSU_HOME=%h/.musu

[Install]
WantedBy=default.target
```

(Critic seed: verify `Type=simple` vs `Type=notify`; `Restart=on-failure` vs `Restart=always`; `WantedBy=default.target` vs `WantedBy=multi-user.target`.)

### Service unit shape (Windows — Scheduled Task, default install)

`schtasks /Create /XML musud_task.xml.tmpl /TN Musu\musud` with template:

```xml
<Task version="1.4">
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>%USERDOMAIN%\%USERNAME%</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal>
      <UserId>%USERDOMAIN%\%USERNAME%</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions>
    <Exec>
      <Command>%USERPROFILE%\.musu\bin\musud.exe</Command>
    </Exec>
  </Actions>
</Task>
```

### Service unit shape (macOS — `com.musu.musud.plist.tmpl`)

```xml
<plist version="1.0">
<dict>
  <key>Label</key><string>com.musu.musud</string>
  <key>ProgramArguments</key>
  <array><string>%MUSU_HOME%/bin/musud</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>  <!-- musud handles its own crash recovery; do NOT double-restart -->
  <key>StandardOutPath</key><string>%MUSU_HOME%/logs/musud.log</string>
  <key>StandardErrorPath</key><string>%MUSU_HOME%/logs/musud.err</string>
</dict>
</plist>
```

---

## §5 Const gates

- **Const III (Schema Migration Banner)**: **FIRES during `musu-rs install`** (initial `db/musu.db` creation runs the embedded schema; banner is printed via existing `core::schema::apply` from R2). Auto-update path **INSPECTS** schema delta via `musu-rs schema-precheck` but **DOES NOT** auto-apply (F16/Q7). Operator must explicitly run `musu-rs apply-schema` after auto-update writes `PENDING_SCHEMA_GATE.txt`.
- **Const VI (GPU / model-weight gate)**: NOT triggered. R6 has no GPU surface.
- **Const VII (per-commit Auditor gate)**: R6 will be implemented across multiple commits (likely one per major sub-flow: install module, auto-update module, supervisor F3/F4 fixes, platform-service templates). Each commit is independently Auditor-gated per the dual-audit master-plan mandate.

---

## §6 Acceptance (≥10 items)

1. `cargo build --release --workspace` clean; `cargo clippy --workspace -- -D warnings` zero allows.
2. `cargo test --release --workspace` green including new `r6_install_smoke.rs` and `r6_auto_update.rs` integration tests.
3. **Fresh install on the 4060Ti Windows 11 primary machine** (operator's stated primary per GOAL.md §A.1.1): from a clean `~/.musu/`, run `musu-rs install` → `~/.musu/` tree present per §4 → `/health` returns 200 → `/health/ready` returns `ready=true`.
4. **Reboot the 4060Ti machine** → on next interactive logon, the Scheduled Task auto-starts musud, which auto-starts the bridge. Verified via `schtasks /Query /TN Musu\musud /V` → `Last Run Time` recent, `Status: Ready`.
5. **`musu-rs auto-update` with mocked github-release** (`wiremock`-served tarball): stages binary, verifies sha256, swaps atomically, `/health` 200 within 30s, no manual restart needed by operator.
6. **`musu-rs auto-update` with intentionally-broken binary**: post-swap `/health` polling fails within 30s, automatic rollback from `.bak` engages, bridge serves 200 again, audit log records the rollback event.
7. **`musu-rs auto-update` with schema-delta release**: `schema-precheck` returns non-zero, `PENDING_SCHEMA_GATE.txt` is written, bridge is NOT restarted, binary is staged at `musu-rs.new`. Operator then runs `musu-rs apply-schema` which prints Const III banner, runs migration, swaps binary, restarts bridge (F16/Q7).
8. **`musu-rs uninstall`** stops the bridge via IPC, deregisters the Scheduled Task (Windows) / disables systemd user unit (Linux) / `launchctl bootout` (macOS). `--purge` deletes `~/.musu/` after explicit `y/N` confirmation (Q6).
9. **Update-during-update race**: while one `musu-rs auto-update` is staging, a second concurrent invocation exits with non-zero status and a "lock held by PID X" message; no `~/.musu/bin/` corruption (F15).
10. **Linux smoke** (manual via WSL Ubuntu on the 4060Ti machine): `musu-rs install` writes `~/.config/systemd/user/musud.service`; `systemctl --user status musud` shows `active (running)`.
11. **F1 negative test**: grep across all R6-touched files confirms zero occurrences of `musu_admin`, `~/.git-credentials`, or any baked Forgejo credentials.
12. **F5 negative test**: when `--boot-start` is invoked on Windows, the `sc.exe create` command line does NOT include `obj= LocalSystem`; it requires operator-provided `obj= <DOMAIN>\<USER>` and prompts for password.
13. **Phase 1.5 dual-Critic** (devops-architect + security-engineer) returns all findings resolved or explicitly deferred with operator sign-off.
14. **Phase 5 dual-Auditor** (quality-engineer + security-engineer) returns SHIP-OK per master plan §5-R6 mandate.

---

## §7 Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R6-W1 | Windows IPC absence: `supervisor.rs` IPC fns are `#[cfg(unix)]`-only — musud on Windows has no way to signal the bridge for swap | High (without fix) | High | F4 fix: Named Pipe `\\.\pipe\musu` transport added behind unified `IpcTransport` trait in `supervisor.rs` (§3 modify) |
| R6-W2 | HOME env-var Windows bug: `env::var("HOME").unwrap_or("/root")` writes config to `/root/.musu` on Windows | High (without fix) | High (broken default path on operator's primary OS) | F3 fix: `dirs::home_dir()` at both `config.rs:207,255` sites (§3 modify) |
| R6-W3 | Locked-binary swap on Windows: running `musu-rs.exe` IS the file auto-update writes | Med | Med | F6 mitigation: download to `.new` slot, IPC stop bridge, attempt rename; on Windows access-denied fall back to `MoveFileEx` with `MOVEFILE_DELAY_UNTIL_REBOOT` and surface clear "restart required" message. Acceptance #5 covers the happy path; acceptance #4 covers the reboot recovery |
| R6-W4 | Forgejo plaintext credential bake-in (Python-era artifact at `auto-update.sh:15-19`) re-introduced by mistake | Low (if vigilant) | Critical (credential leak) | F1 mitigation: default channel is GitHub releases over HTTPS only. Acceptance #11 is the grep negative test. Researcher F1 explicitly bans inheritance |
| R6-W5 | Cargo build wall-clock stall (3m 28s) blocks every 10-min auto-update timer fire when `source=git` | High (if `source=git`) | Med (auto-update stalls but no corruption) | F7 mitigation: hybrid path per Q2 — default is `github-release` (~5-10s download), `source=git` requires explicit opt-in via `update.toml` |
| R6-W6 | Const III auto-acknowledged silently during auto-update | Low (if F16 implemented) | Critical (silent schema breakage) | F16/Q7 mitigation: `schema-precheck` is mandatory pre-flight; non-zero exit halts the swap, writes `PENDING_SCHEMA_GATE.txt`. Acceptance #7 covers this path |
| R6-W7 | Service registration blast radius: typo in unit-file path, wrong UserId, or wrong elevation level can break boot or grant excess privilege | Med | High | Pre-flight DRY-RUN mode (`musu-rs install --dry-run`) that prints all planned filesystem + service writes without executing. Dual-audit per master plan §5-R6 (devops-architect + security-engineer) is mandatory |
| R6-W8 | Update-during-update race: two `auto-update` invocations interleaved corrupt `~/.musu/bin/` | Low | High | F15 mitigation: `fs2`-backed `auto-update.lock`. Acceptance #9 covers this |
| R6-W9 | No rollback path if new binary is broken | Med | High | F8 mitigation: keep `.bak` slot, poll `/health` for 30s, auto-rollback on failure. Acceptance #6 covers this |
| R6-W10 | Boot-start needs admin elevation on Windows — operator might invoke without understanding | Low | Med | F5/F19 mitigation: default install path requires no admin; `--boot-start` opt-in flag explicitly documented as requiring UAC prompt; explicit refusal to install as `LocalSystem` |
| R6-W11 | macOS `KeepAlive=true` would fight musud's own restart loop, causing rapid-cycle restarts | Med | Med | Template ships with `KeepAlive=false` (§4 plist). Critic seed bullet to verify |
| R6-W12 | GitHub Actions CI publishing per-platform tarballs is a hard prerequisite for Q2 hybrid path; CI work is out of R6 scope but a blocker for production use | Med | Med (downgrades operator UX, NOT correctness) | Document the CI prerequisite explicitly; R6 ships working `source=git` fallback that runs even without CI. CI work tracked separately as wiki/496-followup |

---

## §8 Critic seed (dual: devops-architect + security-engineer)

R6 is a dual-audit range per master plan §5-R6. Both Critics receive this plan + the Researcher envelope.

### devops-architect Critic — seed bullets

1. Verify F3 and F4 supervisor cross-platform fixes are minimal and complete. Specifically: does the Windows Named Pipe IPC path actually compile on `cargo check --target x86_64-pc-windows-msvc`? Are both `env::var("HOME")` sites at `config.rs:207` and `:255` consistently replaced?
2. Validate §4 install layout against platform conventions: does Linux respect XDG (`~/.config/systemd/user/`, `~/.local/share/`) vs the chosen `~/.musu/` flat layout? Should Windows use `%APPDATA%\Musu\` or `%USERPROFILE%\.musu\`? Should macOS use `~/Library/Application Support/Musu/` or `~/.musu/`? Recommend uniform `~/.musu/` for operator-mental-model simplicity but flag any platform-violation issues.
3. Verify `staged_swap.rs` covers ALL failure modes:
   - Mid-rename process crash (state: `.new` exists, `.bak` exists, main is missing or partially renamed)
   - Disk full during write of `.new`
   - Antivirus quarantine of `.new` on Windows (real-world failure mode on Windows Defender)
   - Permission denied on the rename
4. Validate service-template details:
   - systemd: is `Type=simple` correct, or should it be `Type=notify` with musud calling `sd_notify(READY=1)`? Is `Restart=on-failure` correct, or should it be `Restart=always`? Is `WantedBy=default.target` correct for a user unit?
   - Windows Scheduled Task: is the XML well-formed against schema 1.4? Does the `RestartOnFailure` clause actually do what we want (restart the task on action failure) vs needing musud's internal supervision?
   - launchd: is `KeepAlive=false` correct (NOT double-restarting)? Should `ThrottleInterval` be set?
5. Verify the pre-flight `--dry-run` mode (R6-W7 mitigation) actually exercises the same code paths as the real install (i.e., it's not just a stub that prints a static list).
6. Confirm `apps/musud/` workspace member doesn't accidentally pull in `musu-rs`-only deps (clean separation).

### security-engineer Critic — seed bullets

1. **F1 verification**: grep the planned diff for `musu_admin`, `git-credentials`, `auto-update.sh:15-19` patterns. Confirm zero inheritance from the Python-era credentials bake-in.
2. **F5 verification**: when `--boot-start` is invoked on Windows, the `sc.exe create` invocation MUST NOT use `obj= LocalSystem`. It MUST require an operator-provided `obj= <DOMAIN>\<USER>` with explicit password entry. Verify the Rust code does NOT have a code path that falls back to `LocalSystem`.
3. **Q5 token handling**: confirm `MUSU_BRIDGE_TOKEN` is generated with `rand::random::<[u8; 32]>()` (CSPRNG), stored in `bridge.env` with `0600` perms on Unix and `icacls /grant:r ${USER}:F /inheritance:r` on Windows, and is NEVER logged (grep `tracing::*` calls touching the token). Confirm the Windows Named Pipe IPC (F4) requires the same token as bearer auth.
4. **Auto-update binary verification chain**:
   - sha256 checksum MUST come from the release manifest (signed by GitHub release process), NOT from the downloaded tarball itself
   - Download URL MUST be HTTPS-only; HTTP redirects MUST be rejected (`ureq` default behaviour — verify)
   - GitHub API responses MUST be validated against expected shape (no blind `.unwrap()` on `serde_json::Value`)
5. **Service registration blast radius** (R6-W7): a typo in `ExecStart=` or `<Command>` path on Linux/Windows can break operator boot. What's the safety net beyond `--dry-run`? Recommend: rollback registration on first-run health-check failure within N minutes.
6. **`--purge` operator gate**: Q6 says `--purge` deletes `~/.musu/`. Confirm the interactive confirm is mandatory (no `--purge --yes` quiet bypass without an additional `--i-understand-this-deletes-data` flag).
7. **`POST /api/system/update` endpoint**: who can call this? Confirm it requires the same bridge token as all other `/api/*` endpoints. Confirm a non-authenticated caller cannot trigger auto-update remotely.
8. **Supply chain**: the six new deps (§2) — confirm they're well-maintained, no abandoned crates, no known CVEs. Note: `windows-service` is MS-blessed; `ureq` is widely used; `flate2`/`tar`/`zip`/`sha2`/`fs2`/`dirs` are all mature.

---

## §9 References

- **wiki/490** — `F:/workspace/musu-bee/docs/V24_RUST_BIG_BANG_MASTER_PLAN_2026_05_20.md` (master plan §5-R6 row + §7 risks; dual-audit mandate)
- **wiki/491** — R1 plan (template predecessor)
- **wiki/495** — `F:/workspace/musu-bee/docs/V24_R5_WRITER_RS_PLAN_2026_05_20.md` (R5 plan — direct template for §1.1 locked-decisions table pattern)
- **wiki/495c** — `F:/workspace/musu-bee/docs/V24_R5_WRITER_RS_CLOSURE_2026_05_20.html` (R5 closure; the supervisor/auto-update gap R6 closes)
- **wiki/498c** — `F:/workspace/musu-bee/docs/V24_R8_4060TI_E2E_CLOSURE_2026_05_20.html` (§3 "the install-clean delta"; the 11 systemd unit deletions R6 partly reverses)
- **GOAL.md §A.1.1** — `F:/workspace/musu-bee/docs/GOAL.md` (operator's primary = Windows 11 + 4060Ti)
- **Phase 0 Researcher envelope** (this turn; F1-F20 + Q1-Q9)
- Source code references for fixes:
  - `F:/workspace/musu-bee/musu-supervisor/crates/musu-supervisor-core/src/config.rs:207` and `:255` (F3 fix sites)
  - `F:/workspace/musu-bee/musu-supervisor/crates/musu-supervisor-core/src/supervisor.rs` (F4 fix site)
  - `F:/workspace/musu-bee/musu-supervisor/crates/musu-supervisor-core/src/ipc.rs` (F4 fix site)
- Deprecation targets (Python-era; R6 supersedes):
  - `F:/workspace/musu-bee/scripts/install.sh` (385 LOC)
  - `F:/workspace/musu-bee/scripts/install.ps1` (480 LOC)
  - `F:/workspace/musu-bee/scripts/auto-update.sh` (173 LOC; F1 credential-bake-in)
- Template reuse targets:
  - `F:/workspace/musu-bee/scripts/systemd/musud.service` (already exists; reused as-is)
  - `F:/workspace/musu-bee/scripts/launchd/com.musu.bridge.plist.example` (parent of new `com.musu.musud.plist.tmpl`)
- Memory tags (operator feedback that constrains R6 design):
  - `[[feedback-self-contained-product]]` — no external SaaS (drives F18 Supabase/Caddy drop)
  - `[[feedback-no-python]]` — no Python at runtime (drives the entire R6 Rust-native rewrite)
  - `[[decision-musu-backend-rust]]` — backend is Rust (drives Q1 single-binary subcommand)
  - `[[feedback-no-yagni-architecture]]` — no speculative scope (drives Q4 dropping musu-tunnel/forgejo/connectsd)
  - `[[feedback-plan-stage-auditor]]` — dual-audit per master plan §5-R6
  - `[[feedback-scribe-html-only]]` — closure is HTML, plan is markdown

---

## §10 Critic Findings (resolved)

Phase 1.5 dual-Critic returned 2026-05-20. Critic A (devops-architect) = 4 HIGH + 6 MED + 5 LOW/INFO (D1-D17). Critic B (security-engineer) = 3 HIGH + 6 MED + 4 LOW/INFO (S1-S14). Per [[MODE_Agent_Team]] §"conflict resolution", **union of HIGH findings** must resolve before Builder. All HIGHs resolved as plan amendments OR Builder constraints below.

### Critic A (devops-architect) findings

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| **D1** | **HIGH** | workspace | `apps/musud/` already EXISTS at `musu-supervisor/apps/musud/src/main.rs` (75 LOC). Plan §3 claimed NEW workspace member; factual error. | **Plan amendment** — §3 "apps/musud" row downgrades from NEW (~70 LOC) to MODIFY (~+50 LOC delta for Windows IPC fix + dirs::home_dir use). |
| **D2** | **HIGH** | supervisor-fix | IPC `IpcCmd` enum has only 3 variants (Status/Stop/Logs); plan §4 architecture diagram promises Start/Restart/Reload pairs. Auto-update flow won't compile against existing API. | **Plan amendment** — §3 modify `supervisor-core/src/ipc.rs` LOC delta from ~+30 to ~+120; add `Start { service: Option<String> }`, `Restart { service: Option<String> }`, `Reload`, `Freeze { service: String }`, `Unfreeze { service: String }` variants. Supervisor dispatch state machine for re-spawning a stopped service (current one-shot watch::Sender<bool> insufficient). |
| **D3** | **HIGH** | service-template | Windows Scheduled Task `<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>` will refuse restart-on-logon if zombie instance lingers — silent boot failure after crash. | **Plan amendment** — §4 XML template: change to `<MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>`. `<RestartOnFailure>` adjusted to Count=5 Interval=PT5M (less aggressive). Acceptance #15 added: "taskkill musud + schtasks /Run → musud running again within 5s". |
| **D4** | **HIGH** | service-template | systemd `Type=simple` + `Restart=on-failure` races musud's own supervision loop during staged_swap: musud doesn't exit but tries to re-spawn the half-replaced binary. | **Plan amendment** — auto-update flow MUST issue `IpcCmd::Freeze { service: "bridge" }` BEFORE staged_swap. After swap, `IpcCmd::Unfreeze` so musud's run_service_loop spawns new binary. Alternative implemented in parallel: `~/.musu/UPDATE_IN_PROGRESS` lock file that musud's run_service_loop checks before re-spawning. Plan picks `Freeze`/`Unfreeze` IPC variants (resolves D2 + D4 together). |
| D5 | MED | supervisor-fix | F4 NamedPipe transport under-specified — tokio features list missing `net`; needs `windows-sys` features Win32_System_Pipes + Win32_Security. | **Builder constraint** — `musu-supervisor-core/Cargo.toml` add tokio features list incl. `net`; `[target.'cfg(windows)'.dependencies] windows-sys = { version = "0.59", features = ["Win32_Security", "Win32_System_Pipes"] }`. Acceptance: `cargo check --target x86_64-pc-windows-msvc -p musu-supervisor-core` clean. |
| D6 | MED | staged-swap | Recovery path undefined for mid-rename crash, disk-full, Defender quarantine, perm-denied. | **Plan amendment** — §3 add `staged_swap.rs` boot-time recovery routine (detects `.new`/`.bak`/main dangling state, finishes swap or rolls back). Pre-flight `available_disk_space > 2 * binary_size`. §7 add R6-W13 "Defender quarantine on Windows". staged_swap.rs LOC 120→200. |
| D7 | MED | loc-budget | ~2,316 LOC estimate ~30% low. Comparables: install.sh 385 + install.ps1 480; R5 5× overshoot. | **Plan amendment** — §1 LOC band raise to ~2,200-3,000 impl + ~270 tests. install.rs 250→350, auto_update.rs 300→450, platform/windows.rs 250→400. Auditor scope-creep flag pre-empted. |
| D8 | MED | timer-cadence | update.toml `check_interval_minutes=60` conflicts with `musu-autoupdate.timer:OnUnitActiveSec=10min`. | **Plan amendment** — §3 add row "MODIFY scripts/systemd/musu-autoupdate.timer" — installer rewrites OnUnitActiveSec from update.toml, OR replace timer with in-binary tokio interval respecting update.toml (preferred — matches Windows + macOS which can't easily re-write external timer cadence). |
| D9 | MED | install-layout | `~/.musu/` flat layout violates platform conventions (XDG / `%APPDATA%` / `~/Library/...`). | **Documented design call** — accept uniform `~/.musu/` per operator-mental-model simplicity. §7 add R6-W14 "platform-convention violation: operators following per-OS tutorials may not find config". Doc mitigation only; not a defect. |
| D10 | MED | system-update-endpoint | `POST /api/system/update` spawns musu-rs auto-update from inside the bridge — chicken-and-egg: auto-update needs IPC to stop bridge; parent bridge inherits fd, blocking new bind on swap. | **Plan amendment** — handler MUST spawn with `Stdio::null()` + `Command::pre_exec` clearing inherited fds (Unix) / `CREATE_NO_WINDOW + DETACHED_PROCESS + new session` (Windows). 202 response AFTER PID capture + lock-file write succeeds. Handler LOC `~+30` → `~+80`. |
| D11 | LOW | service-template | macOS launchd plist `KeepAlive=false` (flat) means launchd never restarts musud even on crash. Existing template uses dict-form `{SuccessfulExit:false}`. | **Plan amendment** — §4 plist: change to `<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/><key>Crashed</key><true/></dict>` + `<key>ThrottleInterval</key><integer>10</integer>`. |
| D12 | LOW | service-template | Existing musud.service template paths point to `%h/musu-functions/bin/musud`; R6 must rewrite to `%h/.musu/bin/musud`. | **Builder constraint** — installer template-substitutes ALL paths including WorkingDirectory + ExecStart. |
| D13 | LOW | dry-run | `--dry-run` underspecified; need real syntax validation, not stub. | **Plan amendment** — §3 add `install/dry_run.rs ~80 LOC`: writes unit files to `/tmp/musu-dryrun-{pid}/`, runs `systemd-analyze verify` / `plutil -lint` / Test-Path. |
| D14 | LOW | musu-bee | `musu-bee.service` installed even when musu-bee not present → systemd warnings. | **Plan amendment** — §3 install only when `musu-bee/package.json` exists AND `--with-musu-bee` flag passed. New acceptance: clean install without musu-bee/ → no musu-bee.service unit. |
| D15 | LOW | module-separation | `install::install` redundant naming. | **Plan amendment** — rename `install/install.rs` → `install/runner.rs`. |
| D16 | INFO | references | Binary name is `musu` not `musu-rs` (per Cargo.toml `[[bin]] name = "musu"`). Plan throughout uses wrong name. | **Plan amendment** — global rename `musu-rs <subcommand>` → `musu <subcommand>` throughout plan body. Cited in HANDOFF NOTES for Builder. |
| D17 | INFO | security-overlap | ACL semantics differ between default install path and `--boot-start` mode. Defer to Critic B. | Cross-reference S2 + S8 below. |

### Critic B (security-engineer) findings

| ID | Sev | Area | Finding | Resolution |
|---|---|---|---|---|
| S1 | LOW | credential | Q8 `source = "git"` channel still exists; if operator points at private repo, F1 ban bypassed. | **Plan amendment** — Q8 spec amended: `source = "git"` MUST refuse http(s):// scheme (SSH-key auth only). Public-github-only at config-load validation. |
| **S2** | **HIGH** | privilege-escalation | `windows-service` crate's `ServiceInfo::account_name: Option<OsString>` — `None` defaults to LocalSystem. F5 ban currently only enforced by intent. | **Builder constraint** — type-safe: introduce newtype `NonLocalSystemAccount(OsString)` consumed by service-create call. `account_name: Some(NonLocalSystemAccount(...))` only. Refuse construction if value is `LocalSystem`/`LocalService`/`NetworkService`. Acceptance #12 amended: source-level grep for `account_name: None` returns zero matches; unit test asserts LocalSystem refusal. |
| S3 | MED | credential | Q5 says `rand::random::<[u8; 32]>()`; spec-fragile. Use explicit `OsRng`/`getrandom`. | **Plan amendment** — Q5 amended: `getrandom::getrandom(&mut buf)` or `OsRng.fill_bytes(&mut buf)`. Builder constraint: ban `thread_rng`/`rand::random` shortcuts for secret gen. |
| **S4** | **HIGH** | binary-verification | sha256 manifest provenance unspecified (transport corruption only, not authenticity); ureq redirect handling unspecified; GitHub API parse may use Value not strong types. | **Builder constraint** — auto_update.rs MUST: (a) doc-comment "sha256 catches transport corruption only; operator-trust = security model"; (b) `ureq` configured with `.redirects(0)`, then explicit hostname-allowlist follow (`api.github.com`, `objects.githubusercontent.com`, `github-releases.githubusercontent.com` only, HTTPS only on every hop); (c) typed `GithubReleaseManifest` struct with `#[serde(deny_unknown_fields)]`. V25 follow-up: GitHub release signing (sigstore/cosign). |
| S5 | MED | endpoint-auth | `POST /api/system/update` is NEW; must be behind `require_bearer` middleware + rate_limit. | **Builder constraint** — route in `native_router()` (auto behind middleware). Unit test `system_update_requires_auth` asserts 401 without bearer. Rate-limit inherited. |
| S6 | MED | operator-gate | `--purge` y/N too weak; no non-TTY refuse. | **Plan amendment** — Q6 amended: typed confirmation string `PURGE MY MUSU DATA` (case-sensitive). Forbid `--yes`/`--force`/`-y` bypass. Refuse in non-TTY unless `--i-understand-this-deletes-data` flag. Refuse if musu.db mtime within 7 days unless separate ack. |
| **S7** | **HIGH** | supply-chain | `tar` + `zip` historical path-traversal vulns (zip-slip). Plan does not specify extraction defenses. | **Builder constraint** — before any extract, validate `entry.path()`: no `..` components, `canonicalize` + `starts_with(extract_root)`. For tar: `set_preserve_permissions(false)`, `set_unpack_xattrs(false)`. For zip: validate `ZipFile::enclosed_name()` returns Some (None = traversal attempt → refuse archive). Pin `tar ≥ 0.4.40`, `zip ≥ 0.6.6`. Integration test feeds malicious archive, asserts refusal. |
| S8 | MED | data-leak | Named Pipe default ACL allows any local authenticated user. Token reuse HTTP+IPC = same-channel compromise. | **Builder constraint** — Named Pipe created with explicit `SECURITY_DESCRIPTOR` (SDDL `D:(A;;GA;;;<operator_sid>)`). Refuse to bind if `GetCurrentProcessTokenUser() == LocalSystem`. Consider HKDF-derived IPC subkey from MUSU_BRIDGE_TOKEN (defense-in-depth, V25). Document threat model in supervisor.rs doc-comment. |
| S9 | MED | data-leak | `update.toml` no integrity check; attacker writing to it can flip source/repo for next update. | **Builder constraint** — on every read: strict enum validation for `source`; `github_repo` regex `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`; `github_repo` value baked at install-time, operator changes require `musu install --reconfigure`. |
| S10 | LOW | data-leak | `PENDING_SCHEMA_GATE.txt` content shape unbound; raw SQL leaks to backups. | **Plan amendment** — Q7 amended: file contains only (a) commit hash, (b) target schema version, (c) human description, (d) operator instruction. NO raw SQL. Perms 0644 (informational). |
| S11 | LOW | privilege-escalation | macOS install run via sudo → LaunchAgent installed under root, breaks subsequent non-sudo uninstall. | **Builder constraint** — install.rs entry: refuse if `euid == 0` (Unix) or `IsUserAnAdmin()` (Windows) UNLESS `--boot-start` (Windows Service legitimate admin need). Clear error. |
| S12 | LOW | data-leak | `~/.musu/` parent dir perms unspecified — defaults to 0755 (umask). Existing install.sh uses 0700. | **Plan amendment** — §4 layout note: `~/.musu/` created with 0700 perms on Unix. Builder constraint + acceptance criterion. |
| S13 | INFO | ipc-auth | Token rotation flow unspecified. | **Documented** — V25 backlog. R6 manual rotation: stop musud, edit bridge.env, restart. Closure HTML note. |
| S14 | INFO | devops-overlap | Windows Scheduled Task with Interactive logon only fires at operator logon (not 24/7 when logged out). | **Documented** — install closure clarifies trade-off. Operator uses `--boot-start` for 24/7. |

**Builder readiness**: 7 union HIGHs (D1+D2+D3+D4 + S2+S4+S7) all resolved as plan amendments OR Builder constraints above. 12 MEDs resolved similarly. Plan READY FOR BUILD. Estimated amendment effort consumed: ~30 min (this turn).

**LOC budget update** (post-D7 recalibration): impl ~2,200-3,000 + tests ~270-400 + service templates ~80 ≈ ~2,550-3,480 total. Builder may exceed plan-stated ~2,316 by up to ~50%; Auditor Phase 5 pre-warned.

**Build IPC API expansion** (D2 + D4 union): `IpcCmd` enum gains 5 new variants (Start, Restart, Reload, Freeze, Unfreeze). Two-sided change (musud dispatch + auto-update caller). Builder time multiplier ~1.3×.

---

## §11 Auditor Findings

_Empty at write time. Populated post Phase 5 dual-Auditor (quality-engineer + security-engineer)._
