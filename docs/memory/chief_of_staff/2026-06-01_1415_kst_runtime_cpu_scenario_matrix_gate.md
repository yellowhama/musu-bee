# 2026-06-01 14:15 KST - Runtime CPU Scenario Matrix Gate

The operator re-supplied the Windows/Tailscale mDNS error pattern and asked for
continued hardening. The current source already default-disables mDNS, IPv6
mDNS, Tailscale mDNS, and common virtual/VPN mDNS interfaces, so this pass
promoted CPU state attribution from diagnostic-only to a release blocker.

Changes:

- Added `scripts/windows/verify-runtime-cpu-scenario-matrix.ps1`.
- `write-release-go-no-go.ps1` now reports and blocks on
  `runtime_cpu_scenario_matrix_verified`.
- The gate requires clean/current 60s `musu.runtime_cpu_scenario_matrix.v1`
  evidence on two machines for `runtime-started`, `dashboard-open`,
  `desktop-open`, and `post-route`, with a successful post-route probe.
- `run-second-pc-release-check.ps1` now runs the post-route probe by default
  for the matrix and records nested matrix verification in its summary.
- Multi-device kit, final operator packet, action-pack verification, and
  desktop readiness audit now carry/require the matrix verifier.

Interpretation:

The existing two-machine `desktop-open` runtime idle CPU evidence remains the
release CPU gate. The matrix is a separate attribution gate so future busy-loop
reports cannot hide in runtime start, dashboard open, desktop open, or
post-route state.
