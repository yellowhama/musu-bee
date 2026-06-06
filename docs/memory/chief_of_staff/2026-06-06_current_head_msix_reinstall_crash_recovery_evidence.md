# 2026-06-06 Current HEAD MSIX Reinstall Crash-Recovery Evidence

Current HEAD `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2` was rebuilt and
reinstalled as MUSU Desktop on `HUGH_SECOND`.

Important outcomes:

- installed package `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- packaged `musu up --json` exposes `stale_bridge_registry_removed` and
  `stale_bridge_registry_pid`
- dynamic stale registry simulation removed dead PID `999999` and started a
  healthy bridge at `127.0.0.1:3678`
- crash-recovery audit passed with `ok=true` and `fail_count=0`
- single-machine smoke passed as `local-bridge-only`
- canonical single-machine evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-195631-HUGH_SECOND.evidence.json`
- canonical desktop-open idle CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-200405-HUGH_SECOND.desktop-open.evidence.json`
- idle CPU: `60.049s`, hot process count `0`, MUSU `0`, Node `0`, WebView2
  `0.08`, working set `178 MB`
- process ownership, Rust background loop, and frontend polling audits passed
- scoped Rust crash-recovery library tests passed with `cargo test cleanup_stale
  --package musu-rs --lib`

Qualitative audit:

- no high or medium issue found in the current local runtime evidence path
- low risks remain: current Codex shell PATH is stale, current proof is
  one-machine only, current matrix lacks `post-route`, and live MUSU.PRO
  release relay proof is still absent

Product boundary:

- MUSU Desktop is the local executor
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback, and evidence/control plane
- `localhost:3001` is not the packaged desktop runtime contract

Public release remains No-Go until second-PC route/CPU/matrix proof, live
MUSU.PRO owner-scoped P2P and relay proof, support mailbox proof, and Store
proof are recorded.
