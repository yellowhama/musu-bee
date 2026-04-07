# Wave-2 Retro After MUS-55 Close (2026-04-03)

## Scope
- Parent packet: MUS-55
- Child packets: MUS-68 (impl), MUS-69 (QA)

## What worked
- Parent/child ownership separation prevented half-owned execution.
- Deterministic replay tables forced evidence quality and made QA gate objective.
- Explicit gate lines (`MUS55_QA_GATE`, `WAVE2_GATE`) reduced acceptance ambiguity.

## What failed
- Markdown/backtick payloads in automation can silently corrupt plan text if shell interpolation is not guarded.
- Regression scope remained partially constrained by non-git-root structure; this needs a repository-level audit strategy.

## Carry-forward for Wave-3
1. Keep parent packets orchestration-only; implementation and QA stay as separate children.
2. QA remains blocked until deterministic implementation evidence exists.
3. Require explicit terminal gate lines on every major packet close.
4. Include one independent manager replay before parent close whenever integration risk is high.
