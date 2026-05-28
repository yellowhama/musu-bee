import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { getBridgeUrl } from "@/lib/bridge-config";
import { getBridgeToken, getMusuHome } from "@/lib/bridge-token";

export const dynamic = "force-dynamic";

type Level = "ok" | "warn" | "fail";

interface Check {
  status: Level;
  note: string;
}

function summarize(levels: Level[]): Level {
  if (levels.includes("fail")) return "fail";
  if (levels.includes("warn")) return "warn";
  return "ok";
}

async function readServiceRegistry(home: string): Promise<string | null> {
  try {
    const body = await readFile(join(home, "services", "bridge.json"), "utf8");
    const parsed = JSON.parse(body) as { addr?: unknown; transport?: unknown };
    if (parsed.transport === "tcp" && typeof parsed.addr === "string") {
      return parsed.addr.replace(/^0\.0\.0\.0:/, "127.0.0.1:");
    }
  } catch {
    return null;
  }
  return null;
}

async function checkBridge(bridgeUrl: string): Promise<Check & {
  url: string;
  httpStatus: number | null;
  health: unknown | null;
}> {
  try {
    const res = await fetch(`${bridgeUrl.replace(/\/+$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    const health = await res.json().catch(() => null);
    return {
      status: res.ok ? "ok" : "fail",
      note: res.ok ? "Bridge is reachable." : `Bridge health returned HTTP ${res.status}.`,
      url: bridgeUrl,
      httpStatus: res.status,
      health,
    };
  } catch (err) {
    return {
      status: "fail",
      note: err instanceof Error ? err.message : "Bridge is unreachable.",
      url: bridgeUrl,
      httpStatus: null,
      health: null,
    };
  }
}

export async function GET() {
  const home = getMusuHome();
  const bridgeUrl = getBridgeUrl();
  const accountTokenPresent = existsSync(join(home, "token"));
  const bridgeToken = await getBridgeToken();
  const serviceRegistryAddr = await readServiceRegistry(home);
  const bridge = await checkBridge(bridgeUrl);

  const account: Check & { tokenPresent: boolean } = {
    status: accountTokenPresent ? "ok" : "warn",
    tokenPresent: accountTokenPresent,
    note: accountTokenPresent ? "Account token exists." : "Run `musu login`.",
  };
  const localToken: Check & { tokenPresent: boolean } = {
    status: bridgeToken ? "ok" : "warn",
    tokenPresent: Boolean(bridgeToken),
    note: bridgeToken ? "Bridge token exists." : "Run `musu up` to create bridge.env.",
  };
  const dashboard: Check & { url: string } = {
    status: "ok",
    note: "Dashboard server is serving this page.",
    url: "/fleet",
  };
  const overall = summarize([account.status, localToken.status, bridge.status, dashboard.status]);
  const nextSteps: string[] = [];
  if (!accountTokenPresent) nextSteps.push("musu login");
  if (!bridgeToken) nextSteps.push("musu up");
  if (bridge.status !== "ok") nextSteps.push("musu up");
  if (nextSteps.length === 0) nextSteps.push("Run your first agent task from the dashboard.");

  return NextResponse.json({
    overall,
    generated_at: new Date().toISOString(),
    home,
    account,
    bridge_token: localToken,
    bridge: {
      ...bridge,
      service_registry_addr: serviceRegistryAddr,
    },
    dashboard,
    next_steps: nextSteps,
  });
}
