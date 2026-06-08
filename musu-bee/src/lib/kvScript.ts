/**
 * Shared Vercel KV / Upstash Redis atomic-script helpers.
 *
 * Both the relay-payload store and the room-work-order store need the same
 * primitives: resolve a KV client (with a non-production test-injection seam)
 * and run an atomic Lua script via EVAL, parsing the JSON result. Extracted
 * here so the two stores share one implementation instead of diverging copies
 * (audit Critic H-C2).
 */

/**
 * Minimal KV client contract required to run atomic Lua scripts. Concrete
 * stores may layer additional list operations (lpush/lrange/...) on top of
 * this interface for their own non-atomic paths.
 */
export type KvScriptClient = {
  eval?: <T = unknown>(script: string, keys: string[], args: string[]) => Promise<T>;
};

let kvScriptClientForTest: KvScriptClient | null = null;

/**
 * Inject a fake KV client for tests. Forbidden in production so a test seam can
 * never be used to swap the live KV backend.
 */
export function setKvScriptClientForTest(client: KvScriptClient | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("kv_script_test_client_forbidden");
  }
  kvScriptClientForTest = client;
}

/**
 * Resolve the KV client: the injected test client when present, otherwise the
 * real `@vercel/kv` client. Generic so callers can view it through their own
 * richer client type (the relay-payload store uses list ops, etc.).
 */
export async function kvClient<T extends KvScriptClient = KvScriptClient>(): Promise<T> {
  if (kvScriptClientForTest) {
    return kvScriptClientForTest as T;
  }
  const { kv } = await import("@vercel/kv");
  return kv as unknown as T;
}

/**
 * Run an atomic Lua script via EVAL against the resolved KV client and parse
 * the JSON-encoded result. `keys` lets callers scope the script to a fixed key
 * (relay payloads) or a per-entity key (per-room work orders).
 */
export async function kvEvalJson<T>(
  script: string,
  keys: string[],
  args: string[]
): Promise<T> {
  const kv = await kvClient();
  if (typeof kv.eval !== "function") {
    throw new Error("kv_script_atomic_eval_unavailable");
  }
  const raw = await kv.eval<unknown>(script, keys, args);
  if (typeof raw === "string") {
    return JSON.parse(raw) as T;
  }
  return raw as T;
}
