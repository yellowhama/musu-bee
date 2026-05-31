"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLowDutyPolling } from "@/lib/useLowDutyPolling";

export type InboxKind = "approval" | "issue" | "notification";

export interface InboxItem {
  /** Synthesized: `${kind}-${rawId}` — unique across kinds. */
  id: string;
  kind: InboxKind;
  title: string;
  subtitle: string;
  rawId: string;
  companyId: string | null;
  /** v13.4 — Display name for the source company (multi-tenant inbox). */
  companyName: string | null;
  createdAt: string;
  /** B's UI can drill into the kind-specific row when it needs more detail. */
  raw: ApprovalRow | IssueRow | NotificationRow;
}

interface ApprovalRow {
  id: string;
  company_id: string;
  task_id: string | null;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

interface IssueRow {
  id: string;
  company_id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "critical";
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationRow {
  id: string;
  message_id: string;
  group_id: string;
  sender_id: string;
  preview: string;
  created_at: string;
}

export interface UseInboxReturn {
  items: InboxItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  resolveApproval: (rawId: string, decision: "approved" | "rejected") => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  /** v14.3 — mark a single notification as read. */
  markNotificationRead: (rawId: string) => Promise<void>;
  /** Company ids that should yellow-ring flash on the canvas. D consumes + clears. */
  flashCompanyIds: string[];
  clearFlash: (companyId: string) => void;
}

// v13.4 — All-companies inbox fans out across N companies per poll. 30s
// strikes a balance between liveness and the bridge's rate limit (60/min/ip).
const POLL_MS = 30_000;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * v12-inbox A — Unified inbox surface for the active company.
 *
 * Pulls three bridge endpoints in parallel and merges them into a single
 * time-sorted list. Polls every 10s. Exposes optimistic action helpers
 * for resolution + a flash signal (`flashCompanyIds`) consumed by D so
 * the canvas card pulses when a new item arrives.
 */
/**
 * v13.4 — `companies` is the full list of operator companies whose
 * approvals/issues should appear in the inbox. Pass `[]` to disable
 * company-side polling. Notification polling uses `userId` (Supabase id).
 *
 * The hook fans out N approvals + N issues + 1 notification fetch per
 * poll. 30s polling keeps total request rate sane against the bridge's
 * default 60/min/ip cap.
 */
export function useInbox(
  companies: Array<{ id: string; name: string }>,
  userId: string | null,
): UseInboxReturn {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashCompanyIds, setFlashCompanyIds] = useState<string[]>([]);

  const mountedRef = useRef(true);
  const lastSeenIdsRef = useRef<Set<string> | null>(null);

  // Stable string of company ids for the effect dependency — the array
  // reference would otherwise reset polling on every render.
  const companyIdsKey = companies.map((c) => c.id).join(",");

  const doFetch = useCallback(async (signal?: AbortSignal) => {
    if (companies.length === 0 && !userId) {
      if (mountedRef.current) {
        setItems([]);
        setLoading(false);
        setError(null);
      }
      return;
    }

    const nameById = new Map(companies.map((c) => [c.id, c.name]));
    const tasks: Array<Promise<InboxItem[]>> = [];

    for (const co of companies) {
      const companyId = co.id;
      const companyName = co.name;
      tasks.push(
        fetch(`/api/bridge/companies/${companyId}/approvals`, { signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: ApprovalRow[]) =>
            (Array.isArray(rows) ? rows : [])
              .filter((row) => row.status === "pending")
              .map<InboxItem>((row) => ({
                id: `approval-${row.id}`,
                kind: "approval",
                title: row.reason || "(no reason)",
                subtitle: `${row.requested_by || "unknown"} · ${formatRelative(row.created_at)}`,
                rawId: row.id,
                companyId: row.company_id,
                companyName,
                createdAt: row.created_at,
                raw: row,
              })),
          )
          .catch(() => [] as InboxItem[]),
      );

      tasks.push(
        fetch(`/api/bridge/companies/${companyId}/issues?status=open`, { signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: IssueRow[]) =>
            (Array.isArray(rows) ? rows : []).map<InboxItem>((row) => ({
              id: `issue-${row.id}`,
              kind: "issue",
              title: row.title || "(no title)",
              subtitle: `${row.priority} · ${formatRelative(row.created_at)}`,
              rawId: row.id,
              companyId: row.company_id,
              companyName,
              createdAt: row.created_at,
              raw: row,
            })),
          )
          .catch(() => [] as InboxItem[]),
      );
    }

    if (userId) {
      tasks.push(
        fetch(`/api/bridge/notifications/${userId}`, { signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: NotificationRow[]) =>
            (Array.isArray(rows) ? rows : []).map<InboxItem>((row) => {
              const cid = row.group_id?.startsWith("company-")
                ? row.group_id.slice("company-".length)
                : null;
              return {
                id: `notification-${row.id}`,
                kind: "notification",
                title: row.preview || "(no preview)",
                subtitle: `${row.sender_id || "unknown"} · ${formatRelative(row.created_at)}`,
                rawId: row.id,
                companyId: cid,
                companyName: cid ? nameById.get(cid) ?? null : null,
                createdAt: row.created_at,
                raw: row,
              };
            }),
          )
          .catch(() => [] as InboxItem[]),
      );
    }

    try {
      const results = await Promise.all(tasks);
      const merged = results
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (!mountedRef.current || signal?.aborted) return;

      // Flash signal: company ids of items new since last poll.
      const seen = lastSeenIdsRef.current;
      if (seen !== null) {
        const fresh = new Set<string>();
        for (const it of merged) {
          if (!seen.has(it.id) && it.companyId) fresh.add(it.companyId);
        }
        if (fresh.size > 0) {
          setFlashCompanyIds((prev) =>
            Array.from(new Set([...prev, ...fresh])),
          );
        }
      }
      lastSeenIdsRef.current = new Set(merged.map((it) => it.id));

      setItems(merged);
      setError(null);
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load inbox");
      }
      if (signal) throw e;
    } finally {
      if (mountedRef.current && !signal?.aborted) setLoading(false);
    }
  }, [companyIdsKey, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on identity change.
  useEffect(() => {
    setLoading(true);
    setItems([]);
    lastSeenIdsRef.current = null;
    void doFetch();
  }, [companyIdsKey, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLowDutyPolling(doFetch, {
    enabled: companies.length > 0 || Boolean(userId),
    intervalMs: POLL_MS,
  });

  const refresh = useCallback(() => {
    void doFetch();
  }, [doFetch]);

  const resolveApproval = useCallback(
    async (rawId: string, decision: "approved" | "rejected") => {
      setItems((prev) =>
        prev.filter((it) => !(it.kind === "approval" && it.rawId === rawId)),
      );
      try {
        await fetch(`/api/bridge/approvals/${rawId}/${decision}`, {
          method: "POST",
        });
      } finally {
        void doFetch();
      }
    },
    [doFetch],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!userId) return;
    setItems((prev) => prev.filter((it) => it.kind !== "notification"));
    try {
      await fetch(`/api/bridge/notifications/${userId}/read`, {
        method: "POST",
      });
    } finally {
      void doFetch();
    }
  }, [userId, doFetch]);

  // v14.3 — per-notification mark-read.
  const markNotificationRead = useCallback(
    async (rawId: string) => {
      if (!userId) return;
      setItems((prev) =>
        prev.filter((it) => !(it.kind === "notification" && it.rawId === rawId)),
      );
      try {
        await fetch(`/api/bridge/notifications/${userId}/${rawId}/read`, {
          method: "POST",
        });
      } finally {
        void doFetch();
      }
    },
    [userId, doFetch],
  );

  const clearFlash = useCallback((cid: string) => {
    setFlashCompanyIds((prev) => prev.filter((id) => id !== cid));
  }, []);

  return {
    items,
    unreadCount: items.length,
    loading,
    error,
    refresh,
    resolveApproval,
    markAllNotificationsRead,
    markNotificationRead,
    flashCompanyIds,
    clearFlash,
  };
}
