# MUSU — binaries, processes, packaging (architecture map, 2026-06-11)

Full structural map of how MUSU's binaries, processes, entry points, and Windows
packaging fit together. Made during the single-binary integration so the work is
planned from facts, not guesses. File:line evidence throughout.

## 1. Binaries today (after the musu-startup absorption)

| Exe | Subsystem | Source | Role |
|---|---|---|---|
| `musu.exe` | **Console** (CLI) | `musu-rs/src/main.rs` | Runtime control plane: bridge, all CLI subcommands, AND `startup` (absorbed from the former musu-startup.exe). Writes JSON to stdout (`nodes --json`, `doctor --json`, MCP frames). |
| `musu-desktop.exe` | **Windows GUI** | `musu-bee/src-tauri/src/main.rs` (`#![windows_subsystem="windows"]` line 2) | Desktop shell + fleet cockpit. No console. Spawns `musu.exe startup open`. |

`musu-rs/Cargo.toml`: now ONE `[[bin]] musu` (musu-startup bin removed). There is a
`[lib] musu_rs` the Tauri side does NOT depend on (deliberate — process-spawn
boundary, see SWOT in `PRODUCT_CRITIQUE_AND_REALIGN_2026_06_11.md`).

`musu` with NO subcommand → clap error/help (`main.rs` `#[command(subcommand)]` is
required; no default arm). **This is the crux of the packaging problem below.**

## 2. Process model & spawn graph

The **bridge** (`musu-rs/src/bridge/mod.rs run()`) is the long-lived foreground
future: binds `127.0.0.1:BRIDGE_PORT` (default **0** = OS-dynamic, config.rs),
writes `~/.musu/services/bridge.json` (pid + actual addr), serves axum + task
runner, stays up for the process lifetime. Registry is the discovery mechanism
(written by bridge::run, read by Tauri `bridge_registry_status` + cli `doctor`).

```
User double-clicks musu-desktop.exe (GUI subsystem)
└─ Tauri app_lib::run() [src-tauri/src/lib.rs]
   ├─ setup() → spawn_runtime_autostart() [bg thread]
   │  └─ (bridge offline?) spawn_musu_startup_open()  [fire-and-forget, CREATE_NO_WINDOW]
   │     └─ musu.exe startup open
   │        ├─ LaunchMode::UserOpen → spawn_desktop_login_if_needed() [detached device-flow]
   │        └─ bridge::run()  ← FOREGROUND, the long-lived bridge
   └─ cockpit commands → spawn musu.exe: doctor (desktop_status) / nodes (list_fleet) /
      route (submit_order)   [all CREATE_NO_WINDOW so no console flashes]

Windows logon (MSIX windows.startupTask)
└─ executes musu.exe  [NO ARGS — startupTask can't pass any]
   └─ ⚠️ clap needs a subcommand → today this would error. See §4.
```

## 3. Windows packaging (MSIX manifest)

`scripts/windows/build-msix.ps1` builds + stages three exes into one .msix and
emits the manifest. Current params (lines 20-22): ApplicationExecutable=
musu-desktop.exe, RuntimeExecutable=musu.exe, StartupExecutable=musu-startup.exe.

The manifest `<Application>` has three relevant pieces:
- `Executable="musu-desktop.exe"` — the Application (what the user launches).
- `<uap3:AppExecutionAlias>` `Alias="musu.exe"` — exposes `musu` on PATH (this is
  why `musu nodes` works from a terminal after install).
- `<desktop:Extension Category="windows.startupTask" Executable="$StartupExecutable">`
  — the logon auto-start.

**THE CONSTRAINT (verified from the emitted XML, build-msix.ps1:216-225):**
```xml
<desktop:Extension Category="windows.startupTask"
  Executable="musu-startup.exe" EntryPoint="Windows.FullTrustApplication">
  <desktop:StartupTask TaskId="MusuBridgeStartup" Enabled="true"
    DisplayName="MUSU Bridge" />
</desktop:Extension>
```
There is **NO `<Arguments>` element** — `windows.startupTask` is **exe-path-only**.
Windows runs the named exe with no args and sets no env. So `musu.exe startup`
cannot be invoked by the startupTask directly.

## 4. Subsystem constraint (why "one exe for everything" is bounded)

- `musu.exe` = console subsystem (no `windows_subsystem` attr in main.rs) → writes
  stdout JSON, but flashes a console if launched from a GUI.
- `musu-desktop.exe` = GUI subsystem (`src-tauri/src/main.rs:2`) → no console, but
  can't write stdout JSON.
- A Windows binary's subsystem is fixed at link time. So a single exe cannot be
  BOTH a clean-stdout CLI and a flash-free GUI window. (The GUI spawning the CLI
  child is why we added `CREATE_NO_WINDOW` to the spawns — that suppresses the
  flash from the GUI side.)

This is why "one binary that is window + bridge + CLI" is not cleanly achievable
on Windows. The honest maximum is: ONE runtime binary (`musu`, console) + one GUI
shell (`musu-desktop`, GUI) — which is exactly what the absorption produced
(3 exes → 2).

## 5. The open question: how does logon start the bridge now?

`musu-startup.exe` is gone; `windows.startupTask` can't pass `startup` as an arg.
So the logon task needs SOME exe it can name that brings up the bridge in service
mode. Options (from the exploration), with tradeoffs:

1. **Tiny stub `musu-startup.exe`** that just `exec`s `musu startup` (or whose
   `main` calls the same `run_startup(Service)`). ~KB. Keeps the manifest slot as-is.
   - ✅ Zero manifest/arg gymnastics; startupTask names a real exe that does the
     right thing. ❌ technically a 2nd small binary again — but it's a 5-line shim,
     not the old 276-line musu-startup, and it carries no logic (just calls into
     the lib). This is "3→2.x", honest about the Windows constraint.
2. **Wrapper `.bat`** the startupTask names (`musu.exe startup`). ✅ no extra Rust
   bin. ❌ a .bat in the package is ugly and a console flashes when cmd runs it.
3. **clap default subcommand**: `musu` (no args) → `startup --service`. ✅ truly one
   exe; startupTask names `musu.exe`. ❌ changes interactive CLI (`musu` alone now
   boots a bridge instead of printing help) — surprising for terminal users, and
   the appExecutionAlias exposes `musu` on PATH, so a user typing `musu` would
   start a server. Mitigable by only defaulting when launched without a console
   (detect via `GetConsoleWindow`/parent), but that's fragile.

**Recommendation: Option 1 (thin stub).** It respects the startupTask exe-only
constraint, keeps `musu` CLI behavior unsurprising, and the "binary count" win is
still real: there is ONE runtime with the logic (`musu`), and the stub is a
logic-free shim that calls `musu_rs::install::startup::run_startup(Service)` — no
version-skew surface (it's built from the same crate, same `bridge::run`). The
user still installs/sees ONE app.

## 6. Files still naming the old musu-startup (cleanup checklist)

Done: `src-tauri/src/lib.rs` (calls `musu startup open`), `musu-rs` (bin removed,
`install/startup.rs` added, `Cmd::Startup` wired).

Still need updating for the absorption to be complete:
- `scripts/windows/build-msix.ps1` — `cargo build --bin musu --bin musu-startup`
  (line 278) will FAIL (no such bin); StartupExecutable copy/stage (272/295/318);
  the startupTask Executable. → rebuild only `--bin musu` (+ the stub if Option 1);
  point startupTask at the stub or `musu.exe` per the §5 decision.
- `scripts/windows/audit-msix-desktop-entrypoint.ps1`, `verify-msix-package.ps1`,
  `capture-msix-install-evidence.ps1`, `smoke-packaged-startup.ps1`,
  `prepare-store-submission-bundle.ps1`, `prepare-operator-action-pack.ps1` —
  all assert/verify a `musu-startup.exe` artifact; update to the §5 decision.
- `musu-rs/README.md` — build instructions mention musu-startup.
- `DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md` — describes
  musu-startup.exe + the argless-startupTask packaging contract.

## 7. State summary

| Component | Status |
|---|---|
| `[[bin]]` targets | ✅ one (`musu`) — startup absorbed |
| `Cmd::Startup` + `install/startup.rs` | ✅ wired, cargo check exit 0 |
| Tauri spawns `musu startup open` + CREATE_NO_WINDOW | ✅ done, src-tauri check exit 0 |
| build-msix.ps1 | ❌ broken (`--bin musu-startup`), startupTask Executable stale |
| MSIX startupTask argument passing | ❌ impossible (exe-only) → needs §5 decision |
| audit/verify/smoke scripts | ❌ still assert musu-startup.exe |
| README + onboarding spec | ❌ stale |

**Next concrete step:** decide §5 (recommend Option 1 thin stub), then fix
build-msix.ps1 + the verify/audit scripts + docs, then rebuild MSIX and run the
real-PC E2E (the step still outstanding from the qualitative eval).
