# CTO Approval — MUSU Lightweight Control Plane (2026-04-09)

## Approval Verdict: APPROVED

The Master Execution Packet (`plans/83`) and detail plans (`plans/84`, `plans/85`, `plans/86`) for the MUSU Lightweight Control Plane are hereby approved for delegation.

## Architectural Boundary Design (Approved)

The 4-layer model (Core, Worker, UI, Diagnostics) is the correct architectural direction to prevent "capability creep" in the control plane.

1. **Core (Control Plane):** Must remain limited to orchestration, policy enforcement, and metadata state. No heavy runtime (LLM, Indexing, GPU) is permitted here.
2. **Worker (Execution):** The primary home for all high-compute tasks. Must be strictly isolated from the Core's process space where possible.
3. **UI (Surface):** Must operate on sampled or event-driven data. No direct "deep polling" of the worker or core state.
4. **Diagnostics (On-Demand):** Artifacts (proofs, audits, traces) must be generated on-demand and have a defined TTL to prevent disk/memory bloat.

## Acceptance Criteria & Guardrails (Approved)

The following numeric budgets and blacklists must be used for G1/G2 validation:

- **Idle Budget (Plan 84):** Numeric targets for CPU, RAM, and Disk I/O must be verified on baseline hardware.
- **Heavy-Work Blacklist (Plan 84):** Any core-side execution of blacklisted tasks is a G1 FAIL.
- **Polling Inventory (Plan 85):** Every remaining `setInterval` or tick loop must be documented and justified.
- **Boundary Enforcement (Plan 86):** Import/runtime boundaries must be respected. No worker-specific heavy libraries (e.g., `torch`, `transformers`) should be imported in Core modules.

## Delegation Directives

- **Founding Engineer:** Prioritize the **Polling Inventory** (`plans/85`). We need to know where the "hot spots" are before we can optimize them.
- **QA Lead:** Focus on the **Baseline Measurement** (`plans/84`). We need a "before" snapshot to prove the "after" improvement.
- **Chief of Staff:** Ensure all sub-issues in Paperclip are linked to these plans and have clear "Evidence Required" sections based on the "Required Evidence" in `plans/83`.

## CTO Oversight

I will personally review the **4-layer responsibility matrix** and the **Forbidden runtime/import list** before they are finalized as part of the `musu-functions` standards.

## Follow-up note

- This approval does **not** authorize immediate code changes.
- Before implementation, the repo still needs:
  - billing migration closeout in `musu-bee`
  - fallback semantics contract for chat
  - local Paperclip recovery runbook

---
**CTO**
2026-04-09
