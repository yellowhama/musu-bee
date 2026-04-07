# MUSU Computer Tools TODO Execution Board

_Last updated: 2026-04-07 (MUS-714: PTY wrapper + stdin write path verified complete)_

## 현재 상태

- Windows bridge baseline: 완료
- helper lifecycle productization: 완료
- WSL interop diagnostics: 완료
- Windows action catalog expansion: 완료
- spec/doc/code sync automation: 완료
- OpenClaw pattern adoption baseline: 부분 완료
- helper service install: 완료
- Windows spawn policy alignment: 완료
- split-host browser boundary: **완료** (MUS-649)
- browser CDP consumer contract: **완료** (MUS-649)
- mus28 smoke runtime prerequisites documented: **완료** (MUS-652)
- unified gateway capability map: **완료** (MUS-656 → `GATEWAY_CAPABILITY_MAP.md`)
- PTY gateway wrapper (pty_spawn, pty_read, pty_write, pty_cleanup): **완료** (MUS-714)
- musu-terminal-engine stdin write path: **완료** (MUS-714)
- spy_ingest_log / spy_get_snapshot (WSL in-memory): **완료** (MUS-714)

## In Progress

_(none)_

## Queued

Priority order based on GATEWAY_CAPABILITY_MAP.md:

1. **[MUS-650] rootless-computer-control MCP smoke test**
   - Verify all 13 live tools against a running FastMCP server
   - Required before promoting any tool to the gateway surface

2. **[MUS-651] Assign Paperclip ownership for musu-terminal-engine and musu-chat-spy-engine**
   - Establish agent assignment so these modules have a clear execution owner

3. ~~**PTY gateway wrapper**~~ **완료** — all stubs live in `server.py`; Rust stdin write path in `main.rs:160-174`

4. **`musu-port`와 browser/network-bound action 연결**
   - Connect browser/CDP surface to musu-port once MUS-650 closes

5. **Unified gateway dispatcher** (`mcp/gateway/server.py`)
   - Build gateway server that imports all live tools and registers PTY/spy stubs
   - Depends on: PTY wrapper (done), MUS-651 ownership assigned

6. **spy_ingest_log HTTP/named-pipe endpoint** (external proxy agents)
   - HTTP or named-pipe ingest endpoint for VS Code / zshrc hook
   - Depends on: gateway dispatcher skeleton
   - Note: in-memory WSL path already done; this is the external push variant

7. ~~**musu-terminal-engine stdin write path**~~ **완료** — stdin → PTY master thread in `main.rs:160-174`; `pty_write` MCP tool live

## Blocked / Deferred

- **Win32 UIAutomation spy_get_snapshot** (native Windows execution) — deferred until Windows node available (not MUS-437 GPU; just any native Windows shell)
- **Lightweight external proxy** (VS Code / zshrc terminal hook) — deferred until gateway ingest endpoint is live

## Done

1. Windows bridge execution baseline
2. Windows bridge action expansion
3. helper lifecycle productization
4. WSL interop diagnostics and evidence pack
5. Windows action catalog expansion
6. spec / doc / code sync automation
7. OpenClaw pattern adoption baseline
8. helper service install
9. Windows spawn policy alignment
10. helper online/runtime proof
11. helper-first interop proof
12. browser CDP unreachable classification proof
13. live browser launch validation proof
14. split-host browser boundary hardening (MUS-649)
15. browser/CDP consumer contract finalization (MUS-649)
16. mus28 smoke runtime prerequisites documented + guard clause (MUS-652)
17. unified gateway capability map + next cut identified (MUS-656)
18. PTY gateway wrapper: pty_spawn, pty_read, pty_write, pty_cleanup live in server.py (MUS-714)
19. musu-terminal-engine stdin write path: Rust thread forwarding stdin → PTY master (MUS-714)
20. spy_ingest_log + spy_get_snapshot (WSL in-memory) live in server.py (MUS-714)
