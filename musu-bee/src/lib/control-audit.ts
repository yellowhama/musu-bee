import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface ControlAuditEvent {
  event: string;
  actor_id: string;
  actor_email: string | null;
  node: string;
  command: string;
  result:
    | "accepted"
    | "rejected"
    | "queued"
    | "claimed"
    | "claim_empty"
    | "requeued"
    | "failed"
    | "bridge_error"
    | "store_error";
  http_status: number;
  bridge_status?: number;
  trace_id: string;
  created_at: string;
  reason?: string;
  owner_key?: string;
  origin?: string;
  room_id?: string;
  work_order_id?: string;
  company_id?: string;
  project_id?: string;
  target_node?: string;
}

const AUDIT_DIR = join(homedir(), ".musu", "audit");
const AUDIT_PATH = join(AUDIT_DIR, "command-center.jsonl");

export async function appendControlAudit(event: ControlAuditEvent): Promise<void> {
  try {
    await mkdir(AUDIT_DIR, { recursive: true });
    await appendFile(AUDIT_PATH, `${JSON.stringify(event)}\n`, "utf-8");
  } catch (error) {
    console.error("Failed to append control audit event:", error);
  }
}

export function createTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
