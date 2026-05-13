import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth-server";
import CeoChatClient from "@/components/dispatch/CeoChatClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CompanyChatPage({ params }: Props) {
  const user = await getUser();
  const { id: companyId } = await params;

  if (!user) {
    redirect(`/login?redirect=/dashboard/company/${companyId}/chat`);
  }

  return (
    <CeoChatClient
      companyId={companyId}
      userId={user.id}
      userEmail={user.email ?? "user@local"}
    />
  );
}
