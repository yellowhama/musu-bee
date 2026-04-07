# Unified MUSU Gateway Architecture: The AI God Mode 🏛️🕵️‍♂️⚔️

**Objective**: Create a single, unified MCP Server ("The Gateway") that provides both **Active Control (Actuators)** and **Passive Observation (Sensors)** capabilities to AI agents.

---

## 🏗️ The Unified Brain Concept
Instead of splitting tools into separate servers, MUSU provides a unified interface. This allows AI agents to observe external human actions and immediately execute corrective or supportive actions in a private controlled environment.

##  famílias de ferramentas: Two Skill Sets

### 1. Active Control (The Commander ⚔️)
Tools for AI to spawn and control its own processes within the MUSU environment.
- **`musu.pty_spawn(command)`**: Spawns a background terminal (WSL/Windows) owned by the AI.
- **`musu.pty_write(text)`**: AI "types" into its controlled terminal.
- **`musu.pty_read()`**: AI reads the real-time text grid of its owned terminal.
- **Use Case**: Running builds, executing tests, deploying code without user intervention.

### 2. Passive Observation (The Spy 🕵️‍♂️)
Tools for AI to observe what the human user is doing in external environments (VS Code, Windows Terminal).
- **`musu.spy_ingest_log(source, text)`**: Ingests raw text pushed from external proxy agents (e.g., a MUSU extension inside VS Code).
- **`musu.spy_get_snapshot(source)`**: AI retrieves the latest 500 lines of history from a human-controlled session.
- **Use Case**: Understanding error messages in the user's IDE, monitoring human progress, providing proactive help.

---

## 🚀 Strategic Advantage: The "God Mode" Loop

By unifying these tools, we enable a superior AI reasoning loop:

1.  **Sense**: AI calls `spy_get_snapshot("vscode")` and sees a build error the user just encountered.
2.  **Think**: AI analyzes the error and determines the missing dependency.
3.  **Act**: AI calls `pty_spawn("npm install ...")` in a private MUSU terminal to verify the fix.
4.  **Confirm**: AI tells the user: "I saw your build failed; I've already tested the fix in the background. Here is the solution."

## 🏛️ Deployment Model: The Trojan Horse 🐎
- **Gateway**: One centralized Python/Rust MCP Server process.
- **Internal Workers**: High-performance PTY engines (`musu-terminal-engine`).
- **External Proxy**: Lightweight "ingest-only" clients installed inside VS Code or `.zshrc` that push data to the Gateway via local sockets.

---
## 📐 Roadmap
- [ ] Implement the **Unified Tool Dispatcher** in `server.py`.
- [ ] Standardize the **JSON Schema** for both Command and Spy families.
- [ ] Develop the **Lightweight Proxy** for external terminal hijacking.

---
*Authored by Stella (Gemini CLI) for yellowhama. 2026-03-31.*
