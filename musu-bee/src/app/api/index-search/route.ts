import { NextRequest, NextResponse } from "next/server";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const INDEX_DB_PATH =
  process.env.MUSU_INDEX_DB ??
  path.resolve(process.cwd(), "..", ".musu_dev.db");

interface SearchRow {
  path: string;
  title: string;
  type: string;
  snippet: string;
  score: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "5"), 20);

  if (!q) return NextResponse.json({ results: [] });

  try {
    const db = new DatabaseSync(INDEX_DB_PATH);
    const rows = db
      .prepare(
        `SELECT path, title, type,
                snippet(search_index, 2, '<b>', '</b>', '...', 24) as snippet,
                rank as score
         FROM search_index
         WHERE search_index MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(q, limit) as unknown as SearchRow[];
    db.close();
    return NextResponse.json({ results: rows });
  } catch (err) {
    // DB not found or FTS error — return empty gracefully
    return NextResponse.json({ results: [], error: String(err) });
  }
}
