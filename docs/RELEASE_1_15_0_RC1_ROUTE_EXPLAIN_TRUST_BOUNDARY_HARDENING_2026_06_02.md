# MUSU 1.15.0-rc.1 Route Explain Trust-Boundary Hardening

**Date**: 2026-06-02 22:18 KST  
**Scope**: `musu route --explain` route-evidence diagnostics and release-grade
transport proof boundaries.

## Result

`musu route --explain` no longer treats registry/rendezvous candidate metadata
as verified peer identity or encryption proof.

Before this change, a candidate whose metadata included fields such as
`peer_identity_verified=true` and `encryption=https_tls_fingerprint_pin` could
make the explain report display those values even though no runtime transport
attempt had happened yet. Actual route evidence already downgraded those claims,
but the diagnostic surface could still mislead an operator.

After this change, route explain behaves like a preflight:

- advertised `peer_public_key` / `cert_fingerprint` can still make
  `https_fingerprint_pin_available=true`
- `peer_identity_method` is reported only as
  `advertised_tls_cert_fingerprint_unverified`
- `peer_identity_verified=false`
- `encryption=none_http_bearer`
- release evidence remains `route_evidence_ready=false`

The only code path that can mark peer identity verified remains the runtime
transport proof path after a real successful request. HTTPS fingerprint pinning
is still diagnostic only; final public release still requires
`encryption=quic_tls_1_3` and
`transport_verified_by=musu_quic_tls_transport`.

## Files Changed

- `musu-rs\src\install\cli_commands.rs`

## Validation

Commands:

```powershell
cargo fmt --manifest-path .\musu-rs\Cargo.toml
cargo fmt --manifest-path .\musu-rs\Cargo.toml --check
cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1
git diff --check
```

Result:

- `cargo check` passed
- `install::cli_commands` tests passed `14/14`
- new/updated test:
  `candidate_report_downgrades_verified_fingerprint_pin_metadata`
- `git diff --check` passed

## Release Impact

This is an internal hardening step toward release-grade route evidence. It does
not implement QUIC/TLS data transport and does not close the multi-device
release gate.

Because Rust source changed, previously recorded packaged primary evidence is
not current for this exact source commit. Public release remains No-Go until:

- current packaged primary evidence is refreshed after this change
- second-PC CPU/matrix/route evidence exists
- release-grade multi-device route evidence proves peer identity, QUIC/TLS
  encryption, and `musu_quic_tls_transport`
- hosted `musu.pro` owner-scoped P2P control-plane evidence passes after KV is
  configured
- `musu@musu.pro` mailbox evidence and Store evidence exist
