# 2026-06-03 Post P2P Storage Alias Primary Evidence

After P2P storage env alias hardening, the MSIX was rebuilt/reinstalled and
fresh primary evidence was recorded.

Fresh evidence:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-005257-HUGH_SECOND.evidence.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-005000-HUGH_SECOND.desktop-single-instance.json`
- `docs\evidence\process-ownership\1.15.0-rc.1\20260603-005010-HUGH_SECOND.process-ownership.json`
- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-010000-HUGH_SECOND.desktop-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-010315-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Important details:

- Source commit is `fbd01746`; evidence base commit is `de243e56`.
- Single-machine smoke passed with task
  `a0245ad5-e299-4015-8f40-75a73bbe5815`, bridge `http://127.0.0.1:2467`,
  and output `MUSU_RELEASE_SMOKE_OK_20260603_005237`.
- Process ownership reports runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `16`, and bridge health `200`.
- Desktop-open CPU was captured from clean git state: MUSU `0`, Node `0`,
  WebView2 `0.1`, working set `363.87MB`, hot `0`.
- Four-state CPU matrix was captured from clean git state with token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`; all scenarios stayed under
  budget with hot `0`.

Verdict:

Primary packaged evidence is current again for the P2P storage alias source
change, and the busy-loop is not reproduced on `HUGH_SECOND`. Public release
remains No-Go until second-PC route/CPU/matrix, live `musu.pro` storage-backed
owner-scoped P2P evidence, `musu@musu.pro` mailbox evidence, and Store evidence
pass.
