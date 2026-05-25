"use client";

import React, { useEffect, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { AvatarWidget } from "@streamoji/avatar-widget";

export function LiveAvatar({ role = "CEO" }: { role?: string }) {
  const agentState = useFleetStore((s) => s.agentState);
  const [actions, setActions] = useState<any>(null);

  // Derive animation classes based on state
  const isThinking = agentState === "thinking";
  const isError = agentState === "error";

  // Watch for messages and make the avatar speak
  // When agent transitions to speaking, find the latest AI message
  const messages = useFleetStore((s) => s.messages);
  useEffect(() => {
    if (agentState === "speaking" && actions) {
      const lastAiMessage = messages.filter(m => m.sender === "ai").pop();
      if (lastAiMessage && lastAiMessage.text) {
        actions.avatarSpeak(lastAiMessage.text);
      }
    }
  }, [agentState, actions, messages]);

  return (
    <div className={`relative flex flex-col items-center justify-center p-4 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl w-64 h-80 transition-all duration-300 ${isThinking ? 'border-[var(--status-running)] shadow-[var(--shadow-glow)]' : ''}`}>
      
      {/* Streamoji Open-Source Avatar */}
      <div className="w-full h-full relative overflow-hidden rounded-lg mb-4 bg-[var(--bg-base)]">
        <AvatarWidget 
          version="v2" 
          displayMode="halfBody" 
          onAvatarReady={setActions}
        />
        {/* Fallback styling/overlay for thinking and error states */}
        {isThinking && (
          <div className="absolute inset-0 bg-blue-500/10 animate-pulse pointer-events-none mix-blend-screen" />
        )}
        {isError && (
          <div className="absolute inset-0 bg-red-500/20 animate-pulse pointer-events-none mix-blend-screen" />
        )}
      </div>

      {/* Role Label */}
      <div className="text-[var(--text-sm)] font-mono font-bold tracking-widest uppercase text-[var(--text-secondary)]">
        {role}
      </div>
      
      {/* Status Badge */}
      <div className={`mt-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-bold ${
        isError ? 'bg-[var(--status-error-bg)] text-[var(--status-error)]' :
        isThinking ? 'bg-[var(--status-running-bg)] text-[var(--status-running)]' :
        agentState === 'speaking' ? 'bg-[var(--accent-muted)] text-[var(--accent)]' :
        'bg-[var(--status-online-bg)] text-[var(--status-online)]'
      }`}>
        {agentState}
      </div>
    </div>
  );
}
