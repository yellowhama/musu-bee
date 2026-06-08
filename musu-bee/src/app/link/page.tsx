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
  const user = await getUser();
  if (!user) {
    // Logged-out users must sign in first; return here afterwards.
    redirect(`/auth/login?next=${encodeURIComponent("/link")}`);
  }

  const params = await searchParams;
  const prefill = prefillUserCode(params.user_code ?? params.code);

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Link a device</h1>
      <p style={{ marginTop: 12, lineHeight: 1.5 }}>
        Enter the code shown in your terminal by <code>musu login</code> to authorize this machine.
      </p>
      <LinkApprovalForm initialUserCode={prefill} />
    </main>
  );
}
