# 2026-06-05 P2P Candidate Endpoint Metadata Preservation

## DEBUG REPORT

- Symptom: Browser reported `ERR_CONNECTION_REFUSED` for
  `http://127.0.0.1:3001/app`.
- Root cause: `127.0.0.1:3001` is an optional workspace dashboard port and had
  no listener. The installed local MUSU runtime was not blocked by this; its
  local bridge answered `200 OK` at `127.0.0.1:8186/health`.
- Fix: Kept the local-program/web-control-plane split and hardened
  `musu.pro` P2P rendezvous metadata preservation instead of making
  `localhost:3001` required. Candidate endpoints now preserve public address,
  NAT type/observer, relay URL, and relay protocol through room presence,
  candidate cache, and rendezvous session seeding.
- Evidence: `npm run test:p2p` passed `79/79`, `npm run typecheck` passed,
  `audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem` passed
  with `ok=true` and `fail_count=0`, and `git diff --check` passed.
- Regression test: route tests in
  `musu-bee/src/app/api/v1/p2p/rendezvous/route.test.ts`,
  `musu-bee/src/app/api/rooms/[roomId]/presence/route.test.ts`, and
  `musu-bee/src/app/api/rooms/[roomId]/rendezvous/route.test.ts`.
- Related: This follows the RC1 local runtime / `musu.pro` split. The local
  program executes work; `musu.pro` is remote input, project room, presence,
  rendezvous, path selection, relay fallback policy, and evidence.
- Status: DONE_WITH_CONCERNS because this metadata hardening is verified, but
  public release still needs second-PC, hosted P2P release proof, support
  mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_CANDIDATE_ENDPOINT_METADATA_PRESERVATION_2026_06_05.md`
