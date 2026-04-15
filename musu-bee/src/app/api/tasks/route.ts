import { NextRequest, NextResponse } from "next/server";
import {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
  getTaskByIdPrefix,
  type TaskStatus,
} from "@/lib/tasks";

const VALID_STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done", "blocked"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "global";
  const statusParam = searchParams.get("status");
  const channelParam = searchParams.get("channel") ?? undefined;

  try {
    const status = statusParam
      ? (statusParam.split(",").filter((s) => VALID_STATUSES.includes(s as TaskStatus)) as TaskStatus[])
      : undefined;
    const tasks = listTasks({ scope, status, channel: channelParam, limit: 100 });
    return NextResponse.json({ tasks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title?: unknown;
      scope?: unknown;
      channel?: unknown;
      body?: unknown;
      assigned_device?: unknown;
    };

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const task = createTask({
      title: body.title.trim(),
      scope: typeof body.scope === "string" ? body.scope : "global",
      channel: typeof body.channel === "string" ? body.channel : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      assigned_device: typeof body.assigned_device === "string" ? body.assigned_device : undefined,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = (await req.json()) as {
      status?: unknown;
      result?: unknown;
      assigned_device?: unknown;
      body?: unknown;
    };

    const task = getTaskByIdPrefix(id);
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    const updates: Parameters<typeof updateTask>[1] = {};
    if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as TaskStatus)) {
      updates.status = body.status as TaskStatus;
    }
    if (typeof body.result === "string") updates.result = body.result;
    if (typeof body.assigned_device === "string") updates.assigned_device = body.assigned_device;
    if (typeof body.body === "string") updates.body = body.body;

    const updated = updateTask(task.id, updates);
    return NextResponse.json({ task: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const task = getTaskByIdPrefix(id);
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    deleteTask(task.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
