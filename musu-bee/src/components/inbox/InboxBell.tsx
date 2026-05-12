"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, AlertOctagon, MessageSquare, X } from "lucide-react";
import type { InboxItem, UseInboxReturn } from "@/lib/useInbox";

export type InboxJumpTarget =
  | { kind: "approvals" }
  | { kind: "issues"; issueId?: string }
  | { kind: "channel"; channelId: string };

interface InboxBellProps {
  /** Shared inbox subscription owned by AppShell. */
  inbox: UseInboxReturn;
  onJump: (target: InboxJumpTarget) => void;
}

/**
 * v12-inbox B — Topbar bell that opens an attention dropdown.
 *
 * Reads from a shared `useInbox` subscription (owned by AppShell so the
 * canvas can read the same `flashCompanyIds`). Renders the count badge,
 * list of items, and inline approve/reject buttons.
 */
export default function InboxBell({ inbox, onJump }: InboxBellProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + escape to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleJump = useCallback(
    (target: InboxJumpTarget) => {
      onJump(target);
      setOpen(false);
    },
    [onJump],
  );

  const count = inbox.unreadCount;

  return (
    <div className="inbox-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="inbox-bell-btn"
        title={count > 0 ? `Inbox · ${count}` : "Inbox"}
        aria-label={`Inbox${count > 0 ? `, ${count} unread` : ""}`}
        onClick={() => setOpen((p) => !p)}
      >
        <Bell size={16} />
        {count > 0 ? (
          <span className="inbox-badge">{count > 99 ? "99+" : count}</span>
        ) : null}
      </button>

      {open ? (
        <div className="inbox-dropdown" role="dialog" aria-label="Inbox">
          <header className="inbox-dropdown-header">
            <span>
              Inbox{count > 0 ? <span className="inbox-dropdown-count"> · {count}</span> : null}
            </span>
            <button
              type="button"
              className="inbox-dropdown-close"
              onClick={() => setOpen(false)}
              aria-label="Close inbox"
            >
              <X size={14} />
            </button>
          </header>

          <div className="inbox-dropdown-body">
            {inbox.loading && inbox.items.length === 0 ? (
              <div className="inbox-empty">Loading…</div>
            ) : inbox.error && inbox.items.length === 0 ? (
              <div className="inbox-empty inbox-empty-error">{inbox.error}</div>
            ) : inbox.items.length === 0 ? (
              <div className="inbox-empty">All clear — your team is heads-down.</div>
            ) : (
              inbox.items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  onApprove={(id) => void inbox.resolveApproval(id, "approved")}
                  onReject={(id) => void inbox.resolveApproval(id, "rejected")}
                  onJump={(target) => {
                    if (target.kind === "channel") void inbox.markAllNotificationsRead();
                    handleJump(target);
                  }}
                />
              ))
            )}
          </div>

          {inbox.items.length > 0 ? (
            <footer className="inbox-footer">
              <button type="button" onClick={() => handleJump({ kind: "approvals" })}>
                View Approvals →
              </button>
              <button type="button" onClick={() => handleJump({ kind: "issues" })}>
                View Issues →
              </button>
            </footer>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

interface InboxRowProps {
  item: InboxItem;
  onApprove: (rawId: string) => void;
  onReject: (rawId: string) => void;
  onJump: (target: InboxJumpTarget) => void;
}

function InboxRow({ item, onApprove, onReject, onJump }: InboxRowProps) {
  const Icon =
    item.kind === "approval" ? CheckCircle2 : item.kind === "issue" ? AlertOctagon : MessageSquare;

  const rowClickable = item.kind !== "approval";
  const onRowClick = rowClickable
    ? () => {
        if (item.kind === "issue") onJump({ kind: "issues", issueId: item.rawId });
        else if (item.kind === "notification") {
          // Notifications can target a company board (`company-{id}`) or a
          // regular chat channel name. AppShell normalizes onJump targets.
          const row = item.raw as { group_id?: string };
          const channelId = row.group_id ?? "general";
          onJump({ kind: "channel", channelId });
        }
      }
    : undefined;

  return (
    <div
      className={`inbox-item inbox-item-${item.kind}${rowClickable ? " clickable" : ""}`}
      onClick={onRowClick}
      role={rowClickable ? "button" : undefined}
      tabIndex={rowClickable ? 0 : undefined}
      onKeyDown={
        rowClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick?.();
              }
            }
          : undefined
      }
    >
      <Icon size={14} className="inbox-item-icon" />
      <div className="inbox-item-text">
        <div className="inbox-item-title">{item.title}</div>
        <div className="inbox-item-subtitle">{item.subtitle}</div>
      </div>
      {item.kind === "approval" ? (
        <div className="inbox-item-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="inbox-action-btn primary"
            onClick={() => onApprove(item.rawId)}
          >
            Approve
          </button>
          <button
            type="button"
            className="inbox-action-btn ghost"
            onClick={() => onReject(item.rawId)}
          >
            Reject
          </button>
        </div>
      ) : null}
    </div>
  );
}
