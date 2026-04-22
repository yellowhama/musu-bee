---
description: Alias for /musu-plugin:musu-wake (invoke heartbeat)
argument-hint: <agent-id-or-name>
allowed-tools: ["Task", "Bash", "Read", "AskUserQuestion"]
---

# MUSU Wake Alias

Project-level alias to make `/musu-wake` deterministic in CLI replay mode.

Apply the exact workflow and output contract from:
@musu-plugin/commands/musu-wake.md

Use `$ARGUMENTS` exactly as the plugin command expects.
