import "server-only";

/**
 * Headscale provisioning for "account login = automatic mesh join".
 *
 * This module is the ONLY place that talks to the Headscale REST API. It is
 * imported solely by the server route `api/account/mesh-join-key`, so the
 * Headscale admin API key (full control-plane authority) never reaches the
 * client bundle. Mirrors the server-only secret discipline of bridge-token.ts.
 *
 * Headscale version pinned at the control plane: v0.28.0 (mesh.musu.pro/version).
 * REST field names below are taken from the v0.28.0 swagger, NOT the vendored
 * v0.29-beta docs — they differ. Notably `POST /api/v1/preauthkey` keys on the
 * numeric user *id* (uint64), not the user name.
 *
 * Account isolation model: one Headscale `user` per Supabase account
 * (`acct-<user_id>`) on a single shared tailnet, with a static `autogroup:self`
 * policy that confines every user's nodes to that same user's nodes. Without a
 * policy Headscale defaults to allow-all (every node sees every node), which is
 * the HIGH finding this module closes. See ACCOUNT_SELF_ISOLATION_POLICY.
 */

/**
 * huJSON policy that isolates each account's fleet. `autogroup:self` matches
 * "devices where the same user is authenticated on both src and dst" — so
 * acct-A nodes reach only acct-A nodes, acct-B only acct-B, and legacy "musu"
 * nodes only each other. One static policy covers all accounts; no per-account
 * upsert is needed.
 *
 * Note: Headscale warns autogroup:self compiles filter rules per-node and is
 * inefficient at large scale. At MUSU's current scale (single owner, a handful
 * of machines) this is irrelevant; revisit only if the coordinator shows load.
 */
export const ACCOUNT_SELF_ISOLATION_POLICY = JSON.stringify({
  grants: [
    {
      src: ["autogroup:member"],
      dst: ["autogroup:self"],
      ip: ["*"],
    },
  ],
});

/**
 * Supabase user ids are UUIDs. We allow-list the exact UUID shape before
 * embedding it in a Headscale username — defense against any non-UUID id ever
 * reaching here and producing a malformed or injection-prone user name.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class HeadscaleProvisioningError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HeadscaleProvisioningError";
    this.status = status;
  }
}

/**
 * Maps a Supabase account id to its Headscale username. The `acct-` prefix
 * keeps account users in their own namespace, distinct from the legacy shared
 * `musu` user and any human-created users. Lowercasing is belt-and-suspenders;
 * UUIDs are already lowercase hex.
 */
/**
 * Maps a single-owner control-plane owner key (`token-sha256:<hex>`, produced by
 * p2pControlOwnerKey) to its Headscale username. The control token is shared
 * across the owner's devices, so one owner key = one fleet = one `acct-*` user;
 * autogroup:self then isolates that fleet from any other user. We take the hex
 * digest (label-safe) so the name is deterministic and collision-free.
 */
export function headscaleUserNameForOwnerKey(ownerKey: string): string {
  const m = /^token-sha256:([0-9a-f]{64})$/.exec((ownerKey ?? "").trim().toLowerCase());
  if (!m) {
    throw new HeadscaleProvisioningError(
      "owner key is not a token-sha256 digest; refusing to derive a Headscale user name",
      400
    );
  }
  // Headscale usernames must start with a letter; `acct-` prefix guarantees that.
  return `acct-${m[1]}`;
}

export function headscaleUserNameForAccount(userId: string): string {
  const id = (userId ?? "").trim().toLowerCase();
  if (!UUID_RE.test(id)) {
    throw new HeadscaleProvisioningError(
      "account id is not a valid UUID; refusing to derive a Headscale user name",
      400
    );
  }
  return `acct-${id}`;
}

interface HeadscaleClientConfig {
  /** e.g. "https://mesh.musu.pro" — no trailing slash required. */
  apiUrl: string;
  /** Headscale admin API key (Bearer). Server-only. */
  apiKey: string;
  /** Optional injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface HeadscaleUser {
  id: string; // uint64 serialized as string by Headscale JSON
  name: string;
}

function apiBase(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

async function headscaleFetch(
  cfg: HeadscaleClientConfig,
  path: string,
  init: RequestInit
): Promise<Response> {
  const doFetch = cfg.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${apiBase(cfg.apiUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    // Network/DNS/TLS failure reaching the control plane.
    throw new HeadscaleProvisioningError(
      `headscale request failed: ${err instanceof Error ? err.message : "network error"}`,
      502
    );
  }
  return res;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Idempotently ensures a Headscale user exists for the account and returns its
 * numeric id. GET by name first; create on miss; treat a create-time conflict
 * as "already exists" (re-GET) so two concurrent logins of the same account
 * converge instead of erroring.
 *
 * Returns the user id (uint64-as-string), which `createOneTimePreauthKey`
 * requires — the preauthkey endpoint keys on id, not name.
 */
export async function ensureHeadscaleUser(
  cfg: HeadscaleClientConfig,
  name: string
): Promise<HeadscaleUser> {
  const existing = await getHeadscaleUserByName(cfg, name);
  if (existing) return existing;

  const createRes = await headscaleFetch(cfg, "/api/v1/user", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  if (createRes.ok) {
    const body = (await readJson(createRes)) as { user?: HeadscaleUser } | null;
    if (body?.user?.id) {
      return { id: String(body.user.id), name: body.user.name ?? name };
    }
    // Created but response shape unexpected — fall through to a confirming GET.
  } else if (createRes.status !== 409) {
    throw new HeadscaleProvisioningError(
      `headscale create user failed (${createRes.status})`,
      502
    );
  }

  // 409 conflict (raced) OR ok-but-unparseable: confirm via GET.
  const after = await getHeadscaleUserByName(cfg, name);
  if (after) return after;
  throw new HeadscaleProvisioningError(
    "headscale user could not be ensured",
    502
  );
}

async function getHeadscaleUserByName(
  cfg: HeadscaleClientConfig,
  name: string
): Promise<HeadscaleUser | null> {
  const res = await headscaleFetch(
    cfg,
    `/api/v1/user?name=${encodeURIComponent(name)}`,
    { method: "GET" }
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new HeadscaleProvisioningError(
      `headscale get user failed (${res.status})`,
      502
    );
  }
  const body = (await readJson(res)) as { users?: HeadscaleUser[] } | null;
  const match = body?.users?.find((u) => u.name === name);
  if (match?.id) return { id: String(match.id), name: match.name };
  return null;
}

/**
 * Ensures the static self-isolation policy is installed. Idempotent: PUT
 * replaces the whole policy with the same content every time. Cheap enough to
 * call on every mint, which guarantees a freshly-provisioned control plane (or
 * one reset to allow-all `{}`) self-heals to isolated before any key is handed
 * out.
 */
export async function ensureSelfIsolationPolicy(
  cfg: HeadscaleClientConfig
): Promise<void> {
  const res = await headscaleFetch(cfg, "/api/v1/policy", {
    method: "PUT",
    body: JSON.stringify({ policy: ACCOUNT_SELF_ISOLATION_POLICY }),
  });
  if (res.ok) return;

  // Headscale running with `policy.mode: file` rejects PUT with
  // "update is disabled for modes other than 'database'". That is NOT a failure
  // for us: in file mode the isolation policy is already applied from
  // policy.json on disk, so the tailnet is isolated regardless. Treat that
  // specific rejection as success; surface any other error.
  let detail = "";
  try {
    detail = JSON.stringify(await readJson(res));
  } catch {
    /* ignore */
  }
  if (res.status === 500 && /modes other than 'database'/i.test(detail)) {
    return; // file-mode policy: already enforced on disk
  }
  throw new HeadscaleProvisioningError(
    `headscale set policy failed (${res.status})`,
    502
  );
}

/**
 * Mints a one-time, short-lived preauth key bound to the given Headscale user
 * id. reusable=false + short TTL keeps the blast radius to a single node enroll
 * into a single account's fleet, even if the key is intercepted in transit.
 */
export async function createOneTimePreauthKey(
  cfg: HeadscaleClientConfig,
  userId: string,
  ttlSeconds: number,
  nowMs: number
): Promise<string> {
  const expiration = new Date(nowMs + ttlSeconds * 1000).toISOString();
  const res = await headscaleFetch(cfg, "/api/v1/preauthkey", {
    method: "POST",
    body: JSON.stringify({
      user: userId, // uint64 user id, NOT the name
      reusable: false,
      ephemeral: false,
      expiration,
    }),
  });
  if (!res.ok) {
    throw new HeadscaleProvisioningError(
      `headscale create preauthkey failed (${res.status})`,
      502
    );
  }
  const body = (await readJson(res)) as
    | { preAuthKey?: { key?: string } }
    | null;
  const key = body?.preAuthKey?.key;
  if (!key) {
    throw new HeadscaleProvisioningError(
      "headscale preauthkey response missing key",
      502
    );
  }
  return key;
}

export interface MeshJoinKey {
  loginServer: string;
  authkey: string;
  tailnet: string;
}

/**
 * High-level provisioning for one account: ensure isolation policy, ensure the
 * account's user, mint a one-time key. Returned to the caller (the route) which
 * shapes the JSON response. The caller supplies `nowMs` so the function stays
 * pure/testable (Date.now is injected, not called here).
 */
export async function provisionMeshJoinKey(args: {
  apiUrl: string;
  apiKey: string;
  loginServer: string;
  /** Either a Supabase account UUID OR a pre-derived Headscale username. */
  accountUserId?: string;
  /** Pre-derived Headscale username (e.g. from headscaleUserNameForOwnerKey). */
  tailnetName?: string;
  ttlSeconds: number;
  nowMs: number;
  fetchImpl?: typeof fetch;
}): Promise<MeshJoinKey> {
  const cfg: HeadscaleClientConfig = {
    apiUrl: args.apiUrl,
    apiKey: args.apiKey,
    fetchImpl: args.fetchImpl,
  };
  const name = args.tailnetName
    ? args.tailnetName
    : headscaleUserNameForAccount(args.accountUserId ?? "");

  // Isolation first: never hand out a key into an allow-all tailnet.
  await ensureSelfIsolationPolicy(cfg);
  const user = await ensureHeadscaleUser(cfg, name);
  const authkey = await createOneTimePreauthKey(
    cfg,
    user.id,
    args.ttlSeconds,
    args.nowMs
  );

  return {
    loginServer: args.loginServer.replace(/\/+$/, ""),
    authkey,
    tailnet: name,
  };
}
