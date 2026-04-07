import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MUSU_AS_MCP_PORT || 8793);

const state = {
  compiled_features: ["core", "mcp_only_fast_loop", "ui_state"],
  current_view: {
    view_mode: "home",
    center_mode: "project_status",
    last_route_source: "mcp_only_harness",
    last_route_reason: "bootstrap",
    active_workspace_id: "ws-fast-loop",
    active_project_id: "project-fast-loop",
    active_repo_id: "repo-fast-loop",
    timestamp: Date.now()
  },
  ui_state: {
    active_surface: "home",
    surface_tabs: {
      left: "projects",
      center: "canvas",
      right: "assistant"
    },
    active_workspace_id: "ws-fast-loop",
    active_project_id: "project-fast-loop",
    active_repo_id: "repo-fast-loop",
    open_desktop_tabs: [
      { id: "tab-home", content_type: "home", opened_by: "system" }
    ],
    ui_registry: [
      {
        id: "settings-button",
        component_type: "button",
        label: "Settings",
        surface: "home",
        actions: ["open_settings"],
        action_descriptors: [
          {
            id: "open_settings",
            label: "Open settings",
            kind: "system",
            signal: "settings",
            requires_project: false,
            requires_approval: false
          }
        ],
        metadata: {
          area: "toolbar"
        }
      },
      {
        id: "project-card-primary",
        component_type: "card",
        label: "Primary Project",
        surface: "home",
        actions: ["open_project"],
        action_descriptors: [
          {
            id: "open_project",
            label: "Open project",
            kind: "route",
            signal: "project-fast-loop",
            requires_project: false,
            requires_approval: false
          }
        ],
        metadata: {
          project_id: "project-fast-loop"
        }
      }
    ],
    view_mode: "home",
    center_mode: "project_status",
    last_route_source: "mcp_only_harness",
    last_route_reason: "bootstrap",
    developer_mode_enabled: true,
    approval_modal_open: false,
    has_workspace: true,
    has_project: true,
    is_typing: false,
    is_interacting: false,
    timestamp: Date.now()
  },
  ui_snapshot_diagnostics: {
    listener_ready: true,
    listener_shell_mode: "mcp_only_harness",
    last_listener_registered_at: Date.now(),
    last_request_id: null,
    last_request_sent_at: null,
    last_request_received_at: null,
    last_submit_started_at: null,
    last_submit_completed_at: null,
    last_snapshot_bytes: null,
    last_error: null
  },
  semantic_snapshot_mode: "success",
  last_action: null
};

const tools = [
  {
    name: "desktop__musu_app_get_current_view",
    description: "Read the current MUSU desktop view routing context."
  },
  {
    name: "desktop__musu_app_get_editor_state",
    description: "Read the current MUSU desktop editor context as a lightweight MCP surface."
  },
  {
    name: "desktop__musu_app_get_ui_state",
    description: "Read the full MUSU native UI mirror snapshot."
  },
  {
    name: "desktop__musu_app_list_actionables",
    description: "List actionable native MUSU UI components."
  },
  {
    name: "desktop__musu_app_get_runtime_status",
    description: "Read runtime status and semantic snapshot diagnostics."
  },
  {
    name: "desktop__musu_app_get_semantic_snapshot",
    description: "Return a lightweight semantic snapshot or simulate timeout."
  },
  {
    name: "desktop__musu_app_execute_action",
    description: "Execute a synthetic action against the MCP-only harness."
  }
];

function updateTimestamp() {
  const now = Date.now();
  state.current_view.timestamp = now;
  state.ui_state.timestamp = now;
}

function editorStatePayload() {
  return {
    current_view: state.current_view,
    active_surface: state.ui_state.active_surface,
    active_project: {
      active_project_id: state.current_view.active_project_id,
      active_workspace_id: state.current_view.active_workspace_id,
      active_repo_id: state.current_view.active_repo_id,
      view_mode: state.current_view.view_mode,
      center_mode: state.current_view.center_mode
    },
    surface_tabs: state.ui_state.surface_tabs,
    desktop_tab_count: state.ui_state.open_desktop_tabs.length,
    actionable_component_count: state.ui_state.ui_registry.filter(
      (entry) => entry.actions.length > 0 || entry.action_descriptors.length > 0
    ).length,
    developer_mode_enabled: state.ui_state.developer_mode_enabled,
    approval_modal_open: state.ui_state.approval_modal_open,
    has_workspace: state.ui_state.has_workspace,
    has_project: state.ui_state.has_project,
    is_typing: state.ui_state.is_typing,
    is_interacting: state.ui_state.is_interacting
  };
}

function semanticSnapshotPayload() {
  return {
    kind: "desktop__musu_app_get_semantic_snapshot",
    parsed: {
      title: "MUSU MCP Only Harness",
      url: "musu://mcp-only-harness",
      body_text: "Synthetic harness for MCP-only fast loop validation.",
      semantic_elements: [
        {
          role: "navigation",
          label: "projects sidebar",
          bounds: { x: 0, y: 0, width: 280, height: 900 }
        },
        {
          role: "main",
          label: "project status center",
          bounds: { x: 280, y: 0, width: 980, height: 900 }
        },
        {
          role: "button",
          label: "Settings",
          actionable_id: "settings-button"
        }
      ]
    }
  };
}

function toolResult(structuredContent, summary) {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent
  };
}

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function callTool(name, args) {
  updateTimestamp();

  switch (name) {
    case "desktop__musu_app_get_current_view":
      return toolResult({ current_view: state.current_view }, "Current MUSU view loaded.");
    case "desktop__musu_app_get_editor_state":
      return toolResult(editorStatePayload(), "Native MUSU editor state loaded.");
    case "desktop__musu_app_get_ui_state":
      return toolResult({ ui_state: state.ui_state }, "Native MUSU UI state loaded.");
    case "desktop__musu_app_list_actionables": {
      const actionable_components = state.ui_state.ui_registry
        .filter((entry) => entry.actions.length > 0 || entry.action_descriptors.length > 0)
        .map((entry) => ({
          component_id: entry.id,
          component_type: entry.component_type,
          label: entry.label,
          surface: entry.surface,
          actions: entry.action_descriptors,
          metadata: entry.metadata
        }));
      return toolResult(
        {
          current_view: state.current_view,
          active_surface: state.ui_state.active_surface,
          component_count: actionable_components.length,
          actionable_components
        },
        `Loaded ${actionable_components.length} native MUSU actionable component(s).`
      );
    }
    case "desktop__musu_app_get_runtime_status":
      return toolResult(
        {
          tauri_runtime: false,
          mcp_only_harness: true,
          compiled_features: state.compiled_features,
          current_view: state.current_view,
          active_surface: state.ui_state.active_surface,
          ui_state_initialized: true,
          ui_snapshot_diagnostics: state.ui_snapshot_diagnostics,
          semantic_snapshot_mode: state.semantic_snapshot_mode,
          last_action: state.last_action
        },
        "Native MUSU runtime status loaded."
      );
    case "desktop__musu_app_get_semantic_snapshot": {
      const requestId = randomUUID();
      const now = Date.now();
      state.ui_snapshot_diagnostics.last_request_id = requestId;
      state.ui_snapshot_diagnostics.last_request_sent_at = now;
      state.ui_snapshot_diagnostics.last_request_received_at = now;
      state.ui_snapshot_diagnostics.last_submit_started_at = now;

      if (state.semantic_snapshot_mode === "timeout") {
        state.ui_snapshot_diagnostics.last_error = "semantic snapshot request timed out";
        throw new Error("Semantic UI snapshot timed out after 5 seconds");
      }

      const payload = semanticSnapshotPayload();
      const raw = JSON.stringify(payload);
      state.ui_snapshot_diagnostics.last_submit_completed_at = Date.now();
      state.ui_snapshot_diagnostics.last_snapshot_bytes = Buffer.byteLength(raw);
      state.ui_snapshot_diagnostics.last_error = null;
      return toolResult(payload, "Semantic MUSU UI snapshot captured.");
    }
    case "desktop__musu_app_execute_action": {
      const componentId = args.component_id;
      const actionId = args.action_id;
      if (!componentId || !actionId) {
        throw new Error("component_id and action_id are required");
      }
      state.last_action = {
        component_id: componentId,
        action_id: actionId,
        params: args.params || {},
        timestamp: Date.now()
      };
      return toolResult(
        {
          ok: true,
          executed: state.last_action
        },
        `Executed synthetic action '${actionId}' on '${componentId}'.`
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/mcp/health") {
      return json(res, 200, {
        ok: true,
        server: "musu-as-mcp",
        mode: "mcp_only_fast_loop",
        port: PORT
      });
    }

    if (req.method === "POST" && req.url === "/mcp") {
      const body = await readJson(req);
      const { id, method, params = {} } = body;

      if (method === "initialize") {
        return json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            serverInfo: {
              name: "musu-as-mcp",
              version: "0.1.0"
            },
            capabilities: {
              tools: {}
            }
          }
        });
      }

      if (method === "tools/list") {
        return json(res, 200, {
          jsonrpc: "2.0",
          id,
          result: { tools }
        });
      }

      if (method === "tools/call") {
        const result = await callTool(params.name, params.arguments || {});
        return json(res, 200, {
          jsonrpc: "2.0",
          id,
          result
        });
      }

      return json(res, 404, {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Unknown method: ${method}`
        }
      });
    }

    if (req.method === "POST" && req.url === "/dev/state") {
      const body = await readJson(req);
      if (body.semantic_snapshot_mode) {
        state.semantic_snapshot_mode = body.semantic_snapshot_mode;
      }
      if (body.current_view) {
        Object.assign(state.current_view, body.current_view);
      }
      if (body.ui_state) {
        Object.assign(state.ui_state, body.ui_state);
      }
      return json(res, 200, {
        ok: true,
        semantic_snapshot_mode: state.semantic_snapshot_mode
      });
    }

    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 500, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`MUSU-AS-MCP harness listening on http://127.0.0.1:${PORT}`);
});
