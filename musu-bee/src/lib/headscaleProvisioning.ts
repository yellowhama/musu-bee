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
    // File mode: PUT is a no-op, but we must NOT assume the on-disk policy is
    // actually isolated — a drifted/allow-all policy.json would silently let a
    // freshly-joined node reach every other account's nodes (the exact HIGH this
    // module exists to prevent). Verify the live policy enforces isolation;
    // fail closed otherwise. (HIGH-2)
    await assertLivePolicyIsolated(cfg);
    return;
  }
  throw new HeadscaleProvisioningError(
    `headscale set policy failed (${res.status})`,
    502
  );
}

/**
 * Reads the live policy from Headscale and asserts it enforces per-user
 * isolation (an `autogroup:self` destination grant) and is NOT allow-all. Used
 * on the file-mode path where we cannot PUT — we must positively confirm the
 * on-disk policy is safe before handing out a join key. Throws 502 otherwise.
 */
async function assertLivePolicyIsolated(cfg: HeadscaleClientConfig): Promise<void> {
  const res = await headscaleFetch(cfg, "/api/v1/policy", { method: "GET" });
  if (!res.ok) {
    throw new HeadscaleProvisioningError(
      `headscale get policy failed (${res.status}); cannot confirm isolation`,
      502
    );
  }
  const body = (await readJson(res)) as { policy?: string } | null;
  const raw = (body?.policy ?? "").trim();
  if (!raw) {
    // Empty/absent policy = allow-all in Headscale. Fail closed.
    throw new HeadscaleProvisioningError(
      "live mesh policy is empty (allow-all); refusing to mint a key into an unisolated tailnet",
      502
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HeadscaleProvisioningError(
      "live mesh policy is not valid JSON; cannot confirm isolation",
      502
    );
  }
  // Must contain an autogroup:self destination grant (the isolation rule) and
  // must NOT be the empty/allow-all object.
  const grants =
    (parsed as { grants?: unknown[]; acls?: unknown[] })?.grants ??
    (parsed as { acls?: unknown[] })?.acls ??
    [];
  const serialized = JSON.stringify(grants);
  const isolated = /autogroup:self/.test(serialized);
  if (!Array.isArray(grants) || grants.length === 0 || !isolated) {
    throw new HeadscaleProvisioningError(
      "live mesh policy does not enforce autogroup:self isolation; refusing to mint a key (fail-closed)",
      502
    );
  }
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

// ── node management (WS-2c rename) ──────────────────────────────────────────
// Headscale v0.28.0 node REST. List is filtered by user id at the control plane
// (never list global then filter in app code — Critic HIGH-2: the admin key is
// global, so this server-side ?user= scope is the sole cross-tenant barrier).

export interface HeadscaleNode {
  id: string; // uint64-as-string
  name: string; // given name
  user: { id: string; name: string };
  ipAddresses: string[];
  online: boolean;
  lastSeen: string | null;
}

function parseHeadscaleNode(raw: unknown): HeadscaleNode | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const id = n.id != null ? String(n.id) : "";
  if (!id) return null;
  const user = (n.user ?? {}) as Record<string, unknown>;
  return {
    id,
    name: String(n.givenName ?? n.name ?? ""),
    user: { id: user.id != null ? String(user.id) : "", name: String(user.name ?? "") },
    ipAddresses: Array.isArray(n.ipAddresses) ? n.ipAddresses.map(String) : [],
    online: n.online === true,
    lastSeen: n.lastSeen != null ? String(n.lastSeen) : null,
  };
}

/**
 * List the nodes belonging to ONE Headscale user, filtered at the control plane
 * by numeric user id. The caller derives `userId` from the authenticated
 * owner_key (never from client input), so an owner only ever sees its own fleet.
 */
export async function listNodesForUser(
  cfg: HeadscaleClientConfig,
  userId: string
): Promise<HeadscaleNode[]> {
  const res = await headscaleFetch(
    cfg,
    `/api/v1/node?user=${encodeURIComponent(userId)}`,
    { method: "GET" }
  );
  if (!res.ok) {
    throw new HeadscaleProvisioningError(`headscale list nodes failed (${res.status})`, 502);
  }
  const body = (await readJson(res)) as { nodes?: unknown[] } | null;
  return (body?.nodes ?? [])
    .map(parseHeadscaleNode)
    .filter((n): n is HeadscaleNode => n !== null && n.user.id === userId);
}

/**
 * Rename a node, but ONLY after re-asserting it still belongs to `userId`
 * (Critic HIGH-2: fail-closed cross-tenant; HIGH-1: act on the authoritative
 * current node, not a stale client-supplied name/IP). Re-fetches the node by id
 * from the owner-scoped list and refuses if it's gone or now owned by someone
 * else (optimistic-concurrency).
 */
export async function renameNodeForUser(
  cfg: HeadscaleClientConfig,
  userId: string,
  nodeId: string,
  newName: string
): Promise<HeadscaleNode> {
  const owned = await listNodesForUser(cfg, userId);
  const target = owned.find((n) => n.id === nodeId);
  if (!target) {
    throw new HeadscaleProvisioningError(
      "node not found in this account's fleet (it may have been removed or renamed elsewhere)",
      409
    );
  }
  const trimmed = newName.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(trimmed)) {
    throw new HeadscaleProvisioningError(
      "name must be 1-63 chars: letters, digits, hyphens; starting alphanumeric",
      400
    );
  }
  const res = await headscaleFetch(
    cfg,
    `/api/v1/node/${encodeURIComponent(nodeId)}/rename/${encodeURIComponent(trimmed)}`,
    { method: "POST" }
  );
  if (!res.ok) {
    throw new HeadscaleProvisioningError(`headscale rename node failed (${res.status})`, 502);
  }
  const body = (await readJson(res)) as { node?: unknown } | null;
  const updated = parseHeadscaleNode(body?.node);
  // Re-assert ownership on the returned node too (defense in depth).
  if (!updated || updated.user.id !== userId) {
    throw new HeadscaleProvisioningError("rename ownership re-check failed", 502);
  }
  return updated;
}

/**
 * Remove (evict) a node from the mesh — ONE-WAY (WS-2c Phase 2). Re-asserts the
 * node belongs to `userId` (HIGH-2 cross-tenant), and refuses to delete the
 * REQUESTING machine's own node (HIGH-3 self-eviction: `callerIp` is the caller's
 * tailnet IP; if the target carries it, refuse — a shell guard is bypassable, so
 * this is enforced server-side). Treats a Headscale 404 as idempotent success
 * (already removed) and NEVER re-resolves by name/IP after a 404 (that's the
 * wrong-node path). `expectedName` is an optimistic-concurrency check: the node's
 * current name must still match what the user confirmed, else refuse.
 */
export async function deleteNodeForUser(args: {
  cfg: HeadscaleClientConfig;
  userId: string;
  nodeId: string;
  expectedName: string;
  callerIp?: string;
}): Promise<{ removed: boolean; alreadyGone: boolean }> {
  const { cfg, userId, nodeId, expectedName, callerIp } = args;
  const owned = await listNodesForUser(cfg, userId);
  const target = owned.find((n) => n.id === nodeId);
  if (!target) {
    // Not in the owner's fleet → either already removed or never theirs.
    return { removed: false, alreadyGone: true };
  }
  // Optimistic concurrency: the confirmed name must still match (HIGH-1 — don't
  // delete a node that was renamed/replaced out from under the confirmation).
  if (expectedName && target.name !== expectedName) {
    throw new HeadscaleProvisioningError(
      "node changed since you confirmed (name no longer matches); refusing to remove",
      409
    );
  }
  // HIGH-3: never evict the requesting machine itself — FAIL-CLOSED. The dual
  // audit flagged that an optional callerIp made this an honor-system check
  // (omit it → guard skipped). So removal now REQUIRES a non-empty callerIp:
  // without it we cannot prove the target isn't this PC, and we refuse rather
  // than risk self-eviction. The cockpit always sends this-PC's tailnet IP; a
  // direct CLI caller must pass --caller-ip.
  const callerIpTrimmed = (callerIp ?? "").trim();
  if (!callerIpTrimmed) {
    throw new HeadscaleProvisioningError(
      "remove requires the caller's tailnet IP (self-eviction guard); none supplied",
      400
    );
  }
  if (target.ipAddresses.includes(callerIpTrimmed)) {
    throw new HeadscaleProvisioningError(
      "refusing to remove the machine you're using (this PC). Disconnect it instead.",
      400
    );
  }
  const res = await headscaleFetch(cfg, `/api/v1/node/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
  });
  if (res.status === 404) {
    return { removed: false, alreadyGone: true }; // idempotent; do NOT re-resolve
  }
  if (!res.ok) {
    throw new HeadscaleProvisioningError(`headscale delete node failed (${res.status})`, 502);
  }
  return { removed: true, alreadyGone: false };
}
