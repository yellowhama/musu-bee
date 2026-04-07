"use client";

import { useEffect, useRef, useState } from "react";
import type { ChannelId, Message } from "@/types";

interface ChatAreaProps {
  channelId: ChannelId;
  messages: Message[];
  onSend: (text: string) => void;
  isAgentTyping?: boolean;
  isConnected?: boolean;
  channelDescription?: string;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.senderKind === "user";
  const isSystem = msg.senderKind === "system";

  if (isSystem) {
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

  const time = msg.timestamp.toLocaleTimeString("ko-KR", {
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
        {msg.text}
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
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Messages are already filtered by the parent for agent channels
  const channelMessages = messages;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages.length, isAgentTyping]);

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
              background: isConnected ? "#22c55e" : "#ef4444",
              flexShrink: 0,
            }}
            title={isConnected ? "연결됨" : "연결 끊김"}
          />
        )}
        <span
          style={{
            fontSize: 13,
            color: "#4b5563",
            borderLeft: "1px solid #2d2d2d",
            paddingLeft: 12,
          }}
        >
          {channelDescription ??
            (channelId === "general"
              ? "모든 대화가 여기서 시작됩니다"
              : channelId === "dev"
                ? "기기 간 내부 대화 (AI 협의)"
                : channelId === "tasks"
                  ? "진행 중인 작업 목록"
                  : channelId === "alerts"
                    ? "기기 상태 변경, 에러, 완료 알림"
                    : "")}
        </span>
      </div>

      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {channelMessages.length === 0 && (
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
            메시지가 없습니다. 첫 메시지를 보내보세요.
          </div>
        )}
        {channelMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
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
              응답 중...
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
          placeholder={`${channelLabel} 채널에 메시지 입력... (Enter 전송, Shift+Enter 줄바꿈)`}
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
          전송
        </button>
      </div>
    </div>
  );
}
