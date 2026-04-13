import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import crypto from "node:crypto";

const WIKI_DB_PATH =
  process.env.MUSU_WIKI_DB ??
  path.resolve(process.cwd(), "..", "wiki.db");

export type WikiPage = {
  id: string;
  scope: string;
  title: string;
  summary: string | null;
  key_points: string[] | null;
  evidence: string[] | null;
  related: string[] | null;
  open_questions: string[] | null;
  source_raw: string | null;
  created_at: string;
  updated_at: string;
};

type WikiRow = {
  id: string;
  scope: string;
  title: string;
  summary: string | null;
  key_points: string | null;
  evidence: string | null;
  related: string | null;
  open_questions: string | null;
  source_raw: string | null;
  created_at: string;
  updated_at: string;
};

let _db: DatabaseSync | null = null;

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      key_points TEXT,
      evidence TEXT,
      related TEXT,
      open_questions TEXT,
      source_raw TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS wiki_scope_idx ON wiki_pages(scope);
    CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(id, scope, title, summary, key_points);
  `);
}

function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(WIKI_DB_PATH);
    initSchema(_db);
  }
  return _db;
}

function rowToPage(row: WikiRow): WikiPage {
  return {
    ...row,
    key_points: row.key_points ? (JSON.parse(row.key_points) as string[]) : null,
    evidence: row.evidence ? (JSON.parse(row.evidence) as string[]) : null,
    related: row.related ? (JSON.parse(row.related) as string[]) : null,
    open_questions: row.open_questions
      ? (JSON.parse(row.open_questions) as string[])
      : null,
  };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function upsertWikiPage(
  params: Omit<WikiPage, "id" | "created_at" | "updated_at"> & { id?: string }
): WikiPage {
  const db = getDb();
  const id = params.id ?? slugify(params.title) + "-" + crypto.randomBytes(3).toString("hex");
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT id FROM wiki_pages WHERE id = ?")
    .get(id) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE wiki_pages SET
        scope=?, title=?, summary=?, key_points=?, evidence=?,
        related=?, open_questions=?, source_raw=?, updated_at=?
       WHERE id=?`
    ).run(
      params.scope,
      params.title,
      params.summary ?? null,
      params.key_points ? JSON.stringify(params.key_points) : null,
      params.evidence ? JSON.stringify(params.evidence) : null,
      params.related ? JSON.stringify(params.related) : null,
      params.open_questions ? JSON.stringify(params.open_questions) : null,
      params.source_raw ?? null,
      now,
      id
    );
    db.prepare("DELETE FROM wiki_fts WHERE id = ?").run(id);
  } else {
    db.prepare(
      `INSERT INTO wiki_pages (id, scope, title, summary, key_points, evidence, related, open_questions, source_raw, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.scope,
      params.title,
      params.summary ?? null,
      params.key_points ? JSON.stringify(params.key_points) : null,
      params.evidence ? JSON.stringify(params.evidence) : null,
      params.related ? JSON.stringify(params.related) : null,
      params.open_questions ? JSON.stringify(params.open_questions) : null,
      params.source_raw ?? null,
      now,
      now
    );
  }

  db.prepare(
    "INSERT INTO wiki_fts(id, scope, title, summary, key_points) VALUES (?, ?, ?, ?, ?)"
  ).run(
    id,
    params.scope,
    params.title,
    params.summary ?? "",
    params.key_points ? params.key_points.join(" ") : ""
  );

  return { id, created_at: now, updated_at: now, ...params };
}

export function queryWiki(
  query: string,
  scope: string,
  limit = 5
): WikiPage[] {
  const db = getDb();

  // FTS search first, then fall back to scope-only list
  let rows: WikiRow[] = [];
  if (query.trim()) {
    try {
      rows = db
        .prepare(
          `SELECT wp.* FROM wiki_fts
           JOIN wiki_pages wp ON wiki_fts.id = wp.id
           WHERE wiki_fts MATCH ? AND (wp.scope = ? OR wp.scope = 'global')
           ORDER BY rank LIMIT ?`
        )
        .all(query, scope, limit) as WikiRow[];
    } catch {
      // FTS match syntax error fallback
      rows = db
        .prepare(
          `SELECT * FROM wiki_pages
           WHERE (scope = ? OR scope = 'global') AND (title LIKE ? OR summary LIKE ?)
           ORDER BY updated_at DESC LIMIT ?`
        )
        .all(scope, `%${query}%`, `%${query}%`, limit) as WikiRow[];
    }
  } else {
    rows = db
      .prepare(
        `SELECT * FROM wiki_pages WHERE scope = ? OR scope = 'global'
         ORDER BY updated_at DESC LIMIT ?`
      )
      .all(scope, limit) as WikiRow[];
  }

  return rows.map(rowToPage);
}

export function listWikiPages(scope: string): WikiPage[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM wiki_pages WHERE scope = ? OR scope = 'global' ORDER BY updated_at DESC"
    )
    .all(scope) as WikiRow[];
  return rows.map(rowToPage);
}

export function deleteWikiPage(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM wiki_pages WHERE id = ?").run(id);
  db.prepare("DELETE FROM wiki_fts WHERE id = ?").run(id);
  return (result.changes as number) > 0;
}
