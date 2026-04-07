# MUSU Gateway Capability Map

**Generated**: 2026-04-06
**Last updated**: 2026-04-07 (MUS-714: PTY wrapper + stdin write path verified complete)
**Purpose**: Single-source truth for all live and planned gateway tool surfaces. Informs the next implementation cut.

---

## Capability Surface Overview

Three source modules feed into the planned unified gateway:

| Module | Runtime | Location |
|--------|---------|----------|
| rootless-computer-control | Python / FastMCP (MCP stdio) | `mcp/rootless-computer-control/server.py` |
| musu-terminal-engine | Rust binary / PTY | `musu-terminal-engine/src/main.rs` |
| musu-chat-spy-engine | Rust binary / Win32 UIAutomation | `musu-chat-spy-engine/src/main.rs` |

The unified gateway is **not yet implemented**. `rootless-computer-control/server.py` is the only live MCP surface.

---

## Full Tool Inventory

### rootless-computer-control (Live MCP Server)

| Tool | Capability Class | Status | Gateway Integration Gap | Next Step |
|------|-----------------|--------|------------------------|-----------|
| `get_screen_size` | Sensor | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `get_mouse_location` | Sensor | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `take_screenshot` | Sensor | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `list_windows` | Sensor | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `move_mouse` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `click_screen` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `mouse_down` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `mouse_up` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `drag_mouse` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `type_text` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `press_keys` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `scroll_mouse` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |
| `activate_window` | Actuator | **Live** | Not re-exported via gateway dispatcher | Add to gateway passthrough tool list |

### musu-terminal-engine (PTY Binary — Architecture-defined, No MCP Interface)

| Tool | Capability Class | Status | Gateway Integration Gap | Next Step |
|------|-----------------|--------|------------------------|-----------|
| `musu.pty_spawn(command)` | Actuator | **Live** — `@mcp.tool()` in `rootless-computer-control/server.py`; launches `musu-terminal-engine` binary as subprocess, stores Popen handle keyed by session_id | — | Done (MUS-714) |
| `musu.pty_write(session_id, text)` | Actuator | **Live** — `@mcp.tool()` in `server.py`; writes to subprocess stdin; Rust binary forwards stdin → PTY master via thread loop in `main.rs:160-174` | — | Done (MUS-714) |
| `musu.pty_read(session_id, timeout)` | Sensor | **Live** — `@mcp.tool()` in `server.py`; uses `select()` with configurable timeout to read next JSON snapshot line from subprocess stdout | — | Done (MUS-714) |
| `musu.pty_cleanup(session_id)` | Actuator | **Live** — `@mcp.tool()` in `server.py`; kills and removes session | — | Done (MUS-714) |

### musu-chat-spy-engine (Win32 Spy Binary — Windows-Only, No MCP Interface)

| Tool | Capability Class | Status | Gateway Integration Gap | Next Step |
|------|-----------------|--------|------------------------|-----------|
| `musu.spy_get_snapshot(source)` | Sensor | **Stub** — Windows UIAutomation crawler reads window text and serialises to JSON; no MCP layer | No MCP server; Windows-only; no cross-platform fallback path | Add a thin Python FastMCP tool that invokes the binary via subprocess on Windows or returns `unsupported` on WSL-only nodes |
| `musu.spy_ingest_log(source, text)` | Sensor | **Live** — `@mcp.tool()` in `server.py`; writes to in-memory `_SPY_LOG` dict (keyed by source) | — | Done (MUS-714) |
| `musu.spy_get_snapshot(source)` | Sensor | **Live (WSL)** — `@mcp.tool()` in `server.py`; returns latest entry from `_SPY_LOG`. Win32 UIAutomation variant still deferred (Windows node required) | Win32 path deferred | WSL path done (MUS-714) |

### Unified Gateway Dispatcher (Planned — Not Implemented)

| Component | Capability Class | Status | Gap | Next Step |
|-----------|-----------------|--------|-----|-----------|
| Unified Tool Dispatcher | Both | **Missing** | No `server.py` gateway file exists | Create `mcp/gateway/server.py` that imports rootless-computer-control tools and stubs PTY/spy tools |
| JSON Schema (Command family) | Actuator | **Missing** | No shared schema file | Define `schemas/actuator_tools.json` |
| JSON Schema (Spy family) | Sensor | **Missing** | No shared schema file | Define `schemas/sensor_tools.json` |
| Lightweight Proxy (VS Code / zshrc) | Sensor ingest | **Missing** | No external proxy pushes data to gateway | Prototype a `zshrc` hook that POSTs terminal output to a local gateway socket |

---

## Smallest Hardware-Independent Implementation Cut

**Scope**: Work that can land without any MUS-437 hardware (physical GPU node / 3-machine cluster).

### Recommended Cut: PTY Gateway Wrapper in `rootless-computer-control/server.py`

**Why this cut**: `rootless-computer-control/server.py` is already a live FastMCP MCP server running on WSL. Adding PTY tools as a Python subprocess wrapper over `musu-terminal-engine` binary requires no new infrastructure — only WSL and the already-compiled Rust binary.

**What it delivers**:
1. `pty_spawn(command)` — launches `musu-terminal-engine <command>` as a subprocess; stores the process handle.
2. `pty_read()` — reads the next JSON snapshot line from the subprocess stdout; returns `content` string.
3. `spy_ingest_log(source, text)` — writes to an in-memory dict keyed by source name (pure Python, no Windows dep).
4. `spy_get_snapshot(source)` — returns latest entry from that dict.

**Status (2026-04-07)**: This cut is **complete**. All tools are live in `server.py`.

**Verified**:
- `pty_spawn`, `pty_read`, `pty_write`, `pty_cleanup`, `spy_ingest_log`, `spy_get_snapshot` all registered as `@mcp.tool()`.
- `musu-terminal-engine` binary compiles (`cargo check` clean), release binary present at `target/release/musu-terminal-engine`.
- Stdin write path: Rust `main.rs:160-174` spawns a thread that reads stdin and forwards to PTY master via `write_all`.
- Smoke test: `echo '...' | timeout 3 ./target/release/musu-terminal-engine echo test` — JSON snapshot emitted successfully.

**Constraints (still standing)**:
- `spy_get_snapshot` with Win32 UIAutomation deferred until a Windows execution environment is available.
- Unified gateway dispatcher (`mcp/gateway/server.py`) not yet built — that is TODO item 5.

**Next cut**: Unified gateway dispatcher (TODO item 5).

---

## Gap Summary

| Gap Category | Count | Blocking Factor |
|---|---|---|
| Tools live, not in gateway | 13 | Gateway dispatcher not built yet |
| Tools stubbed, need MCP wrapper | 2 | musu-terminal-engine has no MCP layer |
| Tools missing entirely | 3 | Not implemented in any module |
| Gateway infrastructure missing | 3 | No gateway server, no schemas |

**Total gaps**: 21 items across 4 categories.
