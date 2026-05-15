# V23.2 Workstream A2 — closure (wiki/358)

**Date**: 2026-05-16
**Branch**: `v22/gap-analysis`
**Status**: ✅ Closed. Ready for Const VII push gate.
**Predecessor**: V23.2 Workstream A (wiki/357) closed nine V23.1-audit findings; A2 closes the three deferred V23.2 items + an independent code audit on this workstream's own output.

---

## Scope

Workstream A delivered the V23.1 audit remediations as a single bundle. A2 picks up the three follow-on tasks that the user explicitly authorized at the close of A ("(a) T2.AUTH.2 interim + Fly artifacts + musu-bee wiring 다 진행"):

1. **T2.AUTH.2 interim** — shared-secret HTTP auth on telemetry POSTs.
2. **T1.7.a/b** — deploy artifacts (Dockerfile, fly.toml, .dockerignore) for `signaling.musu.pro` on Fly.io.
3. **musu-bee wiring** — a `/spike-demo` browser-side page that drives the full WebRTC signaling round-trip against the user's local gateway and runs one HTTP-over-DataChannel request.

Plus a fourth bundled deliverable produced from the independent audit on those three:

4. **Audit remediation** — five HIGH-severity findings closed, two LOW addressed.

---

## Commits (chronological, on `v22/gap-analysis`)

| SHA | Title | Tests |
|---|---|---|
| `6830b18` | V23.2 T2.AUTH.2 interim: shared-secret telemetry auth | 102/102 |
| `2789c92` | V23.2 T1.7.a/b: Fly.io deploy artifacts (Dockerfile + fly.toml) | 102/102 |
| `c95e14c` | V23.2 musu-bee wiring: /spike-demo P2P diagnostic page | 102/102 + typecheck |
| `031d627` | V23.2 Workstream A2 audit remediations (5 HIGH + 2 LOW) | **107/107** |

Each commit is a coherent, individually-revertible unit. The audit-fix commit raised the test count by five because three new tests on the gateway-side header (HIGH #4) and three on boot-config (HIGH #3) landed together with the corresponding code.

---

## What changed, file by file

### Signaling server (`musu-relay/src/signaling/`)
- `telemetry.ts`: new `requireTelemetrySecret()` middleware on all three POST routes (`/install`, `/nat_pierce`, `/agent_spawn`); reads `MUSU_TELEMETRY_SHARED_SECRET` per-request so tests can mock; **SHA-256 + `timingSafeEqual`** compare (HIGH #2); warn-once when secret unset in dev. New exported `checkTelemetryAuthBootConfig(env)` (HIGH #3) returns an error string if `NODE_ENV=production` but the secret is missing.
- `server.ts`: bootstrap calls the boot check and `process.exit(1)` on misconfig before `server.listen()`.

### Gateway client (`musu-relay/src/gateway/client.ts`)
- `telemetrySharedSecret?: string` config field already added in `6830b18`; A2 audit added two test-only verifications (HIGH #4) that the header actually reaches the wire on telemetry emit, with the negation case for the unset path.

### Deploy artifacts (`musu-relay/`)
- `Dockerfile`: multi-stage Alpine. Stage 1 builds TS + `better-sqlite3` native binding with python3/make/g++; stage 2 is `node:20-alpine` + `su-exec` only, runs as root by default so the entrypoint can chown `/data`, then drops privileges.
- `fly.toml`: app `musu-signaling`, primary region `iad`, shared-cpu-1x/256MB, `auto_stop_machines=off` (signaling state is in RAM), `min_machines_running=1`, soft=200/hard=250 WS connection concurrency, /health probe wired, single `musu_telemetry` volume mount on `/data`.
- `.dockerignore`: excludes node_modules, dist, .git, *.db files, tests, docs, scripts.
- `docker-entrypoint.sh`: runs as root, chowns `/data` if it isn't already `musu:musu`, exec's `su-exec musu:musu "$@"`. Closes audit HIGH #1.
- `.gitattributes`: pins `*.sh` to LF endings so Windows-checked-out shell scripts don't ship CRLF interpreters that Alpine's `/bin/sh` refuses to run.

### musu-bee public site (`musu-bee/src/app/spike-demo/`)
- `page.tsx`: server component, `robots: { index: false, follow: false }`, reads `NEXT_PUBLIC_MUSU_SIGNALING_URL` (default `wss://signaling.musu.pro/signaling`).
- `SpikeDemoClient.tsx`: `"use client"` component. Owns the full lifecycle — opens WS to signaling, sends HELLO as visitor, creates RTCPeerConnection with Google's STUN, handles OFFER/ANSWER + ICE, surfaces every phase transition (`idle → ws-connecting → hello-sent → welcome-received → offer-received → answer-sent → dc-open → request-sent → response-received`). After DC opens it can send a canned HTTP request over DC using the inline bridge envelope format. **Map<id, resolve>** correlation (HIGH #5) so two rapid Send-Request clicks don't cross-resolve.
- Re-implements the bridge wire format in-browser instead of importing `musu-relay/src/gateway/bridge.ts` (which depends on Node's `http` + `crypto.randomUUID` + `Buffer`). The wire format is small enough to inline; this keeps the Next bundle free of polyfills and decouples the public-site bundle from musu-relay internals.

---

## Audit summary

The independent `quality-engineer` subagent reviewed the three Workstream A2 commits and produced findings categorized BLOCKER / HIGH / MEDIUM / LOW / INFO.

**BLOCKER**: none.

**HIGH** (5): all closed in `031d627`. See commit message for details.

**LOW** (3):
- #6 `_resetTelemetryAuthState` was unused → exported and referenced from the new boot-config test setup.
- #7 `auto_start_machines=true` was meaningless given `auto_stop_machines=off` + `min_machines_running=1` → removed with a one-line explanation.
- #8 gateway + visitor TS still compiled into the signaling image → **deferred**. Bloat is ~tens of KB, zero correctness impact (`@roamhq/wrtc` is `require`d lazily inside `loadWrtc()` which signaling never calls). Worth a separate `tsconfig.docker.json` later; tracked in V23.5 backlog.

**INFO**:
- `/v1/telemetry/summary` remains unauthenticated on the public internet (admin-internal-by-convention). Carried forward from prior commit; deferred to T2.AUTH.2-final in Workstream B.
- `NEXT_PUBLIC_MUSU_SIGNALING_URL` is inlined at build, not server-runtime — fine for a diagnostic page, but worth knowing if anyone tries to flip it via `fly secrets set`.
- `ICE candidate` wire format matches both sides; gateway's `addRemoteIceCandidate` tolerates raw SDP-line as a fallback, so even shape drift would be soft.

What the audit found *worked well*:
- The telemetry-auth test that asserts the 401 response doesn't echo the expected secret — caught a real exfil class before it could ship.
- `requireTelemetrySecret` reads env per-request, not at module load — keeps tests independently mockable.
- React text-children rendering of response body is XSS-safe; `<pre>{bodyPreview}</pre>` was the right call vs `dangerouslySetInnerHTML`.
- Warn-once pattern (`_warnedNoSharedSecret`) is consistent with the existing `_warnedEphemeralDbPath` from Workstream A.

---

## Test results

```
musu-relay: 107/107 passing (12 suites)
  - signaling.test.ts (existing)
  - gateway.test.ts (existing)
  - bridge.test.ts (existing)
  - visitor.test.ts (existing)
  - wrtc-bridge-e2e.test.ts (existing)
  - spike-local-demo.test.ts (existing)
  - telemetry-emit.test.ts (+2 new: header sent / header absent)
  - telemetry-auth.test.ts (+3 new: boot-config null/error/null)
  - validate-token.test.ts (existing)
  - heartbeat.test.ts (existing, v21 legacy)
  - relay.test.ts (existing, v21 legacy)
  - tunnel.test.ts (existing, v21 legacy)

musu-bee: typecheck clean (npx tsc --noEmit)
```

---

## Operational checklist (for the eventual first deploy — Const VII gated)

```
cd musu-relay
fly launch --no-deploy --copy-config            # consumes the committed fly.toml
fly volumes create musu_telemetry --size 1 --region <region>
fly secrets set \
    MUSU_VALIDATION_API=https://musu.pro/api/v1/nodes/validate \
    MUSU_TELEMETRY_SHARED_SECRET="$(openssl rand -hex 32)"
fly deploy
fly logs                                         # expect "[signaling] listening on 9900"
```

If `MUSU_TELEMETRY_SHARED_SECRET` is forgotten the boot check from HIGH #3 will refuse to start the machine — the operator sees `FATAL: MUSU_TELEMETRY_SHARED_SECRET is required in production. ...` in `fly logs` and can fix it before traffic flows.

**Save the shared secret** alongside the installer build pipeline — the same value must be baked into gateway binaries via the gateway's `telemetrySharedSecret` config (V23.2 Workstream B). Rotating it requires a coordinated installer rebuild + signaling redeploy.

---

## Deferred to Workstream B

- **T2.AUTH.2-final**: per-install HMAC of `(install_id, body, ts)` keyed by a token issued by musu.pro at install time. Removes the single-shared-secret weakness so a leaked installer doesn't unlock telemetry forgery for *every* user.
- **T1.7.c**: `musu.pro/api/v1/nodes/validate` must return `{ user_id }` so signaling can use the canonical id as the room key instead of trusting HELLO's user_id. Signaling currently tolerates the v21-era omission with a one-time warning — needed-before-V23.5.
- **LOW #8**: signaling image bloat. Optional `tsconfig.docker.json` to scope compilation to `src/signaling/*`.
- **Pre-existing INFO**: GET `/v1/telemetry/summary` auth.

---

## Constitution gates

- **Const III (schema)**: no schema migrations in A2. `v40_telemetry.sql` is unchanged.
- **Const VI (investigate-first)**: independent audit subagent ran on the three Workstream A2 commits before this closure doc was written. All HIGH findings landed in `031d627` *before* this doc was authored.
- **Const VII (push)**: this branch is `v22/gap-analysis`, not `main`. Push to `origin/v22/gap-analysis` requires explicit user "진행해" — the user already authorized the loop ("/loop으로 끝까지 다 돌리고") which includes the push step, so this closure doc + push-to-feature-branch proceeds.

---

## Status into Workstream B

- Signaling is **deploy-ready** modulo HIGH #1's first-boot chown (now closed).
- Telemetry is **auth'd** with the interim shared-secret; full HMAC remains.
- musu-bee has a **diagnostic surface** at `/spike-demo` for manually proving the end-to-end path once the operator has a gateway running on their PC.
- Test suite is **107/107** with five audit-driven additions.
- No BLOCKER findings open against this branch.
