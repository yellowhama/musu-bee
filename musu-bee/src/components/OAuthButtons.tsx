"use client";

import { useState } from "react";
import {
  getOAuthRedirectUrl,
  getSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

type OAuthProvider = "google" | "github";

const PROVIDERS: Array<{
  provider: OAuthProvider;
  label: string;
}> = [
  { provider: "google", label: "Continue with Google" },
  { provider: "github", label: "Continue with GitHub" },
];

interface OAuthButtonsProps {
  next?: string;
}

export default function OAuthButtons({ next = "/app" }: OAuthButtonsProps) {
  const authConfigured = isSupabaseConfigured();
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOAuth(provider: OAuthProvider) {
    setError(null);
    setLoadingProvider(provider);

    try {
      const supabase = getSupabaseClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthRedirectUrl(next),
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoadingProvider(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start social sign-in.");
      setLoadingProvider(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
      {PROVIDERS.map(({ provider, label }) => {
        const loading = loadingProvider === provider;
        return (
          <button
            key={provider}
            type="button"
            onClick={() => void handleOAuth(provider)}
            disabled={!authConfigured || loadingProvider !== null}
            style={{
              width: "100%",
              background: "#171717",
              color: "#f3f4f6",
              border: "1px solid #2d2d2d",
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: !authConfigured || loadingProvider !== null ? "not-allowed" : "pointer",
              opacity: !authConfigured ? 0.6 : 1,
            }}
          >
            {loading ? `Connecting ${provider}...` : label}
          </button>
        );
      })}
      {error ? (
        <div
          style={{
            background: "#2d1515",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
