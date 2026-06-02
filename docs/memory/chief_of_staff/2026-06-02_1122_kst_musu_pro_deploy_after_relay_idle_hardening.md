# 2026-06-02 11:22 KST - musu.pro Deploy After Relay Idle Hardening

Commit `77ba7a112581dfd3a2e05d62d7ba0b6a0ce2a0d6`
(`Make dashboard relay connection on demand`) was pushed to `origin/main`.

GitHub Actions:

- `Tests` run `26794342633`: success
- `E2E Tests - musu-bee` run `26794342638`: success
- `Deploy musu-bee to Vercel` run `26794342631`: success

Vercel deploy result:

- production URL:
  `https://musu-9wn2j1cat-yellowhamas-projects.vercel.app`
- alias:
  `https://musu.pro`
- log reported `Ready in 19s`.

Interpretation:

- The web/control-plane surface is deployed to `musu.pro` for the relay
  idle-hardening code commit.
- This is deployment evidence only. It does not close live P2P route/relay
  lease evidence, Store evidence, support mailbox evidence, second-PC
  CPU/matrix evidence, or fresh-current-HEAD MSIX runtime evidence.
