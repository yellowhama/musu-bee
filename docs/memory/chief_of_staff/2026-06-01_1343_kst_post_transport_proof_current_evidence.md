# 2026-06-01 13:43 KST: post transport-proof current evidence refresh

After `Require local transport proof for route evidence`, current local release
evidence was refreshed.

- Single-machine smoke evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260601-134022-HUGH_SECOND.evidence.json`
  from commit `87e5e5c24a6a062d8708d494dea3093cc516d92e`.
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_134000`.
- Dashboard task: `1f487f6b-7448-4745-b628-bfb1753cea1f`.
- Bridge: `http://127.0.0.1:4750`.
- Primary packaged `desktop-open` CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-134219-HUGH_SECOND.desktop-open.evidence.json`
  from clean commit `c316b8ba357235a9d1ea1c1ff437d78194d5b82e`.
- CPU result: `git_dirty=false`, 60.022s sample, two MUSU processes, six
  owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0` and
  `webview2=0.18`, working set `372.88MB`, private memory `189.97MB`.

This restores current primary-machine local evidence after the route-evidence
code change. Public desktop release remains No-Go until second-PC desktop-open
CPU evidence, real QUIC/TLS multi-device route evidence, `musu@musu.pro` inbox
delivery evidence, and Store/Partner Center evidence are recorded.
