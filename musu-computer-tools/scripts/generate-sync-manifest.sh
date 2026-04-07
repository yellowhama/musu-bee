#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/hugh51/musu-functions"

jq -n \
  --arg generated_at "$(date -Iseconds)" \
  --arg workspace_root "$ROOT" \
  --arg tools_root "$ROOT/musu-computer-tools" \
  --arg port_root "$ROOT/musu-port" \
  '{
    generated_at: $generated_at,
    workspace_root: $workspace_root,
    code_indexes: [
      {
        name: "musu-computer-tools",
        path: $tools_root,
        extra_ignore_patterns: [
          ".windows-bridge/**",
          "mcp/rootless-computer-control/pydeps/**",
          "mcp/rootless-computer-control/root/**"
        ]
      },
      {
        name: "musu-port",
        path: $port_root,
        extra_ignore_patterns: [
          "references/**",
          "target/**",
          "target-run-*/**"
        ]
      }
    ],
    doc_indexes: [
      {
        name: "musu-computer-tools",
        path: $tools_root,
        extra_ignore_patterns: [
          ".windows-bridge/**",
          "mcp/rootless-computer-control/pydeps/**",
          "mcp/rootless-computer-control/root/**"
        ]
      },
      {
        name: "musu-port",
        path: $port_root,
        extra_ignore_patterns: [
          "references/**",
          "target/**",
          "target-run-*/**"
        ]
      }
    ],
    key_specs: [
      ($tools_root + "/MASTER_PLAN.md"),
      ($tools_root + "/TODO.md"),
      ($tools_root + "/WINDOWS_BRIDGE_STANDARD.md"),
      ($tools_root + "/WINDOWS_INTEROP_HANDOFF_2026-04-01.md"),
      ($tools_root + "/WINDOWS_ACTION_CATALOG.md"),
      ($tools_root + "/WINDOWS_BROWSER_CDP_STANDARD.md"),
      ($tools_root + "/WINDOWS_BROWSER_ACTION_CATALOG.md"),
      ($tools_root + "/WINDOWS_BROWSER_LAUNCH_RUNBOOK.md"),
      ($tools_root + "/BROWSER_SPLIT_HOST_INVENTORY.md"),
      ($tools_root + "/INDEX_SYNC_RUNBOOK.md"),
      ($tools_root + "/INDEX_SYNC_STATUS.md"),
      ($port_root + "/MASTER_PLAN.md"),
      ($port_root + "/TODO.md"),
      ($port_root + "/DEVICE_PROFILE_CONTRACT.md")
    ]
  }'
