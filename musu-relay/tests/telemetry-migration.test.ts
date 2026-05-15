/**
 * Schema v40→v41 migration tests (V23.2 B1 commit 2 of 6).
 *
 * Covers wiki/363 §3.1 (DDL), §3.2 (sibling-constant + conditional exec),
 * and §9 (Const III env-gate). Asserted invariants:
 *   1. Fresh DB: both v40 and v41 land in schema_version.
 *   2. Re-running applyMigrations is idempotent (no error, no duplicate
 *      schema_version rows).
 *   3. telemetry_account_keys is queryable and has the expected shape.
 *   4. idx_account_keys_last_seen exists in sqlite_master.
 *   5. Pre-existing v40 DB upgrade path: v41 added without rerunning the
 *      v40 INSERT (count(40) stays at 1).
 *   6. Const III env-gate, three regimes:
 *       a. NODE_ENV=production AND var unset → throws with the expected
 *          'MUSU_TELEMETRY_V41_AUTHORIZED' message; no v41 row.
 *       b. NODE_ENV=production AND var='1' → succeeds.
 *       c. NODE_ENV!=production AND var unset → succeeds (gate is
 *          production-only).
 *
 * Strategy: use bare better-sqlite3 :memory: instances and call
 * applyMigrations directly. We bypass openDb() entirely so each test
 * has a fresh DB without touching the module-level singleton, and we
 * never load any router. Env vars are saved/restored around each test
 * to prevent cross-file leakage (telemetry-auth.test.ts and friends
 * set NODE_ENV-adjacent state).
 */

// Pin :memory: just in case any downstream import touches DB_PATH; this
// file does NOT actually open the module-level db.
process.env.MUSU_TELEMETRY_DB = ":memory:";

import Database from "better-sqlite3";
import { applyMigrations } from "../src/signaling/telemetry";

// ── env scrubbing ────────────────────────────────────────────────────────
//
// Tests below mutate NODE_ENV and MUSU_TELEMETRY_V41_AUTHORIZED. Capture
// and restore so other test files (and the harness's own NODE_ENV=test
// default) see the world they expect.
const _origNodeEnv = process.env.NODE_ENV;
const _origAuthorized = process.env.MUSU_TELEMETRY_V41_AUTHORIZED;

afterEach(() => {
  if (_origNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = _origNodeEnv;
  if (_origAuthorized === undefined) delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
  else process.env.MUSU_TELEMETRY_V41_AUTHORIZED = _origAuthorized;
});

function freshDb(): Database.Database {
  const d = new Database(":memory:");
  d.pragma("journal_mode = WAL");
  return d;
}

function versions(d: Database.Database): number[] {
  return (
    d
      .prepare("SELECT version FROM schema_version ORDER BY version")
      .all() as Array<{ version: number }>
  ).map((r) => r.version);
}

describe("V23.2 B1 commit 2 — schema v41 telemetry_account_keys", () => {
  describe("fresh DB", () => {
    it("applies v40 + v41 and records both in schema_version", () => {
      // Ensure gate is open for this fresh-DB suite (default test env).
      delete process.env.NODE_ENV;
      delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
      const d = freshDb();
      applyMigrations(d);
      expect(versions(d)).toEqual([40, 41]);
      d.close();
    });

    it("creates telemetry_account_keys queryable and empty", () => {
      const d = freshDb();
      applyMigrations(d);
      const rows = d
        .prepare("SELECT * FROM telemetry_account_keys")
        .all();
      expect(rows).toEqual([]);
      d.close();
    });

    it("creates idx_account_keys_last_seen index", () => {
      const d = freshDb();
      applyMigrations(d);
      const idx = d
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name=?",
        )
        .get("idx_account_keys_last_seen") as { name: string } | undefined;
      expect(idx).toBeDefined();
      expect(idx!.name).toBe("idx_account_keys_last_seen");
      d.close();
    });

    it("accepts insert/select of an account_key row with the documented shape", () => {
      const d = freshDb();
      applyMigrations(d);
      const now = Date.now();
      d.prepare(
        `INSERT INTO telemetry_account_keys
           (user_id, account_key, first_install_id, issued_at, last_seen_at, rotated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run("user-1", "deadbeef".repeat(8), "install-1", now, null, null);
      const row = d
        .prepare("SELECT * FROM telemetry_account_keys WHERE user_id = ?")
        .get("user-1") as {
        user_id: string;
        account_key: string;
        first_install_id: string;
        issued_at: number;
        last_seen_at: number | null;
        rotated_at: number | null;
      };
      expect(row.user_id).toBe("user-1");
      expect(row.account_key).toHaveLength(64);
      expect(row.first_install_id).toBe("install-1");
      expect(row.issued_at).toBe(now);
      expect(row.last_seen_at).toBeNull();
      expect(row.rotated_at).toBeNull();
      d.close();
    });
  });

  describe("idempotency", () => {
    it("re-running applyMigrations on a v41 DB is a no-op (no error, no dup rows)", () => {
      const d = freshDb();
      applyMigrations(d);
      const before = versions(d);
      // Second run.
      expect(() => applyMigrations(d)).not.toThrow();
      const after = versions(d);
      expect(after).toEqual(before);
      // INSERT OR IGNORE means there's still exactly one row per version.
      const v40Count = (
        d
          .prepare("SELECT COUNT(*) AS n FROM schema_version WHERE version = 40")
          .get() as { n: number }
      ).n;
      const v41Count = (
        d
          .prepare("SELECT COUNT(*) AS n FROM schema_version WHERE version = 41")
          .get() as { n: number }
      ).n;
      expect(v40Count).toBe(1);
      expect(v41Count).toBe(1);
      d.close();
    });
  });

  describe("pre-existing v40 DB upgrade path", () => {
    it("upgrades a v40-only DB to v41 without re-inserting v40's schema_version row", () => {
      // Simulate a DB that was provisioned BEFORE this commit landed: it
      // has v40 tables and a schema_version row for 40, but no v41 table.
      // We use direct DDL to avoid coupling to the v40 constant's text.
      const d = freshDb();
      d.exec(`
        CREATE TABLE schema_version (
          version  INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
        CREATE TABLE telemetry_install (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          received_at INTEGER NOT NULL,
          musu_install_id TEXT NOT NULL,
          os TEXT NOT NULL,
          os_version TEXT NOT NULL,
          musu_version TEXT NOT NULL,
          wsl2_present_at_start INTEGER,
          wsl2_feature_enabled INTEGER,
          bios_virtualization_detected TEXT,
          step_failed TEXT,
          step_error_class TEXT,
          elapsed_ms INTEGER NOT NULL
        );
        CREATE TABLE telemetry_nat_pierce (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          received_at INTEGER NOT NULL,
          musu_install_id TEXT NOT NULL,
          attempt_outcome TEXT NOT NULL,
          fail_cause TEXT,
          ice_candidate_count INTEGER,
          elapsed_ms INTEGER NOT NULL
        );
        CREATE TABLE telemetry_agent_spawn (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          received_at INTEGER NOT NULL,
          musu_install_id TEXT NOT NULL,
          spawn_outcome TEXT NOT NULL,
          cold_start_ms INTEGER,
          node_count_in_cluster INTEGER
        );
      `);
      const v40StampAt = 1700000000000;
      d.prepare(
        "INSERT INTO schema_version(version, applied_at) VALUES (?, ?)",
      ).run(40, v40StampAt);

      // Verify the simulated starting state.
      expect(versions(d)).toEqual([40]);

      // Run the migration.
      applyMigrations(d);

      // Both versions now present.
      expect(versions(d)).toEqual([40, 41]);

      // The original v40 row's applied_at must NOT have been overwritten:
      // INSERT OR IGNORE protects it. This protects audit history.
      const v40Row = d
        .prepare("SELECT applied_at FROM schema_version WHERE version = 40")
        .get() as { applied_at: number };
      expect(v40Row.applied_at).toBe(v40StampAt);

      // telemetry_account_keys exists.
      const tbl = d
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get("telemetry_account_keys") as { name: string } | undefined;
      expect(tbl).toBeDefined();

      d.close();
    });
  });

  describe("Const III env-gate (wiki/363 §9)", () => {
    it("throws when NODE_ENV=production and MUSU_TELEMETRY_V41_AUTHORIZED is unset", () => {
      process.env.NODE_ENV = "production";
      delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
      const d = freshDb();
      expect(() => applyMigrations(d)).toThrow(
        /MUSU_TELEMETRY_V41_AUTHORIZED/,
      );
      // v40 landed before the gate fires; v41 must NOT be present.
      expect(versions(d)).toEqual([40]);
      const tbl = d
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get("telemetry_account_keys");
      expect(tbl).toBeUndefined();
      d.close();
    });

    it("throws with a message naming the secret env var (operator hint)", () => {
      process.env.NODE_ENV = "production";
      delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
      const d = freshDb();
      expect(() => applyMigrations(d)).toThrow(
        /fly secrets set/,
      );
      d.close();
    });

    it("rejects an explicit non-1 value (only '1' opens the gate)", () => {
      process.env.NODE_ENV = "production";
      process.env.MUSU_TELEMETRY_V41_AUTHORIZED = "true"; // not '1'
      const d = freshDb();
      expect(() => applyMigrations(d)).toThrow(
        /MUSU_TELEMETRY_V41_AUTHORIZED/,
      );
      d.close();
    });

    it("succeeds when NODE_ENV=production and MUSU_TELEMETRY_V41_AUTHORIZED=1", () => {
      process.env.NODE_ENV = "production";
      process.env.MUSU_TELEMETRY_V41_AUTHORIZED = "1";
      const d = freshDb();
      expect(() => applyMigrations(d)).not.toThrow();
      expect(versions(d)).toEqual([40, 41]);
      d.close();
    });

    it("succeeds when NODE_ENV=test and the authorization var is unset (gate is production-only)", () => {
      process.env.NODE_ENV = "test";
      delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
      const d = freshDb();
      expect(() => applyMigrations(d)).not.toThrow();
      expect(versions(d)).toEqual([40, 41]);
      d.close();
    });

    it("succeeds when NODE_ENV is unset entirely (dev-without-env-set path)", () => {
      delete process.env.NODE_ENV;
      delete process.env.MUSU_TELEMETRY_V41_AUTHORIZED;
      const d = freshDb();
      expect(() => applyMigrations(d)).not.toThrow();
      expect(versions(d)).toEqual([40, 41]);
      d.close();
    });
  });
});
