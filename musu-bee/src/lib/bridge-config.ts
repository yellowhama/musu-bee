/**
 * Resolves the dynamic MUSU V27 bridge URL.
 * 
 * V27 single-binary writes its dynamic port to `~/.musu/services/bridge.json`.
 * If the file exists and is valid, we use its `addr`.
 * Otherwise, we fallback to ENV vars or the legacy 8070 default.
 */
export function getBridgeUrl(): string {
  if (typeof window !== "undefined") {
    // Client-side fallback
    return process.env.NEXT_PUBLIC_BRIDGE_URL?.trim().replace(/\/+$/, "") || "http://127.0.0.1:8070";
  }

  // 1. Try to read from ~/.musu/services/bridge.json on the server
  try {
    const dynamicRequire = eval("require") as NodeRequire;
    const fs = dynamicRequire("fs") as typeof import("fs");
    const path = dynamicRequire("path") as typeof import("path");
    const os = dynamicRequire("os") as typeof import("os");
    const musuHome = process.env.MUSU_HOME?.trim();
    const homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
    const bridgeJsonPath = path.join(musuHome || path.join(homeDir, ".musu"), "services", "bridge.json");
    
    if (fs.existsSync(bridgeJsonPath)) {
      const data = fs.readFileSync(bridgeJsonPath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && parsed.addr) {
        // The addr looks like `127.0.0.1:11319` or `0.0.0.0:11319`
        const hostPort = parsed.addr.replace(/^0\.0\.0\.0/, '127.0.0.1');
        return `http://${hostPort}`;
      }
    }
  } catch (error) {
    console.warn("[BridgeConfig] Failed to read dynamic port, falling back:", error);
  }

  // 2. Fallback to explicitly configured URL
  if (process.env.MUSU_BRIDGE_URL) {
    return process.env.MUSU_BRIDGE_URL.trim().replace(/\/+$/, "");
  }

  // 3. Fallback to NEXT_PUBLIC configuration if running on client (though this is primarily for server)
  if (process.env.NEXT_PUBLIC_BRIDGE_URL) {
    return process.env.NEXT_PUBLIC_BRIDGE_URL.trim().replace(/\/+$/, "");
  }

  // 4. Ultimate fallback to legacy 8070
  return "http://127.0.0.1:8070";
}
