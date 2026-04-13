import { NextRequest, NextResponse } from "next/server";
import { upsertWikiPage, queryWiki, listWikiPages, deleteWikiPage } from "@/lib/wiki";

const MUSU_LLM_URL = (process.env.MUSU_LLM_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const MUSU_LLM_MODEL = process.env.MUSU_LLM_MODEL;

const EXTRACT_PROMPT = `Extract structured knowledge from the text below. Respond ONLY with valid JSON (no markdown fences).

JSON shape:
{
  "title": "Short descriptive title",
  "summary": "2-3 sentence summary",
  "key_points": ["point 1", "point 2", "point 3"],
  "evidence": ["source reference or quote 1"],
  "related": ["related topic 1"],
  "open_questions": ["question 1"]
}

TEXT TO EXTRACT FROM:
`;

async function extractWithLlm(content: string): Promise<{
  title: string;
  summary: string;
  key_points: string[];
  evidence: string[];
  related: string[];
  open_questions: string[];
} | null> {
  try {
    const modelsRes = await fetch(`${MUSU_LLM_URL}/v1/models`);
    const modelsData = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
    const modelId = MUSU_LLM_MODEL ?? modelsData.data?.[0]?.id;
    if (!modelId) return null;

    const res = await fetch(`${MUSU_LLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "user", content: EXTRACT_PROMPT + content.slice(0, 6000) },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Strip markdown fences if LLM adds them anyway
    const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
    return JSON.parse(cleaned) as {
      title: string;
      summary: string;
      key_points: string[];
      evidence: string[];
      related: string[];
      open_questions: string[];
    };
  } catch {
    return null;
  }
}

// POST /api/wiki — ingest raw content
export async function POST(req: NextRequest) {
  let body: {
    content?: string;
    scope?: string;
    title?: string;
    summary?: string;
    key_points?: string[];
    evidence?: string[];
    related?: string[];
    open_questions?: string[];
    source_raw?: string;
    id?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const scope = body.scope ?? "global";

  // If raw content provided, extract structure via LLM
  if (body.content && !body.title) {
    const extracted = await extractWithLlm(body.content);
    if (!extracted) {
      return NextResponse.json(
        { error: "LLM extraction failed — provide title/summary manually" },
        { status: 502 }
      );
    }
    const page = upsertWikiPage({ ...extracted, scope, source_raw: body.source_raw ?? null });
    return NextResponse.json({ ok: true, page });
  }

  // Manual structured insert
  if (!body.title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const page = upsertWikiPage({
    id: body.id,
    scope,
    title: body.title,
    summary: body.summary ?? null,
    key_points: body.key_points ?? null,
    evidence: body.evidence ?? null,
    related: body.related ?? null,
    open_questions: body.open_questions ?? null,
    source_raw: body.source_raw ?? null,
  });

  return NextResponse.json({ ok: true, page });
}

// GET /api/wiki?q=query&scope=company:xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const scope = searchParams.get("scope") ?? "global";
  const list = searchParams.get("list") === "1";

  if (list) {
    return NextResponse.json({ pages: listWikiPages(scope) });
  }

  const pages = queryWiki(q, scope);
  return NextResponse.json({ pages });
}

// DELETE /api/wiki?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const deleted = deleteWikiPage(id);
  return NextResponse.json({ ok: deleted });
}
