# CTO Plan-Eng Review — MUS-1688 Determinism Re-entry (2026-04-14 KST)

Issue
- MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
- Upstream decision gate MUS-1687 is closed (`CEO_DECISION_MUS1687_FINAL: APPROVE`, comment `17f94098-a10e-4bad-afea-4fda601d5b9c`).

Live state snapshot used for this review
- Issue status: `blocked`
- Assignee: Founding Engineer
- Checkout anomaly evidence exists in both cases:
  - run mismatch 409 (`executionRunId != current run`)
  - matching run 409 (`executionRunId == current run`, `checkoutRunId=null`)
- Latest QA verdicts: `G2_READY_MUS1688: FAIL` (comments `c4195388-f188-49f6-b7d0-1de11185c926`, `b77c05c2-cf66-4e6c-be99-b6a4815bb363`)

Recent evidence reviewed
- FE refresh packet: `/home/hugh51/musu-functions/artifacts/mus1688-fe-refresh-20260414T033523+0900`
- Determinism packet: `/home/hugh51/musu-functions/artifacts/mus1688-deterministic-proof-20260413T185015Z`
- Recheck packet: `/home/hugh51/musu-functions/artifacts/mus1688-recheck-20260413T184538Z`

Architecture and failure-mode assessment
0. Checkout contract ambiguity (board/API contract risk)
- Evidence: FE comments `424082aa-9582-43c7-8683-346466d21fa0`, `8c99441a-a545-403c-a2bc-0df1c0c2536f`, `89f46c54-4ded-47c8-a747-8af0ddc46db7`.
- Pattern: checkout endpoint returns 409 even when assignee matches and executionRunId matches the active FE run.
- Impact: engineer cannot legally mutate code under checkout-before-coding policy; packet gets stuck in non-actionable blocked state.

1. Build artifact contention risk
- Evidence: deterministic packet `build_stability_5x.txt` includes run_1 and run_2 failures with `.next` artifact ENOENT.
- Evidence: recheck packet `process_snapshot.txt` shows active `next dev --port 3001` and `next-server` processes during replay.
- Impact: merge-unit quality cannot be judged reliably while build output directory is shared across concurrent sessions.

2. Scope drift risk
- Prior G1 token was issued on `TOKEN_ONLY` merge unit.
- Latest FE evidence (`changed_files.md`) includes `landing-exp` route/module/tests in addition to token files.
- Impact: acceptance rows changed materially; old G1 PASS cannot be reused as-is.

3. Gate-order instability
- Multiple alternating `G1 PASS/FAIL` and `G2 PASS/FAIL` comments on same packet.
- Impact: auditors cannot infer a single admissible chain without a fixed re-entry contract.

Deterministic re-entry contract (required before next G1)
0. Explicit checkout policy row (must exist first)
- Post one authoritative row on `MUS-1688`:
  - `CHECKOUT_CONTRACT_MUS1688: MATCHED_EXECUTION_RUN_SUFFICIENT`
  - or `CHECKOUT_CONTRACT_MUS1688: CHECKOUT_REQUIRED_AFTER_REBIND`
- If second mode is chosen, include the exact rebind evidence and one successful checkout response.

1. Build isolation contract
- Use one run-scoped build output directory and keep it constant for build/typecheck/runtime-smoke in the same attempt.
- Contract must explicitly show no competing dev server using that build output.
- Evidence must include command lines and raw logs.

2. Single scope declaration
- Exactly one line: `SCOPE_MODE: TOKEN_ONLY` or `SCOPE_MODE: EXPANDED`.
- Include one canonical merge artifact (commit SHA or one repo-relative patch).

3. Reproducibility floor
- Cold replay loop must pass >= 5/5 under the declared contract, not 3/5 or 4/5.
- Include per-iteration exit codes and logs.

4. Coverage obligations
- TOKEN_ONLY: token guard tests + typecheck + build.
- EXPANDED: all above plus behavior tests for `/landing-exp` status branches and waitlist action contract.

5. Security obligations
- Explicit trust-boundary note proving no user-controlled style/token injection path.
- Rollback command sequence tied to declared file scope.

CTO gate decision for now
- G1 remains `FAIL` until deterministic re-entry contract above is met with one coherent evidence bundle.
- QA G2 should not be reopened before updated G1 PASS on that same bundle.
