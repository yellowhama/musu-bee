# Wave-2 Close-Order Contract (MUS-102)

## Contract

Wave-2 packet closure order is strict:

1. `MUS-102` (`W2-1`) manager hygiene baseline
2. `MUS-103` (`W2-2`) wire-level transport evidence contract
3. `MUS-104` (`W2-3`) discovery/provider and route-sync control path
4. `MUS-105` (`W2-4`) independent QA verification gate
5. parent `MUS-96` wave gate confirmation remains historical reference (`done`)

## Transition Rules

- `MUS-102` may close only after runbook + status-truth audit evidence are linked.
- `MUS-103` may move to `todo` only after `MUS-102` is `done`.
- `MUS-104` remains `blocked` until `MUS-103` terminal line exists.
- `MUS-105` remains `blocked` until both `MUS-103` and `MUS-104` are `done`.

## Gate Lines

Required terminal lines:
- `MUSU_CONNECTS_W2_1_READY: GO`
- `MUSU_CONNECTS_W2_2_EVIDENCE: GO`
- `MUSU_CONNECTS_W2_3_CONTROL_PATH: GO`
- `MUSU_CONNECTS_WAVE2_QA_GATE: GO|NO-GO`

## Non-acceptance

Do not close any packet if:
- evidence path is missing,
- run/status drift is unresolved,
- terminal line is absent,
- downstream packet was advanced out of order.
