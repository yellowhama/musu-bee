"use client";

import { useEffect, useRef, useState, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { getBridgeUrl } from "../lib/bridge-config";

export default function WebRtcViewer({ machineId }: { machineId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;

    async function connect() {
      setStatus("connecting");
      setError(null);
      try {
        pc = new RTCPeerConnection();

        // 1. Create KVM Data Channel before creating offer
        const dc = pc.createDataChannel("kvm_control");
        dcRef.current = dc;
        dc.onopen = () => console.log("KVM Control channel open!");
        dc.onclose = () => console.log("KVM Control channel closed.");

        pc.oniceconnectionstatechange = () => {
          if (pc?.iceConnectionState === "connected") setStatus("connected");
          else if (pc?.iceConnectionState === "disconnected") setStatus("disconnected");
          else if (pc?.iceConnectionState === "failed") {
            setStatus("error");
            setError("ICE connection failed");
          }
        };

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        // We must explicitly ask to receive video so the offer includes an m=video line
        const offer = await pc.createOffer({ offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);

        // Send offer to signaling server
        const res = await fetch(`${getBridgeUrl()}/api/webrtc/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sdp: offer.sdp })
        });

        if (!res.ok) throw new Error(`Signaling failed: ${res.status}`);
        const { sdp: answerSdp } = await res.json();
        
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "WebRTC failed");
      }
    }

    connect();

    return () => {
      pc?.close();
    };
  }, [machineId]);

  const sendKvm = (msg: Record<string, unknown>) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify(msg));
    }
  };

  const getRelativePos = (e: ReactMouseEvent | globalThis.MouseEvent) => {
    if (!videoRef.current) return { rx: 0, ry: 0 };
    const video = videoRef.current;
    const rect = video.getBoundingClientRect();
    
    // If video hasn't loaded metadata yet, fallback safely
    if (!video.videoWidth || !video.videoHeight) {
      return {
        rx: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        ry: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      };
    }

    // Get actual video dimensions vs element dimensions
    const videoRatio = video.videoWidth / video.videoHeight;
    const elementRatio = rect.width / rect.height;
    
    let activeWidth = rect.width;
    let activeHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    // Calculate letterboxing/pillarboxing offsets and active area dimensions
    // because objectFit is "contain"
    if (videoRatio > elementRatio) {
      // Letterboxing (black bars on top and bottom)
      activeHeight = rect.width / videoRatio;
      offsetY = (rect.height - activeHeight) / 2;
    } else if (videoRatio < elementRatio) {
      // Pillarboxing (black bars on left and right)
      activeWidth = rect.height * videoRatio;
      offsetX = (rect.width - activeWidth) / 2;
    }

    // Relative mouse position within the *element*
    const elX = e.clientX - rect.left;
    const elY = e.clientY - rect.top;

    // Adjust for the active video area
    const rx = (elX - offsetX) / activeWidth;
    const ry = (elY - offsetY) / activeHeight;
    
    // clamp to 0-1 to prevent sending out-of-bounds coordinates if they click the black bars
    return {
      rx: Math.max(0, Math.min(1, rx)),
      ry: Math.max(0, Math.min(1, ry))
    };
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    const { rx, ry } = getRelativePos(e);
    sendKvm({ type: "mousemove", rx, ry });
  };

  const getBtn = (button: number) => {
    switch (button) {
      case 0: return "left";
      case 1: return "middle";
      case 2: return "right";
      default: return "left";
    }
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    sendKvm({ type: "mousedown", button: getBtn(e.button) });
  };

  const onMouseUp = (e: ReactMouseEvent) => {
    sendKvm({ type: "mouseup", button: getBtn(e.button) });
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    e.preventDefault();
    sendKvm({ type: "keydown", key: e.key });
  };

  const onKeyUp = (e: ReactKeyboardEvent) => {
    e.preventDefault();
    sendKvm({ type: "keyup", key: e.key });
  };

  return (
    <div 
      ref={containerRef}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        width: "100%",
        aspectRatio: "16/9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
        cursor: status === "connected" ? "crosshair" : "default"
      }}
      tabIndex={0} // To capture keyboard events
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()} // prevent right click menu
    >
      {status !== "connected" && (
        <div style={{ position: "absolute", color: "var(--fg3)", zIndex: 10, fontSize: 13 }}>
          {status === "error" ? <span style={{ color: "var(--status-error)" }}>{error}</span> : `Viewer status: ${status}...`}
        </div>
      )}
      <video 
        ref={videoRef} 
        autoPlay
        playsInline
        muted
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        style={{ 
          width: "100%", 
          height: "100%", 
          objectFit: "contain",
          background: "#000",
          opacity: status === "connected" ? 1 : 0.5,
          transition: "opacity 300ms",
          pointerEvents: status === "connected" ? "auto" : "none"
        }} 
      />
      {status === "connected" && (
        <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: 4, fontSize: 11, color: "#fff", pointerEvents: "none" }}>
          KVM Active
        </div>
      )}
    </div>
  );
}
