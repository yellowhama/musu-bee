# V23.4 Phase 4 T2-Z1 closure — wiki/440

**Date**: 2026-05-19
**Branch**: `v23/phase4`
**Scope**: 2 code items + 1 close-note (~25 LOC)
**Status**: shipped

## Items

### 1a. F-B2-1-FOLLOW-1 — sweeper hatch observability

**Problem**: `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` short-circuits the
`install_attempt` sweeper at `telemetry.ts` boot. Pre-fix, this was silent: an
operator setting the env var to investigate a delete-storm would not see any
log line and would not be able to confirm the hatch was honored without
grepping process state.

**Fix**:
1. Capture the env var into module-level `_installAttemptSweeperDisabled`
   (read once at module init — the variable is not a hot toggle).
2. When the hatch fires, emit `console.warn` once: `[telemetry] install_attempt sweeper disabled via MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1`.
3. Surface state in `/health` JSON as `install_attempt_sweeper_disabled: true|false` so probes can detect the hatch externally.

**Files touched**:
- `musu-relay/src/signaling/telemetry.ts` (export `_installAttemptSweeperDisabled`, add warn-once on disabled path)
- `musu-relay/src/signaling/server.ts` (import + include flag in `/health` payload)

### 1b. FO-A1a-1 — GIT_SHA / BUILD_TS derivation move

**Problem**: `build-musu-backend.sh` step 3.d invokes `buildah build ... --build-arg GIT_SHA="${GIT_SHA:-unknown}" --build-arg BUILD_TS="${BUILD_TS:-unknown}"` at line ~349-351. These variables were derived at Step 6.c (line ~575), strictly AFTER step 3.d. Result: every `musu-bridge` OCI image baked into `musu-backend.tar` had `org.opencontainers.image.revision=unknown` and `org.opencontainers.image.created=unknown` in its labels.

**Fix**: Move the derivation block to a new Step 3.c.1, BEFORE step 3.d. Replace the Step 6.c derivation with an explanatory comment (variables remain in scope from the earlier definition; the `/etc/musu-version` provenance block continues to reference the same names).

**Files touched**:
- `musu-relay/installer/build-musu-backend.sh`

### 1c. F-B2-1-FIRST-RUN close-note

The first-run runbook entry was already shipped at V23.4 Tier-1 — see wiki/426 §8. No code change here; this closure paragraph just records the wiki/440 forward-pointer as resolved.

## Verification

- `bash -n musu-relay/installer/build-musu-backend.sh` clean.
- `npx tsc --noEmit` clean in `musu-relay/`.
- No schema changes.

## Out of scope (deferred or unrelated)

None.

## References

- master plan: `docs/V23_4_PHASE4_MASTER_PLAN_2026_05_18.md` §5.Z row Z1
- F-B2-1-FOLLOW-1 forward-pointer source: `docs/V23_3_FINAL_CLOSURE_2026_05_17.md` §5
- F-B2-1-FIRST-RUN origin: V23.4 Tier-1 closure (wiki/426 §8)
