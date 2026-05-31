# CoS Memory Note — Current Primary Desktop-Open CPU Evidence

Date: 2026-06-01 08:30 KST

Durable evidence: primary Windows desktop-open runtime CPU evidence was
refreshed after the relay fallback lease control-plane commit.

Evidence file:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-082822-HUGH_SECOND.desktop-open.evidence.json`

Key facts:

- Source commit recorded by the sampler:
  `cdefc1226481d554d2d151e6a08af4dc81572247`
- `git_dirty=false`
- Scenario: `desktop-open`
- Sample duration: `60.015s`
- Process counts: `musu=1`, `webview2=6`, `node=0`
- Max one-core CPU by role: `musu=0`, `webview2=0.16`, `node=0`
- Total working set: `339.85MB`
- Total private memory: `184.58MB`
- Resource budget violations: none
- Evidence result: `ok=true`

Release implication: the primary-PC idle CPU gate is freshly demonstrated for
the installed packaged desktop app at the current source commit boundary. The
release remains blocked until second-PC desktop-open CPU evidence is recorded,
real hardened multi-device route evidence passes, `musu@musu.pro` inbox
delivery evidence is recorded, and Partner Center/Store evidence is recorded.
