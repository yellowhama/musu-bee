import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DB_PATH = process.env.MUSU_TASKS_DB ?? path.resolve(process.cwd(), "..", "tasks.db");

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode=WAL;");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'global',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      assigned_device TEXT,
      channel TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      body TEXT,
      result TEXT
    );
    CREATE INDEX IF NOT EXISTS tasks_scope ON tasks(scope);
    CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status);
  `);
  return _db;
}

export type TaskStatus = "todo" | "in_progress" | "review" | "done" | "blocked";

export interface Task {
  id: string;
  scope: string;
  title: string;
  status: TaskStatus;
  assigned_device: string | null;
  channel: string | null;
  created_at: string;
  updated_at: string;
  body: string | null;
  result: string | null;
}

function makeId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createTask(params: {
  title: string;
  scope?: string;
  channel?: string;
  body?: string;
  assigned_device?: string;
}): Task {
  const db = getDb();
  const id = makeId();
  const now = new Date().toISOString();
  const task: Task = {
    id,
    scope: params.scope ?? "global",
    title: params.title,
    status: "todo",
    assigned_device: params.assigned_device ?? null,
    channel: params.channel ?? null,
    created_at: now,
    updated_at: now,
    body: params.body ?? null,
    result: null,
  };
  const stmt = db.prepare(
    `INSERT INTO tasks (id, scope, title, status, assigned_device, channel, created_at, updated_at, body, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  stmt.run(
    task.id, task.scope, task.title, task.status,
    task.assigned_device, task.channel, task.created_at, task.updated_at,
    task.body, task.result,
  );
  return task;
}

export function listTasks(params: {
  scope?: string;
  status?: TaskStatus | TaskStatus[];
  channel?: string;
  limit?: number;
}): Task[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.scope) {
    conditions.push("scope = ?");
    values.push(params.scope);
  }

  if (params.status) {
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    conditions.push(`status IN (${statuses.map(() => "?").join(",")})`);
    values.push(...statuses);
  }

  if (params.channel) {
    conditions.push("channel = ?");
    values.push(params.channel);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 50;
  const stmt = db.prepare(
    `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT ?`,
  );
  values.push(limit);
  return stmt.all(...values) as unknown as Task[];
}

export function getTaskByIdPrefix(prefix: string): Task | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM tasks WHERE id LIKE ? LIMIT 1");
  return (stmt.get(`${prefix}%`) as unknown as Task | undefined) ?? null;
}

export function updateTask(id: string, updates: {
  status?: TaskStatus;
  result?: string;
  assigned_device?: string;
  body?: string;
}): Task | null {
  const db = getDb();
  const now = new Date().toISOString();
  const fields: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.result !== undefined) { fields.push("result = ?"); values.push(updates.result); }
  if (updates.assigned_device !== undefined) { fields.push("assigned_device = ?"); values.push(updates.assigned_device); }
  if (updates.body !== undefined) { fields.push("body = ?"); values.push(updates.body); }

  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return (db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as Task | undefined) ?? null;
}

export function deleteTask(id: string): void {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}
