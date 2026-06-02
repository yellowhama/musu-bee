# MUSU 1.15.0-rc.1 P2P Relay Lease Store Status Hardening

Date: 2026-06-03 05:56 KST

## Scope

This pass strengthens the `musu.pro` P2P control-plane release gate by making
relay lease storage status explicit in API, CLI, live evidence, and verifier
contracts.

It does not implement relay payload transport. It makes the remaining blocker
more machine-verifiable: release-grade P2P evidence must now prove that the
owner-scoped relay lease audit store is configured and release-grade, not merely
that the route/lease endpoints exist.

## Product Spec Change

The relay lease API now reports:

- `relay_lease_store_configured`
- `relay_lease_store_backend`
- `relay_lease_store_release_grade`

Backends:

- `vercel_kv`: release-grade hosted storage
- `upstash_redis`: release-grade hosted storage
- `file`: explicit file store, useful for tests/local diagnostics, not
  release-grade for hosted production
- `development_file`: implicit local dev fallback, not release-grade
- `unconfigured`: production has no usable relay lease store

For public P2P/relay readiness, the accepted state is:

- owner-scoped query succeeds
- `relay_default_data_path=false`
- `relay_lease_store_configured=true`
- `relay_lease_store_release_grade=true`
- backend is hosted KV/Upstash, not file/dev fallback

## Code Changes

Updated files:

- `musu-bee/src/lib/p2pRelayLeaseStore.ts`
- `musu-bee/src/app/api/v1/p2p/relay/lease/route.ts`
- `musu-rs/src/cloud/mod.rs`
- `musu-rs/src/install/cli_commands.rs`
- `scripts/windows/record-p2p-control-plane-evidence.ps1`
- `scripts/windows/verify-p2p-control-plane-evidence.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1`

Behavior:

- `/api/v1/p2p/relay/lease` includes relay lease store fields on policy denial,
  successful lease issue, successful lease query, and storage query failure.
- `musu relay leases --json` maps the store fields from successful API
  responses.
- When the API returns an error JSON body, `musu relay leases --json` parses
  the body and still records store status fields.
- P2P live evidence summaries include store configured/backend/release-grade
  lines.
- `verify-p2p-control-plane-evidence.ps1` now fails if relay lease store status
  is missing, unconfigured, or not release-grade.
- `test-release-evidence-verifiers.ps1` now includes a regression fixture that
  rejects unconfigured relay lease storage.

## Validation

Passed:

```powershell
npm run test:p2p
npm run typecheck
cargo fmt --manifest-path .\musu-rs\Cargo.toml --check
cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json
git diff --check
```

Results:

- P2P tests: 28 passed
- TypeScript typecheck: passed
- Rust CLI check: passed
- Rust `install::cli_commands`: 14 passed
- release evidence verifier regressions: 14 cases, 0 failed
- whitespace check: passed

## Release Interpretation

This closes a verifier gap, not the live P2P release gate.

Current live `musu.pro` still needs KV/Upstash credentials and deployment before
new live evidence can pass. Until then, `p2p_relay_lease_kv_not_configured` or
the new explicit `relay_lease_store_configured=false` / backend
`unconfigured` state remains a valid release blocker.

Because this changes web API source, Rust CLI source, and release verifier
contracts, current packaged primary evidence is stale for a clean release claim.
After commit/deploy, the next release pass must refresh:

- live P2P control-plane evidence
- current go/no-go
- packaged MSIX/single-machine/CPU evidence if the release gate treats these
  source changes as runtime-affecting
