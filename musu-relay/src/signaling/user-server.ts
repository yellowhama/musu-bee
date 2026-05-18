// musu-relay/src/signaling/user-server.ts
//
// V23.4 T2-F (wiki/433): user-PC self-hosted signaling rendezvous.
// Differs from src/signaling/server.ts (cloud variant on signaling.musu.pro):
//   - NO telemetry router mount
//   - NO checkTelemetryAuthBootConfig
//   - NO import of ./server (would transitively pull telemetry.ts →
//     better-sqlite3) — C-T2F-H1 fix
//   - Imports ONLY from ./shared which has zero telemetry/better-sqlite3 imports
//   - Binds 0.0.0.0:MUSU_SIGNALING_PORT (default 9900) for LAN reach
//   - Same WS protocol so peers interoperate with cloud server.ts
//
// Per V23.4 Phase 4 [[feedback-self-contained-product]]: this is the
// rendezvous binary shipped inside musu-backend.tar to the user's PC.
// First-installed PC is the rendezvous role; subsequent PCs are peers that
// point MUSU_SIGNALING_URL at the rendezvous PC's LAN IP.
//
// NOTE (post-Audit): user-server /metrics intentionally omits peers_total,
// rooms_total, circuit_breaker (those live in cloud server.ts /metrics).
// user-server is a lightweight rendezvous; full observability stays on the
// cloud variant.

import http from "http";
import { WebSocketServer } from "ws";
import express from "express";
import {
  rooms,
  _resetAuthState,
  _wssConnectionHandler,
} from "./shared"; // OQ-CRIT-1: NOT "./server"
// NOTE (NEW-A3 / OQ-A3): validateToken is NOT imported here. It is invoked
// from inside _wssConnectionHandler (HELLO message handler) which lives in
// shared.ts. user-server.ts therefore neither imports nor re-exports it.

const PORT = parseInt(
  process.env.PORT || process.env.MUSU_SIGNALING_PORT || "9900",
  10,
);

const app = express();
app.set("trust proxy", 1);

const _startTime = Date.now();
app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms_active: rooms.size, mode: "user-server" });
});

app.get("/metrics", (_req, res) => {
  res.json({
    uptime_seconds: Math.floor((Date.now() - _startTime) / 1000),
    rooms_active: rooms.size,
    peers_active: Array.from(rooms.values()).reduce((n, r) => n + r.size, 0),
    mode: "user-server",
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/signaling") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", _wssConnectionHandler);

if (require.main === module) {
  // Bind 0.0.0.0 so peer PCs on the LAN can reach the rendezvous (NOT
  // 127.0.0.1, which would only be reachable from inside the WSL distro).
  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[user-server] listening on 0.0.0.0:${PORT} (rendezvous mode)`,
    );
  });
}

// OQ-A3: validateToken intentionally dropped from exports (unused at this
// surface — HELLO handler in shared.ts invokes it internally).
export { app, server, wss, rooms, _resetAuthState };
