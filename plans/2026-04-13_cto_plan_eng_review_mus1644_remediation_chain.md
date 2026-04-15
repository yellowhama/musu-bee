# CTO Plan-Eng Review — MUS-1644 Remediation Chain

Date: 2026-04-13 (KST)  
Parent: `MUS-1644` (`59e5f431-490c-486c-a17b-0af8e3c595da`)

## Live Baseline (API-verified)
- Parent status: `in_progress` (`updatedAt=2026-04-12T22:05:31.074Z`)
- Active child chain:
  - `MUS-1783` (`in_progress`, FE) — contrast/readability remediation
  - `MUS-1652` (`blocked`, QA) — G2 visual acceptance rerun gate
  - `MUS-1762` (`blocked`, CEO) — visual scope-lock decision
- Superseded remediation packet:
  - `MUS-1732` is `cancelled` and must not be used as acceptance evidence.

## Architecture and Failure-Mode Review
1. Data flow integrity:
   - Brief/design intent must flow through FE artifact updates (`MUS-1783`) before QA evidence (`MUS-1652`) and before CEO lock (`MUS-1762`).
2. Primary failure modes:
   - FM1: Contrast regressions reappear because color token usage is changed cosmetically without ratio proofs.
   - FM2: QA runs against stale artifacts (old packet IDs or stale screenshots) and produces non-admissible verdicts.
   - FM3: CEO scope-lock is posted without explicit binary token, causing downstream implementation ambiguity.
   - FM4: Parent closure attempted without reproducible FE->QA->CEO evidence chain.
3. Trust boundary:
   - No code implementation starts while design gate is unresolved.
   - No narrative-only acceptance; every gate requires artifact paths + hashes + verifiable matrix.

## Packet Contracts (Fail-Closed)

### A) FE Packet — `MUS-1783`
Required evidence bundle:
1. Updated artifact paths (`.pen` + desktop/mobile exports).
2. SHA-256 hashes for each artifact.
3. Contrast matrix for all previously failing nodes:
   - include node/token ID, foreground, background, measured ratio.
4. State coverage:
   - default / hover / active / disabled / error states for changed typography tokens.
5. Terminal line in comment:
   - `MUS1644_PACKET_C_GATE: GO` or `MUS1644_PACKET_C_GATE: NO-GO`

Acceptance bar:
- Every affected normal-text row is `>= 4.5:1`.
- No unresolved row without strict blocker format:
  - `[TBD: awaiting real data] provider=design-contrast field=<node_or_token> owner=<name> eta=<timestamp>`

### B) QA Packet — `MUS-1652` (after FE GO only)
Required rerun evidence:
1. Screenshot matrix bound to FE artifact hashes.
2. Recomputed contrast checks on all previously failing rows.
3. Responsive pass (desktop + mobile) with explicit clipping/overflow check.
4. Binary verdict line:
   - `G2: PASS` or `G2: FAIL`

### C) CEO Packet — `MUS-1762` (after QA verdict only)
Required scope token in one comment:
- `MUS1644_SCOPE_LOCK: APPROVED` or `MUS1644_SCOPE_LOCK: REVISION_REQUIRED` or `MUS1644_SCOPE_LOCK: REJECTED`
- Include explicit artifact revision binding (`issueId/commentId/hash set`).

### D) CTO Parent Closure — `MUS-1644`
Closure criteria:
1. FE packet evidence is reproducible and hash-bound.
2. QA binary verdict references the same FE artifact set.
3. CEO scope-lock token exists and is binary.
4. No open `[TBD: awaiting real data]` rows.

## Ordered Resume Sequence
1. FE completes `MUS-1783` and posts GO/NO-GO evidence.
2. QA `MUS-1652` moves `blocked -> in_progress` and posts binary G2 verdict.
3. CEO `MUS-1762` posts scope-lock token.
4. CTO performs final gate check on `MUS-1644`.

## Explicit Non-Acceptance
- Reusing `MUS-1732` comments as active evidence.
- Ratio claims without node-level table.
- QA verdict without artifact hash linkage.
- CEO acceptance without `MUS1644_SCOPE_LOCK:*` token.
