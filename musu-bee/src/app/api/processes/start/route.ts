import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { appendControlAudit, createTraceId } from "@/lib/control-audit";
import {
  isAllowedProcessStartCommand,
  requireOperator,
  resolveWorkerTarget,
} from "@/lib/operator-api-security";

const WORKER_TOKEN = process.env.MUSU_WORKER_TOKEN ?? "";

function defaultWorkerUrl(): string {
  return (process.env.MUSU_WORKER_URL ?? getBridgeUrl()).trim().replace(/\/+$/, "");
}

export interface ProcessStartRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  device_id?: string;
}

/** POST /api/processes/start
 * Body: { command, args?, cwd?, env?, device_id? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("response" in auth) {
    return auth.response;
  }

  const traceId = createTraceId();
  let body: ProcessStartRequest;
  try {
    body = (await req.json()) as ProcessStartRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const command = typeof body.command === "string" ? body.command.trim() : "";
  const args = Array.isArray(body.args)
    ? body.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  const cwd = typeof body.cwd === "string" ? body.cwd : undefined;
  const deviceId = typeof body.device_id === "string" ? body.device_id : "local";

  if (!command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const target = resolveWorkerTarget(deviceId, defaultWorkerUrl());
  if (!target.ok) {
    await appendControlAudit({
      event: "processes.start",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: deviceId,
      command,
      result: "rejected",
      http_status: target.status,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: target.error,
    });
    return NextResponse.json({ error: target.error }, { status: target.status });
  }
  if (!isAllowedProcessStartCommand(command, args, cwd)) {
    await appendControlAudit({
      event: "processes.start",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: target.deviceId,
      command,
      result: "rejected",
      http_status: 403,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: "command outside process start allowlist",
    });
    return NextResponse.json({ error: "process start command is not allowlisted" }, { status: 403 });
  }
  const base = target.baseUrl;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WORKER_TOKEN) headers["Authorization"] = `Bearer ${WORKER_TOKEN}`;

  try {
    const res = await fetch(`${base}/processes/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        command,
        args,
        cwd: cwd ?? null,
        env: {},
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `worker returned ${res.status}` }));
      await appendControlAudit({
        event: "processes.start",
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        node: target.deviceId,
        command,
        result: "bridge_error",
        http_status: res.status,
        bridge_status: res.status,
        trace_id: traceId,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ error: (err as { detail?: string }).detail ?? String(err) }, { status: res.status });
    }
    await appendControlAudit({
      event: "processes.start",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: target.deviceId,
      command,
      result: "accepted",
      http_status: 200,
      bridge_status: res.status,
      trace_id: traceId,
      created_at: new Date().toISOString(),
    });
    return NextResponse.json(await res.json());
  } catch (err) {
    await appendControlAudit({
      event: "processes.start",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: target.deviceId,
      command,
      result: "bridge_error",
      http_status: 502,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
