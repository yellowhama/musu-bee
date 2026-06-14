# Known Issue — H2: relay-path source identity is unverified

Date: 2026-06-09
Status: **DEFERRED — not a quick patch. Requires node-identity authentication first.**
Audit ref: musu-bee full audit 2026-06-08, finding H2 (HIGH).

## The finding

The relay-payload forward path (`musu-rs/src/bridge/handlers/relay_payload.rs`
→ `forward::forwarded_task_from_relay_payload`) accepts cloud-relayed tasks
**without verifying the source node's identity**, unlike the direct-forward path
(`accept_forwarded_task` → `peer_public_key_fingerprint`, `forward.rs:138,659`).
An actor who can shape a relay payload can forge `source_node_id`.

## Why the obvious fix does NOT work

A design-only sub-plan was produced (server stamps the rendezvous-registered
`public_key` onto the payload; bridge verifies advisory→enforced). Adversarial
review found it **unsafe as designed**:

1. **The trust anchor is not authenticated.** The server's `public_key` for a
   node is **self-asserted by the node** in the candidates POST
   (`candidates/route.ts:46` — `public_key: z.string().optional()`), gated only
   by the **owner** bearer (`authorizeP2pControl`), not by node identity.
   `upsertCandidateSet` (`p2pRendezvousStore.ts:614`) is last-writer-wins with
   no first-registration pinning. An owner-authenticated attacker — the same
   actor the finding describes, since every relay endpoint already requires the
   owner bearer — can register an arbitrary `public_key` for any `node_id`,
   then the server faithfully stamps that forged key. Bridge verification
   compares two copies of the same forgeable value and **passes**, producing a
   `source_identity_verified: true` flag that is **false assurance — worse than
   no flag**.
2. Every relay endpoint is already `owner_key`-scoped, so the only attack the
   stamping design actually closes (cross-owner impersonation) was already
   impossible. Against the in-scope (owner-authenticated) attacker it is a no-op.

## What a real fix requires (separate project)

Authenticated key establishment at node registration, which does not exist
today:
- **TOFU pinning**: the first `public_key` for a `(owner, node_id)` is
  immutable; later mismatches are rejected/alarmed. (`upsertCandidateSet` must
  stop last-writer-wins for the key field.)
- **or proof-of-possession**: node signs a server nonce with its private key at
  registration, proving it holds the key it claims.

Only after node identity is itself trustworthy does server-stamping +
bridge-verification become meaningful. That is a change to the P2P trust model,
not an audit patch, and is out of scope for the audit-fix branch.

## Interim posture

- Direct-forward path identity verification is unaffected (still enforced).
- Relay path remains as-is (no false-assurance flag introduced).
- Tracked for a dedicated node-identity workstream.
