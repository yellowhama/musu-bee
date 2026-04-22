---
description: Alias for /musu-plugin:musu-board (MUSU issue board)
argument-hint: Optional query text with status and assignee filters
allowed-tools: ["Task", "Bash", "Read"]
---

# MUSU Board Alias

Project-level alias to make `/musu-board` deterministic in CLI replay mode.

Apply the exact workflow and output contract from:
@musu-plugin/commands/musu-board.md

Use `$ARGUMENTS` exactly as the plugin command expects.
