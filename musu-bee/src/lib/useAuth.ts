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
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
  const authConfigured = isSupabaseConfigured();

  const [userIdentity, setUserIdentity] = useState<UserIdentity>({
    email: null,
    id: null,
  });

  useEffect(() => {
    if (!authEnabled) {
      setUserIdentity({ email: null, id: null });
      return;
    }

    if (!authConfigured) {
      setUserIdentity({ email: null, id: null });
      router.replace("/auth/login");
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
        router.replace("/auth/login");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserIdentity({
          email: session.user.email ?? null,
          id: session.user.id ?? null,
        });
      } else if (authEnabled) {
        router.replace("/auth/login");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authConfigured, authEnabled, router]);

  return { userIdentity, authEnabled, authConfigured };
}
