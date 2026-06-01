# 2026-06-01 12:18 KST - Current Evidence After Relay Fallback Persistence

## Evidence Refreshed

After `relay_fallback` route-evidence persistence landed, current local evidence was refreshed.

Single-machine smoke:

- Path: `docs\evidence\single-machine\1.15.0-rc.1\20260601-121339-HUGH_SECOND.evidence.json`
- Dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_121339`
- CLI route checked: true
- Dashboard task: `34375312-8b16-4015-ad1a-7bd5f2ccb19c`
- Bridge URL: `http://127.0.0.1:9157`
- SHA-256: `f05c5a8babf474a3a13069b033c9093079c22c72f70026de8316c607ccf2714d`

Primary packaged desktop-open CPU:

- Path: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-121701-HUGH_SECOND.desktop-open.evidence.json`
- `git_dirty=false`
- Sample: 60.023s
- MUSU processes: 2 (`musu` runtime plus `musu-desktop`)
- Owned WebView2: 6
- Owned Node: 0
- Max one-core CPU: `musu=0`, `webview2=0.03`
- Working set: `378.16MB`
- Private memory: `192.07MB`
- SHA-256: `21280f882fc05ed9b7284a268847ab150585c4b0d24d90dce91a0a03568d0fa2`

## Current Gate Shape

`write-release-go-no-go.ps1 -Json` after the evidence commits reports:

- `ready_for_public_desktop_release=false`
- `single_machine_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_idle_cpu_min_machine_count=2`
- `runtime_idle_cpu_valid_machines=["HUGH_SECOND"]`
- `multi_device_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`

Public release remains No-Go until second-PC desktop-open CPU evidence, real second-PC route proof, `musu@musu.pro` inbox delivery evidence, Store evidence, QUIC/TLS proof, and relay/tunnel transport are complete.
