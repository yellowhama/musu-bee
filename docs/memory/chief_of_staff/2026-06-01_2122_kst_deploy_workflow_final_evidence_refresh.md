# 2026-06-01 21:22 KST - Deploy Workflow and Final Primary Evidence Refresh

The operator asked whether the public-site scroll/logo/accent work should be
deployed to `musu.pro` and to keep the current product evaluation, specs, wiki,
index, audit, and next-step docs current.

Actions taken:

- The earlier Vercel production deploy for commit `96303af3` was stuck and was
  canceled as run `26753317276`.
- Commit `65950384` hardened `.github/workflows/deploy-musu-bee.yml` with a
  20-minute job timeout, a 10-minute deploy-step timeout, and `vercel deploy
  --prebuilt --yes`.
- Replacement Vercel production deploy run `26753908889` passed, and `Tests`
  run `26753908911` passed.
- Live browser QA against `https://musu.pro` with `qa=65950384` passed on `/`,
  `/landing`, `/pricing`, and `/install` across desktop and mobile. The site
  scrolls, has no horizontal overflow, renders `/images/favicon-header.png`,
  exposes `.musu-public-scroll-root`, and uses the emerald `#24C8DB` accent.
- Final primary evidence was refreshed:
  - single-machine:
    `docs/evidence/single-machine/1.15.0-rc.1/20260601-211031-HUGH_SECOND.evidence.json`
  - desktop-open CPU:
    `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-211132-HUGH_SECOND.desktop-open.evidence.json`
  - 4-state matrix:
    `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Findings:

- The operator-reported 20%-of-one-core busy-loop did not reproduce in the
  final primary evidence. The clean desktop-open sample counted MUSU `2`, repo
  Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`,
  `webview2=0.23`, working set `506.71MB`, and no hot processes.
- Machine-wide Node.js process count remains diagnostic only. Release evidence
  counts repo-related Node through command-line attribution and excludes
  unrelated Codex/MCP helpers from MUSU ownership.
- Public release is still No-Go because second-PC CPU/matrix, release-grade
  multi-device route, production P2P env/live verification, `musu@musu.pro`
  inbox evidence, Store evidence, and relay/tunnel transport are still open.
