---
description: Alias for /musu-plugin:musu-assign (create and assign issue)
argument-hint: Title with optional assignee priority and status flags
allowed-tools: ["Task", "Bash", "Read", "AskUserQuestion"]
---

# MUSU Assign Alias

Project-level alias to make `/musu-assign` deterministic in CLI replay mode.

Apply the exact workflow and output contract from:
@musu-plugin/commands/musu-assign.md

Use `$ARGUMENTS` exactly as the plugin command expects.
