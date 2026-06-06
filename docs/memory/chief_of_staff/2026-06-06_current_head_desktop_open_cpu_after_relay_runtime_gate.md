# 2026-06-06 current HEAD desktop-open CPU after relay runtime gate

Clean HEAD `dd0e409ee3a8ade2153bb858f74c4c5a0abf5bc2` was sampled on
`HUGH_SECOND` in actual packaged `desktop-open` state.

- evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-154524-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- `git_dirty=false`
- sample: `60.028s`
- hot process count: `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.03`
- bridge runtime `1`, desktop shell `1`, node helper `0`, WebView2 helper `6`
- working set: `366.33MB`
- resource budget violations: none

Frontend polling, Rust background-loop, and process ownership audits passed
with `fail_count=0`.

The four-state matrix diagnostic at
`.local-build\runtime-cpu-scenarios\20260606-154644-HUGH_SECOND` also showed no
hot process, but it is not release evidence because it records `git_dirty=true`
after the new desktop-open evidence file was created.

Qualitative evaluation: no high/medium issue found. The reported 20% idle CPU
loop is not reproduced on this current one-machine packaged desktop state.
