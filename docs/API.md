# musu-bridge API Reference

**Base URL:** `http://localhost:8070`
**Auth:** Bearer token via `Authorization: Bearer <MUSU_BRIDGE_TOKEN>` header. Localhost requests require the same token by default.

---

## 1. Health / System

### `GET /health`
Liveness check.
**Response:** `{"status": "ok", "relay": {"connected": true, "reconnect_count": 0}}`

### `GET /health/ready`
Readiness probe (DB + circuit breaker state). Returns 503 if DB is down.
**Response:** `{"status": "ready", "db": "ok", "agents": {"ceo": "ok", "engineer": "ok"}}`

### `GET /metrics`
Prometheus metrics (HTTP RED + agent task counters). Not in OpenAPI schema.

### `GET /api/system/stats`
System resource usage (CPU, memory, disk).
**Response:** `{"cpu_percent": 12.3, "memory_percent": 45.6, ...}`

### `GET /api/system/circuit-breakers`
Circuit breaker state for heartbeat and per-channel CBs.
**Response:** `{"heartbeat": {"channel": "node-CEO", "state": "closed"}, "channels": {...}, "active_tasks": 2}`

### `GET /api/system/services`
List systemd service statuses for all MUSU services.
**Response:** `{"node": "hugh-main", "services": {"musu-bridge": "active", "musu-bee": "inactive", ...}}`

### `POST /api/system/restart?service=all`
Restart MUSU services. `service` = `all|bridge|portd|bee|worker`.
**Response:** `{"restarted": ["bridge"], "results": {"bridge": {"exit_code": 0, "output": ""}}}`

### `POST /api/system/update`
Direct-download nodes only: git pull + restart bridge if code changed. Store/MSIX packaged Windows nodes must use package-managed updates and return a conflict instead of self-updating.
**Response:** `{"updated": true, "before": "abc12345", "after": "def67890", "restart_scheduled": true}`

### `POST /api/system/update-all`
Update this node + trigger `/api/system/update` on all mesh peers. In a mixed fleet, packaged Store/MSIX Windows nodes will not self-update and should report that their updates are package-managed.
**Response:** `{"self": {...}, "peers": {"4060": {...}}}`

### `POST /api/system/event`
Log a system event for activity timeline.
**Request:** `{"event_type": "node_join", "node_name": "4060", "detail": "joined mesh"}`
**Response:** `{"logged": true, "event_type": "node_join"}`

### `GET /api/audit?limit=100&offset=0`
Recent audit log entries, newest first.
**Response:** `[{"actor_ip": "...", "method": "POST", "path": "/api/route", "status_code": 200, ...}]`

### `GET /api/stats/success-rate?days=7`
Execution success rate for the last N days.
**Response:** `{"period_days": 7, "total": 120, "done": 110, "failed": 5, "success_rate_pct": 91.7}`

### `POST /api/admin/exec`
Run an allowlisted shell command (docker/docker-compose only).
**Request:** `{"command": "docker ps", "cwd": null, "timeout_sec": 60}`
**Response:** `{"exit_code": 0, "output": "CONTAINER ID ..."}`

### `POST /api/admin/bash`
Execute a bash command with blocked-command safety guards.
**Request:** `{"command": "ls -la", "cwd": "/home/user", "timeout": 30}`
**Response:** `{"exit_code": 0, "stdout": "...", "stderr": ""}`

### `POST /api/auto-distribute/pause`
Pause the CEO auto-distribution loop.
**Response:** `{"auto_distribute": "paused"}`

### `POST /api/auto-distribute/resume`
Resume the CEO auto-distribution loop.
**Response:** `{"auto_distribute": "resumed"}`

### `GET /api/templates`
List available company templates for creation.
**Response:** `{"templates": [{"key": "writer", "description": "...", "agents": ["CEO", "PM"], "agent_count": 7}]}`

---

## 2. Chat / Tasks

### `POST /api/route`
Route a message to the agent mapped to a channel (synchronous).
**Request:** `{"channel": "ceo", "sender_id": "user1", "text": "What should we do next?"}`
**Response:** `{"response": "...", "agent_id": "uuid", "tokens_used": 1234}`

### `POST /api/tasks/delegate`
Delegate a task asynchronously. Returns 202 immediately. Poll `/api/tasks/{id}`.
**Request:** `{"channel": "engineer", "sender_id": "orchestrator", "text": "Implement feature X", "company_id": "uuid", "use_qa_loop": false, "timeout_sec": 300}`
**Response (202):** `{"task_id": "uuid", "status": "running", "channel": "engineer"}`

### `GET /api/tasks?status=running&limit=50&channel=engineer&company_id=uuid`
List delegated tasks. Supports cursor pagination via `before_id`.
**Response:** `[{"id": "uuid", "channel": "engineer", "status": "running", "input": "...", "created_at": "..."}]`

### `GET /api/tasks/{task_id}`
Poll task status. Returns summary (<=500 chars) + full output.
**Response:** `{"id": "uuid", "status": "done", "summary": "...", "output": "...", "created_at": "..."}`

### `DELETE /api/tasks/{task_id}`
Cancel a running task by signalling the live Rust `TaskRunner` entry. The
cancel signal is latched before waking current waiters so subprocess adapters
can observe it on the next cancellation check.
**Response:** `{"task_id": "uuid", "cancelled": true}`

### `GET /api/tasks/{task_id}/sprint-contract`
Get the sprint contract linked to a delegated task.
**Response:** `{"task_id": "uuid", "contract": {...}}`

### `GET /api/tasks/{task_id}/qa-scores`
Get QA iteration scores for a task.
**Response:** `[{"iteration": 1, "functionality": 8, "correctness": 7, ...}]`

### `POST /api/tasks/route`
Route a task to a specific node or auto-select best node.
**Request:** `{"channel": "engineer", "instruction": "Fix the bug", "node_name": "", "strategy": "auto"}`
**Response:** `{"task_id": "uuid", "node": "4060", "strategy_used": "auto"}`

### `GET /api/tasks/events`
SSE stream for real-time task status updates.
**Response:** Server-Sent Events: `data: {"type": "task_update", "task_id": "uuid"}`

### `GET /api/channels`
Return channel-to-agent mapping.
**Response:** `{"ceo": {"agent_id": "uuid", "agent_name": "CEO"}, ...}`

### `GET /api/messages?session_id=sid&limit=50`
List messages for a session with cursor pagination. Supports `agent_id`, `date_from`, `date_to` filters.
**Response:** `[{"id": "uuid", "role": "assistant", "content": "...", "created_at": "..."}]`

### `GET /api/messages/{message_id}`
Get a single message by id.
**Response:** `{"id": "uuid", "role": "assistant", "content": "...", "created_at": "..."}`

### `DELETE /api/messages/{message_id}`
Delete a message by id.
**Response:** `{"deleted": true, "id": "uuid"}`

### `POST /api/feedback`
Submit user feedback (bug/suggestion/complaint). Creates an issue for CEO.
**Request:** `{"type": "bug", "title": "Login broken", "description": "..."}`
**Response:** `{"issue_id": "uuid", "status": "received"}`

### `POST /api/research`
Research a topic via web search, save to wiki (background task).
**Request:** `{"topic": "WebMCP specification", "max_sources": 5}`
**Response:** `{"started": true, "topic": "WebMCP specification"}`

---

## 3. Agents

### `GET /api/agents`
List all registered agents.
**Response:** `[{"id": "uuid", "name": "CEO", "role": "CEO", "status": "active", ...}]`

### `GET /api/agents/{agent_id}`
Get a single agent by ID.
**Response:** `{"id": "uuid", "name": "CEO", "role": "CEO", "status": "active", "adapter_type": "claude_local", ...}`

### `PUT /api/agents/{agent_id}`
Update agent configuration (adapter_type, model, instructions, budget).
**Request:** `{"model": "claude-sonnet-4-20250514", "timeout_sec": 600, "budget_usd_monthly": 50.0}`
**Response:** `{"id": "uuid", "name": "CEO", ...}`

### `PATCH /api/agents/{agent_id}`
Update agent role, model, or adapter_config (partial update).
**Request:** `{"role": "Senior Engineer", "adapter_config_patch": {"model": "gemini-2.5-pro"}}`
**Response:** `{"id": "uuid", "name": "Engineer", "role": "Senior Engineer", ...}`

### `POST /api/agents/{agent_id}/pause`
Pause an agent (sets status to `paused`).
**Response:** `{"id": "uuid", "status": "paused"}`

### `POST /api/agents/{agent_id}/resume`
Resume a paused agent (sets status to `active`).
**Response:** `{"id": "uuid", "status": "active"}`

### `GET /api/agents/{agent_id}/budget`
Get agent budget status (monthly limit, spent, remaining).
**Response:** `{"agent_id": "uuid", "budget_usd_monthly": 50.0, "budget_usd_spent": 12.5, "remaining": 37.5}`

### `POST /api/agents/{agent_id}/heartbeat/invoke`
Trigger a heartbeat run for an agent.
**Request:** `{"prompt": "Check on current tasks", "sender_id": "orchestrator"}`
**Response:** `{"response": "...", "agent_id": "uuid"}`

---

## 4. Nodes / Mesh

### `GET /api/nodes`
List all mesh nodes with live health status.
**Response:** `{"nodes": [{"name": "hugh-main", "url": "http://...", "healthy": true, "agents": [...]}], "total": 2}`

### `POST /api/nodes/add`
Add a node to the mesh. Performs health check + token exchange.
**Request:** `{"name": "4060", "tailnet_ip": "100.x.x.x", "agents": ["mgr-4060"]}`
**Response:** `{"name": "4060", "url": "http://100.x.x.x:8070", "healthy": true, "token_exchanged": true}`

### `POST /api/nodes/join`
Register a node in the mesh (called by secondary nodes on startup).
**Request:** `{"name": "4060", "url": "http://...", "agents": ["mgr-4060"], "gpu": "RTX 4060", "os": "linux"}`
**Response:** `{"status": "joined", "node": "4060", "agents_registered": [...]}`

### `POST /api/nodes/accept-peer`
Accept a peer node's registration + exchange tokens. Auth bypassed.
**Request:** `{"name": "hugh-main", "url": "http://...", "token": "xxx"}`
**Response:** `{"accepted": true, "token": "our-token", "name": "4060"}`

### `DELETE /api/nodes/{node_name}`
Remove a node from the mesh.
**Response:** `{"removed": "4060"}`

### `POST /api/nodes/assign-agent`
Assign an agent to a specific node. Updates `nodes.toml`.
**Request:** `{"agent_name": "Engineer", "node_name": "4060"}`
**Response:** `{"agent": "Engineer", "node": "4060", "newly_assigned": 1}`

### `GET /api/admin/node-info`
This node's identity info (name, URL, version, agents).
**Response:** `{"name": "hugh-main", "url": "http://...", "version": "0.2.0", "agents": [...]}`

### `GET /api/admin/node-card`
Legacy node card for mesh peer discovery.
**Response:** `{"name": "hugh-main", "description": "MUSU Bridge Node", "capabilities": {...}}`

### `POST /api/admin/pair`
Pair with a remote node by IP.
**Request:** `{"ip": "192.168.1.100", "port": 8070}`
**Response:** `{"success": true, ...}`

### `POST /api/admin/pair/accept`
Accept a pairing request from a peer.
**Request:** `{"name": "remote-node", "url": "http://...", "agents": ["CEO"], "version": "0.2.0"}`
**Response:** `{"success": true}`

### `GET /api/admin/nodes`
List connected nodes with status (legacy).
**Response:** `[{"name": "...", "url": "...", "status": "online", "agents": [...]}]`

### `DELETE /api/admin/nodes/{node_name}`
Disconnect a node (legacy).
**Response:** `{"disconnected": "node-name"}`

### `GET /api/admin/peer-status`
MUSU_TOKEN peer discovery status (cloud registry).
**Response:** `{"cloud_registry_enabled": true, "node_name": "...", "peer_count": 3, "peers": [...]}`

### `GET /api/admin/discovered`
Nodes discovered via mDNS zero-config.
**Response:** `[{"name": "...", "url": "...", "agents": [...]}]`

### `GET /api/admin/events?limit=50`
Bridge lifecycle events (start/stop).
**Response:** `{"events": [{"event_type": "bridge_started", "node_name": "...", "created_at": "..."}]}`

### `POST /api/wol`
Send Wake-on-LAN magic packet.
**Request:** `{"mac_address": "AA:BB:CC:DD:EE:FF", "broadcast_ip": "255.255.255.255", "port": 9}`
**Response:** `{"ok": true}`

### `POST /api/wol/node/{node_name}`
Wake a node by name using its stored MAC address.
**Response:** `{"ok": true, "node": "4060", "mac": "AA:BB:CC:DD:EE:FF"}`

### `POST /api/watchdog/{node}/{command}`
Send a watchdog command to a node via QUIC P2P. Rate-limited.
**Response:** `{"status": "ok", ...}` (varies by command)

### `GET /api/watchdog/{node}/status`
Get watchdog/bridge status from a remote node.
**Response:** `{"bridge_running": true, "connectsd_ok": true}`

---

## 5. Sync

### `GET /api/sync/companies?since=1970-01-01T00:00:00Z&limit=500`
Pull companies for peer sync (updated since timestamp).
**Response:** `[{"id": "uuid", "name": "...", "updated_at": "..."}]`

### `GET /api/sync/messages?since=1970-01-01T00:00:00Z&limit=500`
Pull messages for peer sync.
**Response:** `[{"id": "uuid", "content": "...", "updated_at": "..."}]`

### `GET /api/sync/agents?since=1970-01-01T00:00:00Z&limit=500`
Pull agents for peer sync.
**Response:** `[{"id": "uuid", "name": "CEO", "updated_at": "..."}]`

### `POST /api/sync/push`
Receive sync data from a peer node.
**Request:** `{"companies": [{...}], "messages": [{...}]}`
**Response:** `{"companies_written": 3, "messages_written": 12}`

---

## 6. Companies

### `GET /api/companies?workspace_id=ws-musu`
List all companies, optionally filtered by workspace.
**Response:** `[{"id": "uuid", "name": "musu_corp", "status": "active", ...}]`

### `POST /api/companies`
Create a company. If `template_key` matches a known template, auto-creates agent team.
**Request:** `{"name": "writer-co", "template_key": "writer", "purpose": "Write novels", "workspace_id": "ws-musu"}`
**Response:** `{"company": {...}, "agents": [...]}`

### `GET /api/companies/{company_id}`
Get a company by id.
**Response:** `{"id": "uuid", "name": "...", "status": "active", "purpose": "..."}`

### `PUT /api/companies/{company_id}`
Update a company's fields (name, purpose, status, meta).
**Request:** `{"name": "new-name", "purpose": "new purpose"}`
**Response:** `{"id": "uuid", "name": "new-name", ...}`

### `DELETE /api/companies/{company_id}`
Delete a company by id.
**Response:** `{"deleted": "uuid"}`

### `POST /api/companies/{company_id}/activate`
Set company status to `active`.
**Response:** `{"id": "uuid", "status": "active"}`

### `POST /api/companies/{company_id}/deactivate`
Set company status to `inactive`. Task delegation rejected.
**Response:** `{"id": "uuid", "status": "inactive"}`

### `POST /api/companies/{company_id}/run`
Kick CEO to act on company goals. Builds full context and delegates.
**Response:** `{"company_id": "uuid", "task": {"response": "...", "agent_id": "uuid"}}`

### `GET /api/companies/{company_id}/dashboard`
Unified dashboard: agents + tasks + nodes.
**Response:** `{"company_id": "uuid", "nodes": [...], "agents": {"total": 7, "active": 5}, "tasks": {"total": 20, "running": 3, ...}}`

### `GET /api/companies/{company_id}/briefing`
Executive briefing: purpose, goals, blockers, recent wins.
**Response:** `{"company_name": "...", "status": "healthy", "summary": "...", "blockers": [], "needs_attention": false}`

### `GET /api/companies/{company_id}/agents`
List agents scoped to a company (company-owned + global).
**Response:** `[{"id": "uuid", "name": "CEO", "company_id": "uuid", ...}]`

### `GET /api/companies/{company_id}/activity?limit=50&offset=0`
Activity feed (route_executions) for a company.
**Response:** `[{"id": "uuid", "channel": "engineer", "status": "done", "created_at": "..."}]`

### `GET /api/companies/{company_id}/metrics`
Performance and cost metrics (time-series).
**Response:** `{"cost": {...}, "latency": {...}}`

### `GET /api/companies/{company_id}/writer-company-health?workspace_root=/home/user/writer`
Audit writer-company drift against canonical manifest.
**Response:** `{"healthy": true, "drift": [], "score": 100}`

### `GET /api/companies/{company_id}/governance`
Get governance config for a company.
**Response:** `{"approval_required": true, "budget_limit": 100.0, ...}`

### `PUT /api/companies/{company_id}/governance`
Update governance config (merges with existing).
**Request:** `{"approval_required": false}`
**Response:** `{"approval_required": false, "budget_limit": 100.0}`

### `GET /api/companies/{company_id}/goals?status=active`
List goals for a company.
**Response:** `[{"id": "uuid", "title": "Ship v1", "status": "active", ...}]`

### `POST /api/companies/{company_id}/goals`
Create a goal.
**Request:** `{"title": "Ship v1", "description": "Launch MVP", "status": "active", "due_date": "2026-06-01"}`
**Response:** `{"id": "uuid", "title": "Ship v1", ...}`

### `GET /api/goals/{goal_id}`
Get a goal by id.
**Response:** `{"id": "uuid", "title": "Ship v1", "status": "active", ...}`

### `PATCH /api/goals/{goal_id}`
Update a goal's fields.
**Request:** `{"status": "completed"}`
**Response:** `{"id": "uuid", "status": "completed", ...}`

### `DELETE /api/goals/{goal_id}`
Delete a goal.
**Response:** `{"deleted": true, "id": "uuid"}`

### `GET /api/companies/{company_id}/issues?status=open&assignee_id=uuid&goal_id=uuid`
List issues for a company. Supports status, assignee, goal, project filters.
**Response:** `[{"id": "uuid", "title": "Bug X", "status": "open", "priority": "high", ...}]`

### `POST /api/companies/{company_id}/issues`
Create an issue.
**Request:** `{"title": "Bug X", "description": "...", "priority": "high", "assignee_id": "uuid"}`
**Response:** `{"id": "uuid", "title": "Bug X", ...}`

### `GET /api/issues/{issue_id}`
Get an issue by id.
**Response:** `{"id": "uuid", "title": "Bug X", "status": "open", ...}`

### `PATCH /api/issues/{issue_id}`
Update an issue's fields.
**Request:** `{"status": "resolved", "priority": "low"}`
**Response:** `{"id": "uuid", "status": "resolved", ...}`

### `POST /api/issues/{issue_id}/checkout`
Checkout an issue to an agent.
**Request:** `{"agent_id": "uuid"}`
**Response:** `{"id": "uuid", "checked_out_by": "uuid", ...}`

### `GET /api/issues/{issue_id}/comments`
List comments on an issue.
**Response:** `[{"id": "uuid", "body": "...", "author_id": "...", "created_at": "..."}]`

### `POST /api/issues/{issue_id}/comments`
Add a comment to an issue.
**Request:** `{"body": "Fixed in commit abc", "author_id": "engineer-1", "author_kind": "agent"}`
**Response:** `{"id": "uuid", "body": "Fixed in commit abc", ...}`

### `GET /api/companies/{company_id}/projects?status=active`
List projects for a company.
**Response:** `[{"id": "uuid", "project_name": "v2-rewrite", "status": "active", ...}]`

### `POST /api/companies/{company_id}/projects`
Create a project.
**Request:** `{"project_name": "v2-rewrite", "status": "active", "assigned_to": "engineer-1"}`
**Response:** `{"id": "uuid", "project_name": "v2-rewrite", ...}`

### `GET /api/projects/{project_id}`
Get a project by id.
**Response:** `{"id": "uuid", "project_name": "v2-rewrite", ...}`

### `PATCH /api/projects/{project_id}`
Update a project's fields.
**Request:** `{"status": "completed"}`
**Response:** `{"id": "uuid", "status": "completed", ...}`

### `DELETE /api/projects/{project_id}`
Delete a project.
**Response:** `{"deleted": true, "id": "uuid"}`

### `GET /api/companies/{company_id}/approvals?status=pending`
List approval requests for a company.
**Response:** `[{"id": "uuid", "status": "pending", "requested_by": "engineer", ...}]`

### `POST /api/approvals/{approval_id}/{decision}`
Resolve an approval. `decision` = `approved|rejected`. Optional `?reason=...`.
**Response:** `{"id": "uuid", "status": "approved", "reason": "..."}`

### `GET /api/companies/{company_id}/heartbeat-runs?status=done&limit=50`
List agent run records (route_executions) for a company.
**Response:** `[{"id": "uuid", "channel": "CEO", "status": "done", ...}]`

### `GET /api/heartbeat-runs/{run_id}`
Get a single run record.
**Response:** `{"id": "uuid", "channel": "CEO", "status": "done", "output": "..."}`

### `POST /api/heartbeat-runs/{run_id}/cancel`
Cancel a heartbeat run.
**Response:** `{"cancelled": "uuid"}`

### `GET /api/companies/{company_id}/costs/summary`
Cost summary for a company.
**Response:** `{"total_executions": 100, "done": 90, "failed": 5, ...}`

### `GET /api/companies/{company_id}/costs/by-agent`
Per-agent execution counts for a company.
**Response:** `[{"agent_name": "CEO", "count": 50, ...}]`

### `GET /api/companies/{company_id}/costs/by-node`
Company costs grouped by mesh node.
**Response:** `[{"node": "hugh-main", "count": 80, ...}]`

### `GET /api/costs/summary`
Global execution cost summary (all companies).
**Response:** `{"total_executions": 500, "done": 450, ...}`

### `GET /api/costs/by-agent`
Global per-agent execution counts.
**Response:** `[{"agent_name": "CEO", "count": 200, ...}]`

### `GET /api/costs/by-node`
Global execution costs grouped by node.
**Response:** `[{"node": "hugh-main", "count": 300, ...}]`

### `GET /api/runs/recent?limit=50`
Recent route executions across all companies.
**Response:** `[{"id": "uuid", "channel": "engineer", "status": "done", "created_at": "..."}]`

---

## 7. Ralph Loop

### `POST /api/ralph/start`
Start autonomous iteration loop for a company (background).
**Request:** `{"company_id": "uuid", "max_iterations": 20, "channel": "team_lead"}`
**Response:** `{"started": true, "company_id": "uuid", "max_iterations": 20}`

### `GET /api/ralph/status/{company_id}`
Get Ralph Loop status.
**Response:** `{"status": "running", "iteration": 5, "max_iterations": 20}`

### `POST /api/ralph/cancel/{company_id}`
Cancel a running Ralph Loop.
**Response:** `{"cancelled": true}`

---

## 8. Workspace

### `GET /api/workspace`
Get current workspace state (active company).
**Response:** `{"active_company_id": "uuid"}`

### `PUT /api/workspace`
Set active company.
**Request:** `{"active_company_id": "uuid"}`
**Response:** `{"active_company_id": "uuid"}`

---

## 9. Group Messages / Notifications

### `POST /api/groups/{group_id}/messages`
Post a message (or reply) to a group channel.
**Request:** `{"text": "Status update: all green", "sender_id": "CEO", "reply_to": null}`
**Response:** `{"id": "uuid", "group_id": "ceo-board", "sender_id": "CEO"}`

### `GET /api/groups/{group_id}/messages?limit=20&since=2026-05-01T00:00:00Z`
Read messages from a group channel.
**Response:** `[{"id": "uuid", "content": "...", "group_id": "ceo-board", "created_at": "..."}]`

### `GET /api/notifications/{recipient_id}`
Get unread notifications for an agent/user.
**Response:** `[{"id": "uuid", "sender_id": "CEO", "preview": "...", "created_at": "..."}]`

### `POST /api/notifications/{recipient_id}/read`
Mark all notifications as read.
**Response:** `{"marked_read": true, "recipient_id": "engineer-1"}`

---

## 10. Wiki

### `GET /api/wiki/pages`
List all wiki pages.
**Response:** `[{"id": "001_INTRO", "title": "Introduction", "updated_at": "..."}]`

### `GET /api/wiki/search?q=keyword`
Full-text search across wiki pages (FTS5).
**Response:** `[{"id": "...", "title": "...", "snippet": "...matching <b>keyword</b>..."}]`

### `GET /api/wiki/page/{page_id}`
Get a wiki page by ID.
**Response:** `{"id": "001_INTRO", "title": "Introduction", "content": "...", "updated_at": "..."}`

### `POST /api/wiki/page/{page_id}`
Create or update a wiki page.
**Request:** `{"title": "New Page", "content": "Page content here..."}`
**Response:** `{"id": "new_page", "title": "New Page", ...}`

### `DELETE /api/wiki/page/{page_id}`
Delete a wiki page.
**Response:** `{"deleted": true}`

---

## 11. Files

### `GET /api/files/read?path=/home/user/file.txt`
Read a file from this device (home directory only, max 10MB).
**Response:** `{"path": "/home/user/file.txt", "size": 1234, "content": "..."}`

### `GET /api/files/list?path=~&pattern=*.md`
List files in a directory (home directory only, glob patterns).
**Response:** `{"path": "/home/user", "entries": [{"name": "README.md", "is_dir": false, "size": 500}]}`

---

## 12. X-Ray Reports

### `POST /api/xray/upload`
Upload an X-Ray scan report from `musu xray --sync`.
**Request:** `{"version": "1.0", "generated_at": "2026-05-07T...", "repo": {"path": "..."}, "health_score": {"overall": 85}}`
**Response:** `{"stored": "xray-myrepo-20260507.json", "path": "..."}`

### `GET /api/xray/reports?repo=myrepo&limit=20`
List stored X-Ray reports.
**Response:** `{"reports": [{"filename": "...", "repo": "...", "score": 85, "grade": "B"}], "total": 5}`

### `GET /api/xray/reports/{filename}`
Get a specific X-Ray report by filename.
**Response:** `{...full report JSON...}`

---

## 13. Index Search

### `GET /api/index-search?q=keyword`
Full-text search on the musu-indexer SQLite database (max 20 results).
**Response:** `[{"path": "src/main.rs", "snippet": "...keyword...", "type": "rust"}]`

---

## 14. MCP / OpenAI / A2A

### `GET /api/mcp/tools`
MCP tools manifest (lists available tools for MCP clients).
**Response:** `{"tools": [{"name": "route_task", "description": "...", "inputSchema": {...}}]}`

### `POST /v1/chat/completions`
OpenAI-compatible chat completions. Routes through MUSU adapters.
**Request:** `{"model": "ceo", "messages": [{"role": "user", "content": "Hello"}]}`
**Response:** `{"choices": [{"message": {"role": "assistant", "content": "..."}}]}`

### `GET /v1/models`
List available models (OpenAI-compatible format).
**Response:** `{"data": [{"id": "ceo", "object": "model"}, {"id": "engineer", "object": "model"}]}`

### `GET /.well-known/agent.json`
A2A Agent Card discovery (Google A2A protocol).
**Response:** `{"name": "MUSU Bridge", "url": "...", "capabilities": {...}}`

### `POST /a2a`
A2A JSON-RPC 2.0 endpoint (SendMessage, GetTask, CancelTask).
**Request:** `{"jsonrpc": "2.0", "method": "SendMessage", "params": {...}, "id": 1}`
**Response:** `{"jsonrpc": "2.0", "result": {...}, "id": 1}`

### `POST /a2a/stream`
A2A SSE streaming endpoint (SendStreamingMessage).
**Response:** Server-Sent Events stream.

---

## 15. Screen / VNC

### `GET /api/screen/monitors`
List available display monitors.
**Response:** `[{"id": 0, "name": ":0", "width": 1920, "height": 1080}]`

### `GET /api/screen/snapshot`
Take a screenshot of a monitor.
**Response:** PNG image binary.

### `POST /api/screen/vnc/start`
Start a VNC server for remote desktop access.
**Response:** `{"started": true, "port": 5900}`

### `POST /api/screen/vnc/stop`
Stop the VNC server.
**Response:** `{"stopped": true}`

### `GET /api/screen/vnc/status`
Get VNC server status.
**Response:** `{"running": true, "port": 5900}`

### `GET /api/screen/vnc/token`
Get a noVNC connection token.
**Response:** `{"token": "..."}`

---

## 16. Proxy

### `ANY /bee/{path}`
Reverse proxy to local musu-bee (relay -> bridge -> bee:3001).
Supports GET, POST, PUT, DELETE, PATCH.
