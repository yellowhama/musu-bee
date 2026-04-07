# MUSU-WORKS TODO Execution Board

## 원칙

- 한 번에 하나의 active objective만 진행한다.
- 각 todo는 문서 산출물 또는 mock 산출물을 반드시 남긴다.
- 원본 코드에 backport 하기 전 `MUSU-WORKS`에서 canonical contract를 먼저 고정한다.

## 현재 상태

- `PLAN_01` 회사 domain model: 완료
- `PLAN_02` persistence schema draft: 완료
- `PLAN_03` UI information architecture: 완료
- `PLAN_04` MCP surface draft: 완료
- `PLAN_05` canonical mock implementation: 완료
- `PLAN_06` original app backport: 완료
- `PLAN_07` read-only company viewer: 완료
- `PLAN_08` agent role templates: 완료
- `PLAN_09` project agent attachment/session model: 완료
- `PLAN_10` role and session aware mocks: 완료
- `PLAN_11` execution-aware root viewer: 거의 완료
- `PLAN_16` scaffolding preset contract: 완료
- `PLAN_17` scaffolding preset mocks: 완료
- `PLAN_18` preset generator implementation: 완료
- `PLAN_19` indexer memory wiring: 완료
- final touch: 완료 초안
- reference intake: 완료

## Todo List

### In Progress

1. company runtime productization
   - 산출물: company runtime productization map / PLAN_20 / contract shortlist
   - 목적: `musu_corp`에서 검증된 queue/lane/approval/review를 `MUSU-WORKS` contract 후보로 고정
2. company runtime contract shortlist
   - 산출물: queue item / lane state / worker result / handoff / governance shortlist
   - 목적: `MUSU-WORKS`가 직접 소유할 runtime/govnernance object를 명확히 한다
3. governance review read-model refinement
   - 산출물: approval/escalation/morning review/board decision read model note
   - 목적: works owner surface를 viewer/MCP consumer로 연결할 준비를 한다

### Queued

4. root viewer visual confirmation
   - 산출물: browser 확인 또는 screenshot evidence
   - 목적: PLAN_11 완전 종료
5. original app visual/runtime parity evidence
   - 산출물: final parity evidence
   - 목적: runtime truth와 canonical docs 차이 마감
6. final parity and backlog
   - 산출물: final touch closure
   - 목적: canonical docs와 runtime truth 차이 정리

## Done

1. 회사/프로젝트 domain model baseline
   - [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
   - [plans/PLAN_01_COMPANY_DOMAIN_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_01_COMPANY_DOMAIN_MODEL.md)
2. persistence schema draft
   - [PERSISTENCE_SCHEMA_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/PERSISTENCE_SCHEMA_DRAFT.md)
   - [plans/PLAN_02_PERSISTENCE_SCHEMA_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_02_PERSISTENCE_SCHEMA_DRAFT.md)
3. UI information architecture
   - [UI_INFORMATION_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/UI_INFORMATION_ARCHITECTURE.md)
   - [plans/PLAN_03_UI_INFORMATION_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_03_UI_INFORMATION_ARCHITECTURE.md)
4. MCP surface draft
   - [MCP_SURFACE_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/MCP_SURFACE_DRAFT.md)
   - [plans/PLAN_04_MCP_SURFACE_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_04_MCP_SURFACE_DRAFT.md)
5. canonical mock implementation
   - [mock/company_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/company_alpha.json)
   - [mock/org_chart_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/org_chart_alpha.json)
   - [mock/projects_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/projects_alpha.json)
   - [mock/approvals_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/approvals_alpha.json)
   - [mock/mcp_surface_examples.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/mcp_surface_examples.json)
6. original app backport
   - [ORIGINAL_APP_BACKPORT_MAP.md](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_BACKPORT_MAP.md)
   - [plans/PLAN_06_ORIGINAL_APP_BACKPORT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_06_ORIGINAL_APP_BACKPORT.md)
7. final touch
   - [FINAL_TOUCH.md](/home/hugh51/musu-functions/MUSU-WORKS/FINAL_TOUCH.md)
8. reference intake
   - [REFERENCE_INTAKE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/REFERENCE_INTAKE_2026-04-01.md)
9. read-only company viewer
   - [viewer/index.html](/home/hugh51/musu-functions/MUSU-WORKS/viewer/index.html)
   - [viewer/README.md](/home/hugh51/musu-functions/MUSU-WORKS/viewer/README.md)
10. agent role templates
   - [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
   - [plans/PLAN_08_AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_08_AGENT_ROLE_TEMPLATES.md)
11. project agent attachment and session model
   - [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
   - [plans/PLAN_09_PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_09_PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
12. role and session aware mocks
   - [plans/PLAN_10_ROLE_AND_SESSION_AWARE_MOCKS.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_10_ROLE_AND_SESSION_AWARE_MOCKS.md)
13. execution-aware root viewer
   - [plans/PLAN_11_EXECUTION_AWARE_VIEWER.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_11_EXECUTION_AWARE_VIEWER.md)
   - [VIEWER_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/VIEWER_PROOF_2026-04-01.md)
14. schema open question closure
   - [plans/PLAN_12_SCHEMA_OPEN_QUESTION_CLOSURE.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_12_SCHEMA_OPEN_QUESTION_CLOSURE.md)
   - [SCHEMA_DECISION_NOTE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/SCHEMA_DECISION_NOTE_2026-04-01.md)
15. original app runtime proof
   - [plans/PLAN_13_ORIGINAL_APP_RUNTIME_PROOF.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_13_ORIGINAL_APP_RUNTIME_PROOF.md)
   - [ORIGINAL_APP_RUNTIME_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_RUNTIME_PROOF_2026-04-01.md)
16. final parity and backlog
   - [plans/PLAN_14_FINAL_PARITY_AND_BACKLOG.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_14_FINAL_PARITY_AND_BACKLOG.md)
17. backport-ready entity list
   - [BACKPORT_READY_ENTITY_SHORTLIST_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/BACKPORT_READY_ENTITY_SHORTLIST_2026-04-01.md)
18. viewer visual confirmation runbook
   - [VIEWER_VISUAL_CONFIRMATION_RUNBOOK_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/VIEWER_VISUAL_CONFIRMATION_RUNBOOK_2026-04-01.md)
19. final closure status
   - [FINAL_CLOSURE_STATUS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/FINAL_CLOSURE_STATUS_2026-04-01.md)
20. original app final evidence runbook
   - [ORIGINAL_APP_FINAL_EVIDENCE_RUNBOOK_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_FINAL_EVIDENCE_RUNBOOK_2026-04-01.md)
21. scaffolding preset architecture
   - [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md)
22. scaffolding preset contract
   - [plans/PLAN_16_SCAFFOLDING_PRESET_CONTRACT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_16_SCAFFOLDING_PRESET_CONTRACT.md)
23. scaffolding preset mocks
   - [plans/PLAN_17_SCAFFOLDING_PRESET_MOCKS.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_17_SCAFFOLDING_PRESET_MOCKS.md)
   - [PRESET_MOCKS_STATUS_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PRESET_MOCKS_STATUS_2026-04-01.md)
24. preset generator implementation
   - [plans/PLAN_18_PRESET_GENERATOR_IMPLEMENTATION.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_18_PRESET_GENERATOR_IMPLEMENTATION.md)
   - [tools/generate_preset.py](/home/hugh51/musu-functions/MUSU-WORKS/tools/generate_preset.py)
25. indexer memory wiring
   - [plans/PLAN_19_INDEXER_MEMORY_WIRING.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_19_INDEXER_MEMORY_WIRING.md)
   - [INDEXER_MEMORY_WIRING.md](/home/hugh51/musu-functions/MUSU-WORKS/INDEXER_MEMORY_WIRING.md)
26. viewer smoke proof
   - [VIEWER_SMOKE_PROOF_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/VIEWER_SMOKE_PROOF_2026-04-01.md)
27. company runtime productization map
   - [COMPANY_RUNTIME_PRODUCTIZATION_MAP.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_RUNTIME_PRODUCTIZATION_MAP.md)
   - [plans/PLAN_20_COMPANY_RUNTIME_PRODUCTIZATION.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_20_COMPANY_RUNTIME_PRODUCTIZATION.md)
28. company runtime contract shortlist
   - [COMPANY_RUNTIME_CONTRACT_SHORTLIST.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_RUNTIME_CONTRACT_SHORTLIST.md)
   - [plans/PLAN_21_COMPANY_RUNTIME_CONTRACT_SHORTLIST.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_21_COMPANY_RUNTIME_CONTRACT_SHORTLIST.md)
29. autonomous workload routing and safety runtime contract seed
   - [AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md](/home/hugh51/musu-functions/MUSU-WORKS/AUTONOMOUS_WORKLOAD_ROUTING_AND_SAFETY.md)
   - [tools/generate_preset.py](/home/hugh51/musu-functions/MUSU-WORKS/tools/generate_preset.py)
   - [presets/minimal-company-alpha/runtime/contract.json](/home/hugh51/musu-functions/MUSU-WORKS/presets/minimal-company-alpha/runtime/contract.json)
   - [presets/delivery-team-alpha/runtime/contract.json](/home/hugh51/musu-functions/MUSU-WORKS/presets/delivery-team-alpha/runtime/contract.json)
   - [presets/research-rd-alpha/runtime/contract.json](/home/hugh51/musu-functions/MUSU-WORKS/presets/research-rd-alpha/runtime/contract.json)
