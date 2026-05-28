# Microsoft Store / MSIX Audit for Current `musu` Install and Runtime Structure

Date: 2026-05-27
Repo: `musu-bee`
Scope: Audit the current Windows install and runtime behavior of `musu` against a Microsoft Store / MSIX distribution target.

## Executive Summary

`musu` is **not currently Store/MSIX-ready as-is**.

The biggest blockers are structural, not cosmetic:

1. The current Windows install path is a **PowerShell bootstrapper** that downloads an unsigned binary from GitHub, executes `musu install`, copies binaries into `~/.musu/bin`, and mutates the user's PATH.
2. The installed runtime depends on a **user-level Scheduled Task** to launch `musud` on logon.
3. The bridge exposes a broad **long-lived local HTTP control surface** with file serving, WebDAV, RPC command execution, PTY shells, pairing, sync, clipboard monitoring, and cloud heartbeat/discovery.
4. The product performs **self-update and self-swap of its own binaries** under `~/.musu/bin`, which is incompatible with the Store-managed update model.
5. The product stores almost all runtime state in `~/.musu/` rather than in package-managed app data locations.

The good news is that a Store/MSIX path still looks plausible if `musu` is treated as a **repackaged product variant**, not as a simple wrapper around the existing installer.

The most realistic target is:

- a **packaged desktop app** with package identity
- a **packaged background startup model** instead of Task Scheduler
- **Store-managed updates only** in Store builds
- a **packaged bridge binary** run directly from the package, not copied into `~/.musu/bin`
- a deliberate decision on whether the remote admin surfaces are included in the Store build

## Evidence Reviewed

### Windows install entrypoint

- Root installer: [install.ps1](../install.ps1)

Observed behavior:

1. Downloads the latest Windows release asset from GitHub Releases.
2. Executes the downloaded `musu.exe install`.
3. Adds `C:\Users\<user>\.musu\bin` to the user's PATH.

This is a direct-download bootstrapper model, not a package-managed install model.

### CLI surface and install/runtime entrypoints

- CLI root: [musu-rs/src/main.rs](../musu-rs/src/main.rs)
- Install module: [musu-rs/src/install/mod.rs](../musu-rs/src/install/mod.rs)
- Install runner: [musu-rs/src/install/runner.rs](../musu-rs/src/install/runner.rs)

Observed behavior:

1. `musu install` seeds `~/.musu/`.
2. It copies the running `musu` binary into `~/.musu/bin/musu(.exe)`.
3. It attempts to copy `musud` into `~/.musu/bin/musud(.exe)`.
4. It writes `bridge.env`, `update.toml`, `musu.toml`, and usage docs into `~/.musu/`.
5. It applies the initial SQLite schema into `~/.musu/db/musu.db`.
6. It registers a platform service.

### Windows platform service model

- Windows registrar: [musu-rs/src/install/platform/windows.rs](../musu-rs/src/install/platform/windows.rs)
- Platform abstraction: [musu-rs/src/install/platform/mod.rs](../musu-rs/src/install/platform/mod.rs)

Observed behavior:

1. Default Windows install path registers a **Scheduled Task** `Musu\musud`.
2. The task runs on **user logon** with `InteractiveToken`.
3. `--boot-start` Windows Service mode is declared, but currently **refuses to run** and is explicitly deferred.
4. Peer worker processes can also be registered as separate Scheduled Tasks.

### Runtime bridge behavior

- Bridge entry: [musu-rs/src/bridge/mod.rs](../musu-rs/src/bridge/mod.rs)
- Bridge config: [musu-rs/src/bridge/config.rs](../musu-rs/src/bridge/config.rs)
- Route surface: [musu-rs/src/bridge/handlers/mod.rs](../musu-rs/src/bridge/handlers/mod.rs)

Observed behavior:

1. The bridge binds a local TCP listener, defaulting to `127.0.0.1`.
2. It creates and uses local SQLite databases and other state in `~/.musu/`.
3. It starts clipboard monitoring automatically.
4. It can advertise/discover peers with mDNS.
5. It can register itself with `musu.pro` and heartbeat every 60s.
6. It can start file sync watchers if shares are configured.
7. It can run with self-generated TLS certificates under `~/.musu/tls/`.

### Data and configuration layout

Representative storage paths:

- `~/.musu/bridge.env`
- `~/.musu/token`
- `~/.musu/musu.toml`
- `~/.musu/update.toml`
- `~/.musu/db/musu.db`
- `~/.musu/shares.toml`
- `~/.musu/manual_peers.toml`
- `~/.musu/nodes.cache.json`
- `~/.musu/services/*.json`

Relevant sources:

- [musu-rs/src/install/runner.rs](../musu-rs/src/install/runner.rs)
- [musu-rs/src/cloud/token.rs](../musu-rs/src/cloud/token.rs)
- [musu-rs/src/install/shares.rs](../musu-rs/src/install/shares.rs)
- [musu-rs/src/peer/discovery.rs](../musu-rs/src/peer/discovery.rs)
- [musu-rs/src/bridge/services.rs](../musu-rs/src/bridge/services.rs)

### Self-update and binary replacement

- Auto-update: [musu-rs/src/install/auto_update.rs](../musu-rs/src/install/auto_update.rs)
- Staged swap: [musu-rs/src/install/staged_swap.rs](../musu-rs/src/install/staged_swap.rs)
- Update endpoint: [musu-rs/src/bridge/handlers/system_update.rs](../musu-rs/src/bridge/handlers/system_update.rs)

Observed behavior:

1. `musu auto-update` downloads release artifacts from GitHub.
2. It writes staged binaries into `~/.musu/bin`.
3. It performs `.new` / `.bak` swap logic on the local executable.
4. It exposes `POST /api/system/update` to trigger a detached self-update run.

### Remote control and file exposure surfaces

Representative sources:

- RPC exec: [musu-rs/src/bridge/handlers/rpc.rs](../musu-rs/src/bridge/handlers/rpc.rs)
- PTY shell: [musu-rs/src/bridge/handlers/pty.rs](../musu-rs/src/bridge/handlers/pty.rs)
- File API: [musu-rs/src/bridge/handlers/files.rs](../musu-rs/src/bridge/handlers/files.rs)
- WebDAV: [musu-rs/src/bridge/handlers/webdav.rs](../musu-rs/src/bridge/handlers/webdav.rs)

Observed behavior:

1. Remote command execution is supported.
2. Remote interactive PTY is supported.
3. Shared directories can be listed, read, written, created, and deleted over HTTP.
4. WebDAV is exposed for mounted file access.

This matters less for mechanical MSIX packaging and more for Store review, security review, and product positioning.

## Current Architecture, Summarized

The current Windows product behaves like a self-managed operator runtime:

1. Download a release binary from GitHub.
2. Execute the binary as an installer.
3. Copy binaries into a per-user operator home.
4. Register a logon-start Scheduled Task.
5. Persist product state in `~/.musu`.
6. Run a long-lived local bridge process with broad machine-control features.
7. Update itself by replacing its own binaries from GitHub.

That is coherent for a direct-download tool.
It is not coherent with the normal Microsoft Store / MSIX value proposition, where package installation, identity, update, and startup are expected to be package-managed.

## Store / MSIX Compatibility Assessment

## 1. Install bootstrapper model

Status: **Incompatible as-is**

Current behavior:

- `install.ps1` downloads a release asset from GitHub and executes it.
- `musu install` then copies binaries and configures the machine.

Why this is a problem:

- Store/MSIX installs are package-driven, not bootstrap-script-driven.
- A Store build should not depend on a raw PowerShell one-liner, GitHub download, or post-download executable bootstrap.

What must change:

- The Store build must package the runnable binaries directly.
- The Store build must not require `install.ps1`.

## 2. PATH mutation

Status: **Incompatible as-is**

Current behavior:

- `install.ps1` appends `~/.musu/bin` to the user PATH.

Why this is a problem:

- Package installs should not rely on mutating arbitrary user PATH state as the primary entry mechanism.
- The current model assumes the installed executable lives in a user-writable copy location.

What must change:

- The Store build should expose app entry through package entrypoints.
- If a CLI is required, it needs a package-aware execution strategy rather than user PATH patching.

## 3. Copying the running binary into `~/.musu/bin`

Status: **Incompatible as-is**

Current behavior:

- `musu install` copies the running executable into `~/.musu/bin/musu.exe`.
- It also attempts to copy `musud.exe` into `~/.musu/bin`.

Why this is a problem:

- MSIX packages are expected to run packaged binaries directly.
- The current design turns the package into a bootstrapper whose main job is to create a second install outside the package.

What must change:

- The Store build should run packaged binaries from the installed package layout.
- `~/.musu/bin` should not be the primary executable home for the Store variant.

## 4. Scheduled Task startup model

Status: **Incompatible as-is**

Current behavior:

- The default Windows install path uses a user-level Scheduled Task (`Musu\musud`) triggered on logon.

Why this is a problem:

- That startup model is outside normal package-managed startup semantics.
- The current code has no AppX/MSIX manifest, no startup-task declaration, and no packaged startup flow.

What must change:

- Replace the Scheduled Task path in the Store build with a package-supported startup model.
- The likely candidate is a packaged desktop app startup flow, not a raw Task Scheduler registration.

## 5. Windows Service path

Status: **Not a viable near-term escape hatch**

Current behavior:

- `--boot-start` exists on paper but currently bails out.

Why this matters:

- Even if implemented, a boot-start service would be a materially different install and privilege model from the current no-admin logon-start path.
- It would also push the Store build further toward a privileged system-management product rather than a simple desktop app.

Conclusion:

- Do not treat boot-start service support as the Store migration plan.

## 6. Self-update and self-binary swap

Status: **Incompatible as-is**

Current behavior:

- `musu auto-update` downloads releases from GitHub.
- It stages and swaps `~/.musu/bin/musu(.exe)`.
- The bridge can trigger this remotely via `/api/system/update`.

Why this is a problem:

- Store builds are expected to receive updates from the Store, not from the app replacing its own packaged binaries.
- The current update model assumes package ownership of the executable lives outside the package and is mutable by the app itself.

What must change:

- Disable self-update in the Store build.
- Disable or stub `/api/system/update` in the Store build.
- Rely on Store-managed package updates.

## 7. Data storage location

Status: **Technically workable, but misaligned**

Current behavior:

- Runtime state is spread across `~/.musu/` under the user profile.

Why this is a problem:

- It bypasses the data model Store/MSIX users expect.
- Uninstall semantics, reset semantics, and package-owned state become unclear.
- It preserves the current operator-runtime shape but loses most of the package-management benefits.

What should change:

- For a Store build, move package-owned runtime state into package-appropriate app data locations.
- If `~/.musu/` is intentionally preserved for portability, document it as an explicit compatibility choice rather than an accidental carry-over.

## 8. Broad local bridge surface

Status: **Packaging possible, Store review risk high**

Current behavior:

- Local HTTP bridge
- WebDAV
- File sync
- mDNS discovery
- Cloud registration
- Clipboard monitoring
- Remote command execution
- Remote PTY shell

Why this matters:

- These features do not automatically make MSIX impossible.
- They do make Store positioning, disclosure, startup consent, and security review much more sensitive.

Assessment:

- Mechanically, a packaged desktop app can still host local listeners and run full-trust code.
- Product-review-wise, this is a higher-risk app category than a normal desktop utility.

This is not a packaging blocker by itself, but it raises certification and product-policy risk.

## 9. Missing packaging assets

Status: **No existing Store/MSIX foundation in repo**

Observed:

- No `.wapproj`
- No `Package.appxmanifest`
- No MSIX packaging project
- No Store submission assets
- No startup-task manifest declarations

Conclusion:

- Store/MSIX support has not started yet in the current tree.

## 10. Documentation drift

Status: **Secondary issue, but relevant**

Observed:

- `INSTALL.md` still describes a Python-era installer and states there is no top-level `musu` CLI, which is no longer true.
- The current Rust install path is different from the document.

Why it matters:

- A Store migration will need a clean product story.
- The current docs are not yet a reliable source of truth for installer/runtime behavior.

Conclusion:

- The migration should use code as ground truth and then rewrite Windows docs after the packaging shape is decided.

## Recommended Store Build Strategy

The best near-term strategy is **not** "wrap the current installer in MSIX".

The best strategy is:

1. **Create a Store-specific product variant**
2. **Run packaged binaries directly**
3. **Disable self-update**
4. **Replace Scheduled Task startup with package-supported startup**
5. **Move or adapt runtime state handling**
6. **Decide whether remote admin features belong in the Store build**

### Practical target architecture

Recommended target:

1. Package `musu.exe` and `musud.exe` inside the app package.
2. Remove `install.ps1` from the Store path entirely.
3. Remove `copy_running_binary()` and `copy_sibling_musud()` from the Store path.
4. Replace Task Scheduler startup with a packaged startup mechanism.
5. Make Store builds read a `store` or `msix` distribution mode flag.
6. In that mode:
   - disable `auto-update`
   - disable `/api/system/update`
   - do not write `update.toml`
   - do not mutate PATH
   - do not assume `~/.musu/bin` contains the executable

### Recommended packaging posture

Best first attempt:

- Package the **bridge runtime and CLI** as a packaged desktop app.
- Keep the web UI and other sidecars out of the first Store submission unless they are required.
- Minimize the first Store build to the smallest product slice that still provides clear user value.

This reduces packaging surface and certification risk.

## Recommended Code Changes Before Packaging Work Starts

## Priority 0

1. Add a distribution mode abstraction:
   - direct-download
   - store-msix

2. Branch install/runtime behavior on that mode.

3. Introduce a package-aware executable resolver so Store builds run packaged binaries instead of `~/.musu/bin`.

4. Make self-update opt-out mandatory in Store mode.

## Priority 1

1. Refactor startup registration behind a higher-level startup policy abstraction.
2. Separate data path resolution from legacy `~/.musu` assumptions.
3. Add a Store-safe status command that does not instruct users to run the bootstrap installer or restart Task Scheduler tasks.

## Priority 2

1. Rewrite Windows install docs from code truth.
2. Add packaging assets and submission metadata.
3. Review remote-control endpoints for Store suitability and disclosure.

## Go / No-Go Assessment

## What is possible without redesign

- Very little.
- A superficial MSIX wrapper around today's installer would preserve the wrong architecture.

## What is possible with moderate redesign

- A packaged per-user desktop runtime with background startup and Store-managed updates looks feasible.

## What is risky even after redesign

- The product's machine-control surface may still complicate Store acceptance.

## Final Verdict

**Go forward with Store/MSIX only if the team is willing to build a Store-specific runtime path.**

Do **not** try to submit the current direct-download installer model unchanged.

The core blockers are:

1. bootstrap install model
2. executable self-copy into `~/.musu/bin`
3. Task Scheduler startup
4. self-update and self-swap
5. package-external state model

The good path is still real, but it starts with an architecture split, not with packaging tooling.

## Microsoft References

- Microsoft code signing options:
  https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

- Packaged desktop app distribution through Microsoft Store:
  https://learn.microsoft.com/en-us/windows/apps/distribute-through-store/how-to-distribute-your-win32-app-through-microsoft-store

- Packaged desktop apps and package identity:
  https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/

- StartupTask API:
  https://learn.microsoft.com/en-us/uwp/api/windows.applicationmodel.startuptask

- MSIX packaging overview:
  https://learn.microsoft.com/en-us/windows/msix/overview
