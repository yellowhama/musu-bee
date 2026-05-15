# V23.1 spike result — TEMPLATE

**Status**: TEMPLATE. Fill in after manual T1.14 + T1.15 + T1.16 runs, then rename `V23_1_SPIKE_RESULT_YYYY_MM_DD.md`.

**Decision under §10.5 V23.1 success criteria**: V23.2 starts ☐ / V23.1 extends ☐ / β fork triggered ☐.

---

## 1. Snapshot

| Metric | Target (§10.5) | Observed | Pass/Fail |
|--------|----------------|----------|-----------|
| **Handshake success rate, home WiFi → home WiFi** | ≥50% | ___% | ☐ |
| **Handshake success rate, cellular CGNAT → home WiFi** | ≥50% (criterion 1) | ___% | ☐ |
| **Telemetry: ≥20 successful handshakes logged** | ≥20 | ___ | ☐ |
| **Telemetry: ≥5 failed handshakes with categorized fail_cause** | ≥5 | ___ | ☐ |
| **End-to-end: browser → musu.pro → laptop → K3s pod stdout** | works | ☐ | ☐ |
| **User sign-off** | "진행해" | ___ | ☐ |

## 2. Local automated baseline (T1.14 local proxy)

From `npx jest tests/spike-local-demo.test.ts` on the dev host:

| N attempts | success | fail | success rate | p50 ms | p95 ms |
|------------|---------|------|--------------|--------|--------|
|            |         |      |              |        |        |

Source commit: `_______________`
Date: `____-__-__`
Host: `(Windows/Linux/macOS) (Node version)`
@roamhq/wrtc version: `_____`

Comment on regression sensitivity: this baseline is the lower bound for the cross-network numbers. If localhost regresses below 95% or p95 above 2s, the wire itself broke — fix before retesting NAT cases.

## 3. T1.14 — Manual demo

**Path**: `https://<test-user>.musu.pro/spike-demo` on a phone browser → Fly.io signaling → gateway on dev laptop → K3s 'hello' pod → response.

**Recorded video**: `<link>`
**Date / time**: `____-__-__ __:__`
**Network**: phone on `(WiFi / 4G / 5G)`, laptop on `(home / office) WiFi`
**Outcome**: `(success / fail)`
**Handshake elapsed_ms (from telemetry summary endpoint)**: `_____`

Notes:

> [Anything noteworthy — first-attempt fail then retry succeeded, ICE candidate counts, etc.]

## 4. T1.15 — Cross-network (different home networks)

20 attempts. Phone (network A) → laptop (network B), neither LAN-shared.

| Result | Count | % | Causes (if fail) |
|--------|-------|---|------------------|
| success | __ | __% |  |
| fail / timeout | __ | __% |  |
| fail / symmetric_nat | __ | __% |  |
| fail / firewall | __ | __% |  |
| fail / other | __ | __% |  |

Median elapsed_ms (success only): `_____`
p95 elapsed_ms (success only): `_____`

Telemetry summary URL when filled: `https://signaling.musu.pro/v1/telemetry/summary`

## 5. T1.16 — CGNAT simulation

20 attempts with one side on cellular tether (most carriers CGNAT all subscribers).

| Result | Count | % | Causes |
|--------|-------|---|--------|
| success | __ | __% |  |
| fail / timeout | __ | __% |  |
| fail / cgnat_detected | __ | __% |  |
| fail / other | __ | __% |  |

Interpretation hook for V23.5 TURN/remote-only decision:

> If CGNAT success rate < 30%, the "remote-only paid tier" upsell needs to be visible at the moment of failure (not buried in a settings page). Per L7 + O4-b, TURN is still rejected — the right move is product surface, not infrastructure relay.

## 6. Failure analysis

For each fail bucket, list:
- one example raw telemetry row (musu_install_id redacted)
- whether the gateway side or visitor side logged it
- whether it was reproducible

> [Fill in. The whole point of the categorized fail_cause column is to make this table writable.]

## 7. Outstanding risks and known gaps

- [ ] V23.1 only categorizes `success` / `timeout`. `cgnat_detected` / `symmetric_nat` / `firewall` require STUN-response analyzer — V23.2 spike work.
- [ ] PEER_LEFT in V23.1 signaling protocol doesn't carry peer_id; gateway can't be selective in session cleanup. Cosmetic for V23.1, fix in V23.2.
- [ ] No TURN fallback. By design (L7). If T1.16 success rate is structurally low, escalate to the user — do NOT silently add TURN.
- [ ] No `@roamhq/wrtc` install verification on macOS / Linux dev hosts yet. Windows worked. If a different host fails install, the node-datachannel fallback per §10.3 is still the path.

## 8. Decision

Choose one and append the user's verbatim quote:

- [ ] **V23.2 starts.** Reason: criteria met. User: `_____`
- [ ] **V23.1 extends.** Reason: criterion __ failed (`_____`). User: `_____`
- [ ] **β fork triggered.** Reason: structural blocker — `_____`. User: `_____`

## 9. Appendix — how to reproduce locally

```bash
cd musu-relay
npm install --save-optional @roamhq/wrtc   # one-time
npm test                                    # 60+ tests pass in ~8s
npx jest tests/spike-local-demo.test.ts     # 20-attempt local baseline
```

Manual cross-network demo (T1.14, T1.15, T1.16) requires:
1. `signaling.musu.pro` deployed to Fly.io per `docs/V23_T1_7_FLY_IO_DEPLOY_DECISION.md` provisioning checklist.
2. `musu-relay-gateway` process running on dev laptop, configured with paid-tier token.
3. A test page on `<user>.musu.pro` that constructs `VisitorClient` against the deployed signaling URL.
4. A `kubectl proxy` or a hello-world HTTP target on the laptop bound to 127.0.0.1.
