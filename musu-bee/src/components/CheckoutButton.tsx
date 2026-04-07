"use client";

import { useState } from "react";

interface Props {
  tier: "free" | "pro" | "team";
  label: string;
  style?: React.CSSProperties;
}

export default function CheckoutButton({ tier, label, style }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (tier === "free") {
      window.location.href = "/";
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "결제 오류가 발생했습니다.");
        setLoading(false);
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "12px 0",
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 700,
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.7 : 1,
        border: "none",
        letterSpacing: "-0.01em",
        transition: "opacity 0.15s",
        ...style,
      }}
    >
      {loading ? "처리 중…" : label}
    </button>
  );
}
