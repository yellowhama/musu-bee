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
  onApprovePlan?: (msgId: string) => void;
  onRejectPlan?: (msgId: string) => void;
  externalInput?: string;
  onExternalInputConsumed?: () => void;
  onNodeChange?: (node: string) => void;
  activeNode?: string;
  availableNodes?: Array<{ name: string; status: string }>;
  /** v15.4 — fire a 1.5s yellow-ring flash on the header when this is
   * true (a new inbox item arrived for the currently-open company).
   * The parent owns the flash list; on toggle off, the animation
   * naturally completes. */
  flashActive?: boolean;
  /** v15.4 — called once 1.5s after a flash starts. Wired to
   * useInbox.clearFlash so the chat-side consume mirrors the
   * canvas-side. Whichever fires first removes the company from the
   * shared list. */
  onFlashConsumed?: () => void;
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
            background: "var(--code-bg)",
            border: "1px solid var(--fg4)",
            borderRadius: 3,
            padding: "1px 5px",
            fontSize: 12,
            fontFamily: "monospace",
            color: "var(--accent)",
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
                background: "var(--code-bg)",
                border: "1px solid var(--fg4)",
                borderRadius: 6,
                padding: "10px 14px",
                overflowX: "auto",
                fontSize: 13,
                color: "var(--fg1)",
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

// Approval card rendered when system message contains "⚠ **Approval required**"
function ApprovalCard({ text, onSend }: { text: string; onSend: (t: string) => void }) {
  const idMatch = /`(task-[a-z0-9-]+)`/.exec(text);
  const taskId = idMatch ? idMatch[1] : null;
  const actionMatch = /⚠ \*\*Approval required\*\*: ([^\n]+)/.exec(text);
  const action = actionMatch ? actionMatch[1] : text;

  const handleApprove = useCallback(() => { if (taskId) onSend(`/approve ${taskId}`); }, [taskId, onSend]);
  const handleReject = useCallback(() => { if (taskId) onSend(`/reject ${taskId}`); }, [taskId, onSend]);

  return (
    <div className="neo-card" style={{ margin: "12px auto", maxWidth: 460, border: "var(--neo-border)", background: "var(--accent-tint)", borderRadius: "var(--neo-radius)", boxShadow: "var(--neo-shadow-sm)" }}>
      <div className="label" style={{ color: "var(--accent)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span className="dot-working" style={{ width: 6, height: 6, borderRadius: "0px", background: "var(--accent)" }} />
        Approval Required
      </div>
      <div style={{ fontSize: 13, color: "var(--fg1)", lineHeight: 1.5, marginBottom: 12 }}>
        {action}
      </div>
      {taskId && (
        <div style={{ marginBottom: 16 }}>
          <code style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", padding: "2px 6px", fontSize: 11, color: "var(--accent)" }}>
            {taskId}
          </code>
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-primary" onClick={handleApprove} style={{ flex: 1, height: 32, fontSize: 12 }}>
          Approve
        </button>
        <button className="btn" onClick={handleReject} style={{ flex: 1, height: 32, fontSize: 12, borderColor: "var(--status-error)", color: "var(--status-error)" }}>
          Reject
        </button>
        <button className="btn btn-ghost" style={{ height: 32, fontSize: 12 }}>
          Show Plan
        </button>
      </div>
    </div>
  );
}

// Plan card rendered when msg.plan is present (numbered execution plan)
function PlanCard({ msg, onApprove, onReject }: { msg: Message; onApprove?: (msgId: string) => void; onReject?: (msgId: string) => void }) {
  const plan = msg.plan;
  const handleApprove = useCallback(() => {
    if (onApprove) onApprove(msg.id);
  }, [msg.id, onApprove]);

  const handleReject = useCallback(() => {
    if (onReject) onReject(msg.id);
  }, [msg.id, onReject]);

  if (!plan) return null;

  return (
    <div
      style={{
        border: "var(--neo-border)",
        borderRadius: "var(--neo-radius)",
        padding: 12,
        marginTop: 8,
        background: "var(--bg-base)",
        boxShadow: "var(--neo-shadow-sm)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg2)", marginBottom: 8 }}>
        📋 Execution Plan · {plan.steps.length} steps
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {plan.steps.map((step, idx) => (
          <div
            key={step.id}
            style={{
              background: "var(--bg-card)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 13,
              color: "var(--fg1)",
              display: "flex",
              gap: 8,
            }}
          >
            <span style={{ color: "var(--fg3)", fontWeight: 600, minWidth: 20 }}>{idx + 1}.</span>
            <span>{step.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {plan.status === "pending" ? (
          <>
            <button
              onClick={handleApprove}
              style={{
                flex: 1,
                padding: "8px 0",
                background: "#14532d",
                border: "1px solid #16a34a",
                borderRadius: 6,
                color: "var(--status-online)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✓ Approve & Run
            </button>
            <button
              onClick={handleReject}
              style={{
                flex: 1,
                padding: "8px 0",
                background: "#450a0a",
                border: "1px solid #dc2626",
                borderRadius: 6,
                color: "#fca5a5",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✗ Reject
            </button>
          </>
        ) : plan.status === "approved" ? (
          <div
            style={{
              flex: 1,
              textAlign: "center",
              padding: "8px 0",
              color: "var(--status-online)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Approved ✓
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              textAlign: "center",
              padding: "8px 0",
              color: "#fca5a5",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Rejected ✗
          </div>
        )}
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
        color: "var(--fg4)",
        fontFamily: "monospace",
      }}
    >
      {chain.map((node, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: "1px 5px",
              color: "var(--fg2)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {node}
          </span>
          {i < chain.length - 1 && (
            <span style={{ color: "var(--fg4)", fontSize: 10 }}>→</span>
          )}
        </span>
      ))}
    </div>
  );
}

function AdapterBadge({ type, duration, cost }: { type: string, duration?: number, cost?: number }) {
  const short = type.split("_")[0].toUpperCase();
  const color = short === "CLAUDE" ? "var(--accent)" : short === "GEMINI" ? "#34d399" : "var(--fg3)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          padding: "0 4px",
          borderRadius: 3,
          background: `${color}22`,
          color,
          border: `1px solid ${color}44`,
          marginLeft: 4,
          display: "inline-flex",
          alignItems: "center",
          height: 14,
        }}
      >
        {short}
      </span>
      {duration !== undefined && (
        <span style={{ fontSize: 9, color: "var(--fg3)" }}>{duration.toFixed(1)}s</span>
      )}
      {cost !== undefined && cost > 0 && (
        <span style={{ fontSize: 9, color: "var(--status-online)" }}>${cost.toFixed(4)}</span>
      )}
    </span>
  );
}

function Avatar({ who, role }: { who: string; role?: string }) {
  const map: Record<string, [string, string]> = {
    ceo: ["ceo", "CE"],
    cto: ["cto", "CT"],
    engineer: ["eng", "EN"],
    qa: ["qa", "QA"],
    cos: ["cos", "CO"],
    worker: ["worker", "WK"],
    user: ["user", "YOU"],
    system: ["system", "SY"],
  };
  const [cls, txt] = map[who.toLowerCase()] || map[role?.toLowerCase() || ""] || ["eng", "?"];

  return (
    <div
      className={`avatar ${cls}`}
      style={{
        width: 32,
        height: 32,
        borderRadius: "var(--neo-radius)",
        border: "var(--neo-border)",
        boxShadow: "var(--neo-shadow-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
        flexShrink: 0,
        color: "var(--fg-on-accent)",
        background: cls === "ceo" ? "var(--accent)" : cls === "cto" ? "var(--status-running)" : cls === "eng" ? "#34d399" : cls === "qa" ? "#fb7185" : "var(--accent)",
      }}
    >
      {txt}
    </div>
  );
}

function MessageBubble({ msg, onSend, onApprovePlan, onRejectPlan }: { msg: Message; onSend: (t: string) => void; onApprovePlan?: (msgId: string) => void; onRejectPlan?: (msgId: string) => void }) {
  const isUser = msg.senderKind === "user";
  const isSystem = msg.senderKind === "system";

  if (isSystem) {
    if (msg.text.includes("⚠ **Approval required**")) {
      return <ApprovalCard text={msg.text} onSend={onSend} />;
    }
    return (
      <div className="sysline" style={{ textAlign: "center", fontSize: 11, color: "var(--fg3)", padding: "12px 0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {msg.text}
      </div>
    );
  }

  const time = msg.timestamp.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="msg" style={{ display: "flex", gap: 12, marginBottom: 24 }}>
      <Avatar who={isUser ? "user" : msg.channelId} role={msg.meta?.adapterType} />
      <div className="mbody" style={{ flex: 1, minWidth: 0 }}>
        <div className="mhead" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span className={`who ${isUser ? "user" : "ai"}`} style={{ fontWeight: 700, fontSize: 13, color: isUser ? "var(--accent)" : "var(--fg1)" }}>
            {msg.sender}
          </span>
          {msg.meta?.adapterType && (
            <AdapterBadge 
              type={msg.meta.adapterType} 
              duration={msg.meta.durationSec} 
              cost={msg.meta.costUsd} 
            />
          )}
          <span className="ts" style={{ fontSize: 11, color: "var(--fg3)", marginLeft: "auto" }}>{time}</span>
        </div>
        
        {!isUser && msg.meta?.chain && (
          <DelegationChip chain={msg.meta.chain} />
        )}

        <div className={`mtext ${isUser ? 'neo-card' : ''}`} style={{ 
          fontSize: 14, lineHeight: 1.6, 
          color: isUser ? "var(--bg-base)" : "var(--fg1)", 
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          ...(isUser ? { background: "var(--accent)", padding: "12px 16px", marginTop: "8px", fontWeight: "600" } : {})
        }}>
          {isUser ? msg.text : renderMarkdown(msg.text)}
        </div>

        {msg.attachment && (
          <div className="neo-card" style={{ marginTop: 8, padding: "8px 12px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            📎 {msg.attachment}
          </div>
        )}

        {!isUser && msg.plan && (
          <PlanCard msg={msg} onApprove={onApprovePlan} onReject={onRejectPlan} />
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
  onApprovePlan,
  onRejectPlan,
  externalInput,
  onExternalInputConsumed,
  onNodeChange,
  activeNode = "local",
  availableNodes = [],
  flashActive = false,
  onFlashConsumed,
}: ChatAreaProps) {
  // v15.4 — consume the flash signal after the 1.5s animation completes.
  useEffect(() => {
    if (!flashActive || !onFlashConsumed) return;
    const t = window.setTimeout(() => {
      onFlashConsumed();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [flashActive, onFlashConsumed]);

  const [input, setInput] = useState("");
  // v13.6 — Embed flag drives a conditional render of the connection pill.
  // Reading window directly inside the JSX caused a hydration mismatch (SSR
  // saw no window → rendered the pill; client saw embed=1 → skipped it).
  // Resolve in a client-only effect so initial render is identical on both.
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("embed") === "1") {
      setIsEmbedded(true);
    }
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Handle external text injection from CommandPalette
  useEffect(() => {
    if (externalInput) {
      setInput(externalInput);
      textareaRef.current?.focus();
      onExternalInputConsumed?.();
    }
  }, [externalInput, onExternalInputConsumed]);

  // v16.E-1 — Mobile virtual keyboard handling.
  // On iOS Safari and Android Chrome, opening the keyboard shrinks the
  // visual viewport without resizing the layout viewport. The result is
  // that the textarea slides under the keyboard and the user can't see
  // what they're typing. visualViewport.resize fires when the keyboard
  // animates in/out — we use it to keep the bottom of the message list
  // (and therefore the input) in view.
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;

    const scrollToBottomIfFocused = () => {
      // Only react when the chat textarea is the active element — otherwise
      // a global viewport resize (e.g. dev tools opening) would yank scroll.
      if (document.activeElement !== textareaRef.current) return;
      // Use the layout viewport's scrollIntoView; visual viewport changes
      // don't affect element.scrollIntoView() targets, but the browser
      // will compose them correctly.
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    vv.addEventListener("resize", scrollToBottomIfFocused);
    return () => {
      vv.removeEventListener("resize", scrollToBottomIfFocused);
    };
  }, []);

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
  const isAgentChannel = ["ceo", "cto", "engineer", "qa", "cos", "worker"].includes(channelId);

  return (
    <main
      className="main"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-surface)",
        overflow: "hidden",
      }}
    >
      {/* chead — channel header */}
      <div
        className={`chead${flashActive ? " chat-channel-flash" : ""}`}
        style={{
          padding: "0 20px",
          height: "88px", /* Match the other headers */
          borderBottom: "3px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div className="title" style={{ fontSize: 18, fontWeight: 800, color: "var(--fg1)", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--accent)", opacity: 0.7 }}>#</span>
          {channelId}
        </div>
        <div className="desc" style={{ fontSize: 12, color: "var(--fg3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {channelDescription ?? "Everything starts here. Send the first one."}
        </div>

        {isConnected !== undefined && !isEmbedded && (
          <span
            className={`pill ${isConnected ? "sync" : "error"}`}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "var(--radius-pill)",
              background: isConnected ? "var(--status-online-bg)" : "var(--status-error-bg)",
              color: isConnected ? "var(--status-online)" : "var(--status-error)",
              border: `1px solid ${isConnected ? "var(--status-online-br)" : "var(--status-error)"}`,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span className={isConnected ? "dot-active" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            {isConnected ? "SYNC" : "OFFLINE"}
          </span>
        )}

        {isAgentChannel && onNodeChange && availableNodes.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 8px",
            }}
          >
            <span className="label" style={{ fontSize: 9 }}>Node</span>
            <select
              value={activeNode}
              onChange={(e) => onNodeChange?.(e.target.value)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: "transparent",
                border: "none",
                color: "var(--fg2)",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {availableNodes.map((node) => (
                <option key={node.name} value={node.name} style={{ background: "var(--bg-overlay)", color: "var(--fg1)" }}>
                  {node.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* msgs — message list */}
      <div
        className="msgs"
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isLoadingHistory && (
          <div className="sysline" style={{ textAlign: "center", padding: "10px", color: "var(--fg3)", fontSize: 11 }}>
            LOADING EARLIER MESSAGES...
          </div>
        )}
        
        {channelMessages.length === 0 && !isLoadingHistory && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg4)", fontSize: 14, letterSpacing: "0.02em" }}>
            No messages yet. Send the first one.
          </div>
        )}

        {channelMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} onSend={onSend} onApprovePlan={onApprovePlan} onRejectPlan={onRejectPlan} />
        ))}

        {isAgentTyping && (
          <div className="msg" style={{ display: "flex", gap: 12, opacity: 0.7 }}>
            <Avatar who={channelId} />
            <div className="mbody">
              <div className="mhead">
                <span className="who ai" style={{ fontWeight: 700, fontSize: 13 }}>{channelId}</span>
              </div>
              <div className="mtext dot-working" style={{ fontSize: 13, color: "var(--fg3)" }}>
                Responding...
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer — input area */}
      <div
        className="composer"
        style={{
          padding: "0 20px 20px",
          background: "transparent",
        }}
      >
        <div
          className="neo-card"
          style={{
            background: "var(--bg-card)",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${channelId}...`}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--fg1)",
              fontSize: 14,
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
              fontFamily: "var(--font-ui)",
              minHeight: 24,
              maxHeight: 200,
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
          />
          <div
            className="crow"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: 10,
            }}
          >
            <button className="ibtn" title="Attach" style={{ background: "transparent", border: "none", fontSize: 16, cursor: "pointer", opacity: 0.6 }}>📎</button>
            <button className="ibtn" title="Plan" style={{ background: "transparent", border: "none", fontSize: 16, cursor: "pointer", opacity: 0.6 }}>📋</button>
            <button className="ibtn" title="Handoff" style={{ background: "transparent", border: "none", fontSize: 16, cursor: "pointer", opacity: 0.6 }}>🔄</button>
            
            <span className="hint" style={{ fontSize: 10, color: "var(--fg4)", marginLeft: "auto", textTransform: "uppercase", fontWeight: 600 }}>
              ENTER send · SHIFT+ENTER newline
            </span>

            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={!input.trim()}
              style={{
                borderRadius: "var(--radius-sm)",
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 700,
                opacity: input.trim() ? 1 : 0.4,
                cursor: input.trim() ? "pointer" : "default",
              }}
            >
              SEND
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
