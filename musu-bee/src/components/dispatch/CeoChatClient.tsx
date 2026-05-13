"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RunEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type RunSummary = {
  type?: "done" | "error" | "stream_timeout";
  status?: "completed" | "failed" | "cancelled";
  summary?: string;
  error?: string;
  detail?: string;
};

type ChatLine =
  | { kind: "user"; body: string; at: string }
  | {
      kind: "run";
      runId: string;
      status: "streaming" | "completed" | "failed" | "cancelled" | "error";
      events: RunEvent[];
      summary?: string;
      error?: string;
      indentLevel: number;
    };

type Props = {
  companyId: string;
  userId: string;
  userEmail: string;
};

export default function CeoChatClient({ companyId, userId, userEmail }: Props) {
  const [ceoId, setCeoId] = useState<string | null>(null);
  const [ceoLoading, setCeoLoading] = useState(true);
  const [ceoError, setCeoError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/bridge/dispatch/company/${companyId}/ceo`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setCeoError("이 회사에 CEO 에이전트가 없습니다.");
        } else if (!r.ok) {
          setCeoError(`CEO 조회 실패 (${r.status})`);
        } else {
          const data = await r.json();
          setCeoId(data.ceo_id);
        }
      })
      .catch((e) => {
        if (!cancelled) setCeoError(`bridge 에 연결할 수 없습니다: ${e}`);
      })
      .finally(() => {
        if (!cancelled) setCeoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const subscribeToRun = useCallback((runId: string, indentLevel: number) => {
    const es = new EventSource(`/api/dispatch/runs/${runId}/stream`);

    setLines((prev) => [
      ...prev,
      {
        kind: "run",
        runId,
        status: "streaming",
        events: [],
        indentLevel,
      },
    ]);

    es.onmessage = (msg) => {
      const data = JSON.parse(msg.data) as RunEvent | RunSummary;

      if ("event_type" in data) {
        setLines((prev) =>
          prev.map((l) =>
            l.kind === "run" && l.runId === runId
              ? { ...l, events: [...l.events, data] }
              : l,
          ),
        );
      } else if (data.type === "done") {
        setLines((prev) =>
          prev.map((l) =>
            l.kind === "run" && l.runId === runId
              ? {
                  ...l,
                  status: data.status ?? "completed",
                  summary: data.summary,
                  error: data.error,
                }
              : l,
          ),
        );
        es.close();
      } else if (data.type === "error") {
        setLines((prev) =>
          prev.map((l) =>
            l.kind === "run" && l.runId === runId
              ? { ...l, status: "error", error: data.detail }
              : l,
          ),
        );
        es.close();
      } else if (data.type === "stream_timeout") {
        setLines((prev) =>
          prev.map((l) =>
            l.kind === "run" && l.runId === runId
              ? { ...l, status: "error", error: "stream timeout (30 min)" }
              : l,
          ),
        );
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
    };
  }, []);

  const handleSend = async () => {
    if (!ceoId || sending) return;
    const body = input.trim();
    if (!body) return;
    setSending(true);
    setLines((prev) => [
      ...prev,
      { kind: "user", body, at: new Date().toISOString() },
    ]);
    setInput("");

    try {
      const r = await fetch(`/api/bridge/dispatch/company/${companyId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, body }),
      });
      if (!r.ok) {
        const detail = await r.text();
        setLines((prev) => [
          ...prev,
          {
            kind: "run",
            runId: `error-${Date.now()}`,
            status: "error",
            events: [],
            error: `요청 실패 (${r.status}): ${detail}`,
            indentLevel: 0,
          },
        ]);
        return;
      }
      const data = await r.json();
      subscribeToRun(data.run_id, 0);
    } finally {
      setSending(false);
    }
  };

  if (ceoLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div>CEO 조회 중...</div>
      </main>
    );
  }

  if (ceoError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="max-w-md p-6 border border-zinc-800 rounded-lg">
          <h1 className="text-lg font-semibold mb-2">CEO 없음</h1>
          <p className="text-sm text-zinc-400">{ceoError}</p>
          <p className="mt-4 text-xs text-zinc-500">
            회사 {companyId} 에 role=&apos;ceo&apos; 인 agent 를 추가해야 채팅할 수 있습니다.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
        <div>
          <h1 className="text-sm font-semibold">CEO 채팅</h1>
          <p className="text-xs text-zinc-500">
            회사 {companyId} · CEO {ceoId} · 사용자 {userEmail}
          </p>
        </div>
        <a href="/dashboard" className="text-xs text-zinc-400 hover:text-zinc-100">
          ← Dashboard
        </a>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {lines.length === 0 && (
          <div className="text-sm text-zinc-500 text-center py-12">
            메시지를 보내서 시작하세요. CEO 가 받아서 직원에게 위임합니다.
          </div>
        )}
        {lines.map((line, idx) => (
          <ChatLineView key={idx} line={line} />
        ))}
      </div>

      <footer className="border-t border-zinc-800 p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="CEO 에게 메시지..."
            disabled={sending}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-amber-500 text-zinc-950 text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-400"
          >
            보내기
          </button>
        </div>
      </footer>
    </main>
  );
}

function ChatLineView({ line }: { line: ChatLine }) {
  if (line.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 text-sm">
          {line.body}
        </div>
      </div>
    );
  }

  const statusColor = {
    streaming: "border-blue-500/40 bg-blue-500/5",
    completed: "border-emerald-500/40 bg-emerald-500/5",
    failed: "border-red-500/40 bg-red-500/5",
    cancelled: "border-zinc-500/40 bg-zinc-500/5",
    error: "border-red-500/40 bg-red-500/5",
  }[line.status];

  const indent = line.indentLevel > 0 ? `ml-${Math.min(line.indentLevel * 8, 24)}` : "";

  return (
    <div className={indent}>
      <div className={`rounded-lg border px-4 py-3 ${statusColor}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-zinc-400">
            run {line.runId.slice(0, 8)}…
          </span>
          <span className="text-xs font-medium">
            {line.status === "streaming" && "🔄 진행중"}
            {line.status === "completed" && "✅ 완료"}
            {line.status === "failed" && "❌ 실패"}
            {line.status === "cancelled" && "⊘ 취소"}
            {line.status === "error" && "❌ 오류"}
          </span>
        </div>
        <div className="space-y-1">
          {line.events.map((ev) => (
            <EventView key={ev.id} event={ev} />
          ))}
        </div>
        {line.summary && (
          <div className="mt-3 pt-2 border-t border-zinc-800 text-sm whitespace-pre-wrap">
            {line.summary}
          </div>
        )}
        {line.error && (
          <div className="mt-3 pt-2 border-t border-zinc-800 text-sm text-red-400 whitespace-pre-wrap">
            {line.error}
          </div>
        )}
      </div>
    </div>
  );
}

function EventView({ event }: { event: RunEvent }) {
  const label =
    {
      wake_started: "🚀 시작",
      tool_call: "🔧 도구 사용",
      tool_progress: "⏳ 도구 진행",
      message_delta: "💬",
      approval_request: "🛑 승인 필요",
      completed: "✅ 완료",
      failed: "❌ 실패",
      delegate: "👇 위임",
    }[event.event_type] ?? event.event_type;

  const payloadStr =
    event.event_type === "message_delta"
      ? String(event.payload.text ?? "")
      : Object.keys(event.payload).length > 0
        ? JSON.stringify(event.payload)
        : "";

  return (
    <div className="text-xs text-zinc-300 font-mono">
      <span className="text-zinc-500">{event.created_at.slice(11, 19)}</span>{" "}
      <span>{label}</span>
      {payloadStr && <span className="text-zinc-400"> {payloadStr}</span>}
    </div>
  );
}
