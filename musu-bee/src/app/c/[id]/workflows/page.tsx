// V23.4 Phase 4 T2-D-mini — Workflows list page (wiki/435 v2 §2 file #6).
// Server component: fetches workflows for company, renders list + "New" link.
import Link from "next/link";
import { headers } from "next/headers";

interface WorkflowRow {
  id: string;
  company_id: string;
  name: string;
  status: string;
  created_at: number;
}

async function fetchWorkflows(companyId: string): Promise<WorkflowRow[]> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "musu.pro";
    const proto = h.get("x-forwarded-proto") ?? (host === "musu.pro" ? "https" : "http");
    const url = `${proto}://${host}/api/workflows?company_id=${encodeURIComponent(companyId)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as WorkflowRow[] | { error: string };
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const STATUS_COLOR: Record<string, string> = {
  pending: "var(--status-warn)",
  running: "var(--status-running)",
  succeeded: "var(--status-online)",
  failed: "var(--status-error)",
  cancelled: "var(--fg3)",
};

export default async function WorkflowsListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const rows = await fetchWorkflows(companyId);
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px", color: "var(--fg1)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Workflows · {companyId}</h1>
        <Link
          href={`/c/${companyId}/workflows/new/edit`}
          style={{
            background: "var(--status-online)",
            color: "var(--bg-base)",
            padding: "8px 16px",
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          + New workflow
        </Link>
      </header>
      {rows.length === 0 ? (
        <div style={{ color: "var(--fg3)" }}>No workflows yet. Create one to get started.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((w) => (
            <Link
              key={w.id}
              href={`/c/${companyId}/workflows/${w.id}/edit`}
              data-testid={`workflow-row-${w.id}`}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-default)",
                borderRadius: 12,
                padding: "12px 16px",
                color: "var(--fg1)",
                textDecoration: "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 600 }}>{w.name}</span>
              <span style={{ fontSize: 12, color: STATUS_COLOR[w.status] ?? "var(--fg3)" }}>{w.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
