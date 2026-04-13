import { MUSU_WORKER_URL } from "../config";

export async function handleRunCommand(params: Record<string, unknown>): Promise<unknown> {
  const command = typeof params.command === "string" ? params.command : null;
  if (!command || !command.trim()) return { error: "command_required" };
  const timeoutSec = typeof params.timeout_sec === "number" ? params.timeout_sec : 30;
  try {
    const res = await fetch(`${MUSU_WORKER_URL}/execute/cli`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: command, cli_type: "bash", timeout_sec: timeoutSec }),
      signal: AbortSignal.timeout((timeoutSec + 5) * 1000),
    });
    if (!res.ok) return { error: `worker_http_${res.status}`, output: null, exit_code: null };
    const data = (await res.json()) as { output?: string; exit_code?: number };
    return { output: data.output ?? null, exit_code: data.exit_code ?? null };
  } catch {
    return { error: "worker_unreachable", output: null, exit_code: null };
  }
}
