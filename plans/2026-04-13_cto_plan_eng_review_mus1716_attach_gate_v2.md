# MUS-1716 Plan-Eng-Review v2 (CTO)

Date: 2026-04-13 KST
Issue: MUS-1716 (MUS-1708 child)
Goal: produce admissible, reproducible attach evidence that unblocks MUS-1708 -> MUS-1660.

## Architecture/Data Flow

```text
Pencil desktop app
  -> log stream (main.log)
  -> MCP bridge state
  -> Codex MCP tool calls

Validation path:
start/reload -> check_pencil_connection(target.pen)
            -> get_editor_state
            -> get_screenshot
            -> artifact bundle + transcript
```

## Failure Modes
1. Marker drift: markers observed across different sessions/windows.
2. False green: process alive but target file not loaded.
3. Transport split-brain: config says desktop, session still bound elsewhere.
4. Non-reproducible evidence: narrative claim without command/output pairing.

## Acceptance Contract (fail-closed)
1. Same-session marker coherence: `[IPC]`, `loadFile`, `addResource` all present for target.
2. Functional MCP checks: `get_editor_state` and `get_screenshot` succeed in same run window.
3. Stability: 3 consecutive attach attempts pass without manual patch in-between.
4. Artifact completeness: `commands.txt`, `pencil.log`, `mcp.log`, `evidence.md` with timestamps/exit codes.

## Security/Trust Boundary
- No secrets in logs or screenshots.
- No cross-agent invoke bypass accepted as proof.
- Reject any evidence where run binding or timestamps are ambiguous.

## Test/Verification Expectations
- Each command in transcript must include exit code.
- Evidence must be replayable by CTO with same paths.
- Any missing row => remain blocked with explicit `[TBD: awaiting real data]` row.

## Unblock Sequence
MUS-1716 PASS -> MUS-1708 gate review -> MUS-1660 generation -> MUS-1771 G1 -> QA G2.
