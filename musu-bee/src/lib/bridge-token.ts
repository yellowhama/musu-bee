import "server-only";

import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

export function getMusuHome(): string {
  return process.env.MUSU_HOME?.trim() || join(homedir(), ".musu");
}

export function parseBridgeTokenEnv(body: string): string {
  for (const rawLine of body.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(/^export\s+/, "");
    if (!line.startsWith("MUSU_BRIDGE_TOKEN=")) continue;

    const value = line
      .slice("MUSU_BRIDGE_TOKEN=".length)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (value) return value;
  }
  return "";
}

export async function getBridgeToken(): Promise<string> {
  const envToken = process.env.MUSU_BRIDGE_TOKEN?.trim();
  if (envToken) return envToken;

  try {
    const body = await readFile(join(getMusuHome(), "bridge.env"), "utf8");
    return parseBridgeTokenEnv(body);
  } catch {
    return "";
  }
}
