# V23.4 Phase 4 T2-Z6 closure — wiki/445

**Date**: 2026-05-19
**Branch**: `v23/phase4`
**Scope**: 1 code item + 1 obsolete-close + 1 process doc (~5 LOC code + 30 LOC doc)
**Status**: shipped (1 code, 1 close-obsolete, 1 process doc)

## Items

### 6a. FO-A1a-4 — K3s airgap-images trim

**Problem**: `build-musu-backend.sh` step 2 downloads the K3s airgap-images
tarball (`k3s-airgap-images-amd64.tar.zst`) wholesale from the K3s release
artifact and bakes the entire payload into `musu-backend.tar`. The K3s
upstream airgap set includes images musu does NOT use:
- `pause`, `coredns`, `traefik`, `local-path-provisioner` — required core.
- `metrics-server` — not used (no autoscaling, no `kubectl top` operator workflow).
- `helm-controller` — not used (musu ships static manifests, no Helm charts).
- a few release-version-dependent extras (Helm CRD images, etc.) that vary
  between K3s point releases.

Trimming to the four required images saves ~40-60 MB off the final
`musu-backend.tar` size — meaningful because we already gate the tar at
the 300 MB soft / 500 MB hard limit at step 10.

**Fix**: New step 2.b in `build-musu-backend.sh`. After the existing sha256
verification of the untrimmed upstream blob (the integrity gate), extract the
zst archive, rewrite `index.json` to keep only manifests whose
`annotations["org.opencontainers.image.ref.name"]` matches the allowlist
regex `(^|/)(pause|coredns|traefik|local-path-provisioner)(:|@|$)`, and
repack with the same B6 reproducible-tar flags as the outer tar
(`--sort=name --mtime=@${SOURCE_DATE_EPOCH} --owner=0 --group=0
--numeric-owner --format=pax`).

**Escape hatch**: Set `MUSU_KEEP_FULL_AIRGAP=1` to skip the trim. Useful when
validating a build against an unmodified upstream airgap set during incident
triage (e.g., reproducing a K3s issue that surfaces in metrics-server which
we removed).

**Note on sha256**: The Step 2 sha256 check runs against the upstream
unmodified blob (integrity gate for the supply-chain download). The
trimmed repack legitimately produces a different sha256 — captured by the
Step 9 outer `${OUTPUT}.sha256` sidecar over the final tar. No conflict.

**Files touched**:
- `musu-relay/installer/build-musu-backend.sh`

### 6b. FO-A1a-5 — close as obsolete

**Original intent**: Reproducibility fix for `musu-bee/Dockerfile`.

**Why obsolete**: The scope audit confirmed `musu-bee/Dockerfile` does NOT
exist in the V23.4 codebase. `musu-bee` is the Next.js frontend; it ships
to the user as a static export hosted by the gateway, not as a container.
There is no Dockerfile to fix.

The original forward-pointer (V23.3 wiki/396 §5) was speculative: it
assumed all three custom services (musu-bee, musu-bridge, musu-signaling)
would containerize. Only musu-bridge actually did (musu-signaling folded
into musu-relay at T2-F; musu-bee never containerized).

**Resolution**: Close as obsolete. Re-open if `musu-bee/Dockerfile` is added
in V23.6+ and reproducibility becomes a concrete requirement.

### 6c. FO-A1a-6 — plan template health-verification process doc

**Original intent**: Add a "health-schema verification" gate to the Planner
template so a future bug like F-B2-1-FOLLOW-1 (silent hatch with no /health
exposure) is caught at plan time, not at audit time.

**Fix**: New process doc `docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md`
adds a single check-step to the Planner pre-freeze checklist. The doc is
project-scoped (not user-scoped — per task constraint, do NOT edit
`~/.claude/MODE_Agent_Team.md` or user-level CLAUDE.md).

The check-step the doc proposes:
> Before plan freeze, identify every observability surface the new code
> exposes or modifies (`/health`, `/metrics`, structured log events,
> install-attempt telemetry shape). For each surface, verify the target
> file's current schema and confirm the new code's emit matches what the
> Auditor will probe in §V (verification).

The doc cites F-B2-1-FOLLOW-1 as the canonical bug pattern this catches:
the sweeper hatch had NO observability (no log line, no /health flag),
so an Auditor probe of /health pre-fix would have shown `{status:"ok"}`
regardless of hatch state.

**Files touched**:
- `docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md` (NEW)

## Verification

- `bash -n musu-relay/installer/build-musu-backend.sh` clean after airgap-trim insertion.
- Allowlist regex `(^|/)(pause|coredns|traefik|local-path-provisioner)(:|@|$)` tested against representative K3s 1.30.x image-ref names: matches `pause:3.6`, `docker.io/library/pause:3.6`, `rancher/local-path-provisioner:v0.0.24`, and excludes `metrics-server:0.6.1`, `helm-controller:v1.13.0`.
- The trim step is opt-out (`MUSU_KEEP_FULL_AIRGAP=1`), preserving the operator-debug path.

## References

- master plan: `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.Z row Z6
- V23.3 forward-pointer source: `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` §5 (wiki/396)
- bug-pattern citation for the process doc: F-B2-1-FOLLOW-1 (see Z1 closure / wiki/440)
