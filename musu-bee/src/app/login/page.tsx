import { redirect } from "next/navigation";

type LoginPageProps = {
  searchParams: Promise<{
    redirect?: string;
    next?: string;
  }>;
};

function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/workspace";
  }
  return value;
}

export default async function LoginAliasPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnPath = safeReturnPath(params.redirect ?? params.next);
  redirect(`/auth/login?next=${encodeURIComponent(returnPath)}`);
}
