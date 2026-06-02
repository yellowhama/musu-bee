# 2026-06-02 12:38 KST - mDNS Regression and P2P KV Blocker

## mDNS Regression

Current clean source commit `6f3f598271ec0b6225524c7d63bbd8da068e7ae5`
preserves the mDNS/Tailscale hardening:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::`
  passed 3/3.
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
  in `8m 38s`.
- `RUST_LOG=debug .\musu-rs\target\debug\musu.exe discover --timeout 2`
  exited 0 with default mDNS opt-in env vars unset.
- The discover output disabled IPv6, Tailscale, and 9 virtual/VPN interfaces,
  sent only on physical LAN `이더넷 2`, and did not contain `Failed to send`,
  `ff02::fb`, `10065`, or `closed channel`.

## P2P KV Blocker

`show-musu-pro-p2p-env-status.ps1 -Json` still reports `ok=false`.

- GitHub secret present: `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- Missing: `KV_REST_API_TOKEN`, `KV_REST_API_URL`
- latest live evidence error class:
  `p2p_relay_lease_kv_not_configured`
- local env does not contain `KV_REST_API_URL`, `KV_REST_API_TOKEN`, or
  `MUSU_P2P_CONTROL_TOKEN_SHA256S`
- repo scan found only `.env.example`, `musu-bee\.env.local.example`, and
  `musu-bee\vercel.json`

This is a production configuration/evidence blocker, not a code blocker.

## Next

Provision Vercel KV/Upstash, set `KV_REST_API_URL` and `KV_REST_API_TOKEN`,
deploy/reload production, then rerun P2P control-plane evidence and go/no-go.

