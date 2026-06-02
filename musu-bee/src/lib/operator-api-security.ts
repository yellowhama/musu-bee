import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth-server";

export interface OperatorIdentity {
  id: string;
  email: string | null;
}

export type OperatorAuthResult =
  | { user: OperatorIdentity }
  | { response: NextResponse };

const SAFE_ARG_RE = /^[^\u0000-\u001f\u007f]{0,512}$/;
const WORKER_HOST_RE = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,126}[A-Za-z0-9])?$/;

export async function requireOperator(req: NextRequest): Promise<OperatorAuthResult> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
  };
}

export function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function csvSet(name: string, defaults: string[] = []): Set<string> {
  const raw = process.env[name];
  const values = raw === undefined ? defaults : raw.split(/[,\s;]+/);
  return new Set(
    values
      .map((value) => commandKey(value))
      .filter((value) => value.length > 0),
  );
}

function commandKey(command: string): string {
  return command.trim().replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
}

function safeArgs(args: string[], maxArgs: number): boolean {
  return args.length <= maxArgs && args.every((arg) => SAFE_ARG_RE.test(arg));
}

export function isAllowedNodeExecuteCommand(command: string, args: string[]): boolean {
  const key = commandKey(command);
  const allowlist = csvSet("MUSU_NODE_EXECUTE_ALLOWLIST", ["echo", "hostname", "whoami"]);
  if (!allowlist.has(key) || !safeArgs(args, 16)) {
    return false;
  }
  if (key === "hostname" || key === "whoami") {
    return args.length === 0;
  }
  return true;
}

export function isAllowedProcessStartCommand(command: string, args: string[], cwd?: string): boolean {
  const key = commandKey(command);
  const allowlist = csvSet("MUSU_PROCESS_START_ALLOWLIST");
  if (!allowlist.has(key) || !safeArgs(args, 32)) {
    return false;
  }
  return cwd === undefined || SAFE_ARG_RE.test(cwd);
}

export type WorkerTarget =
  | { ok: true; deviceId: string; baseUrl: string }
  | { ok: false; status: number; error: string };

export function resolveWorkerTarget(deviceIdRaw: string | null | undefined, defaultBaseUrl: string): WorkerTarget {
  const deviceId = (deviceIdRaw ?? "local").trim() || "local";
  if (deviceId === "local") {
    return { ok: true, deviceId, baseUrl: defaultBaseUrl.trim().replace(/\/+$/, "") };
  }
  if (!envFlag("MUSU_ENABLE_REMOTE_WORKER_PROXY")) {
    return {
      ok: false,
      status: 403,
      error: "remote worker proxy is disabled",
    };
  }
  if (!WORKER_HOST_RE.test(deviceId)) {
    return {
      ok: false,
      status: 400,
      error: "invalid device_id",
    };
  }
  return { ok: true, deviceId, baseUrl: `http://${deviceId}:9700` };
}
