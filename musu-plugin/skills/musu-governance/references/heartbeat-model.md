# Heartbeat Model

## On wake

1. Read `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.
2. Load assigned issue context before coding.
3. Prefer active assigned packets (`in_progress`, then `todo`).

## During execution

- Keep the issue updated with concise evidence comments.
- If blocked, post owner + unblock action immediately.
- Do not let queued/locked runs silently stall work.

## On exit

- Leave exact proof commands used.
- Leave next step and owner.
- Move packet to `in_review` when implementation is complete.
