# 2026-06-06 P2P env runtime login remediation

`show-musu-pro-p2p-env-status.ps1` now classifies latest hosted P2P evidence
`not_logged_in` as `live_evidence_p2p_runtime_not_logged_in` instead of
`live_evidence_unknown`.

Current command:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/show-musu-pro-p2p-env-status.ps1 -BaseUrl https://musu.pro -Json`

Current result:

- `ok=false`
- evidence path:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- `error=not_logged_in`
- `error_class=p2p_runtime_not_logged_in`
- blocker `live_evidence_p2p_runtime_not_logged_in`
- relay status/transport/leases/route evidence logged in `False`
- relay lease store configured/release-grade `False`
- relay transport/connect/payload endpoints wired `False`

New next step:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
- do not use the localhost developer dashboard for this gate
- rerun hosted P2P evidence and require all four logged-in checks to be true

Validation:

- parser check passed
- `git diff --check` passed
- release verifier regression passed `56/56`
- source contract: `P2P env status exposes runtime login remediation`

Interpretation: this is release tooling hardening. The hosted P2P gate remains
open until production packaged-runtime login/auth/storage/relay proof is real.
