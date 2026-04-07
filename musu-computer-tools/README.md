# MUSU Computer Tools (The AI Body) 🤖🦾

**Purpose**: This directory serves as the practical "Body" for AI Agents (Gemini CLI, Claude Code, etc.) to perceive and control the host operating system via the **MUSU MCP Bridge**.

---

## 🏛️ Core Philosophy: AI-Native OS Control
Standard AI agents are restricted to sandboxed environments. `musu-computer-tools` shatters this boundary by providing standardized "Sensors" and "Actuators" that follow the **Bilingual Runtime Architecture**.

### 1. The Sensors (Eyes & Context) 👁️
Tools that allow the AI to "perceive" the user's current environment.
- **`ai-chat-spy`**: Extracts raw text and semantic snapshots from external AI provider windows (Ollama, LM Studio, Web Browsers).
- **`musu-indexer`**: Provides long-term memory by indexing the entire codebase and work history into a queryable FTS5 database.

### 2. The Actuators (Hands & Voice) 🖐️
Tools that allow the AI to "interact" with the OS and execute tasks.
- **`musu-terminal-engine`**: A high-performance PTY hijacking system (Rust-based) that gives AI direct control over WSL and Windows shells.
- **`musu-port`**: Native network management to bridge AI services across ports and OS boundaries.

---

## 🛰️ Integration with MCP (Capability Routing)
When an agent like **Gemini CLI** connects to MUSU, it doesn't just "chat." It gains access to these tools through standardized MCP endpoints:

| Tool Group | Capability Provided |
| :--- | :--- |
| **Search** | `search_codebase`, `sync_workspace` |
| **Observe** | `get_semantic_snapshot`, `list_windows` |
| **Control** | `run_hijacked_command`, `resize_terminal` |
| **Log** | `log_action`, `get_recent_results` |

## 🏛️ Strategic Advantage
By centralizing these tools in `musu-computer-tools`, we ensure:
1. **Zero-Latency Ingestion**: Using memory-mapped SQLite and Rust-based PTY engines.
2. **Bilingual Mastery**: Seamlessly switching between Windows `.exe` and Linux binaries to bypass filesystem bottlenecks (WSL 9P bridge).
3. **Auditability**: Every action taken by the AI "body" is recorded in the `work_log` table for human oversight.

## Current Handoff
- Current master plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/MASTER_PLAN.md`
- Current state:
  - `/home/hugh51/musu-functions/musu-computer-tools/CURRENT_STATE.md`
- Execution board:
  - `/home/hugh51/musu-functions/musu-computer-tools/TODO_EXECUTION_BOARD.md`
- Detailed plan index:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/README.md`
- Bridge dogfood proof:
  - `/home/hugh51/musu-functions/musu-computer-tools/BRIDGE_DOGFOOD_PROOF_2026-04-02.md`
- Windows/WSL interop status and next-session TODO:
  - `/home/hugh51/musu-functions/musu-computer-tools/WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
- Windows bridge standard flow:
  - `/home/hugh51/musu-functions/musu-computer-tools/WINDOWS_BRIDGE_STANDARD.md`
- Windows bridge detailed plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/01_windows_bridge_execution_plan.md`
- Windows bridge action expansion plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/02_windows_bridge_action_expansion.md`
- Windows helper lifecycle plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/03_helper_lifecycle_productization.md`
- WSL interop diagnostics plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/04_wsl_interop_diagnostics_and_evidence_pack.md`
- Windows action catalog expansion plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/05_windows_action_catalog_expansion.md`
- OpenClaw pattern adoption plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/07_openclaw_pattern_adoption_and_windows_host_split.md`
- Windows helper service install plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/08_windows_helper_service_install.md`
- Windows spawn policy alignment plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/09_windows_spawn_policy_alignment.md`
- Split-host browser boundary plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/10_split_host_browser_boundary.md`
- Browser CDP consumer contract plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/11_browser_cdp_consumer_contract.md`
- Live browser launch validation plan:
  - `/home/hugh51/musu-functions/musu-computer-tools/plans/12_live_browser_launch_validation.md`
- Live browser validation proof:
  - `/home/hugh51/musu-functions/musu-computer-tools/BROWSER_CDP_LIVE_VALIDATION_PROOF_2026-04-02.md`
- Windows bridge backlog:
  - `/home/hugh51/musu-functions/musu-computer-tools/TODO.md`
- Windows action catalog:
  - `/home/hugh51/musu-functions/musu-computer-tools/WINDOWS_ACTION_CATALOG.md`
- Windows browser action catalog:
  - `/home/hugh51/musu-functions/musu-computer-tools/WINDOWS_BROWSER_ACTION_CATALOG.md`
- Windows browser CDP standard:
  - `/home/hugh51/musu-functions/musu-computer-tools/WINDOWS_BROWSER_CDP_STANDARD.md`
- Windows browser launch runbook:
  - `/home/hugh51/musu-functions/musu-computer-tools/WINDOWS_BROWSER_LAUNCH_RUNBOOK.md`
- Browser split-host inventory:
  - `/home/hugh51/musu-functions/musu-computer-tools/BROWSER_SPLIT_HOST_INVENTORY.md`
- Index sync runbook:
  - `/home/hugh51/musu-functions/musu-computer-tools/INDEX_SYNC_RUNBOOK.md`
- Index sync status:
  - `/home/hugh51/musu-functions/musu-computer-tools/INDEX_SYNC_STATUS.md`
- WSL interop probe:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/probe-interop.sh`
- WSL browser CDP probe:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/probe-browser-cdp.sh`
- WSL browser bootstrap runner:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-browser-cdp-bootstrap.sh`
- Generic Windows action runner:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-windows-action.sh`
- WSL runner:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-musu-port-smoke.sh`
- WSL native smoke runner:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-musu-port-native-smoke.sh`
- Windows helper launcher:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/start-helper.cmd`
- Windows helper install:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/install-helper.cmd`
- Windows helper status:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/status-helper.cmd`
- Windows helper stop:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/stop-helper.cmd`
- Windows helper restart:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/restart-helper.cmd`
- Windows helper uninstall:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/uninstall-helper.cmd`
- WSL helper status:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/status-helper.sh`
- WSL interop diagnostics:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/diagnose-interop.sh`
- WSL helper selftest:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-helper-selftest.sh`
- Windows helper selftest:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-helper-selftest.cmd`
- Windows one-shot launcher:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-musu-port-smoke.cmd`
- Windows native smoke launcher:
  - `/home/hugh51/musu-functions/musu-computer-tools/scripts/windows-bridge/run-musu-port-native-smoke.cmd`

---
*Maintained by yellowhama & Stella (AI Architect). This is where the AI becomes real.*
