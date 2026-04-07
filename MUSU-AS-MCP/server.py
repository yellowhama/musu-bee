from __future__ import annotations

import json
import os
import time
import uuid
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PORT = int(os.environ.get("MUSU_AS_MCP_PORT", "8793"))

STATE = {
    "compiled_features": ["core", "mcp_only_fast_loop", "ui_state"],
    "current_view": {
        "view_mode": "home",
        "center_mode": "project_status",
        "last_route_source": "mcp_only_harness",
        "last_route_reason": "bootstrap",
        "active_workspace_id": "ws-fast-loop",
        "active_project_id": "project-fast-loop",
        "active_repo_id": "repo-fast-loop",
        "timestamp": int(time.time() * 1000),
    },
    "ui_state": {
        "active_surface": "home",
        "surface_tabs": {"left": "projects", "center": "canvas", "right": "assistant"},
        "active_workspace_id": "ws-fast-loop",
        "active_project_id": "project-fast-loop",
        "active_repo_id": "repo-fast-loop",
        "open_desktop_tabs": [{"id": "tab-home", "content_type": "home", "opened_by": "system"}],
        "ui_registry": [
            {
                "id": "settings-button",
                "component_type": "button",
                "label": "Settings",
                "surface": "home",
                "actions": ["open_settings"],
                "action_descriptors": [
                    {
                        "id": "open_settings",
                        "label": "Open settings",
                        "kind": "system",
                        "signal": "settings",
                        "requires_project": False,
                        "requires_approval": False,
                    }
                ],
                "metadata": {"area": "toolbar"},
            },
            {
                "id": "project-card-primary",
                "component_type": "card",
                "label": "Primary Project",
                "surface": "home",
                "actions": ["open_project"],
                "action_descriptors": [
                    {
                        "id": "open_project",
                        "label": "Open project",
                        "kind": "route",
                        "signal": "project-fast-loop",
                        "requires_project": False,
                        "requires_approval": False,
                    }
                ],
                "metadata": {"project_id": "project-fast-loop"},
            },
        ],
        "view_mode": "home",
        "center_mode": "project_status",
        "last_route_source": "mcp_only_harness",
        "last_route_reason": "bootstrap",
        "developer_mode_enabled": True,
        "approval_modal_open": False,
        "has_workspace": True,
        "has_project": True,
        "is_typing": False,
        "is_interacting": False,
        "timestamp": int(time.time() * 1000),
    },
    "layout_tree": {
        "id": "root-home",
        "role": "window",
        "label": "MUSU Desktop Home",
        "text": "MUSU Desktop Home",
        "bounds": {"x": 0, "y": 0, "width": 1440, "height": 900},
        "problem": None,
        "children": [
            {
                "id": "nav-projects",
                "role": "navigation",
                "label": "Projects Sidebar",
                "text": "Projects",
                "bounds": {"x": 0, "y": 0, "width": 280, "height": 900},
                "problem": None,
                "children": [
                    {
                        "id": "project-card-primary",
                        "role": "card",
                        "label": "Primary Project",
                        "text": "Primary Project",
                        "bounds": {"x": 16, "y": 96, "width": 248, "height": 92},
                        "problem": None,
                        "children": [],
                    }
                ],
            },
            {
                "id": "main-project-status",
                "role": "main",
                "label": "Project Status Center",
                "text": "Project status center",
                "bounds": {"x": 280, "y": 0, "width": 980, "height": 900},
                "problem": None,
                "children": [
                    {
                        "id": "settings-button",
                        "role": "button",
                        "label": "Settings",
                        "text": "Settings",
                        "bounds": {"x": 1160, "y": 24, "width": 104, "height": 40},
                        "problem": "crowded_near_edge",
                        "children": [],
                    }
                ],
            },
            {
                "id": "assistant-panel",
                "role": "complementary",
                "label": "Assistant Panel",
                "text": "Assistant",
                "bounds": {"x": 1260, "y": 0, "width": 180, "height": 900},
                "problem": "narrow_panel",
                "children": [],
            },
        ],
    },
    "ui_snapshot_diagnostics": {
        "listener_ready": True,
        "listener_shell_mode": "mcp_only_harness",
        "last_listener_registered_at": int(time.time() * 1000),
        "last_request_id": None,
        "last_request_sent_at": None,
        "last_request_received_at": None,
        "last_submit_started_at": None,
        "last_submit_completed_at": None,
        "last_snapshot_bytes": None,
        "last_error": None,
    },
    "semantic_snapshot_mode": "success",
    "last_action": None,
}

TOOLS = [
    {
        "name": "desktop__musu_app_get_current_view",
        "description": "Read the current MUSU desktop view routing context.",
    },
    {
        "name": "desktop__musu_app_get_editor_state",
        "description": "Read the current MUSU desktop editor context as a lightweight MCP surface.",
    },
    {
        "name": "desktop__musu_app_get_ui_state",
        "description": "Read the full MUSU native UI mirror snapshot.",
    },
    {
        "name": "desktop__musu_app_get_layout_snapshot",
        "description": "Read a bounded structural layout snapshot of the MUSU desktop surface.",
    },
    {
        "name": "desktop__musu_app_list_actionables",
        "description": "List actionable native MUSU UI components.",
    },
    {
        "name": "desktop__musu_app_get_runtime_status",
        "description": "Read runtime status and semantic snapshot diagnostics.",
    },
    {
        "name": "desktop__musu_app_get_semantic_snapshot",
        "description": "Return a lightweight semantic snapshot or simulate timeout.",
    },
    {
        "name": "desktop__musu_app_get_native_screenshot",
        "description": "Return a targeted synthetic screenshot payload for the current surface or target component.",
    },
    {
        "name": "desktop__musu_app_get_problem_nodes",
        "description": "List inferred problematic UI nodes from the bounded layout model.",
    },
    {
        "name": "desktop__musu_app_execute_action",
        "description": "Execute a synthetic action against the MCP-only harness.",
    },
]


def now_ms() -> int:
    return int(time.time() * 1000)


def update_timestamp() -> None:
    stamp = now_ms()
    STATE["current_view"]["timestamp"] = stamp
    STATE["ui_state"]["timestamp"] = stamp


def tool_result(structured_content, summary: str):
    return {
        "content": [{"type": "text", "text": summary}],
        "structuredContent": structured_content,
    }


def editor_state_payload():
    current = STATE["current_view"]
    ui_state = STATE["ui_state"]
    return {
        "current_view": current,
        "active_surface": ui_state["active_surface"],
        "active_project": {
            "active_project_id": current["active_project_id"],
            "active_workspace_id": current["active_workspace_id"],
            "active_repo_id": current["active_repo_id"],
            "view_mode": current["view_mode"],
            "center_mode": current["center_mode"],
        },
        "surface_tabs": ui_state["surface_tabs"],
        "desktop_tab_count": len(ui_state["open_desktop_tabs"]),
        "actionable_component_count": len(
            [
                entry
                for entry in ui_state["ui_registry"]
                if entry["actions"] or entry["action_descriptors"]
            ]
        ),
        "developer_mode_enabled": ui_state["developer_mode_enabled"],
        "approval_modal_open": ui_state["approval_modal_open"],
        "has_workspace": ui_state["has_workspace"],
        "has_project": ui_state["has_project"],
        "is_typing": ui_state["is_typing"],
        "is_interacting": ui_state["is_interacting"],
    }


def semantic_snapshot_payload():
    editor_state = editor_state_payload()
    layout_snapshot = layout_snapshot_payload(
        {
            "root_id": STATE["layout_tree"]["id"],
            "max_depth": 1,
            "problems_only": False,
            "include_text": True,
            "include_bounds": True,
        }
    )
    screenshot = screenshot_payload(
        {
            "target_id": STATE["current_view"]["view_mode"],
            "view_only": True,
            "include_window_frame": False,
        }
    )
    return {
        "kind": "desktop__musu_app_get_semantic_snapshot",
        "mode": "wrapper_summary",
        "derived_from": [
            "desktop__musu_app_get_editor_state",
            "desktop__musu_app_get_layout_snapshot",
            "desktop__musu_app_get_native_screenshot",
        ],
        "parsed": {
            "title": "MUSU MCP Only Harness",
            "url": "musu://mcp-only-harness",
            "summary": "Semantic snapshot wrapper built from editor state, bounded layout snapshot, and targeted screenshot metadata.",
            "editor_state": editor_state,
            "layout_snapshot": {
                "root_id": layout_snapshot["root_id"],
                "max_depth": layout_snapshot["max_depth"],
                "snapshot": layout_snapshot["snapshot"],
            },
            "screenshot": {
                "target_id": screenshot["target_id"],
                "media_type": screenshot["media_type"],
                "byte_length": screenshot["byte_length"],
                "view_only": screenshot["view_only"],
            },
        },
    }


def find_layout_node(node: dict, target_id: str):
    if node["id"] == target_id:
        return node
    for child in node.get("children", []):
        match = find_layout_node(child, target_id)
        if match is not None:
            return match
    return None


def project_layout_node(node: dict, depth: int, include_text: bool, include_bounds: bool, problems_only: bool):
    children = node.get("children", [])
    projected_children = []
    for child in children:
        projected = project_layout_node(child, depth - 1, include_text, include_bounds, problems_only)
        if projected is not None:
            projected_children.append(projected)

    include_self = not problems_only or node.get("problem") is not None or projected_children
    if not include_self:
        return None

    projected = {
        "id": node["id"],
        "role": node["role"],
        "label": node["label"],
        "problem": node.get("problem"),
    }
    if include_text:
        projected["text"] = node.get("text")
    if include_bounds:
        projected["bounds"] = node.get("bounds")
    if depth <= 0 and children:
        projected["children"] = "..."
        projected["child_count"] = len(children)
    else:
        projected["children"] = projected_children
    return projected


def layout_snapshot_payload(arguments: dict):
    root_id = arguments.get("root_id") or STATE["layout_tree"]["id"]
    max_depth = int(arguments.get("max_depth", 1))
    problems_only = bool(arguments.get("problems_only", False))
    include_text = bool(arguments.get("include_text", True))
    include_bounds = bool(arguments.get("include_bounds", True))

    root = find_layout_node(STATE["layout_tree"], root_id)
    if root is None:
        raise RuntimeError(f"Unknown layout root_id: {root_id}")

    projected = project_layout_node(root, max_depth, include_text, include_bounds, problems_only)
    if projected is None:
        projected = {
            "id": root_id,
            "role": root["role"],
            "label": root["label"],
            "children": [],
        }

    return {
        "root_id": root_id,
        "max_depth": max_depth,
        "problems_only": problems_only,
        "include_text": include_text,
        "include_bounds": include_bounds,
        "snapshot": projected,
    }


def collect_problem_nodes(node: dict, problems: list[dict]):
    if node.get("problem"):
        problems.append(
            {
                "id": node["id"],
                "role": node["role"],
                "label": node["label"],
                "problem": node["problem"],
                "bounds": node.get("bounds"),
            }
        )
    for child in node.get("children", []):
        collect_problem_nodes(child, problems)


def problem_nodes_payload(arguments: dict):
    root_id = arguments.get("root_id") or STATE["layout_tree"]["id"]
    root = find_layout_node(STATE["layout_tree"], root_id)
    if root is None:
        raise RuntimeError(f"Unknown layout root_id: {root_id}")

    problems: list[dict] = []
    collect_problem_nodes(root, problems)
    return {
        "root_id": root_id,
        "problem_count": len(problems),
        "problems": problems,
    }


def screenshot_payload(arguments: dict):
    target_id = arguments.get("target_id") or STATE["current_view"]["view_mode"]
    view_only = bool(arguments.get("view_only", False))
    include_window_frame = bool(arguments.get("include_window_frame", False))
    title = f"MUSU Screenshot: {target_id}"
    frame = "window-frame-on" if include_window_frame else "window-frame-off"
    mode = "view-only" if view_only else "targeted"
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
      <rect width="640" height="360" fill="#f6f1e8"/>
      <rect x="16" y="16" width="608" height="328" rx="18" fill="#102a43"/>
      <text x="40" y="64" font-size="28" fill="#f0f4f8">{title}</text>
      <text x="40" y="112" font-size="18" fill="#d9e2ec">mode: {mode}</text>
      <text x="40" y="144" font-size="18" fill="#d9e2ec">frame: {frame}</text>
      <text x="40" y="196" font-size="22" fill="#f7c948">Synthetic MCP-only screenshot payload</text>
    </svg>
    """.strip()
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return {
        "target_id": target_id,
        "media_type": "image/svg+xml",
        "encoding": "base64",
        "data": encoded,
        "byte_length": len(encoded),
        "view_only": view_only,
        "include_window_frame": include_window_frame,
    }


def call_tool(name: str, arguments: dict):
    update_timestamp()

    if name == "desktop__musu_app_get_current_view":
        return tool_result({"current_view": STATE["current_view"]}, "Current MUSU view loaded.")

    if name == "desktop__musu_app_get_editor_state":
        return tool_result(editor_state_payload(), "Native MUSU editor state loaded.")

    if name == "desktop__musu_app_get_ui_state":
        return tool_result({"ui_state": STATE["ui_state"]}, "Native MUSU UI state loaded.")

    if name == "desktop__musu_app_get_layout_snapshot":
        payload = layout_snapshot_payload(arguments)
        return tool_result(payload, "Native MUSU layout snapshot loaded.")

    if name == "desktop__musu_app_list_actionables":
        actionable_components = []
        for entry in STATE["ui_state"]["ui_registry"]:
            if entry["actions"] or entry["action_descriptors"]:
                actionable_components.append(
                    {
                        "component_id": entry["id"],
                        "component_type": entry["component_type"],
                        "label": entry["label"],
                        "surface": entry["surface"],
                        "actions": entry["action_descriptors"],
                        "metadata": entry["metadata"],
                    }
                )
        return tool_result(
            {
                "current_view": STATE["current_view"],
                "active_surface": STATE["ui_state"]["active_surface"],
                "component_count": len(actionable_components),
                "actionable_components": actionable_components,
            },
            f"Loaded {len(actionable_components)} native MUSU actionable component(s).",
        )

    if name == "desktop__musu_app_get_runtime_status":
        return tool_result(
            {
                "tauri_runtime": False,
                "mcp_only_harness": True,
                "compiled_features": STATE["compiled_features"],
                "current_view": STATE["current_view"],
                "active_surface": STATE["ui_state"]["active_surface"],
                "ui_state_initialized": True,
                "ui_snapshot_diagnostics": STATE["ui_snapshot_diagnostics"],
                "semantic_snapshot_mode": STATE["semantic_snapshot_mode"],
                "last_action": STATE["last_action"],
            },
            "Native MUSU runtime status loaded.",
        )

    if name == "desktop__musu_app_get_semantic_snapshot":
        diagnostics = STATE["ui_snapshot_diagnostics"]
        stamp = now_ms()
        diagnostics["last_request_id"] = str(uuid.uuid4())
        diagnostics["last_request_sent_at"] = stamp
        diagnostics["last_request_received_at"] = stamp
        diagnostics["last_submit_started_at"] = stamp
        if STATE["semantic_snapshot_mode"] == "timeout":
            diagnostics["last_error"] = "semantic snapshot request timed out"
            raise RuntimeError("Semantic UI snapshot timed out after 5 seconds")
        payload = semantic_snapshot_payload()
        raw = json.dumps(payload)
        diagnostics["last_submit_completed_at"] = now_ms()
        diagnostics["last_snapshot_bytes"] = len(raw.encode("utf-8"))
        diagnostics["last_error"] = None
        return tool_result(payload, "Semantic MUSU UI snapshot captured.")

    if name == "desktop__musu_app_get_native_screenshot":
        payload = screenshot_payload(arguments)
        return tool_result(payload, "Native MUSU screenshot payload captured.")

    if name == "desktop__musu_app_get_problem_nodes":
        payload = problem_nodes_payload(arguments)
        return tool_result(payload, f"Loaded {payload['problem_count']} problematic node(s).")

    if name == "desktop__musu_app_execute_action":
        component_id = arguments.get("component_id")
        action_id = arguments.get("action_id")
        if not component_id or not action_id:
            raise RuntimeError("component_id and action_id are required")
        STATE["last_action"] = {
            "component_id": component_id,
            "action_id": action_id,
            "params": arguments.get("params", {}),
            "timestamp": now_ms(),
        }
        return tool_result(
            {"ok": True, "executed": STATE["last_action"]},
            f"Executed synthetic action '{action_id}' on '{component_id}'.",
        )

    raise RuntimeError(f"Unknown tool: {name}")


class Handler(BaseHTTPRequestHandler):
    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _write_json(self, status_code: int, payload):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/mcp/health":
            return self._write_json(
                200,
                {"ok": True, "server": "musu-as-mcp", "mode": "mcp_only_fast_loop", "port": PORT},
            )
        return self._write_json(404, {"error": "Not found"})

    def do_POST(self):
        try:
            body = self._read_json()

            if self.path == "/dev/state":
                if "semantic_snapshot_mode" in body:
                    STATE["semantic_snapshot_mode"] = body["semantic_snapshot_mode"]
                if "current_view" in body:
                    STATE["current_view"].update(body["current_view"])
                if "ui_state" in body:
                    STATE["ui_state"].update(body["ui_state"])
                return self._write_json(
                    200,
                    {
                        "ok": True,
                        "semantic_snapshot_mode": STATE["semantic_snapshot_mode"],
                    },
                )

            if self.path != "/mcp":
                return self._write_json(404, {"error": "Not found"})

            req_id = body.get("id")
            method = body.get("method")
            params = body.get("params", {})

            if method == "initialize":
                return self._write_json(
                    200,
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "serverInfo": {"name": "musu-as-mcp", "version": "0.1.0"},
                            "capabilities": {"tools": {}},
                        },
                    },
                )

            if method == "tools/list":
                return self._write_json(
                    200, {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
                )

            if method == "tools/call":
                result = call_tool(params.get("name"), params.get("arguments", {}))
                return self._write_json(200, {"jsonrpc": "2.0", "id": req_id, "result": result})

            return self._write_json(
                404,
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Unknown method: {method}"},
                },
            )
        except Exception as exc:
            return self._write_json(
                500,
                {
                    "jsonrpc": "2.0",
                    "error": {"code": -32000, "message": str(exc)},
                },
            )

    def log_message(self, format, *args):
        return


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"MUSU-AS-MCP harness listening on http://127.0.0.1:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
