# 2026-06-01 20:43 KST - Public Site Follow-up and Primary Evidence Refresh

The operator asked whether the public-site scroll/logo/accent work should be
deployed to `musu.pro` and also asked to keep the current product evaluation,
spec, wiki, index, and next-step docs current.

Actions taken:

- `musu-bee/src/components/PublicSiteShell.tsx` now marks the shared emerald
  `Open App` CTA with `data-brand-accent="emerald"`, so public shell pages have
  a testable `#24C8DB` accent.
- `musu-bee/e2e/public-site-scroll-brand.spec.ts` now checks `/`, `/landing`,
  `/pricing`, and `/install` on desktop and mobile.
- Local validation passed:
  `npx playwright test --config=playwright.public-site.config.ts` 8/8 and
  `npm run typecheck`.
- Primary single-machine smoke was refreshed:
  `docs/evidence/single-machine/1.15.0-rc.1/20260601-203715-HUGH_SECOND.evidence.json`
  with dashboard task `4345c783-ddc2-4f7c-9328-6a721e7b3f1c`.
- Primary `desktop-open` CPU was refreshed:
  `docs/evidence/runtime-idle-cpu/1.15.0-rc.1/20260601-203537-HUGH_SECOND.desktop-open.evidence.json`.
  It passed from clean git with `musu=0`, `node=0.03`, and `webview2=0.05`
  max one-core CPU and no hot processes.
- Primary 4-state CPU matrix was refreshed:
  `docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/20260601-203835-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  It passed with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_203835`.

Findings:

- The reported 20%-of-one-core busy-loop did not reproduce in the current
  primary measurements.
- The first `desktop-open` sample did reveal stale packaged `musu-desktop.exe`
  shells from repeated manual launches. CPU stayed inside budget, but desktop
  shell window reactivation/single-instance behavior remains a hardening task.
- Machine-wide Node.js process count is mostly Codex/MCP/npx helpers. Release
  CPU evidence counts repo-related Node through command-line metadata and does
  not treat unrelated helper servers as MUSU-owned.

Current decision:

- Public release remains No-Go.
- Primary runtime gates are back to one valid machine after these evidence
  files are committed.
- Remaining blockers are second-PC CPU/matrix evidence, release-grade
  multi-device route evidence, production P2P env/live verification,
  `musu@musu.pro` delivery evidence, Store/Partner Center evidence, and relay
  data transport.
- The public-site follow-up must be pushed, deployed through Vercel, and
  rechecked live on `https://musu.pro` before it is treated as live.
