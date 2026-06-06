# 2026-06-06 Process Ownership Freshness Gate Index Refresh

## Decision

After hardening process ownership release evidence freshness, refresh the MUSU
local index so future agents can retrieve the updated go/no-go gate, release
verifier contract, runtime stabilization spec, report, checklist, wiki, and
next-step plan.

## Index Evidence

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `indexed 2754 files (2776 symbols) in 26216 ms`
- GOAL row: `GOAL v721`
- wiki row: `wiki/896`

## Product Spec Update

Process ownership proof is part of the local MUSU Desktop execution boundary.
It must be current after runtime-affecting local code changes. MUSU.PRO remains
the remote input/control-plane and cannot substitute for local process
ownership evidence.

## Audit Result

No high/medium issue was found. This is evidence freshness hardening only; the
release remains blocked on second-PC CPU/matrix/route evidence, hosted
MUSU.PRO relay proof, support mailbox proof, and Store proof.
