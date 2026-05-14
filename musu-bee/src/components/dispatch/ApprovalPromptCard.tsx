"use client";

import { useState } from "react";

type Decision = "approved" | "declined" | null;

type Props = {
  approvalId: string;
  prompt: string;
  runId: string;
  decision: Decision;
};

/**
 * Inline approval card rendered in the chat stream when an adapter
 * requests user sign-off (v19.C P2).
 *
 * Free-text chat ("yes", "응") is NOT an approval response — the user
 * must click one of these buttons. This was clarified in spec session
 * 2026-05-14.
 */
export default function ApprovalPromptCard({
  approvalId,
  prompt,
  runId,
  decision,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (verb: "yes" | "no") => {
    if (submitting || decision) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/bridge/dispatch/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: verb }),
      });
      if (!r.ok) {
        const detail = await r.text();
        setError(`승인 응답 실패 (${r.status}): ${detail}`);
      }
      // Success path: the SSE stream will deliver an approval_resolved
      // event and the parent CeoChatClient will set our `decision` prop.
      // No local state change needed here.
    } catch (e) {
      setError(`bridge 에 연결할 수 없습니다: ${e}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (decision) {
    const label =
      decision === "approved" ? "✅ 승인됨" : "⊘ 거절됨";
    const color =
      decision === "approved"
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
        : "border-zinc-500/40 bg-zinc-500/5 text-zinc-300";
    return (
      <div className={`mt-2 rounded border px-3 py-2 ${color}`}>
        <div className="text-xs font-mono opacity-70">
          승인 요청 {approvalId.slice(0, 8)}…
        </div>
        <div className="text-sm mt-1 whitespace-pre-wrap">{prompt}</div>
        <div className="text-xs mt-2 font-medium">{label}</div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2">
      <div className="text-xs font-mono text-amber-300/80">
        🛑 승인 필요 {approvalId.slice(0, 8)}…
      </div>
      <div className="text-sm mt-1 whitespace-pre-wrap text-zinc-100">
        {prompt}
      </div>
      {error && (
        <div className="mt-2 text-xs text-red-400">{error}</div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => submit("yes")}
          disabled={submitting}
          className="px-3 py-1 text-xs font-medium rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          예 (yes)
        </button>
        <button
          onClick={() => submit("no")}
          disabled={submitting}
          className="px-3 py-1 text-xs font-medium rounded bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          아니오 (no)
        </button>
      </div>
    </div>
  );
}
