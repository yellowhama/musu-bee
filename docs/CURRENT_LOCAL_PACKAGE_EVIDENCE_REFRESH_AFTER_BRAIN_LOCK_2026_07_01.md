# Current Local Package Evidence Refresh After Brain Lock (2026-07-01)

## Verdict

After the brain sidecar cross-process lock package proof, the non-brain local
freshness lanes were recaptured on `HUGH_SECOND` for source commit
`7c971844bc984f8da458f3c5dc499d9478f67a1a`.

This closes the current local package freshness blockers for:

- single-machine smoke;
- process ownership;
- startup single-instance;
- desktop repeated activation.

It does not close the full-product gate. Runtime CPU still needs the required
machine count, and release readiness still depends on second-PC, public
metadata, Store, P2P/relay, Private Mesh, V34, and design-approval proof.

## Evidence

- Single-machine smoke:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-091035-HUGH_SECOND.evidence.json`
- Single-machine verification:
  `docs/evidence/single-machine/1.15.0-rc.22/20260701-091035-HUGH_SECOND.verification.json`
- Process ownership:
  `docs/evidence/process-ownership/1.15.0-rc.22/20260701-091101-HUGH_SECOND.process-ownership.json`
- Startup single-instance:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-091101-HUGH_SECOND.startup-single-instance.json`
- Startup nested process ownership:
  `docs/evidence/startup-single-instance/1.15.0-rc.22/20260701-091101-HUGH_SECOND.startup-single-instance.process-ownership.json`
- Desktop single-instance:
  `docs/evidence/desktop-single-instance/1.15.0-rc.22/20260701-091101-HUGH_SECOND.desktop-single-instance.json`

## Verification

The dirty go/no-go run at `2026-07-01T09:13:49.6298415+09:00` was written to
`.local-build/go-no-go/after-local-freshness-evidence-dirty-20260701.json`.
It reports:

- `single_machine_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `brain_product_verified=true`
- `msix_install_verified=true`

The remaining blocker areas in that run were:

- `multi-device`
- `private-mesh-packaged-release-proof`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `runtime-cpu-second-pc-route-attempt`
- `store-public-metadata`
- `store-release`
- `p2p-control-plane`
- `git`
- `design-approval`
- `relay-transport`
- `v34-stale-self-heal`

The `git` blocker is expected in this pre-commit run because the evidence and
this report are still uncommitted. After this documentation/evidence commit,
rerun clean go/no-go. The source commit in the evidence is intentionally
`7c971844bc984f8da458f3c5dc499d9478f67a1a`; the release verifiers allow a
later documentation/evidence-only commit on top of that source commit.

## Product Meaning

The local packaged app on `HUGH_SECOND` now has current proof that the packaged
WindowsApps runtime can:

- pass the single-machine smoke path through the packaged bridge-only local
  runtime surface;
- maintain exactly one packaged MUSU runtime process;
- reuse the existing bridge process across repeated `musu up` startup calls;
- reuse the existing packaged desktop shell across repeated AppUserModelId
  activations.

The next useful implementation/evidence lanes are:

1. Capture or import the required second-PC evidence.
2. Refresh runtime idle CPU and full runtime CPU scenario matrix for the
   required machine count.
3. Repair `musu.pro` public metadata/DNS/TLS before Store/public release gates.
4. Continue the P2P/relay, Private Mesh packaged proof, V34 stale self-heal,
   and design-approval gates.
