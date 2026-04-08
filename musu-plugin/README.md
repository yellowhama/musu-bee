# musu-plugin

Claude Code plugin for MUSU operations.

## Included components

- Plugin manifest: `.claude-plugin/plugin.json`
- MCP wiring: `.mcp.json` (`musu-control` + `musu-indexer`)
- Commands:
  - `musu-status`
  - `musu-board`
  - `musu-wake`
  - `musu-assign`
- Agents:
  - `musu-operator`
  - `musu-reviewer`
- Skill bundle:
  - `skills/musu-governance/SKILL.md`
  - governance references
- Hook guard:
  - `hooks/hooks.json`
  - `hooks/paperclip_guard.py`

## Local validation

```bash
jq . .claude-plugin/plugin.json
jq . .mcp.json
jq . hooks/hooks.json
python3 -m py_compile hooks/paperclip_guard.py
```
