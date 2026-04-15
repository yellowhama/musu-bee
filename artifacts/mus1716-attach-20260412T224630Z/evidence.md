# MUS-1716 Evidence (Blocked)

- Artifact directory: /home/hugh51/musu-functions/artifacts/mus1716-attach-20260412T224630Z
- Contract source: CTO harmonization comment a8a3ba50-e801-4548-9b84-16148197cbc5
- Result: BLOCKED (cannot establish deterministic same-session attach for mus1644)

## What Passed
- Cancel stale run lock: POST /api/heartbeat-runs/2b9bfecc-8eff-4ac4-97e7-f9733dc8204a/cancel -> 200
- Issue checkout after cancel: POST /api/issues/74319b32-7012-4aab-9347-afc7b616bdba/checkout -> 200

## What Failed
- pencil/get_editor_state failed twice with WebSocket not connected
- Runtime drift: active Pencil main process switched to mus1783 target, not mus1644

## Root-Cause Line
- Cross-run runtime interference from another active Pencil session/process caused attach target mismatch and MCP websocket detachment for MUS-1716.

## Deterministic Next Remediation
1. Enforce exclusive runtime lock for MUS-1716 run window (single owner; kill/deny external Pencil launches).
2. Relaunch mus1644 target, then run 3 consecutive same-session probes: get_editor_state + get_screenshot with marker checks.
