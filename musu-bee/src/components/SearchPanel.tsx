"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface SearchResult {
  path: string;
  snippet: string;
  type: string;
  error?: string;
}

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/bridge/index-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SearchResult[] = await res.json();
      if (mountedRef.current) {
        if (data[0]?.error) {
          setError(data[0].error);
          setResults([]);
        } else {
          setResults(Array.isArray(data) ? data : []);
          setError(null);
        }
      }
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void doSearch(val);
      }, 350);
    },
    [doSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void doSearch(query);
      }
    },
    [doSearch, query]
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--musu-bg-inset)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px 10px",
          borderBottom: "1px solid var(--musu-border-dim)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg1)" }}>
          Codebase Search
        </span>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search functions, classes, files..."
          autoFocus
          style={{
            background: "var(--musu-bg-card)",
            border: "1px solid var(--musu-border)",
            borderRadius: 6,
            color: "var(--fg1)",
            fontSize: 13,
            padding: "7px 12px",
            outline: "none",
            width: "100%",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {loading && (
          <p style={{ color: "var(--fg3)", fontSize: 13, padding: "12px 0" }}>
            Searching…
          </p>
        )}
        {!loading && error && (
          <p style={{ color: "var(--status-error)", fontSize: 13, padding: "12px 0" }}>
            {error}
          </p>
        )}
        {!loading && !error && query && results.length === 0 && (
          <p style={{ color: "var(--fg4)", fontSize: 13, padding: "12px 0" }}>
            No results for &ldquo;{query}&rdquo;
          </p>
        )}
        {!loading && !error && results.length > 0 && (
          <>
            <div
              style={{
                fontSize: 11,
                color: "var(--fg3)",
                marginBottom: 8,
              }}
            >
              {results.length} result{results.length !== 1 ? "s" : ""}
            </div>
            {results.map((r, idx) => (
              <div
                key={idx}
                style={{
                  background: "var(--musu-bg-card)",
                  border: "1px solid var(--musu-border-dim)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--fg2)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}
                  >
                    {r.type || "file"}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--fg1)",
                      fontFamily: "monospace",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.path}
                  </span>
                </div>
                {r.snippet && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--fg2)",
                      margin: 0,
                      lineHeight: 1.5,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                    dangerouslySetInnerHTML={{ __html: r.snippet }}
                  />
                )}
              </div>
            ))}
          </>
        )}
        {!query && (
          <p style={{ color: "var(--fg4)", fontSize: 13, padding: "12px 0" }}>
            Type to search the indexed codebase.
          </p>
        )}
      </div>
    </div>
  );
}
