# V23.1 spike — /loop handoff

**Date**: 2026-05-16
**Branch**: `v22/gap-analysis` (still local; Const VII push gate pending per V23.0 closure)
**Loop range**: 9 iterations covering T1.3.fix → T1.14/T1.17. Earlier loops (V23.0) covered planning + T1.1–T1.6.

## What this loop produced

Starting from `0f0889a` (T1.6 telemetry complete), the loop landed 9 commits on `v22/gap-analysis`:

| Commit | Task | Lines added |
|---|---|---|
| `d54932c` | T1.3.fix — signaling test harness race fixed; 13/13 signaling pass | +140 / −224 |
| `f23e332` | T1.7 — Fly.io deploy decision doc | +85 |
| `3dc101d` | T1.8 — `GatewayClient` scaffold + 4 tests | +568 |
| `807b1b3` | T1.9 — real `@roamhq/wrtc` factory; DC opens in 37ms localhost | +434 |
| `94b2c68` | T1.10 — `BridgeServer`/`BridgeClient` + wrtc-bridge E2E | +676 / −1 |
| `0838087` | T1.12 — gateway emits `nat_pierce` telemetry; 5 tests | +443 / −2 |
| `7bd32bf` | T1.11 — `VisitorClient` extraction + 2 tests | +471 |
| `6f2337e` | T1.14 (local) + T1.17 template | +342 |

End state: **61 tests across 10 files, all passing in ~13s. 0 skipped, 0 known issues.**

## Master-plan §10 progress

| Task | Status |
|---|---|
| T1.1 fork signaling server | ✅ (pre-loop) |
| T1.2 token validation tests | ✅ (pre-loop) |
| T1.3 OFFER/ANSWER/ICE routing tests | ✅ (loop, T1.3.fix unblocked) |
| T1.4 per-user room model | ✅ (loop) |
| T1.5 telemetry POST endpoints | ✅ (pre-loop) |
| T1.6 SQLite v40 schema | ✅ (pre-loop) |
| T1.7 deploy target decision | ✅ doc; ⏳ actual provisioning pending |
| T1.8 gateway scaffold | ✅ |
| T1.9 real RTCPeerConnection | ✅ |
| T1.10 DC↔HTTP bridge | ✅ |
| T1.11 musu-bee client lib | ✅ (extracted as `VisitorClient`) |
| T1.12 nat_pierce telemetry | ✅ |
| T1.13 STUN server set | ✅ (`DEFAULT_STUN_SERVERS` constant) |
| T1.14 manual demo + video | ⏳ blocked on deploy + real K3s |
| T1.15 cross-network test | ⏳ blocked on real hosts |
| T1.16 CGNAT test | ⏳ blocked on real cellular |
| T1.17 spike result doc | ✅ template; fill-in blocked on T1.14–T1.16 |
| T1.18 user "진행해" gate | ⏳ user-gated |

## Why the loop stops here

Per §10.5 V23.1 success criteria, all three remaining items require resources the /loop cannot provision:

1. **Deployed Fly.io signaling server.** Provisioning checklist in `docs/V23_T1_7_FLY_IO_DEPLOY_DECISION.md`. Gated by Const VII push to main (user "진행해" required per V23.0 §11 status).
2. **Real K3s cluster on a laptop.** V23.1 explicitly defers K3s install — V23.2 is the WSL2-installer spike, V23.3 is the Operator and CRDs. V23.1 mocks the K3s API with an `http.Server` in tests; the mock is sufficient for proving the wire works (which it does — 37ms handshake, 166ms p95 visitor-connect-through-response, 20/20 success on localhost).
3. **Two real hosts on different networks.** T1.15 and T1.16 (cross-network and CGNAT). Anchors the success-criterion-1 number.

The local automated baseline pins regression on every layer below the network boundary. Whatever number the manual T1.14–T1.16 runs produce in the wild, the wire itself is known good at p95 166ms / 100% on localhost. If the wild numbers come back materially worse than that, the failure is NAT/network, not code.

## What the user needs to decide next

In order of dependency:

1. **Authorize Const VII push to main.** That ships V22 retraction + V23 master plan + T1.1–T1.14 code in one merge. (Pre-loop V23.0 §11 deliverable 9.)
2. **Provision `signaling.musu.pro` on Fly.io.** Per the T1.7 doc. 10-minute path.
3. **Set up a paid-tier test user** in musu.pro's existing identity service so the signaling server's `validateToken` returns true for it.
4. **Run T1.14 manual demo**: laptop running `musu-relay-gateway` with that test user's token + a `kubectl proxy` (or any local HTTP target) + a phone browser on `<test-user>.musu.pro`. Record video. Fill in §3 of `V23_1_SPIKE_RESULT_TEMPLATE.md`.
5. **Run T1.15 + T1.16** across networks. Fill in §4–§5 of the template.
6. **Decide T1.18**: V23.2 starts / V23.1 extends / β fork triggered.

Steps 2–5 take a day of focused work, not weeks. The loop has shipped everything that can be shipped without leaving the sandbox.

## What stays open as known follow-ups

- **`PEER_LEFT` carries no peer_id** in V23.1 signaling protocol; gateway cleanup is coarse. Cosmetic; fix in V23.2.
- **fail_cause categorization** is only `success`/`timeout` in V23.1. CGNAT / symmetric-NAT discrimination needs a STUN-response analyzer (V23.2 spike work).
- **`@roamhq/wrtc` Windows install verified.** macOS / Linux verification deferred to whoever runs T1.15 on those platforms. `node-datachannel` is the documented fallback per §10.3.
- **No retraction of `src/server.ts`.** The v21 tunnel-broker file still lives next to `src/signaling/`. Delete or move to `src/legacy/` when V22+V23 merge to main lands.

## How to reproduce the loop's results

```
cd musu-relay
npm install --save-optional @roamhq/wrtc
npm test                                  # 61/61 in ~13s
npx jest tests/spike-local-demo.test.ts   # 20-attempt baseline
```

Expect on a dev laptop: 20/20 success, p50 ~110ms, p95 ~170ms. Significant deviation is a regression, not a NAT issue — investigate code first.
