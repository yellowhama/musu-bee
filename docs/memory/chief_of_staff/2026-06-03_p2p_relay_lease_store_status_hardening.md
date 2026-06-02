# 2026-06-03 P2P Relay Lease Store Status Hardening

Changed the `musu.pro` P2P relay lease gate so storage readiness is explicit,
not inferred from an error string.

Fields now exposed by relay lease API/CLI/evidence:

- `relay_lease_store_configured`
- `relay_lease_store_backend`
- `relay_lease_store_release_grade`

Backends:

- `vercel_kv`
- `upstash_redis`
- `file`
- `development_file`
- `unconfigured`

Release interpretation:

- Hosted public P2P evidence must use release-grade KV/Upstash storage.
- File/dev fallback stores are only local/test diagnostics.
- Relay remains non-default data path.
- Relay payload transport is still not implemented.

Validation passed:

- `npm run test:p2p` 28/28
- `npm run typecheck`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1` 14/14
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json` 14/14
- `git diff --check`

Fresh release evidence is required after commit/deploy because web API, Rust
CLI, and verifier source changed.
