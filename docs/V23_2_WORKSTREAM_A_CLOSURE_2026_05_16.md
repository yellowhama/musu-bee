# V23.2 Workstream A closure — audit remediation

**Date**: 2026-05-16
**Branch**: `v22/gap-analysis`
**Wiki ID** (abstract): `wiki/357`
**Predecessor**: `V23_2_PLAN_2026_05_16.md` (wiki/356)
**Scope**: V23.1 audit findings (3 HIGH, 4 MED, 5 LOW, 1 INFO) per `V23_1_CLOSURE_2026_05_16.md` §6.

---

## 1. Status table

| # | Sev | Topic | Status | Commit |
|---|---|---|---|---|
| 1 | HIGH | `validateToken` fail-open below circuit-breaker threshold | ✅ Fixed | `92c9012` T2.AUTH.1 |
| 2 | HIGH | Telemetry endpoints unauthenticated | ⏳ Deferred to Workstream B (needs installer secret) |
| 3 | HIGH | Token cache key allows user_id squatting | ✅ Fixed | `ff79866` T2.AUTH.3 |
| 4 | MED | BridgeServer `pathAllowPrefix` is `startsWith`, not normalizing | ✅ Fixed | `82a5394` T2.SEC.1 |
| 5 | MED | `GatewayClient.connect()` leaks welcome-poll timers on close race | ✅ Fixed | `99feb1d` (V23.1 closure commit, audit fix #5) |
| 6 | MED | PEER_LEFT carries no peer_id → stale PeerSession accumulation | ✅ Fixed | `f2255e9` T2.PROTO.1 |
| 7 | MED | `addRemoteIceCandidate` swallows JSON parse errors silently | ✅ Fixed | `6a8eb07` T2.OBS.1 |
| 8 | LOW | Bridge error message echoes rejected path | ✅ Fixed | `82a5394` (bundled in T2.SEC.1) |
| 9 | LOW | No test for `dc.send` throw path in BridgeClient | ✅ Fixed | `4dc12d9` (LOW bundle) |
| 10 | LOW | Tests use real wall-clock `setTimeout` settles | ⏳ Deferred (broad churn, marginal value) |
| 11 | LOW | `MUSU_TELEMETRY_DB` ephemeral default | ✅ Fixed (warning) | `4dc12d9` (LOW bundle) |
| 12 | LOW | `as any` around `getDataChannel()` is a soft type hole | ✅ Fixed | `4dc12d9` (LOW bundle) |
| 13 | INFO | Dead code: v21 `src/server.ts` next to v23 signaling | ⏳ Deferred (needs `tests/server.test.ts` rewrite first) |

**Workstream A shipped: 9 fixes (1 HIGH carryover + 2 HIGH + 4 MED + 4 LOW including #8).**
**Deferred: 1 HIGH (T2.AUTH.2, Workstream B), 1 LOW (#10), 1 INFO (#13).**

## 2. Commits in this workstream

```
4dc12d9 V23.2 Workstream A LOWs: typing, bridge throw test, telemetry db warning
6a8eb07 V23.2 T2.OBS.1: ICE candidate parse-error observability
f2255e9 V23.2 T2.PROTO.1: PEER_LEFT carries peer_id + gateway session cleanup
82a5394 V23.2 T2.SEC.1: bridge path-traversal hardening
ff79866 V23.2 T2.AUTH.3: drop user_id from cache key + canonical from API
92c9012 V23.2 T2.AUTH.1: validateToken fail-closed with degraded grace
```

Net: ~+850 / −150 lines across 11 files. Tests went from 60 (end of V23.1 loop) → 93 (end of Workstream A) = **+33 tests in 6 commits.**

## 3. Suite state

- 11 test suites, 93 tests, all passing, ~7s on dev host (no native-build-time variance).
- The new tests focus on the **negative path** of each finding: fail-closed for unseen tokens, traversal-vector rejection, session-cleanup on departure, dc.send-throws-then-recovers, etc.
- No skipped tests. No `.only`. No `console.log` left enabled.

## 4. What did NOT change (and why)

- **The signaling protocol** stays backward-compatible. PEER_LEFT now carries an optional `peer_id` field; v1 clients that don't read it still function. T2.AUTH.3 still tolerates a v21-era validation API that returns no `user_id` in the body (with a one-time warning).
- **The wire format for SDP/ICE/bridge envelopes** is unchanged. All audit-driven changes are server-side trust-model fixes; client compatibility is preserved.
- **No new MCP or dependency** added. All fixes use the existing module set.

## 5. T2.AUTH.2 — what's required to close it

The remaining HIGH (telemetry endpoint authentication) needs:

1. An **installer-side secret** to be generated at install time and registered with musu.pro's identity service. That's a Workstream B (T2.INST.x) deliverable per `V23_2_PLAN §2`.
2. The signaling server validates an HMAC of the request body against the install's registered key on every `/v1/telemetry/{install,nat_pierce,agent_spawn}` POST.
3. `telemetry_install_keys` table added → schema v41 → Constitution III gate before land.

Workstream A is not blocked by this — every fix in this workstream stands alone. T2.AUTH.2 is the **production-deploy gate** for the telemetry endpoint specifically. Before `signaling.musu.pro` accepts public traffic, T2.AUTH.2 must close.

## 6. Qualitative evaluation of Workstream A

| Axis | Score | Note |
|---|---|---|
| Audit closure rate | 9/13 substantive findings (4 deferred with reasons recorded) | strong |
| Test coverage delta | +33 tests, all negative-path-focused | strong |
| Backward compat | wire stays compatible; one-time-warning paths bridge old servers | good |
| Documentation | each commit message carries finding ID + before/after rationale | good |
| Velocity | 6 substantive commits + this closure doc in one /loop session | good |
| Risk introduced | 0 known regressions; the WELCOME-poll timer fix actually closed a separate bug found by the new tests | clean |

The audit was a useful forcing function — the HIGH findings on auth were real defects that V23.1's "spike" framing had silently shipped. Closing them before signaling deploy is the right ordering and the loop took the path naturally.

## 7. Next

V23.2 Workstream A is complete except T2.AUTH.2 (gated on Workstream B). The path forward:

1. **User decision** on V23.2 §7 open questions (sequencing, code-signing, tar-size budget). Until those answers come in, Workstream B (WSL2 installer) can't start.
2. **Const VII push gate**: this commit + the prior Workstream A commits should reach origin/v22/gap-analysis on the same push that ships this closure.
3. **T2.AUTH.2 follows Workstream B T2.INST.2** (the install-time secret registration). Once the installer telemetry happens, T2.AUTH.2 is mechanical.

Loop continues — pushing now, then waiting on user direction for Workstream B kickoff or any other redirect.
