// V23.5 W-4 — Agent wiki page route.
//
// Next.js App Router server component. Renders a single agent-shaped wiki
// page (extracted to `~/llm-wiki/` by musu-bridge). Composition:
//
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ <article>                                                        │
//   │   <header> title + scope/updated metadata                        │
//   │   <WikiHtmlRender markdown={source_markdown} />   ← W-2          │
//   │ </article>                                                       │
//   │                                                                  │
//   │ On error:                                                        │
//   │   404           → notFound()  (Next.js convention)               │
//   │   503 / other   → <TldrCard variant="warning"> with SeverityBadge│
//   └─────────────────────────────────────────────────────────────────┘
//
// Why source_markdown, not server-rendered html?
//   W-2 (WikiHtmlRender) is the canonical render path with the locked
//   12-vector XSS contract. W-3's `html` field is a server-side fallback
//   for cases where the client cannot run react-markdown (e.g. RSS, email
//   digests). W-7 will verify equivalence; until then the page route
//   intentionally consumes `source_markdown` and lets W-2 re-render.
//
// CSS:
//   W-5 wiki-explainer.css is imported here at the route boundary so the
//   stylesheet is bundled once per agent wiki view (the W-5 barrel
//   deliberately does NOT auto-import it — see `wiki-explainer/index.ts`).

import { notFound } from "next/navigation";
import { fetchAgentWikiPage } from "@/lib/agentWikiClient";
import WikiHtmlRender from "@/components/WikiHtmlRender";
import { TldrCard, SeverityBadge } from "@/components/wiki-explainer";
import "@/styles/wiki-explainer.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ page_id: string }>;
  searchParams: Promise<{ company_id?: string }>;
};

export default async function AgentWikiPage({
  params,
  searchParams,
}: PageProps) {
  const { page_id } = await params;
  const { company_id } = await searchParams;
  const result = await fetchAgentWikiPage(page_id, company_id);

  if (!result.ok) {
    if (result.error.status === 404) {
      notFound();
    }
    return (
      <main
        style={{ maxWidth: 720, margin: "32px auto", padding: "0 24px" }}
      >
        <TldrCard variant="warning" title="Wiki page unavailable">
          <div style={{ marginBottom: 12 }}>
            <SeverityBadge
              severity="MED"
              text={`status ${result.error.status}`}
            />
          </div>
          <p style={{ margin: "8px 0" }}>
            Reason: <code>{result.error.detail}</code>
          </p>
          <p style={{ margin: "8px 0", fontSize: 14 }}>
            Try refreshing or reach out via CoS briefing.
          </p>
        </TldrCard>
      </main>
    );
  }

  const { title, scope, source_markdown, updated_at } = result.data;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 8px 0" }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg2, #888)", margin: 0 }}>
          scope: {scope} · updated:{" "}
          {new Date(updated_at).toLocaleString()}
        </p>
      </header>
      <WikiHtmlRender markdown={source_markdown} />
    </main>
  );
}
