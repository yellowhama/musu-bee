---
description: Alias for /musu-plugin:musu-status (MUSU control-plane status dashboard)
argument-hint: Optional issue status filter (e.g. blocked,in_progress)
allowed-tools: ["Task", "Bash", "Read"]
---

# MUSU Status Alias

Project-level alias to make `/musu-status` deterministic in CLI replay mode.

Apply the exact workflow and output contract from:
@musu-plugin/commands/musu-status.md

Use `$ARGUMENTS` exactly as the plugin command expects.
