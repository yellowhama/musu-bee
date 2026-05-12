import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function getUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionCookie = [...cookieStore.getAll()].find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!sessionCookie) {
    console.log("DEBUG: No Supabase session cookie found");
    return null;
  }

  let accessToken: string | null = null;
  try {
    const parsed = JSON.parse(sessionCookie.value);
    if (typeof parsed === "string") {
      accessToken = parsed;
    } else if (parsed?.access_token) {
      accessToken = parsed.access_token;
    } else if (Array.isArray(parsed) && parsed[0]) {
      const joined = parsed.join("");
      const inner = JSON.parse(joined);
      accessToken = inner?.access_token || null;
    }
  } catch (err) {
    console.error("DEBUG: Failed to parse session cookie:", err);
    if (sessionCookie.value.split(".").length === 3) {
      accessToken = sessionCookie.value;
    }
  }

  if (!accessToken) {
    console.log("DEBUG: No access token extracted from cookie");
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      console.error("DEBUG: Supabase getUser error:", error);
      return null;
    }
    return user;
  } catch (err) {
    console.error("DEBUG: Supabase client error:", err);
    return null;
  }
}
