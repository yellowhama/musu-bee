# 2026-06-05 Rust while-let loop audit coverage

Commit `d1c3361b` extends
`scripts/windows/audit-rust-background-loop-contract.ps1` so the release
background-loop verifier scans for `while let` loop files and requires explicit
allowlisting.

What changed:

- Added named contracts for finite/request-scoped `while let` sites:
  audit failure-window pruning, rate-limit pruning, workflow executor/spec
  queues, file directory listing, forwarded-task multipart parsing, WebDAV
  PROPFIND listing, and WebRTC NAL buffer splitting.
- Added `$allowlistedWhileLetFiles`; new `while let` loop files now fail the
  Rust background-loop contract until they are explicitly reviewed.

Validation:

- PowerShell parser: pass.
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`,
  `check_count=152`.
- Selected scopes: `audit-failure-window 2/2`, `rate-limit-window 2/2`,
  `workflow-executor 6/6`, `workflow-spec 3/3`, `files-api 2/2`,
  `forward-multipart 2/2`, `webdav-propfind 2/2`,
  `webrtc-screen-share 8/8`, `ws-proxy 6/6`.
- Frontend polling audit: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`.
- Clean go/no-go after `d1c3361b`: local artifacts, single-machine, MSIX
  install, targeted second-PC route CPU, Rust/idle/frontend contracts, and P2P
  store-forward contract true; `manifest_git_dirty=false`;
  `ready_for_public_desktop_release=false`.

Product/spec notes:

- No runtime behavior changed.
- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, rendezvous, path
  selection, relay fallback policy, and evidence control plane.
- Public release remains blocked on second-PC multi-device/CPU/matrix evidence,
  hosted P2P proof, support mailbox proof, and Store proof.

Canonical report:

- `docs/RELEASE_1_15_0_RC1_RUST_WHILE_LET_LOOP_AUDIT_COVERAGE_2026_06_05.md`
