# Private Mesh Packaged Release Proof Handoff (2026-06-28)

## Status

The Private Mesh packaged release proof is still **NO-GO**.

What is fixed now: `musu mesh physical-peer-evidence` no longer requires
`mesh.node_name` to be persisted in `~/.musu/private_mesh.toml` when the live
Tailscale status already reports `Self.HostName`. It also prefers the live
`tailscale ip -4` value over a stale persisted `verification.local_tailnet_ip`.

What is not closed: the full release gate still requires a packaged desktop
release proof archive generated from two physical machines.

## Root Cause Found On HUGH_SECOND

`musu mesh status --json` could infer the live node state:

- node hostname: `hugh_second`
- live tailnet IP: `100.64.0.1`
- control server: `https://mesh.musu.pro`
- control server verified: `true`

But `~/.musu/private_mesh.toml` had no `mesh.node_name`, and its persisted
`verification.local_tailnet_ip` was stale at `100.64.0.2`.

Before the code fix, physical peer evidence failed with:

```text
physical peer evidence requires mesh.node_name
```

## Code Contract Update

`musu-rs/src/install/private_mesh.rs` now resolves physical peer evidence fields
as follows:

- `node_name`: `mesh.node_name`, falling back to `tailscale status --json`
  `Self.HostName`.
- `tailnet_ip`: live `tailscale ip -4`, falling back to persisted
  `verification.local_tailnet_ip`.
- evidence records `node_name_source`, `tailnet_ip_source`, and
  `persisted_tailnet_ip` so stale config is visible instead of hidden.

## Local Verification

Targeted unit test:

```powershell
$env:CARGO_BUILD_JOBS='1'
cargo test --manifest-path musu-rs\Cargo.toml --lib parse_tailnet_status_hostname -- --nocapture
```

Result:

- `2 passed`
- `0 failed`

Actual debug CLI evidence generation:

```powershell
$env:CARGO_BUILD_JOBS='1'
cargo run --manifest-path musu-rs\Cargo.toml --bin musu -- `
  mesh physical-peer-evidence `
  --output .local-build\private-mesh-physical-peer\20260628-codex\hugh_second.physical-peer-evidence.json `
  --json
```

Result:

- report schema: `musu.private_mesh_physical_peer_evidence_report.v1`
- `ok=true`
- node: `hugh_second`
- tailnet IP: `100.64.0.1`
- control server verified: `true`
- evidence path:
  `.local-build\private-mesh-physical-peer\20260628-codex\hugh_second.physical-peer-evidence.json`

This debug/local proof validates the source fix. It does not satisfy the
packaged release gate by itself.

## Build/Test Risk

Running a broad filtered test without `--lib` caused Cargo to compile unrelated
integration test targets and failed on this Windows machine with:

```text
os error 1455
LINK : fatal error LNK1102: out of memory
```

Use `--lib` and `CARGO_BUILD_JOBS=1` for narrow unit checks on this machine.
Treat full test runs here as environment-sensitive unless the Windows page file
or build host capacity is increased.

## Next Steps To Close The Gate

1. Build a new current MSIX that includes the `physical-peer-evidence` fallback
   fix.
2. Install that packaged build on both physical PCs.
3. On `hugh-main`, generate target-side evidence:

```powershell
musu mesh physical-peer-evidence --json
```

4. Copy the generated JSON and its `.sha256` sidecar from `hugh-main` to this
   source PC.
5. On this source PC, run the final packaged proof:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts\windows\run-private-mesh-release-proof.ps1 `
  -TargetNode hugh-main `
  -TargetIp <hugh-main-100.64.x.y> `
  -ExpectedControlServerUrl https://mesh.musu.pro `
  -PhysicalPeerEvidencePath <copied-hugh-main-evidence-json> `
  -Json
```

6. Verify/import the produced release proof archive.
7. Rerun `scripts\windows\write-release-go-no-go.ps1 -Json`.

Only after the archive verifier passes should
`private_mesh_packaged_release_proof_verified=true` be expected.
