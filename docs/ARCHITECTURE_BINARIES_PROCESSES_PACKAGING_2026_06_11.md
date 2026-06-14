# MUSU — binaries, processes, packaging (architecture map, 2026-06-11)

Full structural map of how MUSU's binaries, processes, entry points, and Windows
packaging fit together. Made during the single-binary integration so the work is
planned from facts, not guesses. File:line evidence throughout.

Updated 2026-06-14: the startupTask shim was restored as a logic-free binary
because MSIX startupTask is exe-path-only and cannot pass `startup` to `musu.exe`.

## 1. Binaries today

| Exe | Subsystem | Source | Role |
|---|---|---|---|
| `musu.exe` | **Console** (CLI) | `musu-rs/src/main.rs` | Runtime control plane: bridge, all CLI subcommands, AND `startup` (absorbed from the former musu-startup.exe). Writes JSON to stdout (`nodes --json`, `doctor --json`, MCP frames). |
| `musu-desktop.exe` | **Windows GUI** | `musu-bee/src-tauri/src/main.rs` (`#![windows_subsystem="windows"]` line 2) | Desktop shell + fleet cockpit. No console. Spawns `musu.exe startup open`. |
| `musu-startup.exe` | **Console shim** | `musu-rs/src/bin/musu-startup.rs` | Logic-free MSIX logon shim. Calls the same library startup path in Service mode because `windows.startupTask` cannot pass args. |

`musu-rs/Cargo.toml`: `[[bin]] musu` plus `[[bin]] musu-startup`. The shim exists
only for MSIX startupTask; all real startup logic lives in the shared library
path (`musu_rs::install::startup::run_startup`). There is a `[lib] musu_rs` the
Tauri side does NOT depend on (deliberate process boundary, see SWOT in
`PRODUCT_CRITIQUE_AND_REALIGN_2026_06_11.md`).

`musu` with NO subcommand still prints clap help/error. That is intentional:
typing `musu` in a terminal must not silently start a background bridge.

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
   └─ cockpit commands
      ├─ desktop_status / submit_order → spawn musu.exe with CREATE_NO_WINDOW
      └─ list_fleet → direct local bridge HTTP GET /api/fleet/status
         (bearer-authenticated, no child CLI process in the refresh loop)

Windows logon (MSIX windows.startupTask)
└─ executes musu-startup.exe  [NO ARGS — startupTask can't pass any]
   └─ calls run_startup(Service)
      └─ bridge::run()  ← bridge-only, no desktop login/device-flow
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
on Windows. The honest maximum is: one runtime binary with real logic
(`musu.exe`), one GUI shell (`musu-desktop.exe`), and one logic-free startupTask
shim (`musu-startup.exe`) that exists only because Windows will not pass args to
startupTask entries.

## 5. StartupTask decision

Decision: keep the thin `musu-startup.exe` shim.

Rejected alternatives:

- Naming `musu.exe` directly in startupTask cannot work because startupTask is
  exe-path-only and cannot pass `startup`.
- A `.bat` wrapper would add a visible `cmd.exe` console flash and is not a
  polished desktop packaging surface.
- Making no-arg `musu` default to service startup would surprise terminal users
  and turn a help command into a background daemon launch.

The shim is acceptable because it carries no product logic and is built from the
same crate as `musu.exe`, which avoids the version skew that existed when startup
logic lived in a separate program.

## 6. Packaging state

Current packaging contract:

- `scripts/windows/build-msix.ps1` builds `--bin musu --bin musu-startup`.
- The MSIX application entrypoint is `musu-desktop.exe`.
- The AppExecutionAlias exposes `musu.exe`.
- The startupTask names `musu-startup.exe`.
- The desktop shell launches `musu.exe startup open` through `CREATE_NO_WINDOW`
  on user launch.
- Fleet refresh does not spawn `musu.exe nodes`; it reads the local bridge API
  directly.

## 7. State summary

| Component | Status |
|---|---|
| Runtime logic | ✅ in `musu.exe` + shared library startup path |
| `musu-startup.exe` | ✅ logic-free startupTask shim |
| `Cmd::Startup` + `install/startup.rs` | ✅ wired, cargo check exit 0 |
| Tauri spawns `musu startup open` + CREATE_NO_WINDOW | ✅ done, src-tauri check exit 0 |
| `list_fleet()` refresh path | ✅ direct bridge HTTP, no child CLI process |
| build-msix.ps1 | ✅ builds and stages `musu.exe`, `musu-startup.exe`, `musu-desktop.exe` |
| MSIX startupTask argument passing | ✅ handled by shim because args are impossible |
| audit/verify/smoke scripts | ✅ should continue asserting the shim exists |

**Next concrete step:** after source changes that affect packaged behavior,
rebuild/reinstall MSIX and run the real-PC E2E. Mock, contract, and compile tests
are not enough for release claims.
