# V23.2 Workstream B5 — Image trim: signaling-only Docker compile (wiki/369)

**Date**: 2026-05-16
**Status**: Code-complete, tests green, ready for Const VII push.
**Predecessors**: wiki/361 (master plan §B5 "Image bloat, optional"), wiki/364 (B1 closure), wiki/366 (B2 closure), wiki/368 (B3 closure)
**Branch**: `v22/gap-analysis`
**Wiki ID**: `wiki/369`
**Workstream pattern**: solo orchestrator (no `MODE_Agent_Team` triggers met — no auth/schema, ≤4 files, single-repo, ~1 LOC functional). Per master plan §B5 "Skip if any prior sub-workstream slips" — B1+B2+B3 all landed cleanly, so B5 is in scope.

---

## 1. Summary

B5 adds `tsconfig.docker.json` that scopes the Docker image's TypeScript compile to `src/signaling/**` only. The Dockerfile now uses this scoped tsconfig instead of the project-wide one. Result: `dist/` inside the runtime image drops from 7 files (gateway, visitor, legacy v21 broker, signaling) to 2 files (`dist/signaling/server.js` + `dist/signaling/telemetry.js`). The dropped files were never executed in the signaling container (`npm start` → `dist/signaling/server.js`); they were dead weight in the image. Image-layer reduction is small in absolute terms (~tens of KB per master plan estimate) but removes the foot-gun of operators reading `dist/gateway/` inside the signaling pod and mistakenly thinking the image runs both. Zero correctness impact; tests stay 189/189 green; tsc --noEmit clean. Local-dev workflow (`npm run build`) is unchanged — it continues to use `tsconfig.json` and produces all dist artifacts.

---

## 2. Files touched

| File | Change | Lines |
|---|---|---|
| `musu-relay/tsconfig.docker.json` | **NEW** — `extends ./tsconfig.json` + `include: ["src/signaling"]` | +7 |
| `musu-relay/Dockerfile` | Stage 1: `COPY tsconfig.json tsconfig.docker.json ./` + `RUN npx tsc -p tsconfig.docker.json` (replaces `RUN npm run build`) | +1/-1 |

Total functional delta: 8 lines added, 1 line replaced.

---

## 3. Verification

### 3.1 Scoped build correctness

```
$ npx tsc -p tsconfig.docker.json
$ find dist/ -type f
dist/signaling/server.js
dist/signaling/telemetry.js
```

Previously (`npx tsc` / `npm run build` / pre-B5 Dockerfile):
```
dist/gateway/bridge.js
dist/gateway/client.js
dist/gateway/wrtc-factory.js
dist/server.js          ← legacy v21 broker, unused in signaling image
dist/signaling/server.js
dist/signaling/telemetry.js
dist/visitor/client.js
```

7 files → 2 files. The 5 dropped files are:
- `dist/gateway/*.js` (3 files) — gateway runs on user's PC, not in signaling container
- `dist/server.js` — legacy v21 broker; `npm start` invokes `dist/signaling/server.js` per `package.json`
- `dist/visitor/client.js` — bundled into `musu-bee` web frontend, not the signaling container

Image-layer impact is harder to measure without actually building the Docker image, but the master plan estimate of "~tens of KB" tracks (TypeScript compile output is small; the real Docker image bulk is in `node_modules`, which B5 does NOT touch).

### 3.2 Tests + typecheck

After restoring the default `npm run build` for local dev:

```
Test Suites: 18 passed, 18 total
Tests:       189 passed, 189 total
Snapshots:   0 total
```

`npx tsc --noEmit`: clean (no output).

Zero regressions. Tests do not exercise the Dockerfile or `tsconfig.docker.json`; the build-correctness check is purely the artifact-list comparison above.

### 3.3 Constitution gates

- **Const III** (schema): NO — no DB changes.
- **Const VI** (experiment): NO.
- **Const VII** (push): YES — feature-branch push to `v22/gap-analysis`. No `fly deploy` triggered. Next `fly deploy` (operator-initiated) will use the new scoped build.

---

## 4. Why solo orchestrator (no agent-team)

Per `MODE_Agent_Team.md` activation triggers:
- ≥3 specialist roles needed? **NO** (single concern: TS build scope)
- Cross-repo? **NO** (musu-bee only)
- Auth/security/schema? **NO** (no auth, no DB)
- ≥4 files across ≥2 dirs? **NO** (2 files, 1 dir)

Master plan §B5 explicitly calls this "optional, ~tens of KB win, zero correctness impact". The change is mechanically simple, evidence is reproducible (artifact list diff), and no novel design decisions were made. Solo orchestrator is the right call. Skipping Critic + dedicated Auditor saves ~30min of agent-team overhead for a 1-LOC change.

---

## 5. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Operator runs the local `npm run build` (project-wide) and expects all dist files; then `fly deploy` runs with stale `dist/` | Dockerfile does `RUN npx tsc -p tsconfig.docker.json` INSIDE the builder stage — `dist/` is rebuilt fresh during image build, regardless of local state. The repo's `dist/` is git-ignored. |
| A future developer adds a new file to `src/signaling/` that imports from `src/gateway/` | TypeScript compile under `tsconfig.docker.json` will fail (file not in `include`). Catches at image-build time, not runtime. |
| Test suite uses something gateway/visitor that ALSO touches signaling code path | Tests run against the local `npm run build` output (project-wide), which still compiles everything. B5 only narrows the Docker image build, not the dev/test build. |
| Image-build CI breaks because `npm run build` is no longer the docker step | No CI exists for the signaling image build; operator-driven `fly deploy` is the build trigger. Operator's first `fly deploy` post-B5 will validate. |

---

## 6. Operational dependency forward

No operator action required pre-`fly deploy`. Next `fly deploy` of `v22/gap-analysis` will use the scoped tsconfig automatically. Operator may optionally compare image sizes pre- and post-B5 via `docker images musu-signaling` after building locally:

```bash
# Before B5 (revert tsconfig.docker.json change locally)
docker build -t musu-signaling:pre-b5 .

# After B5
docker build -t musu-signaling:post-b5 .

docker images | grep musu-signaling
```

Per master plan estimate the win is small; the closure doc records the win for posterity, not as a critical SLO.

---

## 7. Out of scope

- Removing legacy `src/server.ts` (v21 broker) entirely — separate decision; keeping it for now per existing comment trail
- Slimming `node_modules` further — already covered by `npm prune --omit=dev --omit=optional` in Dockerfile stage 1
- Multi-stage build optimizations (distroless, etc.) — out of B5 scope; future hardening pass
- `tsconfig.docker.json` for the `musu-bee` web frontend Docker image — different repo path, different concern
- B5 has zero coupling to B4a/b/c — B4a's `musu-backend.tar` is unrelated, B4b's PowerShell installer is gateway-side

---

## 8. Acceptance verification

- [x] `tsconfig.docker.json` exists at `musu-relay/tsconfig.docker.json`
- [x] Dockerfile uses `npx tsc -p tsconfig.docker.json` instead of `npm run build`
- [x] Scoped build produces only `dist/signaling/server.js` + `dist/signaling/telemetry.js`
- [x] Project-wide `npm run build` (used by tests + local dev) still produces all 7 files
- [x] `npm test`: 189/189 green
- [x] `npx tsc --noEmit`: clean
- [ ] Const VII gate: operator approves push to `v22/gap-analysis`

---

## 9. References

- wiki/361 §B5 — master plan ("Image bloat, optional, ~tens of KB win")
- wiki/364 — B1 closure (security exit-state foundation)
- wiki/366 — B2 closure (cross-repo fallback closure)
- wiki/368 — B3 closure (admin auth on /summary)
- `musu-relay/Dockerfile` — Stage 1 build invocation (B5 modified)
- `musu-relay/tsconfig.json` — project-wide tsconfig (unchanged)
- `musu-relay/tsconfig.docker.json` — B5 new file

**End of B5 closure.**
