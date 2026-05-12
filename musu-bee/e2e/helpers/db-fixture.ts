/**
 * v13-visual A — sqlite fixture helper for Playwright visual smoke tests.
 *
 * Inserts/deletes rows directly via the `sqlite3` CLI so the inbox poll
 * can pick up changes without going through bridge endpoints. The path
 * targets ~/.musu/musu.db by default; override with MUSU_TEST_DB if
 * running against a fixture database.
 */
import { execSync } from "child_process";
import * as os from "os";
import * as path from "path";

const DB = process.env.MUSU_TEST_DB ?? path.join(os.homedir(), ".musu", "musu.db");

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

export function insertPendingApproval(opts: {
  id: string;
  companyId: string;
  reason: string;
  requestedBy?: string;
}): void {
  const sql = `INSERT INTO company_approvals_queue (id, company_id, status, requested_by, reason) VALUES ('${sqlEscape(opts.id)}', '${sqlEscape(opts.companyId)}', 'pending', '${sqlEscape(opts.requestedBy ?? "ceo")}', '${sqlEscape(opts.reason)}');`;
  execSync(`sqlite3 "${DB}" "${sql.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
}

export function deleteApproval(id: string): void {
  execSync(`sqlite3 "${DB}" "DELETE FROM company_approvals_queue WHERE id = '${sqlEscape(id)}';"`, {
    stdio: "pipe",
  });
}

export async function fetchActiveCompanyId(
  proxyBase = "http://localhost:3001/api/bridge",
): Promise<string | null> {
  try {
    const r = await fetch(`${proxyBase}/workspace`);
    if (!r.ok) return null;
    const data = (await r.json()) as { active_company_id?: string };
    return data.active_company_id ?? null;
  } catch {
    return null;
  }
}

export async function bridgeHealthy(
  proxyBase = "http://localhost:3001/api/bridge",
): Promise<boolean> {
  try {
    const r = await fetch(`${proxyBase}/workspace`);
    return r.ok;
  } catch {
    return false;
  }
}
