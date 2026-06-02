import { getBridgeUrl } from '../../../../lib/bridge-config';
import { NextRequest, NextResponse } from "next/server";
import { appendControlAudit, createTraceId } from "@/lib/control-audit";
import { envFlag, requireOperator, resolveWorkerTarget } from "@/lib/operator-api-security";

const WORKER_TOKEN = process.env.MUSU_WORKER_TOKEN ?? "";

function defaultWorkerUrl(): string {
  return (process.env.MUSU_WORKER_URL ?? getBridgeUrl()).trim().replace(/\/+$/, "");
}

/** POST /api/processes/kill?pid=<pid>&device_id=<ip|local>&force=<bool> */
export async function POST(req: NextRequest) {
  const auth = await requireOperator(req);
  if ("response" in auth) {
    return auth.response;
  }

  const traceId = createTraceId();
  const { searchParams } = new URL(req.url);
  const pid = searchParams.get("pid");
  const deviceId = searchParams.get("device_id") ?? "local";
  const force = searchParams.get("force") === "true";

  if (!pid || isNaN(Number(pid))) {
      return NextResponse.json({ error: "pid is required" }, { status: 400 });
  }

  const target = resolveWorkerTarget(deviceId, defaultWorkerUrl());
  if (!target.ok) {
    await appendControlAudit({
      event: "processes.kill",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: deviceId,
      command: `kill:${pid}`,
      result: "rejected",
      http_status: target.status,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: target.error,
    });
    return NextResponse.json({ error: target.error }, { status: target.status });
  }
  if (!envFlag("MUSU_ENABLE_PROCESS_KILL")) {
    await appendControlAudit({
      event: "processes.kill",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: target.deviceId,
      command: `kill:${pid}`,
      result: "rejected",
      http_status: 403,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: "process kill disabled",
    });
    return NextResponse.json({ error: "process kill is disabled" }, { status: 403 });
  }

  const base = target.baseUrl;
  const url = new URL(`${base}/processes/${pid}/kill`);
  if (force) url.searchParams.set("force", "true");

  const headers: Record<string, string> = {};
  if (WORKER_TOKEN) headers["Authorization"] = `Bearer ${WORKER_TOKEN}`;

  try {
    const res = await fetch(url.toString(), { method: "POST", headers });
    if (res.status === 404) {
      await appendControlAudit({
        event: "processes.kill",
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        node: target.deviceId,
        command: `kill:${pid}`,
        result: "bridge_error",
        http_status: 404,
        bridge_status: 404,
        trace_id: traceId,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ error: `process ${pid} not found` }, { status: 404 });
    }
    if (!res.ok) {
      await appendControlAudit({
        event: "processes.kill",
        actor_id: auth.user.id,
        actor_email: auth.user.email,
        node: target.deviceId,
        command: `kill:${pid}`,
        result: "bridge_error",
        http_status: 502,
        bridge_status: res.status,
        trace_id: traceId,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({ error: `worker returned ${res.status}` }, { status: 502 });
    }
    await appendControlAudit({
      event: "processes.kill",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: target.deviceId,
      command: `kill:${pid}`,
      result: "accepted",
      http_status: 200,
      bridge_status: res.status,
      trace_id: traceId,
      created_at: new Date().toISOString(),
    });
    return NextResponse.json(await res.json());
  } catch (err) {
    await appendControlAudit({
      event: "processes.kill",
      actor_id: auth.user.id,
      actor_email: auth.user.email,
      node: target.deviceId,
      command: `kill:${pid}`,
      result: "bridge_error",
      http_status: 502,
      trace_id: traceId,
      created_at: new Date().toISOString(),
      reason: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
