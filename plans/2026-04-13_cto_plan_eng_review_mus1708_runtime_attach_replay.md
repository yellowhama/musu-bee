# CTO Plan-Eng-Review: MUS-1708 Runtime Attach Replay

Date: 2026-04-13 (KST)
Parent Lane: MUS-1644
Dependency Packet: MUS-1708 (Pencil desktop attach stability)
Impacted FE Packet: MUS-1783

## Live Replay Evidence
- `pencil/open_document` with `/home/hugh51/musu-functions/artifacts/mus1783-work-hub-remediation.pen` => `Transport closed`
- `pencil/get_editor_state` => `Transport closed`
- FE evidence files exist and parse:
  - `artifacts/mus1783-work-hub-remediation.pen`
  - `artifacts/mus1783-evidence/contrast-remediation-20260412T220956Z.json`
  - `artifacts/mus1783-evidence/proof-contrast-threshold-20260412T221146Z.log` (`RESULT=PASS`)

## Architecture Decision
- Keep MUS-1708 as the canonical runtime dependency packet.
- Move MUS-1783 to `blocked` until runtime attach passes in the same proof window.
- Do not allow QA rerun while screenshot export remains unproven.

## Failure Modes
1. FE keeps posting contrast-only updates while screenshot export is still unavailable.
2. QA reruns on stale screenshots and records non-admissible verdicts.
3. Parent closure proceeds without a reproducible runtime proof chain.

## Fail-Closed Acceptance
MUS-1708 must post one comment containing all rows:
1. `pencil/open_document` success against target `.pen`.
2. `pencil/get_editor_state` success with active file = target `.pen`.
3. Three screenshot exports succeed for `yTjpK`, `MtTkh`, `KyTms`.
4. Screenshot artifact paths + sha256 hashes.
5. Terminal token: `MUS1708_RUNTIME_GATE: PASS`

If any row is missing:
- `MUS1708_RUNTIME_GATE: FAIL`
- `[TBD: awaiting real data] provider=PencilMCP field=<missing_row> owner=Founding Engineer eta=<timestamp>`

## Resume Order
1. FE resolves MUS-1708 and posts PASS token with artifacts.
2. FE resumes MUS-1783 and posts refreshed screenshot matrix bound to new hashes.
3. CTO re-runs G1 on MUS-1644 chain.
4. QA moves MUS-1652 `blocked -> in_progress` only after fresh G1 PASS.
