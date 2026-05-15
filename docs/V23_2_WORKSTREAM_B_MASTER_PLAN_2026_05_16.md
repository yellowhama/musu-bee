# V23.2 Workstream B — Master Plan

**Date**: 2026-05-16
**Status**: Approved via plan-mode ExitPlanMode. Not authorized for B0 deploy step (user-side action required for `fly auth login` + `fly secrets set`). Const III gate on B1 schema v41 is separate.
**Branch**: `v22/gap-analysis`
**Predecessors**: wiki/358 (A2 closure), wiki/359 (A2 qual eval), wiki/360 (B prep — this doc supersedes its B-scope section)
**Wiki ID**: `wiki/361`

## Context

V23.2 Workstream A2 closed five HIGH audit findings and shipped deploy artifacts, but landed two known weaknesses by design:

1. **Telemetry auth is interim** — one shared secret baked into every installer. A single leaked installer compromises every user's telemetry endpoint until B1 ships per-install HMAC.
2. **musu.pro `/validate` API doesn't return canonical `user_id`** — confirmed by reading `F:\Aisaak\Projects\musu-pro\src\app\api\v1\nodes\validate\route.ts:69-72` which currently returns `{ valid: true, plan: "pro", node_id }`. The underlying `findByAccountToken` repo *already retrieves* `user_id` (`F:\Aisaak\Projects\musu-pro\src\lib\db\repositories\account_tokens.repo.ts:61`) — it's just not included in the response.

Plus a known never-tested artifact: the Fly.io Dockerfile entrypoint (commit `031d627`) has never been executed against a real Fly volume; A2 qual-eval §"What's still uncertain" #2 explicitly calls this out.

This master plan covers what makes V23.2 actually deployable. Detail plans for each sub-workstream get written in their own plan-mode pass when they start.

## Sub-workstreams

Five sub-workstreams. **B0 must precede everything else** — without first-deploy validation, A2's deploy fix is paper. Inside each sub-workstream the order is informed by dependency, not estimate.

### B0 — First-deploy validation (gate)

Prove A2's deploy artifacts actually work on real Fly.io before adding code on top.

**Acceptance:**
- `fly deploy` returns `[signaling] listening on 9900` in `fly logs`
- `/health` returns 200 from the public Fly domain
- `MUSU_TELEMETRY_SHARED_SECRET` unset → boot refuses to start (HIGH #3 negative test)
- `/spike-demo` page reaches phase `welcome-received` from a real browser pointed at the deployed signaling URL
- One `nat_pierce` telemetry POST with the shared secret returns 204; without the header returns 401

Files involved (all read-only at this stage, just configuration on Fly side):
- `musu-relay/fly.toml`
- `musu-relay/Dockerfile`
- `musu-relay/docker-entrypoint.sh`

Failure modes to watch for (from A2 qual-eval §"What's still uncertain"):
- Alpine BusyBox `stat -c %u` behaving differently from coreutils → chown path may not detect volume ownership correctly
- `su-exec` dropping to wrong uid → app runs as root or fails to start
- `.gitattributes` LF-pinning not surviving the COPY → `bad interpreter` error

If B0 finds a problem, **fix and re-run B0 before starting B1**. Do not pile work on top of broken deploy artifacts.

### B1 — Per-install HMAC (T2.AUTH.2-final)

Replace shared-secret with per-install HMAC. Removes "one leaked installer = global compromise" failure mode.

**Files:**
- `musu-relay/src/signaling/telemetry.ts` (extend schema v40 → v41, new `issue_install_key` route, swap auth path)
- `musu-relay/src/gateway/client.ts:397-414` (replace `x-musu-telemetry-secret` header with `x-musu-install-hmac` body signature)
- `musu-relay/tests/telemetry-auth.test.ts` (new test file: `telemetry-hmac.test.ts`)
- `musu-relay/tests/telemetry-emit.test.ts` (update to expect new header)

**Wire format:**
- New endpoint: `POST /v1/telemetry/issue_install_key`, accepts `x-musu-installer-secret` header (installer-bundled), body `{ musu_install_id }`. Returns `{ install_key }` (32-byte hex). Idempotent on collision (returns existing key for known install_id).
- Existing routes (`/install`, `/nat_pierce`, `/agent_spawn`): replace `requireTelemetrySecret` with `requireInstallHmac`. Header is `x-musu-install-hmac: hmac_sha256(install_key, request_body_bytes)`. Server looks up `install_key_hash` (SHA-256 of key) by `musu_install_id` in body, computes HMAC, `timingSafeEqual` compare.

**Schema v41:**
```sql
CREATE TABLE IF NOT EXISTS telemetry_install_keys (
  musu_install_id   TEXT PRIMARY KEY,
  install_key_hash  BLOB NOT NULL,  -- SHA-256 of the issued key
  issued_at         INTEGER NOT NULL,
  last_seen_at      INTEGER
);
```
Storing `SHA-256(install_key)` not the key itself: DB compromise yields hashes, not usable keys.

**Const III gate**: explicit user "진행해" before this migration lands. The migration code itself can be written and tested against an in-memory DB without authorization; the production schema bump is the gated step.

**Acceptance:**
- All three POST routes (`/install`, `/nat_pierce`, `/agent_spawn`) reject missing-HMAC with 401
- Wrong HMAC for known install_id → 401
- Correct HMAC → 204
- `/issue_install_key` is idempotent on collision
- Gateway client emits correct HMAC header on every telemetry POST (tested in `telemetry-emit.test.ts`)
- Shared-secret code path removed (or moved to a compat shim with a deprecation log)
- Full suite stays green (current: 107/107)

**Rotation strategy** (doc, not code): documented in this workstream's closure doc.
- For shared-secret → HMAC transition: dual-accept window where server accepts both `x-musu-telemetry-secret` AND `x-musu-install-hmac` for an explicit grace period during rolling installer rollout
- For per-key rotation later: `/issue_install_key` can be called again by an authenticated installer to rotate; old hash invalidated

### B2 — musu.pro `/validate` returns canonical `user_id`

**This is a 3-line change** — `findByAccountToken` already retrieves `user_id`; just include it in the 200 response.

**Files (musu-pro repo at `F:\Aisaak\Projects\musu-pro`):**
- `src/app/api/v1/nodes/validate/route.ts:69-72` — change response from `{ valid: true, plan: "pro", node_id }` to `{ valid: true, plan: "pro", node_id, user_id: tokenRow.user_id }`

**Files (musu-bee repo, AFTER musu-pro deploy):**
- `musu-relay/src/signaling/server.ts:141-151` — remove `_warnedCanonicalIdMissing` warn-once tolerance, treat missing `user_id` as auth failure now that the API is canonical
- `musu-relay/tests/validate-token.test.ts` — drop tolerance tests, replace with strict "canonical id is the room key" test (already exists from T2.AUTH.3, just remove the v21-compat case)

**Cross-repo ordering:**
- musu-pro change lands and deploys to production first
- Then musu-bee fallback removal lands
- Backwards order would 401 every gateway until musu-pro catches up

**Const VII**: the musu-pro deploy needs its own gate. musu-bee main-branch push gate is separate.

**Acceptance:**
- musu.pro `/validate` 200 response includes `user_id`
- musu-relay signaling no longer logs the warn-once tolerance message
- Room key in signaling = canonical id from API, never HELLO's claimed user_id
- musu-pro test added: validate route returns user_id (currently no test exists for this route per my read of `musu-pro/src/app/api/v1/nodes/`)

### B3 — Summary endpoint auth

`GET /v1/telemetry/summary` is currently public on the internet. Aggregate install / nat_pierce / agent_spawn counts leak.

**Files:**
- `musu-relay/src/signaling/telemetry.ts:297` — add auth check on the route handler
- `musu-relay/tests/telemetry-auth.test.ts` — add tests for the new auth path

**Auth scheme**: separate admin secret `MUSU_TELEMETRY_ADMIN_SECRET`, distinct from `MUSU_TELEMETRY_SHARED_SECRET`. Reuse the `crypto.timingSafeEqual` + SHA-256 pattern from `requireTelemetrySecret`. Boot-time check: if `NODE_ENV=production` and admin secret unset, log a WARN (not refuse to start — summary endpoint failure is non-fatal, unlike write endpoints).

**Acceptance:**
- `GET /summary` without header → 401
- Wrong admin secret → 401
- Correct admin secret → 200 + JSON

### B4 — WSL2 installer (sequenced)

V23 master plan §0.5 specifies Alpine + `wsl --import` + K3s. None of this is implemented today. The existing `scripts/install.ps1` (481 lines) is v21 native-Python — **not the V23 path**. Decision: don't fork or refactor it; **write fresh under `installer/`**. The v21 script stays as-is for users still on the native install until V23.5 cuts that path. No code re-use; the only thing shared between v21 and V23 installers is the telemetry schema.

**Sub-sequence (each step gates the next):**

**B4a — `musu-backend.tar` build pipeline, manual import validation.**
- Build script that produces `musu-backend.tar` from Alpine 3.19 + K3s 1.30 binary + minimal init
- Target size: ≤ 80 MB compressed (master plan §0.5 budget was 300 MB; tightening because there's no plugin payload yet)
- Manual validation: on a clean Windows host with WSL2 enabled, run `wsl --import musu-test C:\temp\musu musu-backend.tar`, then `wsl -d musu-test`, confirm K3s starts and `kubectl get nodes` returns 1 Ready node
- Acceptance: manual import + K3s health check passes on at least one operator machine before moving to B4b

**B4b — PowerShell installer + 3-tier prereq check + telemetry hooks.**
- `installer/check-prereqs.ps1` implementing the 3-tier check (BIOS virtualization → Windows feature → our tar). Outcomes emit fields in the existing `telemetry_install` table.
- `installer/install-wsl2.ps1` orchestrating: prereq → enable WSL2 feature (with reboot orchestration) → `wsl --import` of the bundled tar → register K3s with musu-relay-gateway → telemetry POST
- `installer/uninstall.ps1`: `wsl --unregister musu` + clean `C:\ProgramData\musu`
- Uses HMAC auth from B1 (this is why B1 precedes B4b)
- Acceptance: install on a clean Windows VM goes from "downloaded the .exe" to "K3s running + gateway connecting to signaling" without operator intervention beyond the reboot prompt

**B4c — Const VI 30% gate experiment.**
- Run B4b installer on 5 hosts (mix of: WSL2-already-on, WSL2-off-feature-on, WSL2-off-feature-off, no-BIOS-vt simulated, fresh-Windows-VM)
- Aggregate telemetry: `wsl2_present_at_start`, `wsl2_feature_enabled`, `bios_virtualization_detected`, `step_failed`, `step_error_class`
- If >70% succeed: continue with α-path (WSL2-on-Windows-first)
- If <70% with dominant cause `hard_blocker_bios`: trigger β fork per V23 master plan §0.2 retreat structure (macOS-first via Option γ, defer Windows)
- Acceptance: a written decision doc with the data + the call

**B4 scope decision** (replaces the original wiki/360 §B4 task list): the original wiki/360 listed T2.INST.1-5 as parallel-ish; the sequenced view above is better because each layer gates the next. If B4a fails, B4b is dead code; if B4b fails on a clean VM, the 30% gate experiment is unnecessary.

### B5 — Image bloat (LOW #8, optional)

If time allows after B4c. `tsconfig.docker.json` scoping signaling-image compile to `src/signaling/*`. ~tens of KB win, zero correctness impact. Skip if any prior sub-workstream slips.

**Files:**
- `musu-relay/tsconfig.docker.json` (new)
- `musu-relay/Dockerfile:37` (change `npm run build` → `npm run build:docker` or `tsc -p tsconfig.docker.json`)

## Sequencing + dependencies

```
B0 (deploy validation) — MUST be first
  │
  ├─► B1 (HMAC) ── Const III gate before schema v41 lands
  │     │
  │     ▼
  │   B4b (PowerShell uses HMAC) depends on B1
  │
  ├─► B2 (musu.pro user_id) — parallel with B1, independent
  │
  ├─► B3 (summary auth) — parallel with B1, independent
  │
  ▼
B4a (tar build + manual import) — can start after B0; doesn't depend on B1/B2/B3
  │
  ▼
B4b (PowerShell) — needs B4a + B1
  │
  ▼
B4c (Const VI gate) — needs B4b
  │
  ▼
B5 (image trim) — optional, after B4c
```

## Constitution gates

- **Const III**: schema v41 in B1 — explicit user "진행해" required before migration lands. The code can be written and unit-tested without authorization (in-memory DB); only the production `applyMigrations(40)` → `applyMigrations(41)` bump is gated.
- **Const VI**: B4c is the 30% gate experiment. Data-driven α vs β decision.
- **Const VII**: each sub-workstream closure that pushes to the feature branch is allowed; main-branch merge of any V23.2 work requires explicit "진행해". Cross-repo push to musu-pro is its own Const VII gate.

## Workflow per sub-workstream

For each of B0 → B5, the process is:

1. **Enter plan mode again** at the start of the sub-workstream → write a detailed plan doc (`docs/V23_2_WORKSTREAM_B<X>_PLAN_2026_05_16.md`, wiki/362+)
2. Add TODOs to the task list from that detail plan
3. Implement
4. Tests stay green
5. **Independent audit subagent** runs on the resulting commits (B1 gets two independent passes per wiki/360 §7 question 1)
6. Audit-fix commit if anything found
7. Sub-workstream closure doc (wiki/N)
8. Push to `v22/gap-analysis`
9. Mark sub-workstream complete; check whether B0 result is still valid (Fly logs healthy, /spike-demo still works) — if not, regress investigation precedes next sub-workstream

## Verification (master-plan level)

Workstream B is "done" when:

- All five sub-workstreams (B0–B5, with B5 optional) closed with their own closure docs
- Test suite green (target: ≥107/107 + new tests from B1 + B3 + B4b)
- `/v1/telemetry/summary` returns 401 without admin secret on the deployed Fly instance
- Per-install HMAC is the only auth path on telemetry write endpoints (shared-secret either removed or behind explicit compat flag)
- musu.pro `/validate` returns `user_id` in production
- A clean Windows VM completes the installer flow end-to-end with telemetry visible in `/summary`
- B4c Const VI gate has a written decision (α or β)
- All findings from each sub-workstream's independent audit are either closed or explicitly deferred with reasoning in the closure doc

## Critical files

**musu-relay (this repo):**
- `src/signaling/telemetry.ts` — B1 schema + routes, B3 summary auth
- `src/signaling/server.ts:141-151` — B2 fallback removal
- `src/gateway/client.ts:397-414` — B1 HMAC header
- `fly.toml`, `Dockerfile`, `docker-entrypoint.sh` — B0 validation, B5 trim
- `tests/telemetry-*.test.ts` — B1 + B3 test additions
- `tests/validate-token.test.ts` — B2 strictness

**musu-pro (cross-repo at `F:\Aisaak\Projects\musu-pro`):**
- `src/app/api/v1/nodes/validate/route.ts:69-72` — B2 add `user_id` to response

**New under `musu-relay/installer/`:**
- `installer/check-prereqs.ps1` (B4b)
- `installer/install-wsl2.ps1` (B4b)
- `installer/uninstall.ps1` (B4b)
- `installer/build-musu-backend.ps1` or `.sh` (B4a build script)

## Out of scope (explicit)

- macOS installer (V23.3, Option γ)
- Linux installer (V23.3)
- Auto-update for `musu-backend.tar` (V23.3)
- TURN fallback (rejected by V23 L7)
- Argo Workflows / CRDs / React Flow (V23.3+)
- Paddle billing (V23.5)
- Multi-region signaling (V23.5)
- v21 `scripts/install.ps1` removal (deferred until V23.5 cuts the native path)

## Open user gates

Before sub-workstreams that require explicit auth:
- **Const III gate** for B1 schema v41 — needed when B1 detail plan is ready
- **musu-pro deploy** for B2 — operator triggers from musu-pro repo
- **Const VII gate** for any main-branch merge

## What this doc replaces

Supersedes the original `Workstream B` task list in `docs/V23_2_WORKSTREAM_B_PREP_2026_05_16.md` (wiki/360). That prep doc had wall-clock estimates and "open questions for the user" — answered here:
- vibecode-town location: confirmed `F:\Aisaak\Projects\musu-pro`
- install.ps1 disposition: write fresh under `installer/`, don't fork
- B4 scope: sequenced B4a → B4b → B4c, no parallel-fork
- B4 wall-clock: removed; acceptance criteria is what defines done
