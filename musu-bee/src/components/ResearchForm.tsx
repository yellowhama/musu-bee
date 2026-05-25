"use client";

import { useState } from "react";

interface ResearchFormProps {
  onComplete?: () => void;
}

export default function ResearchForm({ onComplete }: ResearchFormProps) {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setStatus("리서치 시작...");

    try {
      const res = await fetch(`/api/bridge/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), max_sources: 5 }),
      });
      if (res.ok) {
        setStatus("리서치 진행 중 — 완료 시 위키에 자동 저장됩니다.");
        setTopic("");
        setTimeout(() => {
          setStatus(null);
          onComplete?.();
        }, 30000);
      } else {
        setStatus(`오류: ${res.statusText}`);
      }
    } catch {
      setStatus("Bridge 연결 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        gap: "8px",
        alignItems: "center",
      }}
    >
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="리서치 주제 입력 (예: React Server Components)"
        disabled={loading}
        style={{
          flex: 1,
          padding: "8px 12px",
          border: "1px solid var(--border-default)",
          borderRadius: "6px",
          fontSize: "14px",
        }}
      />
      <button
        type="submit"
        disabled={loading || !topic.trim()}
        style={{
          padding: "8px 16px",
          borderRadius: "6px",
          background: loading ? "#ccc" : "var(--fg-on-accent)",
          color: "#fff",
          border: "none",
          cursor: loading ? "wait" : "pointer",
          fontSize: "14px",
        }}
      >
        {loading ? "..." : "리서치"}
      </button>
      {status && (
        <span style={{ fontSize: "12px", color: "var(--fg3)" }}>{status}</span>
      )}
    </form>
  );
}
