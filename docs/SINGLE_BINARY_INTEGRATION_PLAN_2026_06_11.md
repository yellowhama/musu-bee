# Single-binary integration plan — "musu.exe 하나로" (2026-06-11)

Goal (owner, repeated): MUSU should be ONE thing, not 3 exes. The current split
(`musu-desktop.exe` window / `musu.exe` runtime / `musu-startup.exe` boot) caused
a real E2E failure this session — version skew (`musu nodes` "unrecognized" because
the release musu.exe was stale) and console-window flicker (the autostart fallback
spawned `musu up --json` console procs). Both are direct costs of the 3-way split.

This plan is how far "one" can actually go, and the ONE hard Windows constraint
that bounds it.

## The hard constraint (verified, not assumable)

`musu-bee/src-tauri/src/main.rs:2` sets `#![windows_subsystem = "windows"]` — the
GUI subsystem (no console). `musu` is a CLI: it writes JSON to stdout (`nodes
--json`, MCP JSON-RPC frames — `r3_stdout_clean.rs` is a regression gate asserting
clean stdout). **A Windows binary's subsystem is fixed at link time.** So:
- A GUI-subsystem exe running CLI → stdout is detached; `musu nodes --json` piped
  output breaks.
- A console-subsystem exe opening a window → a console flashes on every launch
  (this is exactly the flicker we hit).

**Therefore a single exe cannot be both a clean CLI and a flash-free GUI window on
Windows.** "One binary that is window + bridge + CLI" (busybox) is not achievable
without one of them being degraded. This is a platform limit, not a design choice.

## What "one" CAN mean (three honest options)

### Option A — One binary, GUI subsystem, CLI via attached console (busybox, degraded CLI)
`musu.exe` = GUI subsystem; dispatch on argv (no args → window; `bridge`/`route`/
`nodes` → CLI). To make CLI stdout work, the CLI arms call
`AttachConsole(ATTACH_PARENT_PROCESS)` (Win32) at startup.
- ✅ Literally one exe. No version skew. No separate startup.
- ❌ `AttachConsole` is fiddly: piped/redirected stdout (`musu nodes --json > f`)
  works, but interactive-terminal output is awkward and MCP stdio framing is
  high-risk (the r3_stdout_clean invariant). GUI-subsystem CLIs are a known pain.
- ❌ Still needs the bridge as a CHILD process (long-lived server must outlive the
  window) — so internally it still spawns itself; "one process" is not achieved,
  only "one file".

### Option B — One binary, console subsystem, window via a worker that hides the console
`musu.exe` = console subsystem; CLI is clean; the `open`/window arm allocates the
webview and `FreeConsole()`s / hides the console window immediately.
- ✅ One exe; CLI is first-class (no AttachConsole risk).
- ❌ A console window briefly exists on GUI launch (the flicker) before it's hidden
  — exactly the symptom we're trying to kill. Mitigable (hide ASAP) but not zero.

### Option C — 3 → 2: fold `musu-startup` into `musu` (`musu startup`/`musu up`), keep the GUI exe separate
`musu-startup.exe` is deleted; its logic becomes `musu startup` (a CLI subcommand,
console subsystem, fine). The Tauri window stays its own GUI-subsystem exe but is
RENAMED/colocated so the "one app" identity holds, and it spawns `musu startup`/
`musu` (one runtime binary, so NO version skew).
- ✅ Kills the version-skew class (one runtime exe, `musu`, owns nodes/route/
  bridge/startup). Kills the startup-fallback flicker (no separate musu-startup;
  the GUI spawns `musu startup` which is the real path, not the `--json` fallback).
- ✅ Each binary keeps its correct subsystem (CLI=console, window=GUI) → no
  AttachConsole hacks, no console flash from the CLI side.
- ⚠️ Still 2 files (one GUI window + one runtime). But it's the honest maximum
  given the subsystem constraint, and it removes BOTH problems E2E exposed.

## Recommendation

**Option C.** It eliminates the two real failures (version skew + startup-fallback
flicker) and respects the Windows subsystem limit instead of fighting it. "One
binary that does everything" (A/B) trades those wins for either a fragile
GUI-subsystem CLI (A, risks the MCP stdout invariant) or a residual console flash
(B) — and NEITHER removes the bridge-as-child-process, so neither is truly "one
process" anyway. C gets the user-visible win ("install one app, one runtime, no
skew, no flicker") at the only cost being an internal 2-file layout the user never
sees.

If the owner insists on literally one file, Option A is the path — but it should
be entered knowing the MCP-stdout risk and that the bridge still self-spawns.

## Ordered steps (Option C)

1. **Fold musu-startup → `musu startup`.** Move `musu-startup.rs` logic into a
   `Cmd::Startup` arm in main.rs (LaunchMode/open/service handling becomes flags).
   Delete the `[[bin]] musu-startup`. Update the C1 single-entry-point
   (`spawn_musu_startup_open`) to spawn `musu startup open` instead of
   `musu-startup.exe open`. ~1 day human / ~30 min CC.
2. **Point the GUI at `musu` only.** `lib.rs` `musu_startup_path()` → use
   `musu_command_path()` + `["startup","open"]`. Remove the `musu up --json`
   fallback (it was the flicker source); if `musu` is missing, fail honest.
3. **Build pipeline + MSIX.** `build-msix.ps1`: drop `StartupExecutable`
   (musu-startup.exe); the `windows.startupTask` points at `musu.exe` with a
   `startup` arg (or argless service mode). Rebuild = `cargo build --release --bin
   musu` + the tauri build. Two artifacts, not three.
4. **Verify E2E (the step this session skipped):** install/run the real app →
   window opens → fleet lists from the SAME `musu` that the window spawns (no skew)
   → order submits → NO console flicker (GUI spawns `musu startup`, console
   subsystem, but detached/no-window via CREATE_NO_WINDOW). Confirm the
   CREATE_NO_WINDOW flag on the spawn so the CLI child shows no console.

## The flicker fix is independent and worth doing first

Regardless of A/B/C: the spawns from the GUI must use `CREATE_NO_WINDOW`
(Win32 process creation flag) so a console-subsystem `musu` child does NOT pop a
window. The flicker this session was the autostart fallback spawning visible
console procs. Even before full integration, adding `CREATE_NO_WINDOW` to
`spawn_musu_startup_open` and the run_command_with_timeout spawns kills the
flicker. **Do this first — it's a small, high-value fix decoupled from the binary
count.**
