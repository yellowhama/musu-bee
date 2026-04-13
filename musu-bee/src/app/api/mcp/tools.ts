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
];
