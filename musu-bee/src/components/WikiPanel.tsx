"use client";

import { useEffect, useState, useCallback } from "react";

interface WikiPage {
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
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface WikiPanelProps {
  companyId?: string | null;
}

export default function WikiPanel({ companyId }: WikiPanelProps) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WikiPage | null>(null);
  const [query, setQuery] = useState("");

  const scope = companyId ? `company:${companyId}` : "global";

  const fetchPages = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ scope });
        if (q.trim()) {
          params.set("q", q.trim());
        } else {
          params.set("list", "1");
        }
        const res = await fetch(`/api/wiki?${params.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { pages: WikiPage[] };
        setPages(data.pages ?? []);
      } catch {
        setPages([]);
      } finally {
        setLoading(false);
      }
    },
    [scope]
  );

  useEffect(() => {
    void fetchPages(query);
  }, [fetchPages, query]);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 13,
        color: "var(--fg1)",
        background: "var(--bg-surface)",
        overflow: "hidden",
      }}
    >
      {/* Left: list */}
      <div
        style={{
          width: 280,
          borderRight: "1px solid var(--border-default)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg1)", marginBottom: 8 }}>
            Wiki
          </div>
          <input
            type="text"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "5px 10px",
              color: "var(--fg1)",
              fontSize: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {loading ? (
            <div style={{ color: "var(--fg3)", padding: "12px 6px", fontSize: 12 }}>Loading…</div>
          ) : pages.length === 0 ? (
            <div style={{ color: "var(--fg3)", padding: "12px 6px", fontSize: 12 }}>
              {query ? "No results" : "No wiki pages yet"}
            </div>
          ) : (
            pages.map((page) => (
              <div
                key={page.id}
                onClick={() => setSelected(page)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  marginBottom: 2,
                  background: selected?.id === page.id ? "var(--bg-overlay)" : "transparent",
                  borderLeft: selected?.id === page.id ? "2px solid #60a5fa" : "2px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--fg1)",
                    marginBottom: 2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {page.title}
                </div>
                {page.summary && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--fg3)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {page.summary}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 2 }}>
                  {formatRelative(page.updated_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {selected ? (
          <WikiDetail page={selected} />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--fg4)",
              fontSize: 12,
            }}
          >
            Select a page to read
          </div>
        )}
      </div>
    </div>
  );
}

function WikiDetail({ page }: { page: WikiPage }) {
  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "#f9fafb",
          marginBottom: 6,
          marginTop: 0,
        }}
      >
        {page.title}
      </h2>
      <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 14 }}>
        Updated {formatRelative(page.updated_at)} · scope: {page.scope}
      </div>

      {page.summary && (
        <Section title="Summary">
          <p style={{ margin: 0, lineHeight: 1.6, color: "var(--fg1)" }}>{page.summary}</p>
        </Section>
      )}

      {page.key_points && page.key_points.length > 0 && (
        <Section title="Key Points">
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--fg1)", lineHeight: 1.6 }}>
            {page.key_points.map((pt, i) => (
              <li key={i}>{pt}</li>
            ))}
          </ul>
        </Section>
      )}

      {page.evidence && page.evidence.length > 0 && (
        <Section title="Evidence">
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--fg2)", lineHeight: 1.6 }}>
            {page.evidence.map((e, i) => (
              <li key={i} style={{ fontStyle: "italic" }}>{e}</li>
            ))}
          </ul>
        </Section>
      )}

      {page.related && page.related.length > 0 && (
        <Section title="Related">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {page.related.map((r, i) => (
              <span
                key={i}
                style={{
                  background: "#1e3a5f",
                  color: "#93c5fd",
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontSize: 11,
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </Section>
      )}

      {page.open_questions && page.open_questions.length > 0 && (
        <Section title="Open Questions">
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--fg2)", lineHeight: 1.6 }}>
            {page.open_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}

      {page.source_raw && (
        <Section title="Source">
          <pre
            style={{
              margin: 0,
              padding: "10px 12px",
              background: "var(--bg-card)",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--fg2)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {page.source_raw}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--fg3)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
