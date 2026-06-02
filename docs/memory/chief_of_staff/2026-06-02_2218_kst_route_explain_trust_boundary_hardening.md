# 2026-06-02 22:18 KST - Route explain trust-boundary hardening

Changed `musu-rs\src\install\cli_commands.rs` so `musu route --explain` never
treats registry/rendezvous candidate metadata as verified peer identity or
encryption proof.

Important contract:

- advertised `peer_public_key` / `cert_fingerprint` may expose
  `https_fingerprint_pin_available=true`
- route explain still reports `peer_identity_verified=false`
- route explain reports `peer_identity_method=advertised_tls_cert_fingerprint_unverified`
  when key material exists
- route explain reports `encryption=none_http_bearer`
- actual runtime transport proof remains the only path that can write verified
  route evidence
- HTTPS fingerprint pinning remains diagnostic; final release still requires
  `quic_tls_1_3` and `musu_quic_tls_transport`

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  passed 14/14
- `git diff --check`

Release impact:

- This moves the release-grade route proof trust boundary forward.
- It does not implement QUIC/TLS transport.
- Because Rust source changed, existing packaged primary evidence is stale for
  the new source commit until MSIX build/install and primary evidence are
  refreshed.

Indexer:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed 1450 files and 2261 symbols.
