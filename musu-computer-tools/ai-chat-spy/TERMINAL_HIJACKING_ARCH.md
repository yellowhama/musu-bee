# Terminal Hijacking Architecture (PTY Bridge) 🚀

**Target**: Direct text extraction from terminals (WSL, CMD, PowerShell) without heavy images.  
**Philosophy**: "Don't scrape the screen, own the pipe."

---

## 🏗️ The Core Mechanism: PTY Hijacking

To get raw text from an AI chat window or any terminal-based tool, we bypass the GUI rendering layer and sit directly on the **PTY (Pseudo-Terminal) Stream**.

### 🔄 Data Flow Transformation
- **Standard Flow**: `Input` ➔ `Shell` ➔ `Terminal UI` ➔ `Human Eye`
- **MUSU Hijacked Flow**: `Input` ➔ `Shell` ➔ **`[MUSU PTY Bridge]`** ➔ `UI Mirror` ➔ `AI Assistant`

By becoming the terminal emulator ourselves, every single character emitted by the shell (Bash, Zsh, etc.) passes through our Rust backend.

## 🛠️ Implementation Specs (Rust)

### 1. The PTY Engine: `portable-pty`
We use `portable-pty` to handle the heavy lifting of OS-native PTY systems (ConPTY on Windows, /dev/ptmx on Linux).

```rust
// Core hijacking logic
let pty_system = native_pty_system();
let pty_pair = pty_system.openpty(PtySize { rows: 24, cols: 80, ... })?;
let mut cmd = CommandBuilder::new("wsl.exe");
let mut child = pty_pair.slave.spawn_command(cmd)?;
```

### 2. The Noise Filter: ANSI Stripping
Terminals use escape codes for colors (`\x1B[34m`). These are "visual junk" for AI. We must strip them to provide clean context.

```rust
// Using strip-ansi-escapes crate
let clean_bytes = strip_ansi_escapes::strip(&raw_buffer)?;
let clean_text = String::from_utf8_lossy(&clean_bytes);
```

## 🧠 Strategic Value for `musu-functions`

### 1. Token Efficiency (Context Optimization)
- **Image-based**: Requires Vision LLM, uses massive tokens, slow.
- **PTY-based**: Pure string data, minimal tokens, 0.01s latency.

### 2. Semantic Snapshotting (The "Live Eye")
This logic feeds the `ui_mirror` state. When an AI agent calls `get_semantic_snapshot`, it receives the **exact text currently visible in the terminal**, allowing it to understand the user's latest actions or error messages instantly.

### 3. Cross-Platform Consistency
Following the **Bilingual Runtime Architecture**, this system provides a unified text-stream interface regardless of whether the user is on Windows Native or inside WSL2.

---
## 🚀 Next Steps: Integration
1.  **State Mapping**: Store the hijacked stream in a ring-buffer (e.g., last 1000 lines).
2.  **MCP Promotion**: Expose `index.live_terminal` as an MCP tool.
3.  **Auto-Ingest**: Automatically index successful terminal commands into `.musu_dev.db`.

---
*Archived for musu-functions by Stella (Gemini CLI) on 2026-03-31.*
