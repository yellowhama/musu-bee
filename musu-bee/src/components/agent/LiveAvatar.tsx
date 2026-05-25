"use client";

import React, { useEffect, useState } from "react";
import { useFleetStore } from "@/store/useFleetStore";

export function LiveAvatar({ role = "CEO" }: { role?: string }) {
  const agentState = useFleetStore((s) => s.agentState);
  const [blink, setBlink] = useState(false);

  // Random blinking logic for idle state
  useEffect(() => {
    if (agentState !== "idle") return;
    const interval = setInterval(() => {
      if (Math.random() > 0.6) {
        setBlink(true);
        setTimeout(() => setBlink(false), 150);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [agentState]);

  // Derive animation classes based on state
  const isThinking = agentState === "thinking";
  const isSpeaking = agentState === "speaking";
  const isError = agentState === "error";

  const eyeColor = isError ? "var(--status-error)" : isThinking ? "var(--status-running)" : "var(--accent)";
  const eyeHeight = blink ? 2 : isThinking ? 6 : 12;
  
  return (
    <div className={`relative flex flex-col items-center justify-center p-6 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl w-48 h-48 transition-all duration-300 ${isThinking ? 'border-[var(--status-running)] shadow-[var(--shadow-glow)]' : ''} ${isSpeaking ? 'animate-bounce-slow' : ''}`}>
      
      {/* Abstract Geometric Face SVG */}
      <svg width="80" height="80" viewBox="0 0 100 100" className="mb-4">
        {/* Face Outline */}
        <rect x="10" y="10" width="80" height="80" rx="12" fill="var(--bg-surface)" stroke="var(--border-strong)" strokeWidth="4" />
        
        {/* Left Eye */}
        <rect 
          x="30" 
          y={40 - eyeHeight / 2} 
          width="12" 
          height={eyeHeight} 
          rx="4" 
          fill={eyeColor} 
          className="transition-all duration-150"
        />
        
        {/* Right Eye */}
        <rect 
          x="58" 
          y={40 - eyeHeight / 2} 
          width="12" 
          height={eyeHeight} 
          rx="4" 
          fill={eyeColor} 
          className="transition-all duration-150"
        />

        {/* Mouth */}
        {isSpeaking ? (
          <rect x="35" y="70" width="30" height="8" rx="4" fill="var(--text-primary)" className="animate-pulse" />
        ) : isError ? (
          <path d="M 35 75 Q 50 65 65 75" stroke="var(--text-primary)" strokeWidth="4" fill="none" strokeLinecap="round" />
        ) : isThinking ? (
          <rect x="40" y="72" width="20" height="4" rx="2" fill="var(--text-muted)" />
        ) : (
          <rect x="35" y="72" width="30" height="4" rx="2" fill="var(--text-secondary)" />
        )}

        {/* Error Sweat Drop */}
        {isError && (
          <path d="M 80 20 Q 85 30 80 40 Q 75 30 80 20" fill="var(--status-error)" className="animate-bounce" />
        )}
      </svg>

      {/* Role Label */}
      <div className="text-[var(--text-sm)] font-mono font-bold tracking-widest uppercase text-[var(--text-secondary)]">
        {role}
      </div>
      
      {/* Status Badge */}
      <div className={`mt-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full font-bold ${
        isError ? 'bg-[var(--status-error-bg)] text-[var(--status-error)]' :
        isThinking ? 'bg-[var(--status-running-bg)] text-[var(--status-running)]' :
        isSpeaking ? 'bg-[var(--accent-muted)] text-[var(--accent)]' :
        'bg-[var(--status-online-bg)] text-[var(--status-online)]'
      }`}>
        {agentState}
      </div>

      <style jsx>{`
        .animate-bounce-slow {
          animation: float-speak 1s ease-in-out infinite alternate;
        }
        @keyframes float-speak {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
