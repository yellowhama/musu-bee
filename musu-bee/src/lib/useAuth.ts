"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

export interface UserIdentity {
  email: string | null;
  id: string | null;
}

export interface UseAuthReturn {
  userIdentity: UserIdentity;
  authEnabled: boolean;
  authConfigured: boolean;
}

export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const authConfigured = isSupabaseConfigured();
  const envAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

  // v13-visual P0-1 — Read embed flag synchronously on the client. Reading
  // window during state init (and skipping during SSR) avoids both the race
  // with the auth-redirect effect AND the hydration mismatch warning
  // (initial render returns null for embed flag both server-side and
  // client-side; the effect upgrades it before the auth gate fires).
  const [isEmbedded, setIsEmbedded] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("embed") === "1") {
      setIsEmbedded(true);
    }
  }, []);

  const authEnabled = isEmbedded ? false : envAuthEnabled;

  const [userIdentity, setUserIdentity] = useState<UserIdentity>({
    email: null,
    id: null,
  });

  useEffect(() => {
    // P0-1 — Delay the auth gate decision until after we've checked for
    // ?embed=1 on the client. Without this, the first effect run sees
    // `authEnabled = envAuthEnabled = true` while the embed flag is still
    // false, and redirects to /login before isEmbedded flips.
    if (typeof window !== "undefined" && !isEmbedded) {
      const hasEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
      if (hasEmbed) return; // pending state flip; bail this run
    }
    const redirectToLogin = () => {
      const path = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?redirect=${encodeURIComponent(path)}`);
    };

    if (!authEnabled) {
      setUserIdentity({ email: null, id: null });
      return;
    }

    if (!authConfigured) {
      setUserIdentity({ email: null, id: null });
      redirectToLogin();
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user) {
        setUserIdentity({
          email: data.session.user.email ?? null,
          id: data.session.user.id ?? null,
        });
      } else if (authEnabled) {
        redirectToLogin();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserIdentity({
          email: session.user.email ?? null,
          id: session.user.id ?? null,
        });
      } else if (authEnabled) {
        redirectToLogin();
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authConfigured, authEnabled, router, isEmbedded]);

  return { userIdentity, authEnabled, authConfigured };
}
