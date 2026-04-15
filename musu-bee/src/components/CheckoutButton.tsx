"use client";

import { initializePaddle } from "@paddle/paddle-js";
import { useState } from "react";

interface Props {
  tier: "free" | "pro" | "team";
  label: string;
  style?: React.CSSProperties;
}

declare global {
  interface Window {
    __MUSU_CHECKOUT_TEST_HOOKS__?: {
      initializePaddle?: typeof initializePaddle;
    };
  }
}

export default function CheckoutButton({ tier, label, style }: Props) {
  const [loading, setLoading] = useState(false);
  const paddleEnvironment =
    process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
      ? "production"
      : "sandbox";
  const paddleClientToken =
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() ?? "";

  async function handleClick() {
    if (tier === "free") {
      window.location.href = "/app";
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json()) as {
        transactionId?: string;
        url?: string;
        error?: string;
      };

      if (paddleClientToken && data.transactionId) {
        try {
          const initializePaddleForEnv =
            window.__MUSU_CHECKOUT_TEST_HOOKS__?.initializePaddle ?? initializePaddle;
          const paddle = await initializePaddleForEnv({
            environment: paddleEnvironment,
            token: paddleClientToken,
          });
          if (paddle) {
            paddle.Checkout.open({ transactionId: data.transactionId });
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to hosted checkout redirect when Paddle.js init fails.
        }
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "A checkout error occurred.");
        setLoading(false);
      }
    } catch {
      alert("A network error occurred.");
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
      {loading ? "Processing..." : label}
    </button>
  );
}
