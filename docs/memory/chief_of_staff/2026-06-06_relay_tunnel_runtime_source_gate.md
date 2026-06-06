# 2026-06-06 relay tunnel runtime source gate

Release relay readiness now has an explicit runtime source marker:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- API status exposes `relay_tunnel_runtime_implemented=false`
- P2P env status emits
  `source_release_relay_tunnel_runtime_not_implemented`

Validation:

- P2P tests: `108/108`
- typecheck: pass
- P2P store-forward relay audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative evaluation: no high/medium issue found. This prevents fake release
enablement; it does not implement the release `quic_relay_tunnel` runtime.
