"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useFleetStore } from "@/store/useFleetStore";
import { LiveAvatar } from "@/components/agent/LiveAvatar";

export default function AgentPage() {
  const params = useParams();
  const id = params?.id;
  const agentRole = (typeof id === 'string' ? id : Array.isArray(id) ? id[0] : "CEO").toUpperCase();
  const messages = useFleetStore((s) => s.messages);
  const isTyping = useFleetStore((s) => s.isTyping);
  const setIsTyping = useFleetStore((s) => s.setIsTyping);
  const addMessage = useFleetStore((s) => s.addMessage);
  const initSSE = useFleetStore((s) => s.initSSE);
  const overlayWidgets = useFleetStore((s) => s.overlayWidgets);

  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initSSE();
  }, [initSSE]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, overlayWidgets]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMsg = {
      id: `msg-user-${Date.now()}`,
      sender: "user" as const,
      text: input
    };
    addMessage(userMsg);
    setInput("");
    setIsTyping(true);

    try {
      await fetch("/api/tasks/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: userMsg.text,
          target_node: "local",
          adapter_type: "openai_compat_local",
          workspace_uri: "f:/workspace/musu-bee/musu-bee"
        })
      });
    } catch (err) {
      console.error(err);
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="flex items-center px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <h1 className="text-[var(--text-lg)] font-bold font-mono text-[var(--accent)] tracking-widest uppercase">
          [ {agentRole} OFFICE ]
        </h1>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left: Avatar Persona */}
        <aside className="w-80 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col items-center justify-center p-8">
          <LiveAvatar role={agentRole} />
          
          <div className="mt-12 w-full max-w-[240px]">
            <h3 className="text-[var(--text-sm)] text-[var(--text-secondary)] font-bold mb-4 uppercase tracking-widest border-b border-[var(--border-subtle)] pb-2">
              Capabilities
            </h3>
            <ul className="text-[var(--text-base)] text-[var(--text-muted)] space-y-2">
              <li>• System Diagnostics</li>
              <li>• Automated Refactoring</li>
              <li>• Quality Audits</li>
              <li>• P2P Delegation</li>
            </ul>
          </div>
        </aside>

        {/* Center: Infinite Canvas & Hologram Stage */}
        <main className="flex-1 flex flex-col relative overflow-y-auto">
          
          <div className="flex-1 p-8 space-y-6 max-w-4xl w-full mx-auto">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-[var(--text-muted)] font-mono text-center">
                The canvas is empty.<br/>Give the {agentRole} an instruction to begin.
              </div>
            )}
            
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-3 rounded-lg max-w-[80%] ${
                  m.sender === "user" 
                    ? "bg-[var(--accent)] text-[var(--text-on-accent)]" 
                    : "bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                }`}>
                  <p className="whitespace-pre-wrap text-[var(--text-md)]">{m.text}</p>
                </div>
              </div>
            ))}
            
            {/* Render Widgets explicitly here as Holograms */}
            {overlayWidgets.map(w => (
              <div key={w.id} className="bg-[var(--bg-card)] border border-[var(--accent-border)] rounded-lg p-4 shadow-[var(--shadow-glow)]">
                <div className="text-[var(--text-xs)] text-[var(--accent)] mb-2 font-mono uppercase">
                  [ Holographic Output ]
                </div>
                <pre className="font-mono text-[var(--text-sm)] whitespace-pre-wrap">
                  {JSON.stringify(w.payload, null, 2)}
                </pre>
              </div>
            ))}

            <div ref={endRef} />
          </div>

          {/* Bottom Chat Input */}
          <div className="p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <div className="max-w-4xl mx-auto flex gap-4">
              <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={`Ask ${agentRole} to execute a task...`}
                className="flex-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-md px-4 py-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                disabled={isTyping}
              />
              <button 
                onClick={handleSend}
                disabled={isTyping}
                className="bg-[var(--accent)] text-[var(--text-on-accent)] font-bold px-8 py-3 rounded-md hover:bg-[var(--accent-hover)] transition-all shadow-sm hover:shadow-[var(--shadow-glow)] disabled:opacity-50"
              >
                {isTyping ? "WAIT" : "SEND"}
              </button>
            </div>
          </div>
        </main>

      </div>
    </div>
  );
}
