import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Account-wide mesh bearer — the single shared secret every machine in one
 * owner's fleet uses to authenticate cross-machine bridge calls (forward +
 * callback). This replaces the broken per-machine random bridge tokens that
 * never reconciled (see docs/CONNECTION_CURRENT_STATE_2026_06_20.md: every
 * cross-machine forward 401'd because sender sent its own random token and the
 * receiver only knew its own).
 *
 * Design (per Phase-1 strategic gate + security Critic):
 *  - DETERMINISTIC from owner_key, so the server never has to store or sync it:
 *    mesh_bearer = HMAC-SHA256(server_secret, owner_key). Same owner_key (same
 *    account, derived from the device-flow control token) → same bearer on every
 *    machine. The cloud hands it out at mesh-join time; the bridge keeps a real
 *    bearer check (NOT removed — Critic NO-GO'd removing app auth, since a
 *    forwarded task spawns processes = RCE-equivalent). headscale/WireGuard is
 *    the network layer; this bearer is the authorization layer.
 *  - server_secret is server-only env (never shipped to the client bundle),
 *    mirroring the bridge-token.ts / headscaleProvisioning.ts secret discipline.
 */

/**
 * Server secret used to derive account mesh bearers. Dedicated env preferred;
 * falls back to the existing control-token secret so a fresh deploy still works
 * without a new env (the control token is already account-stable and server-only).
 */
function meshBearerSecret(): string {
  return (
    process.env.MUSU_MESH_BEARER_SECRET?.trim() ||
    process.env.MUSU_P2P_CONTROL_TOKEN?.trim() ||
    ""
  );
}

/**
 * Derive the account-wide mesh bearer for an owner. Returns "" when no server
 * secret is configured (caller must fail-closed: no secret → no bearer issued).
 */
export function deriveMeshBearer(ownerKey: string): string {
  const secret = meshBearerSecret();
  if (!secret || !ownerKey) return "";
  // Domain-separated so this HMAC can never collide with any other use of the
  // same secret elsewhere.
  return createHmac("sha256", secret)
    .update("musu.mesh_bearer.v1:")
    .update(ownerKey)
    .digest("hex");
}

/** Whether a mesh bearer can be issued (server secret present). */
export function meshBearerConfigured(): boolean {
  return meshBearerSecret().length > 0;
}

/** Constant-time compare for two hex bearers of equal length. */
export function meshBearerEquals(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
