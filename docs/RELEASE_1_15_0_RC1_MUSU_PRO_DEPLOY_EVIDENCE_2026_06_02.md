# MUSU 1.15.0-rc.1 musu.pro Deploy Evidence

Date: 2026-06-02 11:22 KST

## Scope

This records the GitHub Actions and Vercel deployment result after commit
`77ba7a112581dfd3a2e05d62d7ba0b6a0ce2a0d6`
(`Make dashboard relay connection on demand`).

## Evidence

GitHub Actions:

- `Tests` run `26794342633`: success
  - Rust core tests: success
  - Web typecheck and build: success
  - required `test`: success
- `E2E Tests - musu-bee` run `26794342638`: success
  - Playwright CI smoke: success
- `Deploy musu-bee to Vercel` run `26794342631`: success
  - production P2P control-plane env sync step: success
  - Vercel build step: success
  - Vercel deploy step: success

Vercel:

- production deployment:
  `https://musu-9wn2j1cat-yellowhamas-projects.vercel.app`
- alias:
  `https://musu.pro`
- deploy log reported `Ready in 19s`.

## Interpretation

The web app/control-plane surface is deployed to `musu.pro` for this code
commit.

This does not close the P2P release gate by itself. Release-grade P2P evidence
still needs a live owner-scoped rendezvous/relay lease and route evidence with
route kind, latency, handshake result, peer identity, encryption proof, and
direct-vs-relay semantics.

This also does not close Store, support mailbox, second-PC CPU/matrix, or MSIX
fresh-current-HEAD runtime evidence gates.
