import { createTask, listTasks, updateTask, getTaskByIdPrefix } from "@/lib/tasks";
import type { TaskStatus } from "@/lib/tasks";

export function handleGetTasks(params: Record<string, unknown>): unknown {
  const scope = typeof params.scope === "string" ? params.scope : undefined;
  const rawStatus = params.status;
  const status = Array.isArray(rawStatus)
    ? (rawStatus as TaskStatus[])
    : typeof rawStatus === "string"
      ? [rawStatus as TaskStatus]
      : undefined;
  const limit = typeof params.limit === "number" ? params.limit : 20;
  const tasks = listTasks({ scope, status, limit });
  return { tasks, count: tasks.length };
}

export function handleCreateTask(params: Record<string, unknown>): unknown {
  if (typeof params.title !== "string" || !params.title.trim()) {
    return { error: "title_required" };
  }
  const task = createTask({
    title: params.title,
    scope: typeof params.scope === "string" ? params.scope : undefined,
    channel: typeof params.channel === "string" ? params.channel : undefined,
    body: typeof params.body === "string" ? params.body : undefined,
    assigned_device: typeof params.assigned_device === "string" ? params.assigned_device : undefined,
  });
  return { task };
}

export function handleUpdateTask(params: Record<string, unknown>): unknown {
  if (typeof params.id_prefix !== "string" || !params.id_prefix.trim()) {
    return { error: "id_prefix_required" };
  }
  const existing = getTaskByIdPrefix(params.id_prefix);
  if (!existing) return { error: "task_not_found", id_prefix: params.id_prefix };
  const updated = updateTask(existing.id, {
    status: typeof params.status === "string" ? (params.status as TaskStatus) : undefined,
    result: typeof params.result === "string" ? params.result : undefined,
  });
  return { task: updated };
}
