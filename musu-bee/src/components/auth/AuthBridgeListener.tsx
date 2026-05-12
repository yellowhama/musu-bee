"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

const TRUSTED_ORIGIN = "https://musu.pro";

export default function AuthBridgeListener() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  useEffect(() => {
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
    return () => window.removeEventListener("message", handleMessage);
  }, [supabase, router]);

  return null;
}
