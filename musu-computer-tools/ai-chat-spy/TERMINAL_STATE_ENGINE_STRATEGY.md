# Terminal State Engine Strategy (Embed vs. Hijack) 🧠

**Target**: Integrating world-class terminal emulation logic into MUSU for zero-latency text extraction.  
**Inspiration**: `Zellij` (State Management), `Alacritty` (Parsing Engine).

---

## 🛰️ The Core Mission
Transform the terminal from a "black box" into a **Queryable State Machine**. Instead of scraping pixels, we maintain a live "Grid" of text in memory that AI can query instantly.

## ⚖️ Strategy Comparison: Full Binary vs. Core Library

### Option A: Sidecar Zellij (Embedding the Full App)
- **Method**: Package the `zellij` binary inside MUSU and run it as a background process.
- **Pros**: Instant access to advanced multiplexing (tabs, panes).
- **Cons**: Large binary size (+30MB), complex IPC to extract buffer, "tug-of-war" over UI control.

### Option B: Alacritty Core (The "MUSU Way") 🏆
- **Method**: Use `alacritty_terminal` as a Rust library (crate) inside MUSU's backend.
- **Pros**: Lightweight, total control over state, pure text grid output, zero UI overhead.
- **Cons**: Requires custom implementation of the PTY-to-Grid bridge.

---

## 🛠️ Implementation Blueprint: The "Alacritty-MUSU" Bridge

Following the **Bilingual Runtime Architecture**, we decouple the terminal backend from the UI display.

### 1. The PTY Layer (Input/Output)
Use `portable-pty` to spawn shells (`wsl.exe`, `powershell.exe`).

### 2. The Terminal Engine (State)
Feed the raw PTY byte stream into `alacritty_terminal`'s state machine. It automatically handles:
- **ANSI Parsing**: Translates `\x1B[34m` into "Blue Text".
- **Grid Management**: Manages rows, columns, and scrollback.
- **Surgical Access**: Allows us to read specific lines or the entire screen as a `String`.

### 3. The AI Interface (Recall)
Expose the grid via Tauri/MCP:
- `index.get_terminal_view`: Returns the visible screen.
- `index.get_terminal_history`: Returns the last N lines of output.

---

## 🧠 Strategic Value: Why this wins?

1. **Zero-Delay Snapshots**: Since the grid is always live in memory, `get_semantic_snapshot` never times out. It's just a memory read.
2. **True Situational Awareness**: AI can "watch" the terminal for specific patterns (e.g., build failure, server started) and trigger actions autonomously via `index.watch`.
3. **Bilingual Mastery**: High-speed terminal access regardless of host OS, bypassing the slow 9P bridge in WSL2.

---
## 🚀 Next Phase: POC
Build a minimal Rust prototype linking `portable-pty` with `alacritty_terminal` to prove sub-millisecond text extraction on `/mnt/f/` projects.

---
*Authored by Stella (Gemini CLI) for yellowhama. 2026-03-31.*
