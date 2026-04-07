# Autonomous Workload Routing and Safety

## Goal

Define a concrete, persistent runtime contract for autonomous operation in `MUSU-WORKS`:

- workload routing
- handoff progression
- blocker escalation
- approval and safety guardrails

This document maps the contract shortlist to executable preset artifacts.

## Runtime Contract Files

Every generated preset now includes a `runtime/` tree:

- `runtime/contract.json`
  - canonical schema and policy contract
  - lane owners and handoff rules
  - blocker escalation chain
  - safety profiles and approval requirements
- `runtime/queue_items.json`
  - queue item storage (`items`)
- `runtime/lane_states.json`
  - lane state storage (`lanes`)
- `runtime/worker_results.json`
  - worker result storage (`results`)
- `runtime/handoff_queue.json`
  - pending handoff payload storage (`items`)
- `runtime/blockers.json`
  - active blockers (`open`)
- `runtime/governance_reviews.json`
  - governance read models:
    - `approvals`
    - `escalations`
    - `morning_reviews`
    - `board_decisions`

## Default Lane Model

The default autonomous loop uses four lanes:

1. `planning`
2. `implementation`
3. `verification`
4. `governance`

Canonical handoff chain:

1. `planning -> implementation` on `scope_ready`
2. `implementation -> verification` on `artifact_ready`
3. `verification -> governance` on `qa_report_ready`
4. `governance -> planning` on `decision_published`

## Workload Topology Baseline

The contract includes a representative multi-machine topology:

- `gpu_primary`: generation-focused execution node
- `gpu_secondary`: vision QA/tagging node
- `operator_laptop`: review/control node

This keeps routing semantics aligned with the root on-prem operation scenario.

## Safety and Governance

Safety profiles are lane-aware:

- `safe_auto`: autonomous non-destructive execution (`read`, `non_destructive_write`, `test`)
- `approval_guarded`: approval-gated actions (`deployment`, `destructive_command`, `new_external_mcp`)

Blocked tasks must include explicit blocker metadata and follow escalation routing by role/time.

## Generator Integration

`tools/generate_preset.py` now seeds runtime state and contract artifacts for:

- `minimal_company`
- `delivery_team`
- `research_rd`

Indexer roots include `runtime` so queue/lane/governance state can be indexed as first-class operational memory.

## Wave E Fixture and Wave F Gap

**Wave E evidence:** `MUSU-WORKS/work/wave_e_routing_evidence.json` provides a simulation-based proof of the dual-GPU workload routing contract. It expresses two simulated workers (`gpu_primary` as `codex_local`, `gpu_secondary` as `claude_local`), task-type-based workload split, handoff triggers (`artifact_ready`, `qa_report_ready`), and blocker entries for capacity limits and hardware absence.

This fixture validates the routing *contract* — the schema, trigger conditions, and blocker surface — without requiring physical hardware.

**Wave F gap (hardware-blocked):** Physical multi-node deployment cannot be verified until dedicated GPU hardware nodes are provisioned (tracked as MUS-437, hardware-blocked). Wave F will re-run the same routing evidence path against real `gpu_primary` and `gpu_secondary` nodes, proving actual GPU-to-GPU latency, physical isolation, and network-level handoff reliability. The Wave E fixture is proxy evidence only and does not substitute for Wave F production proof.
