"use client";

import Image from "next/image";
import { WIDGETS } from "../town/widgets/WidgetRegistry";
import { VscRobot } from "react-icons/vsc";
import { useFleetStore } from "../../../store/useFleetStore";

export default function ButlerView() {
  const overlayWidgets = useFleetStore(state => state.overlayWidgets);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      background: "#1d1210", // Deep espresso
      borderRadius: 8,
      border: "1px solid var(--border-default)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "inset 0 0 50px rgba(0,0,0,0.5)",
      fontFamily: "'Space Mono', monospace"
    }}>
      {/* Background Grid */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: "linear-gradient(#251714 1px, transparent 1px), linear-gradient(90deg, #251714 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        opacity: 0.3
      }} />

      {/* Butler Avatar */}
      <div style={{
        position: "relative",
        width: 200,
        height: 200,
        filter: "drop-shadow(0 20px 20px rgba(0,0,0,0.5))",
        imageRendering: "pixelated",
        zIndex: 10,
        animation: "float 4s ease-in-out infinite"
      }}>
        <Image src="/agents/butler.png" alt="Musu Butler" fill style={{ objectFit: "contain" }} />
      </div>

      {/* Dynamic Widget Stack (Holograms) */}
      <div style={{
        position: "absolute",
        right: 40,
        top: 40,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "flex-end"
      }}>
        {overlayWidgets.map(widgetObj => {
          const Component = WIDGETS[widgetObj.payload.type];
          if (!Component) return null;
          return (
            <div key={widgetObj.id} style={{ animation: "fadeIn 0.3s ease-out" }}>
              <Component {...widgetObj.payload.props} />
            </div>
          );
        })}
      </div>

      {/* Name Plate */}
      <div style={{
        position: "absolute",
        bottom: 24,
        left: 24,
        background: "rgba(0,0,0,0.7)",
        border: "1px solid var(--border-strong)",
        padding: "8px 16px",
        borderRadius: 6,
        color: "var(--fg1)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        backdropFilter: "blur(4px)"
      }}>
        <VscRobot style={{ color: "var(--accent-orange)", fontSize: 20 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: "bold" }}>Musu Butler</div>
          <div style={{ fontSize: 10, color: "var(--status-success)", display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-success)" }} /> Online
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}} />
    </div>
  );
}
