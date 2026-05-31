# CoS Memory - Runtime Route Evidence and mDNS Audit

Date: 2026-06-01 04:35 KST

Durable decisions:

- The operator-supplied `mdns_sd::service_daemon` logs are treated as a real
  Windows/Tailscale idle/log-noise risk, not cosmetic output.
- Current mDNS defaults are now three-gated: bridge mDNS off unless
  `MUSU_ENABLE_MDNS=1`, IPv6 off unless `MUSU_MDNS_ENABLE_IPV6=1`, and
  Tailscale interfaces off unless `MUSU_MDNS_ENABLE_TAILSCALE=1`.
- Route evidence is no longer CLI-only. Shared writer module:
  `musu-rs/src/bridge/route_evidence.rs`.
- Runtime forwarding paths now write local `musu.route_evidence.v1` files under
  `~/.musu/route-evidence/`: task delegation, company run, and workflow remote
  steps.
- The evidence remains intentionally non-release-grade because current remote
  execution is still legacy HTTP bearer with no peer identity or QUIC/TLS proof.

Validation remembered:

- `cargo check --manifest-path .\musu-rs\Cargo.toml -j 1` passed.
- `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib cli_commands -- --nocapture` passed.
- Targeted `rustfmt --check` and `git diff --check` passed.
- Filtered `route_evidence` test execution was attempted but stopped after
  excessive MSVC test-binary compile time on this machine.

Next P0:

- Add `musu.pro` rendezvous/local stub endpoints.
- Submit runtime route evidence to the control plane after local write.
- Add peer identity verification and QUIC/TLS proof before allowing
  multi-device evidence to pass release verification.
