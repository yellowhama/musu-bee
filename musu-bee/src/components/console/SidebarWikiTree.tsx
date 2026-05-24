"use client";

import { Search } from "lucide-react";

interface WikiPage {
  id: string;
  title: string;
  node: string;
  folder: string;
}

interface WikiSearchResult extends WikiPage {
  snippet: string;
}

interface Tab {
  key: string;
  label: string;
  count: number;
}

interface SidebarWikiTreeProps {
  pages: WikiPage[];
  searchResults: WikiSearchResult[] | null;
  selectedId: string | null;
  selectedNode: string | null;
  onSelect: (id: string, node: string) => void;
  loading: boolean;
  searching: boolean;
  collapsed: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  activeTab: string;
  tabs: Tab[];
  onTabChange: (key: string) => void;
  multiNode: boolean;
}

export function SidebarWikiTree({
  pages,
  searchResults,
  selectedId,
  selectedNode,
  onSelect,
  loading,
  searching,
  collapsed,
  query,
  onQueryChange,
  activeTab,
  tabs,
  onTabChange,
  multiNode,
}: SidebarWikiTreeProps) {
  if (collapsed) return null;

  const displayList = searchResults !== null ? searchResults : pages;
  const filtered =
    activeTab === "all"
      ? displayList
      : activeTab === "__root__"
      ? displayList.filter((p) => !p.folder)
      : displayList.filter((p) => p.folder === activeTab);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Search */}
      <div
        style={{
          padding: "8px 8px 6px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
            padding: "0 8px",
            height: "28px",
          }}
        >
          <Search size={12} color="rgba(253,251,247,0.3)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="검색…"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "#FDFBF7",
              fontSize: "12px",
              fontFamily: "inherit",
              minWidth: 0,
            }}
          />
          {searching && (
            <span
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                border: "1.5px solid rgba(255,166,2,0.3)",
                borderTop: "1.5px solid #FFA602",
                borderRadius: "50%",
                animation: "musu-spin 0.7s linear infinite",
                flexShrink: 0,
              }}
            />
          )}
        </div>
      </div>

      {/* Folder tabs */}
      {tabs.length > 1 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            padding: "6px 8px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: active
                    ? "1px solid rgba(255,166,2,0.35)"
                    : "1px solid rgba(255,255,255,0.07)",
                  background: active ? "rgba(255,166,2,0.1)" : "transparent",
                  color: active ? "#FFA602" : "rgba(253,251,247,0.4)",
                  fontSize: "11px",
                  fontWeight: active ? 700 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {tab.label}
                <span
                  style={{
                    background: active ? "rgba(255,166,2,0.2)" : "rgba(255,255,255,0.06)",
                    borderRadius: "3px",
                    padding: "0 4px",
                    fontSize: "10px",
                    fontWeight: 600,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Page list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 6px" }}>
        {loading && (
          <div style={{ color: "rgba(253,251,247,0.3)", fontSize: "11px", padding: "8px 4px" }}>
            로딩 중…
          </div>
        )}
        {!loading && filtered.length === 0 && !query && <EmptyWikiTree />}
        {!loading && query && filtered.length === 0 && (
          <div style={{ color: "rgba(253,251,247,0.3)", fontSize: "11px", padding: "8px 4px" }}>
            결과 없음
          </div>
        )}

        {filtered.map((p) => {
          const isSelected = p.id === selectedId && p.node === selectedNode;
          const snippet = "snippet" in p ? (p as WikiSearchResult).snippet : undefined;
          return (
            <button
              key={`${p.node}:${p.id}`}
              onClick={() => onSelect(p.id, p.node)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: isSelected ? "rgba(255,166,2,0.12)" : "transparent",
                border: "none",
                borderRadius: "5px",
                padding: "6px 8px",
                cursor: "pointer",
                color: isSelected ? "#FFA602" : "rgba(253,251,247,0.65)",
                fontSize: "12px",
                fontFamily: "inherit",
                minHeight: "32px",
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.title}
              </div>
              {activeTab === "all" && p.folder && (
                <div style={{ color: "rgba(255,166,2,0.35)", fontSize: "10px", marginTop: "1px" }}>
                  {p.folder}
                </div>
              )}
              {multiNode && (
                <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", marginTop: "1px" }}>
                  {p.node}
                </div>
              )}
              {snippet && (
                <div
                  style={{
                    color: "rgba(253,251,247,0.3)",
                    fontSize: "10px",
                    marginTop: "2px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {snippet.slice(0, 55)}
                </div>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}

function EmptyWikiTree() {
  return (
    <div style={{ padding: "8px 4px" }}>
      <div style={{ color: "rgba(253,251,247,0.5)", fontSize: "12px", fontWeight: 600, marginBottom: "8px" }}>
        위키가 비어있습니다
      </div>
      <div style={{ color: "rgba(253,251,247,0.3)", fontSize: "11px", lineHeight: 1.7, marginBottom: "10px" }}>
        <code style={{ color: "#FFA602", fontSize: "10px" }}>~/llm-wiki/wiki/</code>
        {" "}에 마크다운 파일을 추가하면 여기에 나타납니다.
      </div>
      <div
        style={{
          color: "rgba(253,251,247,0.2)",
          fontSize: "10px",
          lineHeight: 1.8,
          fontFamily: "var(--font-jetbrains), monospace",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          paddingTop: "8px",
        }}
      >
        wiki/<br />
        &nbsp;&nbsp;musu/&nbsp;&nbsp;&nbsp;&nbsp;← tab<br />
        &nbsp;&nbsp;&nbsp;&nbsp;overview.md<br />
        &nbsp;&nbsp;notes.md&nbsp;&nbsp;← General
      </div>
    </div>
  );
}
