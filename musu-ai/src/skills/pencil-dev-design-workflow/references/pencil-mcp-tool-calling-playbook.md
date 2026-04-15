# Pencil MCP Tool Calling Playbook

Use this playbook when doing live Pencil design work through MCP.

## Standard Loop

1. `get_editor_state` (if allowed): confirm active `.pen` file path.
2. `batch_get`: read target frame/object IDs and hierarchy.
3. `get_screenshot`: capture `before`.
4. `batch_design`: apply a small mutation batch.
5. `snapshot_layout`: check structure and clipping/overlap issues.
6. `get_screenshot`: capture `after` and compare expected delta.

Repeat this loop until all required changes are complete.

## Batch Design Guardrails

1. Keep one `batch_design` call small (usually 5-15 ops, max 25).
2. Prefer incremental updates over one large destructive replacement.
3. Always bind `I/C/R` operations to variable names.
4. Use `U(path, ...)` for property edits only.
5. Use `R(path, ...)` when replacing subtree nodes.
6. For component instance descendants, use `instanceId/childId` path syntax.

## No Visible Change Checklist

1. Active file mismatch:
   Run `get_editor_state` and verify the expected `.pen` is active.
2. Wrong frame inspected:
   Call `get_screenshot` on the exact node ID that was edited.
3. Node ID invalid:
   Re-run `batch_get`; if ID is missing it may have been deleted/replaced.
4. Canceled/aborted tool call:
   Retry the same call and verify non-error response.
5. Oversized mutation:
   Split the change into smaller `batch_design` calls.
6. Layout side effects:
   Run `snapshot_layout` with `problemsOnly=true`.

## Minimal Verification Contract

For each task, keep these artifacts:

1. `before` screenshot node ID.
2. `batch_design` summary (what changed).
3. Changed node/frame IDs.
4. `snapshot_layout` result.
5. `after` screenshot node ID.

## Restricted Tool Mode

If the user allows only selected Pencil tools:

1. Use only the whitelisted tools.
2. Do not call non-whitelisted helpers.
3. If needed data is unavailable, report the limitation explicitly and proceed with the allowed tools.
