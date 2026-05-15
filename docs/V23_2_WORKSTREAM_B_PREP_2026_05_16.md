# V23.2 Workstream B — preparation doc (wiki/360)

**Date**: 2026-05-16
**Status**: **Prep only — not authorized.** User "진행해" gates entry.
**Predecessors**:
- `V23_2_WORKSTREAM_A2_CLOSURE_2026_05_16.md` (wiki/358) — closes A2
- `V23_2_WORKSTREAM_A2_QUAL_EVAL_2026_05_16.md` (wiki/359) — names the open uncertainties this workstream must resolve
**Wiki ID** (abstract): `wiki/360`

---

## 0. Why prep doc, not "plan" doc

`V23_2_PLAN_2026_05_16.md` (wiki/356) §2 already sketches the B workstream as "WSL2 installer." That sketch predates A and A2 and is now incomplete in two ways:

1. **T2.AUTH.2-final** (per-install HMAC) was extracted from Workstream A's original ticket and now lives in B's scope explicitly — A2 shipped the *interim* shared-secret in its place.
2. **First-deploy validation** has to land *before* B's installer work, because the installer ships a `MUSU_TELEMETRY_SHARED_SECRET` baked at build time, and the matching secret must be set on a working `signaling.musu.pro` machine. We cannot ship installers pointing at an unverified server.

So B's actual entry point is **not** "start writing PowerShell." It's "deploy what A2 produced, prove it works on real Fly.io, *then* hand off the baked secret to the installer build."

This doc enumerates that ordering. The detailed task table is below; the dependency graph in §3 is the load-bearing piece.

---

## 1. Open items being carried in

From wiki/358 §"Deferred to Workstream B":

| ID | Source | Severity | Scope |
|---|---|---|---|
| T2.AUTH.2-final | A2 audit + V23.1 audit HIGH #2 | HIGH | per-install HMAC of `(install_id, body, ts)`; replaces shared-secret; new `telemetry_install_keys` table (schema v41, Const III gate) |
| T1.7.c | A2 closure | MED | musu.pro `/api/v1/nodes/validate` must return `{ user_id }` so signaling can use canonical id as room key |
| Summary auth | A2 audit INFO | MED | `/v1/telemetry/summary` is currently public — add auth |
| LOW #8 | A2 audit | LOW | gateway + visitor TS compiled into signaling image; ~tens of KB bloat. `tsconfig.docker.json` to scope compilation |
| First-deploy validation | wiki/359 §2 + §1 | **HIGH (gating)** | Until first `fly deploy` succeeds, A2's deploy fix (HIGH #1 entrypoint chown) is unverified |

From wiki/356 §2 (still pending):

| ID | Source | Scope |
|---|---|---|
| T2.INST.1–5 | V23 master plan §10.4 | WSL2 installer + `musu-backend.tar` import path |
| T2.DEMO.1–5 | wiki/356 Workstream C | manual demo close once installer + signaling exist |

---

## 2. Sub-workstreams

### B0 — First-deploy validation (gate for everything else)

| ID | Task | Acceptance |
|---|---|---|
| T2.B0.1 | `fly launch --no-deploy --copy-config` then `fly volumes create musu_telemetry --size 1 --region <r>` from `musu-relay/` | volume listed by `fly volumes list` |
| T2.B0.2 | `fly secrets set MUSU_VALIDATION_API=... MUSU_TELEMETRY_SHARED_SECRET=$(openssl rand -hex 32)` — and *save the secret to a password manager the installer build can read* | secrets exist; secret stored where Workstream B's installer build can pull it |
| T2.B0.3 | `fly deploy` and observe `fly logs` for `[signaling] listening on 9900` | clean boot, no chown failures, `GET /health` returns 200 (route confirmed at `signaling/server.ts:327`) |
| T2.B0.4 | Negative test: temporarily unset `MUSU_TELEMETRY_SHARED_SECRET` via `fly secrets unset` and confirm the boot check (HIGH #3) refuses to start | machine exits 1 with "FATAL: MUSU_TELEMETRY_SHARED_SECRET is required in production" in logs; then re-set the secret to recover |
| T2.B0.5 | E2E sanity: open `/spike-demo` on musu-bee with `NEXT_PUBLIC_MUSU_SIGNALING_URL=wss://signaling.musu.pro/signaling`, paste a paid-tier token, confirm phase progresses to at least `welcome-received` even without a gateway running | the page does not crash; phase log shows WS open + HELLO + WELCOME |

Without B0 complete, every B-stage assumption is paper. Total wall-clock: ~half a day if Fly account already set up.

### B1 — T2.AUTH.2-final (per-install HMAC)

Replaces the shared-secret with per-install HMAC, removing the "one leaked installer compromises every endpoint" failure mode.

| ID | Task | Notes |
|---|---|---|
| T2.B1.1 | Schema v41: `telemetry_install_keys(install_id PK, install_key_hash, issued_at, last_seen_at)` — store HMAC key as SHA-256 hash so DB compromise doesn't yield usable keys | Const III gate — needs user "진행해" |
| T2.B1.2 | New endpoint `POST /v1/telemetry/issue_install_key` accepting `musu-installer-secret` header (env-injected at installer build time); returns `{ install_key }` (32-byte hex) | issued once per install_id; idempotent on `install_id` collision |
| T2.B1.3 | Modify `/install`, `/nat_pierce`, `/agent_spawn` to verify `x-musu-install-hmac` header = `hmac_sha256(install_key, request_body)`; drop the `x-musu-telemetry-secret` path | tests: missing header → 401; wrong hmac → 401; correct hmac → 204 |
| T2.B1.4 | Gateway client signs body before POST; sends `x-musu-install-hmac` instead of shared-secret | regenerate `telemetry_install_key` on first run if absent (call /issue_install_key with bundled installer secret) |
| T2.B1.5 | Migration story for already-deployed installers (none, since pre-V23.2 installers don't speak this protocol — but document it) | one paragraph in B closure doc |
| T2.B1.6 | Secret rotation procedure: dual-accept window where server accepts both shared-secret AND per-install HMAC for N days, then drops shared-secret | doc only; the actual rotation happens at B ship time |

### B2 — T1.7.c (musu.pro `/validate` canonical user_id)

| ID | Task | Notes |
|---|---|---|
| T2.B2.1 | Update `vibecode-town` (or wherever musu.pro lives) `/api/v1/nodes/validate` to return `{ valid: true, user_id: "canonical-id" }` instead of `{ valid: true }` | one-line API change |
| T2.B2.2 | Drop the warn-once tolerance in signaling/server.ts now that the API canonical id is reliable | code change in musu-relay |
| T2.B2.3 | Test that signaling room key is the API's canonical id, NOT the HELLO-supplied user_id | test exists from T2.AUTH.3; just verify it covers this |

### B3 — Summary endpoint auth

| ID | Task | Notes |
|---|---|---|
| T2.B3.1 | Decide: shared admin secret (operator-only) vs full HMAC vs IP allowlist | recommended: shared admin secret distinct from telemetry secret; operator-only |
| T2.B3.2 | Implement chosen scheme on `GET /v1/telemetry/summary` | tests: no header → 401; wrong header → 401; right header → 200 |

### B4 — WSL2 installer (the original B per wiki/356)

Unchanged from wiki/356 §2 Workstream B. T2.INST.1 through T2.INST.5. Pulls the secret from B0.2's secure storage into the build pipeline. Cannot start until B0 + B1 ship — installer bundles the per-install issuance secret (B1.2), not the deprecated shared secret.

### B5 — LOW #8 image bloat (optional / opportunistic)

`tsconfig.docker.json` scopes signaling-image compile to `src/signaling/*` only. Drop gateway + visitor TS from the production image. ~tens of KB. Skip if any B0–B4 task slips.

---

## 3. Dependency graph

```
B0 (first-deploy validation) ── MUST precede everything else
   │
   ├──► B1 (T2.AUTH.2-final HMAC) ── needs schema v41 Const III gate
   │       │
   │       └──► B4 (WSL2 installer) ── installer bundles B1's issuance secret
   │
   ├──► B2 (musu.pro /validate user_id) ── independent, can run in parallel
   │
   ├──► B3 (summary endpoint auth) ── independent
   │
   └──► B5 (image bloat) ── optional, can land at B closure
```

Critical path: B0 → B1 → B4. B2 and B3 parallel.

Estimated wall-clock: B0 = 0.5d, B1 = 2d (with HMAC tests), B2 = 0.5d (needs musu.pro repo access), B3 = 0.5d, B4 = 1 week (original V23.2 master plan estimate). Total ~9–10 working days, same shape as wiki/356 §3.

---

## 4. What is NOT in Workstream B (explicit)

- macOS installer (V23.3, master plan §10 Option γ)
- Linux installer (V23.3)
- TURN fallback (rejected by L7)
- Argo Workflows / CRDs / React Flow (V23.3+)
- Auto-update for `musu-backend.tar` (V23.3)
- Paddle billing (V23.5)
- Multi-region signaling (V23.5)
- A new audit on this prep doc — that's wiki/361 if needed

---

## 5. Constitution gates B will hit

- **Const III** (schema): T2.B1.1 adds `telemetry_install_keys` v41. Explicit user "진행해" required before that migration lands.
- **Const VI** (investigate-first): T2.INST.4 30% gate experiment still applies for B4 — data-driven decision on whether to keep the α-path or fork β.
- **Const VII** (push gate): B closure + first main-branch merge of any A/A2/B work require explicit "진행해". The current `v22/gap-analysis` branch can keep accumulating commits.

---

## 6. Pre-flight checklist before authorizing B

Before user gives "진행해" on B:

- [ ] **wiki/359 §2** — has anyone actually opened `/spike-demo` in a browser even once? If not, do that first, even just to confirm no React crash on WS connection refused.
- [ ] **Fly.io account** ready (operator has logged in via `fly auth login`).
- [ ] **musu.pro repo access** — Workstream B2 touches a different repo; need write access decided.
- [ ] **`MUSU_TELEMETRY_SHARED_SECRET` rotation policy** — confirm "don't rotate before B ships" is acceptable, or commit to a dual-accept rolling rotation in B1.6.
- [ ] **30% gate criteria for B4** — what exactly counts as success for the WSL2 install on a 5-host sample? wiki/356 §2 says ">70% succeed → continue, <70% → β fork." Confirm the threshold and what β means concretely.

Once these five are clear + "진행해" given, B starts at B0.

---

## 7. Open questions for the user

1. **Audit cadence for B**: B touches auth-final + schema migration + secret rotation. Recommend **two independent audit passes** on B1 (the HMAC commit) — different subagents — instead of one. Acceptable?
2. **First-deploy timing**: should B0 happen now (immediately after this prep doc lands) or wait until B authorization? Recommended: **B0 happens immediately**, because if A2's deploy artifacts have a bug, knowing now is better than knowing after B1's HMAC work piles on top.
3. **musu.pro repo coupling**: T2.B2.1 lives in `vibecode-town` (musu.pro web). Cross-repo work — should it be tracked here or moved to a vibecode-town-side doc?

Answer these three + "진행해" → B0 starts.
