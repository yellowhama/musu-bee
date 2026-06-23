import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth-server";
import LinkApprovalForm from "./LinkApprovalForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LinkPageProps = {
  searchParams: Promise<{ user_code?: string; code?: string }>;
};

function prefillUserCode(value: string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  // Display-only prefill; the server re-validates on approve. Keep it loose
  // here so a pasted "XXXX-XXXX" survives but obvious junk is dropped.
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8) {
    return "";
  }
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export default async function LinkDevicePage({ searchParams }: LinkPageProps) {
  const params = await searchParams;
  const prefill = prefillUserCode(params.user_code ?? params.code);

  const user = await getUser();
  if (!user) {
    // Logged-out users must sign in first; return here afterwards. CRITICAL:
    // preserve the device code through the login round-trip — otherwise the
    // user lands back on /link with no code, sees the manual "Enter the code"
    // form, and MUSU has already moved on (no code to type). Carry it in `next`.
    const returnTo = prefill ? `/link?code=${encodeURIComponent(prefill)}` : "/link";
    redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  }
  // When MUSU opened this page itself, the code is already in the URL — the user
  // shouldn't type anything, just confirm the sign-in.
  const hasCode = prefill.length > 0;

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        {hasCode ? "Sign in to MUSU" : "Link a device"}
      </h1>
      <p style={{ marginTop: 12, lineHeight: 1.5 }}>
        {hasCode ? (
          "Confirm to sign this app in to your MUSU account."
        ) : (
          "Enter the code shown in the MUSU app to sign it in to your account."
        )}
      </p>
      <LinkApprovalForm initialUserCode={prefill} hasCode={hasCode} />
    </main>
  );
}
