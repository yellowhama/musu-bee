# MUSU Node Onboarding (V27)

**Adding another machine to an existing MUSU mesh.** 
For the *first* initial machine setup, refer to [`../QUICKSTART.md`](../QUICKSTART.md). This document assumes you already have a MUSU cloud account (`musu.pro`).

## Prerequisites

- Windows, macOS, or Linux
- (Optional but Recommended) Tailscale installed and connected to the same network for secure mesh routing.

Windows distribution note:
- This page primarily describes the current direct-download/operator runtime flow.
- The intended Windows product direction is a Store/MSIX packaged runtime with package-managed install/update/startup.
- Do not assume packaged Windows builds will reuse raw Scheduled Task setup or MUSU-managed self-update.
- Reference: [`STORE_MSIX_AUDIT_2026_05_27.md`](STORE_MSIX_AUDIT_2026_05_27.md), [`PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`](PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md)

## Quick Start (5 minutes)

### 1. Download or Build `musu-rs`

MUSU V27 is a single-binary architecture. You no longer need Python, virtual environments, or Node.js to run the node itself.

You can download the pre-compiled binary from the release page, or build it from source:

```bash
git clone https://github.com/yellowhama/musu-bee.git ~/musu-bee
cd ~/musu-bee/musu-rs
cargo build --release
```

### 2. Install and Initialize

Run the installation command. This sets up your `~/.musu/` directory and creates the initial SQLite schema.

```bash
# For built source
./target/release/musu install
```

### 3. Connect this machine (`musu up`)

To enable mDNS local discovery and cloud routing, this machine must be linked to
your MUSU account. The recommended path starts the bridge **and** the sign-in in
one step:

```bash
musu up
```

When this machine has no account token yet, `musu up` (on an interactive
terminal) starts the device-flow login automatically: it prints a code and opens
`https://musu.pro/device?code=...`. **Approve it in the browser** (you must
already be signed in to musu.pro), and the token is saved to `~/.musu/token` and
the node is registered. The MUSU Desktop app does the same on launch (no terminal
needed) — see
[`DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md`](DESKTOP_BRIDGE_ONBOARDING_SPEC_AND_ROADMAP_2026_06_09.md).

> Device-flow (RFC 8628), not OAuth-redirect: the code originates on THIS
> machine because the token must land on this machine; the browser only approves.
> The poll is a `POST /api/v1/auth/device` with the `device_code` in the body
> (the legacy `GET ?device_code=` form is deprecated). Login is live on musu.pro.

If you prefer to sign in without starting the bridge, run `musu login` instead;
in non-interactive contexts (CI, service/systemd, `--json`) auto-login is skipped
by design and you must run `musu login` explicitly.

### 4. Start the Bridge (if you didn't use `musu up`)

`musu up` already starts the bridge. To run it standalone: the bridge
automatically assigns a dynamic port (saved in `~/.musu/services/bridge.json`)
and broadcasts its presence via mDNS to other local nodes.

```bash
musu bridge
```
*(In production, direct-download builds usually run this via a platform service such as systemd or Windows Scheduled Tasks. Store/MSIX packaged Windows builds need a package-aware startup path instead of the raw Scheduled Task/bootstrap model.)*

### 5. Verify Discovery

On your main machine (or the new node), check if the fleet sees each other:

```bash
musu discover
# or
musu status
```

### 6. Register as a Worker Peer (Optional)

If this node is meant to process tasks (e.g., Ollama GPU worker, script runner), register it:

```bash
musu peer register --type ollama --start "ollama serve" --name "my-gpu-worker"
```
This automatically configures the node to accept delegated tasks and starts a platform service to keep it running across reboots on direct-download builds. Store/MSIX packaged Windows builds must use a package-aware startup model instead.
