# TASK-2C: musu-indexer 웹 통합 + pytest suite

> 작성: 2026-04-14 | 우선순위: P3 | 예상: 4h
> 참조: MASTER_BACKLOG_2026-04-14.md

---

## 현황 파악

- musu-bee `/api/wiki` → `wiki.db` FTS5 ✅ (이미 동작)
- musu-indexer → `.musu_dev.db` FTS5 `search_index` 테이블 ❌ 웹 미연결
- musu-indexer pytest: 19개 테스트 있지만 PYTHONPATH 없으면 import 실패

## 목표

1. musu-indexer pytest 정상 실행 (`pythonpath = ["src"]` 추가)
2. `/api/index-search` Next.js API 라우트 신규 — `.musu_dev.db` `search_index` FTS5 직접 쿼리
3. `@wiki query` 시 위키 결과 + 코드 검색 결과 합쳐 표시

---

## 변경 파일

| 파일 | 작업 |
|------|------|
| `musu-indexer/pyproject.toml` | `[tool.pytest.ini_options]` pythonpath 추가 |
| `musu-bee/src/app/api/index-search/route.ts` | 신규 — FTS5 코드 검색 |
| `musu-bee/src/lib/chatCommands/handleWikiCommand.ts` | @wiki → 코드 검색 결과 병합 |

---

## 1. musu-indexer/pyproject.toml

```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

검증: `cd musu-indexer && .venv/bin/python -m pytest tests/ -q` → 19 passed

---

## 2. /api/index-search/route.ts (신규)

SQLite FTS5 직접 쿼리. musu-indexer 프로세스 실행 불필요.

```typescript
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
    const db = new DatabaseSync(INDEX_DB_PATH, { readonly: true });
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
      .all(q, limit) as SearchRow[];
    db.close();
    return NextResponse.json({ results: rows });
  } catch (err) {
    // DB not found or FTS error — return empty gracefully
    return NextResponse.json({ results: [], error: String(err) });
  }
}
```

---

## 3. handleWikiCommand.ts 수정

`@wiki query` 시 `/api/wiki` (knowledge) + `/api/index-search` (code) 병렬 쿼리:

```typescript
// @wiki <query> → search wiki AND code index
if (text.startsWith("@wiki ")) {
  const query = text.slice(6).trim();
  if (!query) return false;
  appendChatMessage({ ...userMsg });
  setIsAgentTyping(true);
  try {
    const [wikiRes, codeRes] = await Promise.all([
      fetch(`/api/wiki?q=${encodeURIComponent(query)}&scope=global`),
      fetch(`/api/index-search?q=${encodeURIComponent(query)}&limit=3`),
    ]);
    const wikiData = (await wikiRes.json()) as { pages?: Array<...> };
    const codeData = (await codeRes.json()) as { results?: Array<{ path: string; title: string; type: string; snippet: string }> };

    const sections: string[] = [];

    // Wiki knowledge results
    if (wikiData.pages?.length) {
      sections.push(
        "**📚 Knowledge Base**\n" +
        wikiData.pages.slice(0, 3).map((p, i) => {
          const kps = (p.key_points ?? []).slice(0, 2).map(kp => `  • ${kp}`).join("\n");
          return `**${i + 1}. ${p.title ?? "—"}**\n${p.summary ?? ""}\n${kps}`;
        }).join("\n\n")
      );
    }

    // Code index results
    if (codeData.results?.length) {
      sections.push(
        "**🔍 Code Index**\n" +
        codeData.results.map(r =>
          `\`${r.path}\` [${r.type}]\n  ${r.title}\n  ...${r.snippet}...`
        ).join("\n\n")
      );
    }

    const reply = sections.length > 0
      ? sections.join("\n\n---\n\n")
      : `No results for "${query}".`;

    appendChatMessage({ ..., sender: "Wiki", senderKind: "ai", text: reply });
  } catch {
    appendChatMessage({ ..., text: "Wiki query failed: network error" });
  } finally {
    setIsAgentTyping(false);
  }
  return true;
}
```

---

## 검증

```bash
# 1. musu-indexer pytest
cd musu-indexer && .venv/bin/python -m pytest tests/ -q
# → 19 passed

# 2. index-search API
curl "http://localhost:3001/api/index-search?q=agent"
# → {"results": [...]}

# 3. wiki.db 검색 (기존 유지)
curl "http://localhost:3001/api/wiki?q=CEO"
# → {"pages": [...]}
```

---

## 제외 범위

- musu-indexer HTTP 서버 추가 (MCP 전용으로 충분)
- 코드 인덱스 실시간 동기화 (musu-indexer CLI로 수동 동기화)
- MUSU_INDEX_DB env var 문서화 (기본값으로 충분)
