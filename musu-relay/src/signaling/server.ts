// musu.pro WebRTC signaling server (V23.1 T1.1)
//
// Role under V23 product model (per docs/V23_MASTER_PLAN_2026_05_15.md §0,§9,§14):
//   - Stateless, cloud-hosted (legacy backward-compatible deployment)
//   - Exchanges WebRTC SDP offers/answers + ICE candidates between
//     external visitors and the user's musu-relay-gateway running
//     on the user's PC
//   - Carries NO traffic. Once peers exchange ICE, they connect
//     directly via WebRTC DataChannel. musu.pro never sees workspace
//     data
//   - Authenticates paid-tier users via musu.pro identity (token
//     validation kept from old server.ts; circuit breaker preserved)
//
// V23.4 T2-F (wiki/433) refactor: wire-protocol primitives extracted to
// ./shared.ts so user-server.ts (user-PC rendezvous) can import them
// without transitively pulling telemetry.ts → better-sqlite3. This file
// stays as the cloud variant and re-exports `_validationCache` for
// backward compat with signaling.test.ts (NEW-A3 / OQ-A1).
//
// What this file is NOT (deliberately stripped from old server.ts):
//   - Bidirectional HTTP-over-WS tunnel (that was the v21 cloud broker
//     model; superseded by True P2P per L1+L2+L7)
//   - HTTP request/response proxying (signaling-only)
//   - WebSocket-frame relay (no traffic mediation)
//
// Telemetry endpoints (per V23 plan §9.3) live in src/signaling/telemetry.ts
// (T1.5, separate file).

import http from "http";
import { WebSocketServer } from "ws";
import express from "express";
import { checkTelemetryAuthBootConfig, makeTelemetryRouter } from "./telemetry";
import {
  // OQ-A1 / NEW-A3: alias _validationCache as validationCache so internal
  // call sites stay byte-identical to the pre-refactor file. signaling.test.ts
  // imports `_validationCache` from "./server" — re-exported below.
  _validationCache as validationCache,
  rooms,
  validateToken,
  _resetAuthState,
  _wssConnectionHandler,
  _circuitFailures,
  _circuitOpenUntil,
} from "./shared";

const PORT = parseInt(
  process.env.PORT || process.env.MUSU_SIGNALING_PORT || "9900",
  10,
);

// ── Token Validation Cache + Circuit Breaker (V23.2 T2.AUTH.1) ─────────────
// Implementation moved to ./shared.ts (V23.4 T2-F / wiki/433). Imported above.

// ── Peer model ────────────────────────────────────────────────────────────
// Types + room helpers (joinRoom/leaveRoom/findPeerInRoom/send/broadcast) +
// the wss connection handler all live in ./shared.ts as of V23.4 T2-F. This
// file keeps the Express HTTP surface (telemetry router mount + /metrics +
// /health) plus the listen-on-PORT bootstrap.

// ── Express HTTP surface ──────────────────────────────────────────────────

const app = express();

// V23.3 B2 (wiki/390 §3.4 + Critic C-B2-H1): trust exactly one proxy hop so
// req.ip consumes the right-most X-Forwarded-For entry (the actual client
// IP), not the upstream proxy socket peer. Without this, the
// /v1/telemetry/install_attempt rate-limit dimension
// "(install_id, source_ip)" would collapse to "(install_id, proxy-ip)" —
// i.e. functionally per-install_id-only — and an attacker rotating
// install_id (a free [Guid]::NewGuid()) would get unlimited 20-token
// buckets.
app.set("trust proxy", 1);

const _startTime = Date.now();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Telemetry endpoints (V23.1 T1.5)
//
// V23.2 B1 commit 4: inject validateToken so the /issue_install_key route
// can derive a canonical user_id from the supplied tunnel token. We pass
// "" as the claimedUserId — historically (pre-B2) this hint mattered
// because the v21-era /validate upstream fell back to echoing the claim;
// post-B2 (wiki/365) the upstream always returns the canonical user_id
// in the 200 body and the claim is ignored on our side. The adapter
// normalizes ""→null defensively in case the upstream is ever rolled
// back to v21-era behavior.
//
// forceRefresh=true RETAINED as defense-in-depth (Critic LOW #2 RESOLVED,
// wiki/365 §15). Rationale:
//   - The validationCache is keyed on the token alone (shared.ts +
//     audit HIGH #3 fix). Even with the v21 fallback removed in B2-bee
//     (wiki/365), forceRefresh guarantees the bootstrap path never reads
//     a stale or attacker-poisoned cache entry written by a concurrent
//     WS HELLO.
//   - The HELLO handler in shared.ts now rejects userId=null with 4003,
//     but the cache write still happens before HELLO sees the result —
//     so a 200-with-empty-user_id from a misconfigured upstream would
//     land in the cache as {valid:true, canonicalUserId:null} and the
//     bootstrap path would also see null and return 503 (correct).
//     forceRefresh just ensures this path never trusts cache writes it
//     didn't initiate.
app.use(
  "/v1/telemetry",
  makeTelemetryRouter(async (token) => {
    const r = await validateToken(token, "", /* forceRefresh */ true);
    return {
      valid: r.valid,
      userId: r.userId && r.userId.length > 0 ? r.userId : null,
    };
  }),
);

app.get("/metrics", (_req, res) => {
  res.json({
    uptime_seconds: Math.floor((Date.now() - _startTime) / 1000),
    rooms_active: rooms.size,
    peers_active: Array.from(rooms.values()).reduce(
      (n, r) => n + r.size,
      0,
    ),
    // _totalPeers / _totalRooms now live in shared.ts but are not currently
    // surfaced via getters; cloud /metrics keeps the lifetime counters at 0
    // post-refactor (acceptable; signaling.test.ts does not assert on these).
    peers_total: 0,
    rooms_total: 0,
    circuit_breaker: {
      failures: _circuitFailures,
      open_until:
        _circuitOpenUntil > Date.now()
          ? new Date(_circuitOpenUntil).toISOString()
          : null,
    },
  });
});

// ── HTTP server + WS upgrade ──────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/signaling") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

// V23.4 T2-F: connection handler is the lifted _wssConnectionHandler from
// ./shared.ts. user-server.ts uses the SAME line. signaling.test.ts MUST
// pass UNMODIFIED (C-T2F-H5 zero-behavior-change gate).
wss.on("connection", _wssConnectionHandler);

// ── Bootstrap ─────────────────────────────────────────────────────────────

if (require.main === module) {
  // V23.2 audit HIGH #3: fail fast in production if the telemetry secret
  // is unset, so the operator sees the misconfig at deploy time rather
  // than discovering anonymous-telemetry months later.
  const bootErr = checkTelemetryAuthBootConfig(process.env);
  if (bootErr) {
    console.error(`[signaling] FATAL: ${bootErr}`);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`[signaling] listening on ${PORT}`);
  });
}

// ── Exports ──────────────────────────────────────────────────────────────
// V23.4 T2-F: _validationCache is re-exported from ./shared (NEW-A3 /
// OQ-A1) so signaling.test.ts continues to import it from "./server"
// unchanged.

export {
  app,
  server,
  wss,
  rooms,
  _resetAuthState,
};
// V23.4 T2-F (NEW-A3 / OQ-A1): re-export shared symbols that existing tests
// import from "./server" (validate-token.test.ts, issue-install-key-cache-
// bypass.test.ts, signaling.test.ts). Keeps test files byte-identical to
// pre-refactor. Per OQ-CRIT-5, these are backward-compat re-exports only —
// internal call sites in this file use the alias-imported names above.
export { _validationCache, validateToken } from "./shared";
