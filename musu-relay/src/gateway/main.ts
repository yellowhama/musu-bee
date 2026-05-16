// musu-relay/src/gateway/main.ts — V23.2 Workstream B4b (wiki/372)
//
// Gateway entry-point for the WSL2 backend distro (B4a + B4b).
// Replaces dist/gateway/client.js as the OpenRC service entry-point.
// (client.ts only exports the class; this file constructs + connects.)
//
// Critic HIGH #1 (C1) resolution: this file lives at src/gateway/main.ts
// rather than installer/gateway-main.ts so that `import { GatewayClient }
// from "./client"` resolves cleanly under the existing tsconfig.json
// `include: ["src"]`. `npm run build` produces dist/gateway/main.js
// alongside the other gateway files; B4a's `cp -r dist/gateway` step bakes
// it into the tar automatically. No new tsconfig.json, no --rootDir
// shenanigans.
//
// Responsibilities:
//   1. Read /etc/musu/gateway.env (key=value, written by install-wsl2.ps1).
//   2. Read /etc/musu/account_key (written by musu-write-key); if missing,
//      let GatewayClient.bootstrapAccountKey() fire as fallback.
//   3. Build a GatewayConfig and call client.connect().
//   4. Emit a synthetic install_completed telemetry event (OQ2 hybrid
//      path — Critic INFO C14 MUST-DO).
//   5. Stay alive (await indefinitely).
//
// Failure semantics: install_completed telemetry POST is best-effort and
// MUST NOT crash the gateway. The install is successful (account_key +
// gateway.env + WS handshake all worked) even if the telemetry POST 5xxs.

import { createHmac } from "crypto";
import * as fs from "fs";
import {
  DEFAULT_STUN_SERVERS,
  GatewayClient,
  GatewayConfig,
} from "./client";

/** Parse a simple KEY=VALUE file. Skips blank lines and #-prefixed comments.
 *  Tolerant of trailing CR (CRLF source from PowerShell).
 *  Keys must match `[A-Z_][A-Z0-9_]*`; non-conforming lines are silently skipped.
 */
function readEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  const txt = fs.readFileSync(p, "utf-8");
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Best-effort emission of the synthetic install_completed event.
 *
 *  Reuses the HMAC pattern from client.ts:489-549 (recordOutcome). Posts
 *  to ${telemetryBase}/install with x-musu-user-id + x-musu-telemetry-signature
 *  headers. Failure is logged and swallowed — the install is successful
 *  even if telemetry POST fails (B1 wire-contract is fire-and-forget).
 */
async function emitInstallCompleted(
  cfg: GatewayConfig,
  effectiveAccountKey: string | undefined,
  musuVersion: string,
  osVersion: string,
  installElapsedMs: number,
  log: (line: string) => void,
): Promise<void> {
  if (!cfg.telemetryBase) {
    log("[gateway-main] install_completed skipped: no telemetryBase");
    return;
  }
  if (!cfg.musuInstallId) {
    log("[gateway-main] install_completed skipped: no musuInstallId");
    return;
  }
  if (!effectiveAccountKey) {
    log("[gateway-main] install_completed skipped: no accountKey");
    return;
  }

  // Schema mirrors telemetry.ts:553-583 (POST /v1/telemetry/install). Server
  // validates required fields: musu_install_id, os, os_version, musu_version,
  // elapsed_ms. step_failed=null marks a successful install.
  const record = {
    musu_install_id: cfg.musuInstallId,
    os: "windows",
    os_version: osVersion,
    musu_version: musuVersion,
    wsl2_present_at_start: null,
    wsl2_feature_enabled: null,
    bios_virtualization_detected: null,
    step_failed: null,
    step_error_class: null,
    elapsed_ms: installElapsedMs,
  };
  // ONE rawBody variable — HMAC compute AND fetch body MUST be the same
  // bytes (client.ts:514-520 body-identity invariant).
  const rawBody = JSON.stringify(record);
  const t = Math.floor(Date.now() / 1000);
  const signedString = `${t}.${rawBody}`;
  const v1 = createHmac("sha256", effectiveAccountKey)
    .update(signedString)
    .digest("hex");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-musu-user-id": cfg.userId,
    "x-musu-telemetry-signature": `t=${t},v1=${v1}`,
  };

  const fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  try {
    const resp = await fetchImpl(`${cfg.telemetryBase}/install`, {
      method: "POST",
      headers,
      body: rawBody,
    });
    log(
      `[gateway-main] install_completed POST status=${resp.status}`,
    );
  } catch (err) {
    log(
      `[gateway-main] install_completed POST failed (best-effort, ignored): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

async function main(): Promise<void> {
  // JS-side fallback measurement for installElapsedMs (M2 audit-fix). Used
  // when MUSU_INSTALL_STARTED_AT_UTC is absent or unparseable.
  const processStartMs = Date.now();

  const envFile = process.env.MUSU_ENV_FILE ?? "/etc/musu/gateway.env";
  let env: Record<string, string>;
  try {
    env = readEnvFile(envFile);
  } catch (err) {
    console.error(
      `[gateway-main] FATAL: cannot read env file ${envFile}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    process.exit(1);
    return; // unreachable; satisfies control-flow checker
  }

  const signalingBase = env.MUSU_SIGNALING_URL;
  const token = env.MUSU_TUNNEL_TOKEN;
  const userId = env.MUSU_USER_ID;
  const telemetryBase = env.MUSU_TELEMETRY_BASE;
  const musuInstallId = env.MUSU_INSTALL_ID;
  if (!signalingBase || !token || !userId || !musuInstallId) {
    console.error(
      "[gateway-main] FATAL: gateway.env missing one of MUSU_SIGNALING_URL/MUSU_TUNNEL_TOKEN/MUSU_USER_ID/MUSU_INSTALL_ID",
    );
    process.exit(1);
    return;
  }

  const keyPath = env.MUSU_ACCOUNT_KEY_PATH ?? "/etc/musu/account_key";
  let accountKey: string | undefined;
  try {
    accountKey = fs.readFileSync(keyPath, "utf-8").trim();
  } catch (err) {
    // Not fatal — GatewayClient.bootstrapAccountKey() fires as fallback.
    console.error(
      `[gateway-main] account_key read at ${keyPath} failed (${
        err instanceof Error ? err.message : String(err)
      }); bootstrapAccountKey fallback will fire`,
    );
  }

  // Convert https://signaling.musu.pro → wss://signaling.musu.pro/signaling
  // (and http→ws for local dev). Append /signaling path per server.ts route.
  const signalingWs =
    signalingBase.replace(/^https?:/, (m) =>
      m === "https:" ? "wss:" : "ws:",
    ) + "/signaling";

  // Read musu-version (provenance baked by B4a build script at /etc/musu-version).
  // Best-effort — if absent, use "unknown".
  let musuVersion = "unknown";
  try {
    const verRaw = fs.readFileSync("/etc/musu-version", "utf-8");
    const sha = verRaw.match(/^git_sha=(.+)$/m)?.[1];
    musuVersion = sha?.trim() ?? "unknown";
  } catch {
    // ignore — /etc/musu-version not present in dev builds
  }

  // OS version from inside WSL — we can't see Windows version directly.
  // Use kernel release as the closest proxy. Server's os_version column is
  // TEXT NOT NULL; PowerShell installer will also write the Windows OS
  // version into gateway.env (extension) for richer telemetry; if present,
  // prefer it.
  const osVersion =
    env.MUSU_WIN_OS_VERSION ??
    (() => {
      try {
        return fs.readFileSync("/proc/sys/kernel/osrelease", "utf-8").trim();
      } catch {
        return process.platform;
      }
    })();

  const cfg: GatewayConfig = {
    signalingUrl: signalingWs,
    token,
    userId,
    stunServers: DEFAULT_STUN_SERVERS,
    pcFactory: {
      create: () => {
        // T1.9 (wrtc factory wiring) is master-plan-deferred. B4b ships with
        // signaling-only — the gateway connects, registers as peer=gateway,
        // and is ready for OFFERs but cannot complete handshakes until T1.9.
        throw new Error("TODO T1.9 wrtc factory wiring");
      },
    },
    telemetryBase,
    musuInstallId,
    accountKey,
    onLog: (l) => process.stdout.write(l + "\n"),
  };

  const client = new GatewayClient(cfg);
  await client.connect();
  console.log(
    "[gateway-main] connect() resolved; entering long-running loop",
  );

  // M1 audit-fix: bootstrap-path C14 gap. If account_key was absent on disk,
  // GatewayClient.bootstrapAccountKey() may have fetched one inside connect().
  // Prefer the in-client value over the locally-read one so install_completed
  // emission does NOT silently skip on the bootstrap path.
  const effectiveAccountKey = client.accountKey ?? accountKey;

  // M2 audit-fix: stale install_elapsed_ms. install-wsl2.ps1 now writes
  // MUSU_INSTALL_STARTED_AT_UTC (ISO 8601) at step 8; we compute the actual
  // elapsed by subtracting from Date.now() here, AFTER connect() resolves.
  // Falls back to processStartMs if the env var is missing/unparseable.
  let installElapsedMs: number;
  const startedAtStr = env.MUSU_INSTALL_STARTED_AT_UTC;
  const parsedStartedAtMs = startedAtStr
    ? new Date(startedAtStr).getTime()
    : NaN;
  if (Number.isFinite(parsedStartedAtMs)) {
    installElapsedMs = Date.now() - parsedStartedAtMs;
  } else {
    installElapsedMs = Date.now() - processStartMs;
  }

  // C14 INFO MUST-DO: emit synthetic install_completed event.
  // Wrap in try/catch so any thrown error does NOT crash the gateway —
  // install is successful even if this POST fails.
  if (effectiveAccountKey) {
    try {
      await emitInstallCompleted(
        cfg,
        effectiveAccountKey,
        musuVersion,
        osVersion,
        installElapsedMs,
        (l) => process.stdout.write(l + "\n"),
      );
    } catch (err) {
      console.error(
        `[gateway-main] install_completed emission threw (swallowed): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } else {
    console.error(
      "[gateway-main] no accountKey available — install_completed not emitted",
    );
  }

  // Keep alive indefinitely. OpenRC's command_background=true tracks the
  // pidfile; this promise never resolves under normal operation.
  await new Promise<void>(() => {
    /* never resolves */
  });
}

main().catch((e: unknown) => {
  console.error(
    "[gateway-main] fatal:",
    e instanceof Error ? e.stack ?? e.message : String(e),
  );
  process.exit(1);
});
