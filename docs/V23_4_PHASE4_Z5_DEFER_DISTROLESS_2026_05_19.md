# V23.4 Phase 4 T2-Z5 defer — distroless pivot — wiki/444

**Date**: 2026-05-19
**Branch**: `v23/phase4`
**Scope**: 0 LOC code, single defer doc
**Status**: deferred (no V23.5 commitment; reactivation gated on scale change)

## FO-A1a-3 — distroless base image pivot

**Original intent (V23.3 wiki/396 §5)**: Migrate `musu-bridge/Dockerfile` from
`FROM python:3.11-slim-bookworm` to a distroless base
(`gcr.io/distroless/python3-debian12`) to reduce attack surface (no shell,
no apt, no package manager) and shrink the image by ~30 MB.

## Why defer at V23.4 horizon

The cost/benefit math that motivated FO-A1a-3 at V23.3 has shifted under
two V23.4 changes:

### 1. Image surface shrunk: 2 images -> 1 image post T2-F

V23.3 originally bundled TWO custom OCI images in `musu-backend.tar`:
- `musu-bridge` (the FastAPI watch-dispatcher).
- `musu-signaling-cloud` (an in-cluster fork of the cloud signaling service for the rendezvous role).

V23.4 T2-F (wiki/433) folded the rendezvous-role signaling into the existing
`musu-relay` gateway process, NOT a separate K3s Deployment with its own
container image. The bundle now ships ONE custom OCI image (`musu-bridge`),
not two. The distroless pivot was attractive at 2x because the per-image
savings doubled; at 1x the savings are 50% of the original projection.

### 2. Single-user, 4-companies scale — attack-surface math different

Distroless's primary win is reducing CVE shipment counts for high-replica
production fleets where each replica multiplies the surface. musu's
operational scale is single-user / 4-companies / few PCs per V23 master
plan §0 (and explicitly per `[[feedback-no-yagni-architecture]]`). At this
scale:
- A bookworm-slim CVE is patched by rebuilding `musu-backend.tar` and
  re-running `install-wsl2.ps1` — same operator workflow as a distroless CVE.
- The "no shell" property of distroless is irrelevant when the bridge runs
  as a non-root user (UID 1000) with no privilege-escalation path: an
  attacker who gets execution inside the pod cannot meaningfully use bash
  any more than they can use the distroless image's NO bash.
- The ~30 MB savings is dwarfed by the K3s airgap-images footprint
  (~150-200 MB; Z6 trims ~40-60 MB off that, much bigger lever).

### 3. Cost: distroless pivot is not free

- Bookworm-slim's `tini` package is currently the pinned-version PID 1
  signal handler (`tini=0.19.0-1+b3`, see Dockerfile L48). Distroless does
  not ship tini in the python3 variant; we'd vendor it.
- pip wheels installed with `--require-hashes` (current Dockerfile L61-62)
  occasionally need `apt`-installed system libs for native wheels
  (e.g., a future cryptography wheel rebuild). Bookworm-slim trivially adds
  one `apt-get install`; distroless requires a multi-stage build to install
  in a builder stage and copy into the distroless final stage.
- Multi-stage build means two FROM lines, two layer trees, two paths to
  reproduce — meaningfully more complex byte-identity audit surface.

## Reactivation criterion

Reconsider the pivot when at least ONE of the following is true:

1. musu scale grows by >10x replicas (e.g., V25+ multi-tenant hosted variant where each tenant runs its own bridge fleet at high replica count).
2. A bookworm-slim CVE materializes that distroless avoids AND that requires emergency rebuild (no advance notice). At single-user scale this is hypothetical; at hosted scale it would be a recurring tax that distroless removes.
3. The pip wheel set shrinks to pure-python with no native-build dependencies — eliminating the multi-stage build complexity.

Until then, the bookworm-slim image with the V23.4 Z2a apt-cache scrub is the right cost/benefit point for musu's deployment scale.

## References

- master plan: `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.Z row Z5
- T2-F signaling-fold rationale: `docs/V23_4_F_T2F_CLOSURE_2026_05_18.md`
- no-YAGNI-architecture memo: `[[feedback-no-yagni-architecture]]`
- self-contained product memo: `[[feedback-self-contained-product]]`
- V23.3 forward-pointer source: `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` §5
