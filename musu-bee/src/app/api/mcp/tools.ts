export const TOOLS = [
  {
    name: "musu_get_devices",
    description: "Get the list of connected MUSU devices with their current CPU, GPU, and RAM utilisation.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "musu_get_tasks",
    description: "List tasks from the MUSU task queue. Optionally filter by scope or status.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", description: "Workspace scope (default: global)" },
        status: {
          type: "array",
          items: { type: "string", enum: ["todo", "in_progress", "review", "done", "blocked"] },
          description: "Filter by one or more statuses",
        },
        limit: { type: "number", description: "Max number of tasks to return (default: 20)" },
      },
      required: [],
    },
  },
  {
    name: "musu_create_task",
    description: "Create a new task in the MUSU task queue.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        scope: { type: "string", description: "Workspace scope (default: global)" },
        channel: { type: "string", description: "Channel this task belongs to" },
        body: { type: "string", description: "Task body / description" },
        assigned_device: { type: "string", description: "Device ID to assign this task to" },
      },
      required: ["title"],
    },
  },
  {
    name: "musu_update_task",
    description: "Update the status or result of an existing MUSU task. Accepts a task ID prefix.",
    inputSchema: {
      type: "object",
      properties: {
        id_prefix: { type: "string", description: "Task ID or prefix (e.g. 'task-m3k2')" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "review", "done", "blocked"],
          description: "New status",
        },
        result: { type: "string", description: "Result text to attach to the task" },
      },
      required: ["id_prefix"],
    },
  },
  {
    name: "musu_send_message",
    description: "Send a message to a MUSU channel via musu-port WebSocket bridge.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name (e.g. 'general', 'ceo')" },
        text: { type: "string", description: "Message content" },
        sender: { type: "string", description: "Sender display name (default: 'MCP')" },
      },
      required: ["channel", "text"],
    },
  },
  {
    name: "musu_search_wiki",
    description: "Full-text search the MUSU wiki knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        scope: { type: "string", description: "Workspace scope (default: global)" },
        limit: { type: "number", description: "Max results to return (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "musu_run_command",
    description: "Execute a shell command on the MUSU worker device.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout_sec: { type: "number", description: "Timeout in seconds (default: 30)" },
      },
      required: ["command"],
    },
  },
  {
    name: "musu_get_service_health",
    description: "Get the health status and latency of all MUSU services (port, bridge, worker).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "musu_list_channels",
    description: "List available MUSU chat channels.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "musu_get_network_runbook",
    description: "Return the MUSU Private Mesh / Headscale runbook. Do not require or suggest Tailscale.com signup.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "musu_get_connector_policy",
    description:
      "Return MUSU's connector trust policy, and optionally classify a proposed external API/MCP/scraping connector before recommending it.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Proposed connector/API name" },
        description: { type: "string", description: "Short description or user request to classify" },
        source_url: { type: "string", description: "Connector source URL, marketplace URL, or official docs URL" },
      },
      required: [],
    },
  },
  {
    name: "musu_list_connectors",
    description:
      "List MUSU's curated connector registry with trust tiers, required secrets, data egress, health checks, and proof requirements.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter, e.g. work-apps or developer-tools" },
        trust_tier: { type: "number", description: "Optional trust tier filter: 0, 1, 2, or 3" },
        risk_profile: { type: "string", description: "Optional risk profile filter" },
      },
      required: [],
    },
  },
  {
    name: "musu_get_connector_proof_plan",
    description:
      "Return the exact readiness, missing secrets, health check, proof artifact, retry contract, and revoke plan for one curated connector.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Curated connector id, e.g. github or website-to-markdown" },
      },
      required: ["id"],
    },
  },
  {
    name: "musu_run_connector_health_check",
    description:
      "Run an implemented connector health check and return a MUSU connector proof artifact. Requires source_url for URL-based connectors.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Curated connector id, e.g. website-to-markdown, openapi-to-mcp, mcp-validator, or github" },
        source_url: { type: "string", description: "Required for URL-based health checks" },
      },
      required: ["id"],
    },
  },
];
