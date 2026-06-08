"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

const TRUSTED_ORIGIN = "https://musu.pro";

export default function AuthBridgeListener() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  useEffect(() => {
    // 1. Sync session to cookie so middleware.ts can read it.
    // We only store the access_token to avoid the 4KB cookie limit.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        const maxAge = 100 * 365 * 24 * 60 * 60; // 100 years
        document.cookie = `sb-musu-auth-token=${session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax; secure`;
      } else if (event === "SIGNED_OUT") {
        document.cookie = `sb-musu-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; secure`;
      }
    });

    // 2. Handle iframe messages
    function handleMessage(event: MessageEvent) {
      // Security: Strictly validate origin (musu.pro or vercel previews)
      if (event.origin !== TRUSTED_ORIGIN && !event.origin.endsWith(".vercel.app") && event.origin !== "http://localhost:3000") {
        return;
      }

      const { type, session } = event.data;

      if (type === "MUSU_AUTH_TRANSFER" && session) {
        console.log("DEBUG: Received auth transfer from parent...");
        supabase.auth.setSession(session).then(({ error }) => {
          if (!error) {
            console.log("DEBUG: SSO Session established successfully.");
            router.refresh();
          } else {
            console.error("DEBUG: Failed to establish SSO session:", error);
          }
        });
      }
    }

    window.addEventListener("message", handleMessage);
    
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("message", handleMessage);
    };
  }, [supabase, router]);

  return null;
}
