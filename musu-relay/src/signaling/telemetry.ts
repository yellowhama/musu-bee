// musu.pro signaling telemetry collector (V23.1 T1.5 + T1.6)
//
// Per docs/V23_MASTER_PLAN_2026_05_15.md §9.3:
//   - Captures install / nat_pierce / agent_spawn events from musu-relay
//     running on user PCs
//   - Stores in musu.pro's own SQLite (no Sentry, no PostHog)
//   - NEVER stores user identity, workspace contents, agent outputs,
//     file paths, code, chat history. Plumbing health ONLY
//   - Retention: 90 days raw; aggregated metrics retained indefinitely
//     (TODO V23.5: separate aggregation job)
//
// Schema (T1.6) defined in v40_telemetry.sql; this module applies it
// on startup and exposes Express routers for the three event types.

import express from "express";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import path from "path";

// ── DB bootstrap ──────────────────────────────────────────────────────────

const DB_PATH =
  process.env.MUSU_TELEMETRY_DB || path.join(process.cwd(), "telemetry.db");

let db: Database.Database;

function openDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  applyMigrations(db);
  return db;
}

// Schema v40_telemetry. Inlined so the signaling server can self-bootstrap;
// migrations directory remains the canonical source if/when we add v41+.
const MIGRATION_V40_TELEMETRY = `
CREATE TABLE IF NOT EXISTS schema_version (
  version  INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_install (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at        INTEGER NOT NULL,
  musu_install_id    TEXT NOT NULL,
  os                 TEXT NOT NULL,         -- 'windows'|'linux'|'macos'
  os_version         TEXT NOT NULL,
  musu_version       TEXT NOT NULL,
  wsl2_present_at_start INTEGER,            -- 0|1|NULL when not applicable
  wsl2_feature_enabled  INTEGER,            -- 0|1|NULL
  bios_virtualization_detected TEXT,        -- 'yes'|'no'|'unknown'|NULL
  step_failed        TEXT,                  -- NULL = success
  step_error_class   TEXT,                  -- 'hard_blocker_bios'|'timeout'|'permission'|'network'|...
  elapsed_ms         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_install_received ON telemetry_install(received_at);
CREATE INDEX IF NOT EXISTS idx_install_fail ON telemetry_install(step_failed)
  WHERE step_failed IS NOT NULL;

CREATE TABLE IF NOT EXISTS telemetry_nat_pierce (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at        INTEGER NOT NULL,
  musu_install_id    TEXT NOT NULL,
  attempt_outcome    TEXT NOT NULL,          -- 'success'|'fail'
  fail_cause         TEXT,                   -- 'cgnat_detected'|'symmetric_nat'|'firewall'|'timeout'|NULL
  ice_candidate_count INTEGER,
  elapsed_ms         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nat_received ON telemetry_nat_pierce(received_at);
CREATE INDEX IF NOT EXISTS idx_nat_outcome ON telemetry_nat_pierce(attempt_outcome);

CREATE TABLE IF NOT EXISTS telemetry_agent_spawn (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at        INTEGER NOT NULL,
  musu_install_id    TEXT NOT NULL,
  spawn_outcome      TEXT NOT NULL,          -- 'success'|'fail'
  cold_start_ms      INTEGER,
  node_count_in_cluster INTEGER
);
CREATE INDEX IF NOT EXISTS idx_spawn_received ON telemetry_agent_spawn(received_at);
`;

function applyMigrations(d: Database.Database): void {
  d.exec(MIGRATION_V40_TELEMETRY);
  d.prepare(
    "INSERT OR IGNORE INTO schema_version(version, applied_at) VALUES (?, ?)",
  ).run(40, Date.now());
}

// ── Validation helpers ───────────────────────────────────────────────────

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  return null;
}
function asBool(v: unknown): number | null {
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}
function isValidOs(v: unknown): v is "windows" | "linux" | "macos" {
  return v === "windows" || v === "linux" || v === "macos";
}
function isValidOutcome(v: unknown): v is "success" | "fail" {
  return v === "success" || v === "fail";
}

// ── Routes ────────────────────────────────────────────────────────────────

export function makeTelemetryRouter(): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  const _db = openDb();

  // POST /v1/telemetry/install
  router.post("/install", (req, res) => {
    const b = req.body || {};
    if (!asStr(b.musu_install_id) || !isValidOs(b.os) || !asStr(b.os_version) || !asStr(b.musu_version) || asInt(b.elapsed_ms) === null) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }
    _db
      .prepare(
        `INSERT INTO telemetry_install
           (received_at, musu_install_id, os, os_version, musu_version,
            wsl2_present_at_start, wsl2_feature_enabled,
            bios_virtualization_detected, step_failed, step_error_class,
            elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        b.musu_install_id,
        b.os,
        b.os_version,
        b.musu_version,
        asBool(b.wsl2_present_at_start),
        asBool(b.wsl2_feature_enabled),
        asStr(b.bios_virtualization_detected),
        asStr(b.step_failed),
        asStr(b.step_error_class),
        asInt(b.elapsed_ms),
      );
    res.status(204).end();
  });

  // POST /v1/telemetry/nat_pierce
  router.post("/nat_pierce", (req, res) => {
    const b = req.body || {};
    if (!asStr(b.musu_install_id) || !isValidOutcome(b.attempt_outcome) || asInt(b.elapsed_ms) === null) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }
    _db
      .prepare(
        `INSERT INTO telemetry_nat_pierce
           (received_at, musu_install_id, attempt_outcome, fail_cause,
            ice_candidate_count, elapsed_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        b.musu_install_id,
        b.attempt_outcome,
        asStr(b.fail_cause),
        asInt(b.ice_candidate_count),
        asInt(b.elapsed_ms),
      );
    res.status(204).end();
  });

  // POST /v1/telemetry/agent_spawn (debug-mode optional)
  router.post("/agent_spawn", (req, res) => {
    const b = req.body || {};
    if (!asStr(b.musu_install_id) || !isValidOutcome(b.spawn_outcome)) {
      res.status(400).json({ error: "missing required fields" });
      return;
    }
    _db
      .prepare(
        `INSERT INTO telemetry_agent_spawn
           (received_at, musu_install_id, spawn_outcome, cold_start_ms,
            node_count_in_cluster)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        b.musu_install_id,
        b.spawn_outcome,
        asInt(b.cold_start_ms),
        asInt(b.node_count_in_cluster),
      );
    res.status(204).end();
  });

  // GET /v1/telemetry/summary — internal admin (no auth in V23.1; add for prod)
  router.get("/summary", (_req, res) => {
    const installCount = (
      _db.prepare("SELECT COUNT(*) AS n FROM telemetry_install").get() as {
        n: number;
      }
    ).n;
    const installFails = (
      _db
        .prepare(
          "SELECT COUNT(*) AS n FROM telemetry_install WHERE step_failed IS NOT NULL",
        )
        .get() as { n: number }
    ).n;
    const natTotal = (
      _db.prepare("SELECT COUNT(*) AS n FROM telemetry_nat_pierce").get() as {
        n: number;
      }
    ).n;
    const natSuccess = (
      _db
        .prepare(
          "SELECT COUNT(*) AS n FROM telemetry_nat_pierce WHERE attempt_outcome='success'",
        )
        .get() as { n: number }
    ).n;
    res.json({
      install: {
        total: installCount,
        failures: installFails,
        failure_rate: installCount > 0 ? installFails / installCount : 0,
      },
      nat_pierce: {
        total: natTotal,
        success: natSuccess,
        success_rate: natTotal > 0 ? natSuccess / natTotal : 0,
      },
    });
  });

  return router;
}

// ── Test helpers ─────────────────────────────────────────────────────────

export function _resetDb(): void {
  if (!db) return;
  db.exec(
    `DELETE FROM telemetry_install;
     DELETE FROM telemetry_nat_pierce;
     DELETE FROM telemetry_agent_spawn;`,
  );
}

export function _closeDb(): void {
  if (db) {
    db.close();
    db = undefined as any;
  }
}
