# Reference Analysis: OpenClaw & Computer Use 🐾💻

**Source**: `https://github.com/openclaw/openclaw`  
**Date**: 2026-03-31  
**Lead Strategist**: yellowhama  
**Engineer**: Stella (Gemini CLI)

---

## 🌟 Overview
OpenClaw is a self-hosted autonomous AI agent framework. Its "Computer Use" philosophy is built on **Stateful Context** and **Native OS Mastery**, moving beyond simple "Chat" to proactive "Execution".

## 🏗️ Core Architectural Patterns for Computer Use

### 1. The ACP (Agent Client Protocol)
OpenClaw defines a formal protocol for agents to interact with "Runtimes" (Terminal, Browser, Desktop). 
- **acpx**: A headless client that manages stateful process lifecycles.
- **Session Management**: Unlike raw shell calls, ACP maintains context across multiple turns.

### 2. Intelligent Process Spawning (`windows-spawn.ts`)
This is a masterclass in **Bilingual Runtime** engineering.
- **Wrapper Resolution**: It knows how to look "inside" Windows `.cmd` or `.bat` shims to find the real `node.exe` or binary.
- **Path Mastery**: Implements its own PATH resolution to bypass slow OS calls and ensure the agent hits the right executable.
- **Shell Fallback**: Carefully manages when to use a raw `spawn` vs. a `shell: true` call to prevent command injection and ensure performance.

### 3. Multi-Sensor Observation
OpenClaw uses a "Node Layer" architecture:
- **Browser Node**: Uses Chrome DevTools Protocol (CDP) for high-fidelity DOM control.
- **Desktop Node**: Integrates with OS tray and accessibility APIs for window management.
- **Audit Chain**: Every command and state change is recorded in a cryptographically signed(?) or at least stable "Audit Chain" for post-mortem analysis.

---

## 🛠️ Strategic Integration for `musu-computer-tools`

Based on OpenClaw's architecture, we should adopt these "Pro" patterns:

1.  **Stateful Shells**: Instead of one-off `subprocess.run`, we should move towards the `acpx` model where the terminal state is preserved in a "Session".
2.  **Strict Path Resolution**: Use our `musu-indexer` to help the spawning logic find the **absolute best** executable path, especially in WSL/Windows hybrid environments.
3.  **Audit-First Design**: Ensure our "Mechanical Logging" (from Task 2) matches OpenClaw's "Audit Chain" philosophy—making the AI's actions 100% transparent and reproducible.

---
## 🏛️ Reference File Mapping
- **Process Logic**: `extensions/acpx/src/runtime-internals/process.ts`
- **Windows Mastery**: `src/plugin-sdk/windows-spawn.ts`
- **Agent Protocol**: `docs.acp.md` (Formal spec)

---
*Analyzed by Stella for the MUSU-Functions Ecosystem.*
