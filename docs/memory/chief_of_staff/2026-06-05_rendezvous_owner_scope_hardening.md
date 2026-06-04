# 2026-06-05 Rendezvous Owner-Scope Hardening

MUSU.PRO control-plane roadmap update:

- Local MUSU programs remain the execution plane.
- `musu.pro` is the remote input, room, presence, rendezvous, path-selection,
  fallback relay coordination, and evidence plane.
- Room/rendezvous/route-candidate/relay-control state must be scoped to the
  authenticated P2P control owner.

Implemented:

- `StoredP2pRendezvousSession.owner_key`.
- Owner-scoped create/read/update/approve/close/candidate rendezvous routes.
- Owner-scoped file/KV candidate cache keys.
- Room rendezvous and room presence now use the same owner-scoped cache.
- `audit-operator-api-security-contract.ps1` verifies the source and tests.

Validation:

- `npm run test:p2p` passed `79/79`.
- `npm run test:routes` passed `19/19`.
- `npm run typecheck` passed.
- `npm run build` passed.
- Operator API security audit passed with `ok=true`, `fail_count=0`.
- `git diff --check` passed.

Release state:

- Web runtime source changed, so packaged primary evidence is stale until a new
  MSIX build/install/smoke/CPU/matrix refresh is recorded.
- Public release remains No-Go on second-PC, hosted P2P, support mailbox, and
  Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RENDEZVOUS_OWNER_SCOPE_HARDENING_2026_06_05.md`
