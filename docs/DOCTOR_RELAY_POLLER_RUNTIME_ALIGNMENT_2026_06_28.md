# Doctor Relay Poller Runtime Alignment (2026-06-28)

## Verdict

This is a source-level evidence accuracy fix, not a product-spec completion
claim.

The bridge relay payload poller runtime is default-on with opt-out through
`MUSU_ENABLE_RELAY_PAYLOAD_POLLER=0|false|no|off`. Before this change,
`musu doctor --json` reported the feature as if it were env-opt-in by checking
only whether `MUSU_ENABLE_RELAY_PAYLOAD_POLLER` was truthy. That made the
doctor background-loop evidence disagree with the actual runtime.

## Source Change

- `musu-rs/src/bridge/handlers/relay_payload.rs` now exposes
  `relay_payload_poller_enabled()` for the doctor path.
- `musu-rs/src/install/cli_commands.rs` now uses that same runtime decision
  helper instead of a separate truthy-env check.
- The doctor runtime-loop candidate reports relay target polling as
  `default-on-opt-out`.
- The default low-duty relay target polling loop no longer turns the doctor
  background status into a warning by itself.
- The opt-out path remains explicit and test-covered with
  `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=0`.
- `audit-p2p-store-forward-relay-contract.ps1` now describes the same runtime
  contract as default-on opt-out instead of emitting stale default-off wording.

## Product Scope

This closes a local observability mismatch only. It does not implement the real
release relay tunnel runtime, does not provision KV/Upstash storage, does not
prove live relay route transport, and does not flip
`relay_transport_product_verified`.

The full product remains NO-GO until the existing blockers are closed,
especially:

- real delegated-work relay transport and payload delivery proof;
- live P2P control-plane evidence with release-grade relay storage;
- two-machine runtime CPU/matrix evidence;
- Private Mesh packaged release proof;
- canonical `https://musu.pro` public metadata DNS/TLS;
- Store/Partner Center evidence;
- explicit design approval;
- V34 stale self-heal physical proof.

## Verification

Passed:

- `cargo test --lib -j 1 doctor_background`
- `cargo test --lib -j 1 relay_payload_poller`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`
- `scripts/windows/audit-operator-api-security-contract.ps1 -Json`

Known caveat:

- `cargo fmt --check` still fails on this workstation due pre-existing
  repository-wide Rust formatting drift in unrelated files. This change did not
  run broad `cargo fmt` because that would touch unrelated source.

## Next

After commit, rerun the release go/no-go gate. Because this is a runtime source
change, current installed-package evidence may become stale until a new package
is built/installed and the package-bound evidence lanes are refreshed.
