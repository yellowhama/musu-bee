"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, Fragment } from "react";
import type { ChannelId, Message, AgentsSurfaceSnapshot } from "@/types";

interface ChatAreaProps {
  channelId: ChannelId;
  messages: Message[];
  onSend: (text: string) => void;
  isAgentTyping?: boolean;
  isConnected?: boolean;
  channelDescription?: string;
  activeCompanyName?: string | null;
  workspaceId?: string | null;
  selectedProjects?: string[];
  isLoadingHistory?: boolean;
  hasMoreHistory?: boolean;
  loadOlderMessages?: () => void;
  agentsSurface?: AgentsSurfaceSnapshot | null;
}

// ── Inline markdown renderer ──────────────────────────────────────────────────
// Supports: ```fenced code```, `inline code`, **bold**, _italic_, - list items
// No external dependencies — purely JSX.

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|_[^_\n]+_)/g);
  return tokens.map((token, j) => {
    if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      return (
        <code
          key={j}
          style={{
            background: "#111827",
            border: "1px solid #374151",
            borderRadius: 3,
            padding: "1px 5px",
            fontSize: 12,
            fontFamily: "monospace",
            color: "#a78bfa",
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      return <strong key={j}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("_") && token.endsWith("_") && token.length > 2) {
      return <em key={j}>{token.slice(1, -1)}</em>;
    }
    return <Fragment key={j}>{token}</Fragment>;
  });
}

/** Render a text block that may contain list items and inline markdown. */
function renderTextBlock(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(
      <ul
        key={`${keyPrefix}-ul-${nodes.length}`}
        style={{ margin: "4px 0", paddingLeft: 18, listStyleType: "disc" }}
      >
        {listItems}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, li) => {
    const listMatch = /^[-*]\s+(.*)/.exec(line);
    if (listMatch) {
      listItems.push(
        <li key={li} style={{ marginBottom: 2 }}>
          {renderInline(listMatch[1])}
        </li>
      );
    } else {
      flushList();
      if (line.trim()) {
        nodes.push(
          <Fragment key={`${keyPrefix}-l-${li}`}>
            {renderInline(line)}
          </Fragment>
        );
      } else if (li > 0) {
        nodes.push(<br key={`${keyPrefix}-br-${li}`} />);
      }
    }
  });
  flushList();
  return nodes;
}

function renderMarkdown(text: string): React.ReactNode {
  // Split on fenced code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <Fragment>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const inner = part.slice(3, -3);
          // Strip optional language hint on the first line (e.g. ```bash)
          const nl = inner.indexOf("\n");
          const code = nl !== -1 ? inner.slice(nl + 1) : inner;
          return (
            <pre
              key={i}
              style={{
                background: "#111827",
                border: "1px solid #374151",
                borderRadius: 6,
                padding: "10px 14px",
                overflowX: "auto",
                fontSize: 13,
                color: "#e5e7eb",
                margin: "6px 0",
                fontFamily: "monospace",
                whiteSpace: "pre",
              }}
            >
              <code>{code.replace(/\n$/, "")}</code>
            </pre>
          );
        }
        return <Fragment key={i}>{renderTextBlock(part, String(i))}</Fragment>;
      })}
    </Fragment>
  );
}

// Approval card rendered when system message contains "⚠ **승인 필요**"
function ApprovalCard({ text, onSend }: { text: string; onSend: (t: string) => void }) {
  // Parse task_id from text — looks for a backtick-wrapped id like `task-xxx`
  const idMatch = /`(task-[a-z0-9-]+)`/.exec(text);
  const taskId = idMatch ? idMatch[1] : null;

  // Extract action description between "⚠ **승인 필요**: " and the next newline
  const actionMatch = /⚠ \*\*승인 필요\*\*: ([^\n]+)/.exec(text);
  const action = actionMatch ? actionMatch[1] : text;

  const handleApprove = useCallback(() => {
    if (taskId) onSend(`/approve ${taskId}`);
  }, [taskId, onSend]);

  const handleReject = useCallback(() => {
    if (taskId) onSend(`/reject ${taskId}`);
  }, [taskId, onSend]);

  return (
    <div
      style={{
        margin: "8px auto",
        maxWidth: 420,
        background: "#1a1a1a",
        border: "1px solid #f59e0b44",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>
        ⚠ 승인 필요
      </div>
      <div style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.4 }}>
        {action}
      </div>
      {taskId && (
        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>
          {taskId}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={handleApprove}
          style={{
            flex: 1,
            padding: "6px 0",
            background: "#14532d",
            border: "1px solid #16a34a",
            borderRadius: 6,
            color: "#86efac",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ✅ 승인
        </button>
        <button
          onClick={handleReject}
          style={{
            flex: 1,
            padding: "6px 0",
            background: "#450a0a",
            border: "1px solid #dc2626",
            borderRadius: 6,
            color: "#fca5a5",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ❌ 거부
        </button>
      </div>
    </div>
  );
}

function DelegationChip({ chain }: { chain: string[] }) {
  if (chain.length < 2) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        marginBottom: 4,
        fontSize: 11,
        color: "#4b5563",
        fontFamily: "monospace",
      }}
    >
      {chain.map((node, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              padding: "1px 5px",
              color: "#9ca3af",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {node}
          </span>
          {i < chain.length - 1 && (
            <span style={{ color: "#374151", fontSize: 10 }}>→</span>
          )}
        </span>
      ))}
    </div>
  );
}

function MessageBubble({ msg, onSend }: { msg: Message; onSend: (t: string) => void }) {
  const isUser = msg.senderKind === "user";
  const isSystem = msg.senderKind === "system";

  if (isSystem) {
    // Render approval card for APPROVAL_REQUIRED messages
    if (msg.text.includes("⚠ **승인 필요**")) {
      return <ApprovalCard text={msg.text} onSend={onSend} />;
    }
    return (
      <div
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "#4b5563",
          padding: "4px 0",
        }}
      >
        {msg.text}
      </div>
    );
  }

  const time = msg.timestamp.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
      }}
    >
      {!isUser && msg.meta?.chain && (
        <DelegationChip chain={msg.meta.chain} />
      )}
      <div
        style={{
          fontSize: 12,
          color: "#6b7280",
          marginBottom: 3,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {!isUser && (
          <span style={{ fontWeight: 600, color: "#a78bfa" }}>
            {msg.sender}
          </span>
        )}
        <span>{time}</span>
        {isUser && (
          <span style={{ fontWeight: 600, color: "#60a5fa" }}>
            {msg.sender}
          </span>
        )}
      </div>
      <div
        style={{
          maxWidth: "72%",
          background: isUser ? "#1d4ed8" : "#1e1e1e",
          color: "#f3f4f6",
          borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          padding: "10px 14px",
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {isUser ? msg.text : renderMarkdown(msg.text)}
        {msg.attachment && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.08)",
              borderRadius: 6,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            📎 {msg.attachment}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatArea({
  channelId,
  messages,
  onSend,
  isAgentTyping = false,
  isConnected,
  channelDescription,
  activeCompanyName,
  workspaceId,
  selectedProjects = [],
  isLoadingHistory = false,
  hasMoreHistory = false,
  loadOlderMessages,
  agentsSurface,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is near the bottom of the message list
  const isNearBottomRef = useRef(true);
  // Scroll height saved just before history prepend, for restoration
  const prevScrollHeightRef = useRef(0);

  // Messages are already filtered by the parent for agent channels
  const channelMessages = messages;

  // Save scroll height when history load starts (before messages are prepended)
  useEffect(() => {
    if (isLoadingHistory && scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    }
  }, [isLoadingHistory]);

  // After history prepend: restore scroll position so the user stays in place
  useLayoutEffect(() => {
    if (isLoadingHistory) return;
    const el = scrollRef.current;
    if (!el || !prevScrollHeightRef.current) return;
    const diff = el.scrollHeight - prevScrollHeightRef.current;
    if (diff > 0 && !isNearBottomRef.current) {
      el.scrollTop = diff;
    }
    prevScrollHeightRef.current = 0;
  }, [isLoadingHistory, channelMessages.length]);

  // Auto-scroll to bottom on new messages — only when near bottom or on initial load
  useEffect(() => {
    if (isLoadingHistory) return; // skip during history load to avoid fighting restoration
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [channelMessages.length, isAgentTyping, isLoadingHistory]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (el.scrollTop < 80 && hasMoreHistory && !isLoadingHistory) {
      loadOlderMessages?.();
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const channelLabel = `#${channelId}`;
  const onlineAgents = agentsSurface?.summary?.departments.filter(
    (dept) => {
      const status = dept.status.toLowerCase();
      // Online: anything except paused, retired, error, offline
      return !["paused", "retired", "error", "offline", "unknown"].includes(status);
    }
  ) ?? [];
  const totalAgents = agentsSurface?.summary?.departments.length ?? 0;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#0d0d0d",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #1f1f1f",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{ fontSize: 18, fontWeight: 700, color: "#f3f4f6" }}
        >
          {channelLabel}
        </span>
        {isConnected !== undefined && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isConnected ? "var(--musu-status-online)" : "var(--musu-status-error)",
              flexShrink: 0,
            }}
            title={isConnected ? "Connected" : "Disconnected"}
          />
        )}
        {totalAgents > 0 && (
          <span
            style={{
              fontSize: 11,
              color: onlineAgents.length > 0 ? "#86efac" : "#6b7280",
              background: onlineAgents.length > 0 ? "rgba(34,197,94,0.12)" : "#1a1a1a",
              border: `1px solid ${onlineAgents.length > 0 ? "rgba(34,197,94,0.3)" : "#2d2d2d"}`,
              borderRadius: 12,
              padding: "2px 8px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title={`${onlineAgents.length} of ${totalAgents} agents online`}
          >
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: onlineAgents.length > 0 ? "var(--musu-status-online)" : "#6b7280",
              }}
            />
            {onlineAgents.length}/{totalAgents} agents
          </span>
        )}
        <div
          style={{
            borderLeft: "1px solid #2d2d2d",
            paddingLeft: 12,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "#4b5563",
            }}
          >
            {channelDescription ??
              (channelId === "general"
                ? "Everything starts here"
                : channelId === "dev"
                  ? "Internal device-to-device discussion"
                  : channelId === "tasks"
                    ? "Work currently in progress"
                    : channelId === "alerts"
                      ? "Device state changes, errors, and completion alerts"
                      : "")}
          </span>
          {(activeCompanyName || workspaceId) ? (
            <span
              style={{
                fontSize: 11,
                color: "#9ca3af",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeCompanyName ?? "Draft company"}
              {workspaceId ? ` · workspace ${workspaceId}` : ""}
              {selectedProjects.length > 0 ? ` · ${selectedProjects.length} projects` : ""}
            </span>
          ) : null}
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* History loading spinner */}
        {isLoadingHistory && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "8px 0 4px",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 12,
                color: "#6b7280",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  border: "2px solid #374151",
                  borderTopColor: "#a78bfa",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Loading earlier messages...
            </span>
          </div>
        )}
        {channelMessages.length === 0 && !isLoadingHistory && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#374151",
              fontSize: 14,
            }}
          >
            No messages yet. Send the first one.
          </div>
        )}
        {channelMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onSend={onSend} />
        ))}
        {isAgentTyping && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 0",
            }}
          >
            <span style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600 }}>
              {channelId}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "#6b7280",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              Responding...
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid #1f1f1f",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexShrink: 0,
          background: "#0d0d0d",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${activeCompanyName ? `Message ${activeCompanyName}` : `Message ${channelLabel}`}... (Enter to send, Shift+Enter for a new line)`}
          rows={1}
          style={{
            flex: 1,
            background: "#1a1a1a",
            border: "1px solid #2d2d2d",
            borderRadius: 10,
            color: "#f3f4f6",
            fontSize: 14,
            padding: "10px 14px",
            resize: "none",
            outline: "none",
            lineHeight: 1.5,
            fontFamily: "inherit",
            maxHeight: 120,
            overflowY: "auto",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? "#1d4ed8" : "#1f2937",
            color: input.trim() ? "#fff" : "#4b5563",
            border: "none",
            borderRadius: 10,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: input.trim() ? "pointer" : "default",
            transition: "background 0.2s",
            whiteSpace: "nowrap",
            height: 42,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
