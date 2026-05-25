# MUSU Node Onboarding (V27)

**Adding another machine to an existing MUSU mesh.** 
For the *first* initial machine setup, refer to [`../QUICKSTART.md`](../QUICKSTART.md). This document assumes you already have a MUSU cloud account (`musu.pro`).

## Prerequisites

- Windows, macOS, or Linux
- (Optional but Recommended) Tailscale installed and connected to the same network for secure mesh routing.

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

### 3. Login to musu.pro (Required for Auto-Discovery)

To enable mDNS local discovery and cloud routing, you must authenticate your node.

```bash
musu login
```
*Follow the OAuth prompt in your browser. This will save a secure token to `~/.musu/token`.*

### 4. Start the Bridge

Start the local bridge. The bridge automatically assigns a dynamic port (saved in `~/.musu/services/bridge.json`) and begins broadcasting its presence via mDNS to other local nodes.

```bash
musu bridge
```
*(In production, this is usually run as a background service via systemd or Windows Scheduled Tasks. `musu peer register` can set this up for you).*

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
This automatically configures the node to accept delegated tasks and starts a platform service to keep it running across reboots.
