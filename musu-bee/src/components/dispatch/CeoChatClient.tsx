"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ApprovalPromptCard from "./ApprovalPromptCard";

// Tailwind doesn't generate `ml-*` classes from dynamic strings, so the
// indent levels are enumerated up to 3 (CEO → role → sub-role → leaf).
const INDENT_CLASSES = ["", "ml-6", "ml-12", "ml-18"] as const;

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
  const [delegateModal, setDelegateModal] = useState<{
    parentRunId: string;
    indentLevel: number;
  } | null>(null);

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

  const handleDelegate = async (
    parentRunId: string,
    role: string,
    body: string,
    indentLevel: number,
  ) => {
    const r = await fetch(`/api/bridge/dispatch/runs/${parentRunId}/delegate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, body }),
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
          error: `위임 실패 (${r.status}): ${detail}`,
          indentLevel,
        },
      ]);
      return;
    }
    const data = await r.json();
    subscribeToRun(data.run_id, indentLevel);
  };

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
        <a href="/fleet" className="text-xs text-zinc-400 hover:text-zinc-100">
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
          <ChatLineView
            key={idx}
            line={line}
            onDelegate={
              line.kind === "run" && line.status === "streaming"
                ? undefined
                : (parentRunId, level) =>
                    setDelegateModal({ parentRunId, indentLevel: level })
            }
          />
        ))}
      </div>

      {delegateModal && (
        <DelegateModal
          parentRunId={delegateModal.parentRunId}
          onClose={() => setDelegateModal(null)}
          onSubmit={async (role, body) => {
            await handleDelegate(
              delegateModal.parentRunId,
              role,
              body,
              delegateModal.indentLevel,
            );
            setDelegateModal(null);
          }}
        />
      )}

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

function ChatLineView({
  line,
  onDelegate,
}: {
  line: ChatLine;
  onDelegate?: (parentRunId: string, indentLevel: number) => void;
}) {
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

  const indent = INDENT_CLASSES[Math.min(line.indentLevel, INDENT_CLASSES.length - 1)];

  // v19.C P3: unwrap any forwarded_event rows so the rest of this view
  // treats them as if they were the inner remote event. Single-level
  // unwrap; the bridge never re-wraps a forwarded_event.
  const unwrappedEvents: RunEvent[] = line.events.map((ev) => {
    if (ev.event_type !== "forwarded_event") return ev;
    const remoteType = String(ev.payload.remote_type ?? "");
    const remotePayload =
      (ev.payload.remote_payload as Record<string, unknown> | undefined) ?? {};
    if (!remoteType) return ev;
    return {
      id: ev.id,
      event_type: remoteType,
      payload: remotePayload,
      created_at: ev.created_at,
    };
  });

  // v19.C P1: concatenate message_delta payload.text into a single
  // streaming text block. Each delta still appears in line.events for
  // the timeline log; we just render the user-visible stream above it.
  const streamingText = unwrappedEvents
    .filter((ev) => ev.event_type === "message_delta")
    .map((ev) => String(ev.payload.text ?? ""))
    .join("");

  // v19.C P2: collect approval cards. Each approval_request event spawns
  // a card; if a matching approval_resolved event arrived later, the card
  // renders in its read-only "decision" state.
  const approvalRequests = unwrappedEvents.filter(
    (ev) => ev.event_type === "approval_request",
  );
  const resolvedById = new Map<string, "approved" | "declined">();
  for (const ev of unwrappedEvents) {
    if (ev.event_type === "approval_resolved") {
      const id = String(ev.payload.approval_id ?? "");
      const decision = String(ev.payload.decision ?? "");
      if (id && (decision === "approved" || decision === "declined")) {
        resolvedById.set(id, decision);
      }
    }
  }

  // Non-delta, non-approval events are what we show in the technical log.
  // (message_delta is folded into streamingText; approval_request and
  // approval_resolved are folded into the ApprovalPromptCard.)
  const nonDeltaEvents = unwrappedEvents.filter(
    (ev) =>
      ev.event_type !== "message_delta" &&
      ev.event_type !== "approval_request" &&
      ev.event_type !== "approval_resolved",
  );

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
        {streamingText && (
          <div className="mb-3 text-sm whitespace-pre-wrap leading-relaxed">
            {streamingText}
            {line.status === "streaming" && (
              <span className="inline-block w-2 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
            )}
          </div>
        )}
        {approvalRequests.map((ev) => {
          const approvalId = String(ev.payload.approval_id ?? "");
          const prompt = String(ev.payload.prompt ?? "");
          if (!approvalId) return null;
          return (
            <ApprovalPromptCard
              key={`approval-${approvalId}`}
              approvalId={approvalId}
              prompt={prompt}
              runId={line.runId}
              decision={resolvedById.get(approvalId) ?? null}
            />
          );
        })}
        <div className="space-y-1">
          {nonDeltaEvents.map((ev) => (
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
        {onDelegate && line.status !== "error" && (
          <div className="mt-3 pt-2 border-t border-zinc-800">
            <button
              onClick={() => onDelegate(line.runId, line.indentLevel + 1)}
              className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
            >
              👇 직원에게 위임
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DelegateModal({
  parentRunId,
  onClose,
  onSubmit,
}: {
  parentRunId: string;
  onClose: () => void;
  onSubmit: (role: string, body: string) => Promise<void> | void;
}) {
  const [role, setRole] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = role.trim().length > 0 && body.trim().length > 0 && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold">직원에게 위임</h2>
          <p className="text-xs text-zinc-500 mt-1">
            parent run {parentRunId.slice(0, 8)}…
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-zinc-400">직원 role</label>
          <input
            autoFocus
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="engineer, qa, researcher 등"
            disabled={submitting}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs text-zinc-400">작업 내용</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="이 직원이 무엇을 해야 하는지..."
            disabled={submitting}
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-600 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
          >
            취소
          </button>
          <button
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit(role.trim(), body.trim());
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={!canSubmit}
            className="px-4 py-1.5 bg-amber-500 text-zinc-950 text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-amber-400"
          >
            위임
          </button>
        </div>
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
