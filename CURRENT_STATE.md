# musu-functions Current State

Last updated: `2026-04-09` (KST)

## 현재 위치

- `musu-functions`는 새 MUSU 제품 코드베이스다.
- `musu_corp`는 이 제품을 실제로 운영/도그푸딩하는 회사 인스턴스다.
- 따라서 현재 단계는 “회사를 더 만든다”가 아니라, “회사에서 검증된 기능을 제품 capability로 환원한다” 쪽으로 넘어가고 있다.

## 현재 코드 상황

- `musu-port`
  - local control-plane baseline이 상당 부분 올라와 있다.
  - 현재 루트에서 가장 구현 밀도가 높은 모듈이다.
- `musu-connects`
  - Rust workspace와 domain/application baseline이 있다.
  - QUIC pair/control, discovery/route sync baseline이 있다.
  - daemon에 live harness 명령이 추가되어 `musu-port /routes -> peer-aware imported route snapshot` proof JSON을 생성할 수 있다.
  - canonical harness: `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh`
  - latest positive artifact: `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-live-proof.json`
  - latest blocked artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-blocked-peer/musu-connects-live-proof.json`
  - latest unverified artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-unverified-peer/musu-connects-live-proof.json`
  - latest positive runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-runtime-transport-evidence.json`
  - latest blocked-peer runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-blocked-peer/musu-connects-runtime-transport-evidence.json`
  - latest unverified runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-unverified-peer/musu-connects-runtime-transport-evidence.json`
  - replay commands:
    - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh`
    - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario unverified-peer`
    - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario blocked-peer`
  - proof artifact에는 `trustLevel`, `discoveryState`, `trustGateReason`, `importDecisionReason`, `transportEvidenceKind`, `sessionEvidenceMode`, `sessionRemoteAddrSource`가 포함된다.
  - runtime evidence artifact는 `effectiveTransportEvidenceKind`를 canonical field로 사용하고, `transportEvidenceKind`는 canonical alias로 정렬됐다.
  - 이전 runtime-constant 의미는 `legacyRuntimeTransportEvidenceKind`로 분리되어 scenario truth와 분리된다.
  - `trustGateReason`은 peer trust/discovery verdict만, `importDecisionReason`은 alias/stale merge reason만 표현하도록 분리됐다.
  - verified session evidence는 `runtime-musu-port-http-route-plane-v1`, `sessionEvidenceMode=runtime-peer-authenticated`로 기록하고, unverified/blocked는 trust-gate suppression(`sessionEvidenceMode=not-generated`)으로 기록한다.
- `MUSU-CRT`
  - canonical harness와 remote session baseline이 있다.
  - 하지만 최종 제품 의미의 live integrated remote surface는 아직 아니다.
  - wave-2 one-flow integration harness:
    - `/home/hugh51/musu-functions/scripts/mus55-operator-oneflow-harness.sh`
  - latest wave-2 one-flow artifacts (context id: `mus55-cafe-laptop-20260403T064500Z`):
    - `/home/hugh51/musu-functions/work/mus55-operator-oneflow/mus55-operator-oneflow-manifest.json`
    - `/home/hugh51/musu-functions/work/mus55-operator-oneflow/operator-context-success.json`
    - `/home/hugh51/musu-functions/work/mus55-operator-oneflow/operator-context-failure.json`
  - MUS-58 coherence replay command: `node /home/hugh51/musu-functions/MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs`
  - MUS-58 matrix artifacts:
    - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/trusted_fresh.operator-view.json`
    - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/degraded.operator-view.json`
    - `/home/hugh51/musu-functions/work/mus28-crt-qa-states/stale_withdrawn.operator-view.json`
  - lane-3 smoke replay command: `/home/hugh51/musu-functions/scripts/mus28-crt-remote-smoke.sh`
  - wave-2 one-flow replay command:
    - `cd /home/hugh51/musu-functions && ./scripts/mus55-operator-oneflow-harness.sh --context-id mus55-cafe-laptop-20260403T064500Z`
  - lane-3 smoke artifacts:
    - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/summary.json`
    - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/operator-view.json`
    - `/home/hugh51/musu-functions/work/mus28-crt-remote-smoke/mus28-crt-remote-smoke-manifest.json`
  - coherence proof note:
    - `/home/hugh51/musu-functions/MUSU-CRT/MUS58_REMOTE_SESSION_HEALTH_COHERENCE_PROOF_2026-04-03.md`
- `MUSU-AS-MCP`
  - self-MCP canonical surface가 별도 workspace에 있다.
- `MUSU-WORKS`
  - 회사/프로젝트/에이전트/메모리/preset baseline이 있다.
  - runtime contract(`queue/lane/worker/handoff/blocker/governance`) seed가 preset 생성기에 반영됐다.
  - lane별 safety profile과 blocker escalation chain이 contract로 고정됐다.
- `musu_corp`
  - queue, watchdog, supervisor, approval/escalation, morning review, Codex/BitNet workforce split까지 도그푸딩이 진행됐다.
 - toolchain
  - 현재 기본 PATH에서는 `/usr/bin/cargo` (`1.75.0`)가 잡혀 `Cargo.lock` v4를 읽지 못한다.
  - `PATH=\"/home/hugh51/.cargo/bin:$PATH\"`로 pinned toolchain(`cargo 1.91.1`)을 쓰면 `musu-connects`/`musu-port` 검증은 통과한다.
  - 즉 build 검증은 가능하지만, routine/runtime 기본 PATH normalization은 여전히 별도 운영 항목이다.
  - canonical lane-1 shim은 `/home/hugh51/musu-functions/scripts/linux-rust-env.sh`다.
  - canonical lane-1 verifier는 `/home/hugh51/musu-functions/scripts/verify-wave0-lane1.sh`다.
  - 현재 기준 verifier summary는 `pass=8 fail=0 info=1`이다.

## 인덱싱 상태

- code index:
  - repo id: `local/musu-functions-35ec71f9`
  - scope: product code 중심 재인덱싱
  - result: `~257 files`, `2816 symbols` (incremental)
  - ignore: `**/references/**`, `**/work/**`, `**/target/**`, `**/.git/**`, `**/node_modules/**`, `**/__pycache__/**`
- docs index:
  - repo id: `local/musu-functions`
  - scope: Markdown 중심 재인덱싱
  - result: `~443 markdown files`, `4310 sections` (incremental)
  - ignore: `**/references/**`, `**/work/**`, `**/target/**`, `**/.git/**`, `**/node_modules/**`, `**/__pycache__/**`, `**/*.json`, `**/*.html`, `**/*.txt`

## 현재 판단

- 지금 `musu_corp`에 많이 들어가 있는 회사 기능은 장기적으로 `musu-functions` 안에 다시 나뉘어 있어야 한다.
- 즉 `musu_corp`는 회사 인스턴스이고,
- `musu-functions`가 원래 MUSU 제품 기능의 최종 위치다.
- control surface는 루트 product control layer 후보로 읽는 것이 맞다.
- Codex / BitNet workforce plane은 루트 runtime capability 후보로 읽는 것이 맞다.
- company runtime contract / governance surface는 `MUSU-WORKS` ownership 후보로 읽는 것이 맞다.
- root product control layer와 root runtime capability의 구조 문서가 추가됐다.
- 루트 ownership을 각 모듈 backlog로 연결하는 execution sequence 문서가 추가됐다.
- `MUSU-WORKS`는 company runtime contract shortlist를 정리하는 단계로 넘어갔다.
- 회사 전략, 제품 전략, 수익 모델, 실행 전략 문서가 추가됐다.
- 지금의 대표 완성 목표는 `musu-computer-tools` 단일 capability가 아니다.
- 지금 목적은 `musu-functions` 전체를 "여러 개인 컴퓨터를 하나의 보호된 on-prem AI operation으로 묶는 시스템"으로 닫는 것이다.
- 즉 사용자 시나리오는 "카페 노트북 -> 집 GPU 데스크탑 2대 -> 실시간 화면 공유/작업물 확인/역할 분담 실행"이다.
- 이 정의에서 핵심 축은 `musu-port + musu-connects + MUSU-CRT + MUSU-WORKS`다.

## 2026-04-09 CEO Operating Model Truth (live)

- source of truth는 live Paperclip API와 루트 문서 3종이다.
- `CEO` (`5dffee24-ee3f-4b75-89c8-11608fe7e186`)는 현재 `running` 상태다.
- `adapterConfig.cwd=/home/hugh51/musu-functions`
- `lastHeartbeatAt`: `2026-04-08T17:00:32.671Z`
- CEO instructions bundle은 충분히 강하다.
  - active issue 점검
  - error-state agent 점검
  - active issue가 없으면 board를 읽고 새 issue 생성
- runtime normalization은 완료됐다.
  - `runtimeConfig.heartbeat.enabled=true`
  - `runtimeConfig.heartbeat.cooldownSec=10`
  - `runtimeConfig.heartbeat.intervalSec=3600`
  - `runtimeConfig.heartbeat.wakeOnDemand=true`
  - `runtimeConfig.heartbeat.maxConcurrentRuns=1`
- 현재 root program의 가장 큰 갭은 "무엇을 해야 하는지"가 아니라 "blocked/hard-decision을 증거 패킷으로 바꾸는 방법"이다.
  - `Paddle credential evidence`
  - `5070Ti SSH/manual status proof`
  - `run-linkage repair + QA G2 verification`
- 현재 org 리스크: `Founding Engineer`는 현재 `running`으로 관측됨(2026-04-09, Paperclip `/api/companies/{cid}/agents` 기준). “error-state agent”는 계속 감시 대상.

### 이번 세션에서 추가된 unblock 자산

- blocked/high 7 재패킷팅 문서: `/home/hugh51/musu-functions/plans/70_paperclip_unblock_pack_2026-04-09.md`
- Paperclip plan 문서 동기화 스크립트: `/home/hugh51/musu-functions/scripts/paperclip_put_unblock_plans_2026-04-09.sh`
- 제품 SSOT 문서 선반(인덱스): `/home/hugh51/musu-functions/docs/PRODUCT_CHARTER/README.md`
- “채팅은 코어가 아니라 원격 Web GUI surface” 노트 + SSOT 반영:
  - note: `/home/hugh51/musu-functions/docs/NOTE_2026-04-09_chat_is_web_gui_not_core.md`
  - updated SSOT: `/home/hugh51/musu-functions/PRODUCT_VISION.md`, `/home/hugh51/musu-functions/PRODUCT_STRATEGY.md`, `/home/hugh51/musu-functions/PRODUCT_CONTROL_SURFACE_MAP.md`, `/home/hugh51/musu-functions/MUSU_BLUEPRINT.md`
- MUSU system optimization/guardrails master plan: `/home/hugh51/musu-functions/plans/78_musu_system_optimization_master_plan_2026-04-09.md`
  - worker concurrency cap: `/home/hugh51/musu-functions/plans/79_worker_concurrency_cap_detail_plan_2026-04-09.md`
  - systemd/cgroup guardrails: `/home/hugh51/musu-functions/plans/80_systemd_cgroup_guardrails_detail_2026-04-09.md`
  - disk hygiene cleanup: `/home/hugh51/musu-functions/plans/81_disk_hygiene_cleanup_detail_2026-04-09.md`
  - observability minimum plan: `/home/hugh51/musu-functions/plans/82_observability_and_profiling_minimum_2026-04-09.md`
  - qualitative eval + code audit: `/home/hugh51/musu-functions/docs/REPORT_2026-04-09_guardrails_qualitative_eval_and_code_audit.md`
  - implementation:
    - `musu-worker` rate limit/output caps + concurrency cap(+`GET /stats`): `/home/hugh51/musu-functions/musu-worker/src/musu_worker/main.py`
    - systemd user service install: `/home/hugh51/musu-functions/scripts/install-musu-worker-user-service.sh`
    - cleanup command + optional timer: `/home/hugh51/musu-functions/scripts/musu_cleanup.py`, `/home/hugh51/musu-functions/scripts/install-musu-cleanup-user-timer.sh`
- lightweight control plane follow-up (CEO handoff only; no implementation in this packet):
  - master execution packet: `/home/hugh51/musu-functions/plans/83_lightweight_control_plane_execution_master_2026-04-09.md`
  - idle budget / heavy-work blacklist: `/home/hugh51/musu-functions/plans/84_idle_budget_and_heavy_work_blacklist_2026-04-09.md`
  - event-driven refresh / sampling: `/home/hugh51/musu-functions/plans/85_event_driven_refresh_and_sampling_2026-04-09.md`
  - core/worker/UI/diagnostics boundary enforcement: `/home/hugh51/musu-functions/plans/86_core_worker_ui_boundary_enforcement_2026-04-09.md`

## 남은 작업 리스트

Snapshot: `2026-04-03 21:21 KST` (historical; “현재”는 아래 Paperclip live snapshot 참고)

1. Closed baseline
   - `MUS-145`(Wave A), `MUS-147`(Wave B), `MUS-148`(Wave C main), `MUS-149`(Wave D), `MUS-157/158/159/163` are `done`.
   - Wave B canonical packet: `/home/hugh51/musu-functions/musu-port/OPERATOR_INGRESS_ACCEPTANCE.md`
2. Active hardening lanes
   - `MUS-162` and `MUS-172` are now `done`.
3. Wave E lanes
   - parent `MUS-150` remains `backlog` (owner: `Chief of Staff`).
   - child `MUS-173` and `MUS-174` are `done`.
4. Wave F lane
   - `MUS-151` stays `backlog` (owner: `QA Lead`) and remains parked.
5. Parallel ops hygiene (`MUS-146`)
   - active anomaly count is currently `0` (root backlog/done + active mismatch 없음).
   - latest aligned run is `MUS-146` (`9a780f36...`, `running`).
   - `MUS-150` comment wake로 생긴 queued recurrence는 same-window cancel로 정리했다.
   - status-first sequencing은 유지하며 recurrence clearance를 우선 처리한다.
   - residual debt: heartbeat projection에서 `issueId=null` + `contextSnapshot.issueId` linkage 혼재.
6. Parent packet sync (`MUS-144`)
  - parent owner: `CEO 2`
  - parent execution contract plan: `/home/hugh51/musu-functions/plans/39_root_program_continuation_parent_execution_contract_2026-04-03.md`
  - latest live sync packet: `/home/hugh51/musu-functions/plans/64_root_program_live_sync_2026-04-03.md`

## 즉시 다음 단계

1. 루트 master plan을 현재 completion scope 기준으로 유지한다.
2. `MUS-150` parent를 backlog 상태에서 실행 상태로 올릴지 여부를 조건부로 결정한다.
3. `MUS-151`는 Wave E gate close 전까지 backlog로 유지한다.
4. `MUS-146`에서 recurrence guard(특히 backlog issue comment wake) + unblock note 루프를 유지한다.

## 자율운영 상태

- Paperclip control plane health (2026-04-09):
  - `http://127.0.0.1:3100/api/health` → `status=ok`, `version=0.3.1`, `deploymentMode=local_trusted`, `deploymentExposure=private`
- Paperclip live counts (2026-04-09, `companyId=f27a9bd2-688a-450b-98b4-f63d24b0ab50`, `limit=500`):
  - issues total: `344`
  - issues status: `backlog=2`, `todo=2`, `in_progress=7`, `blocked=13`, `done=299`, `cancelled=21`
  - agents total: `5` (status: `running=3`, `idle=2`)
- 운영 원칙:
  - run id는 burst window에서 수분 단위로 회전하므로 status-class 기준으로 운영한다.
  - heartbeat-runs에는 `issueId` 대신 `contextSnapshot.issueId`로 issue linkage가 관측되는 projection debt가 남아 있다.
