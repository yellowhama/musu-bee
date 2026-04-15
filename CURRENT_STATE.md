# musu-functions Current State

Last updated: `2026-04-15 KST (Wave 5 — Phase 17R 이후)`

## 현재 위치

- `musu-functions`는 새 MUSU 제품 코드베이스다.
- `musu_corp`는 이 제품을 실제로 운영/도그푸딩하는 회사 인스턴스다.
- 따라서 현재 단계는 “회사를 더 만든다”가 아니라, “회사에서 검증된 기능을 제품 capability로 환원한다” 쪽으로 넘어가고 있다.

## 현재 코드 상황

- **Wave 5 (2026-04-15) — Phase 17R 이후 미커밋 변경사항 (66 tracked files, +7211/-1692):**
  - `musu-bee`: Stripe → Paddle 완전 마이그레이션 완료 (stripe.ts 삭제, webhooks/stripe/ 삭제, paddle handler 강화)
  - `musu-bee`: chatRateLimit.ts 보안 강화 — IP 정규화, 신뢰/비신뢰 버킷 분리, malformed 입력 차단
  - `musu-bee`: auth 영어화 완료 (login/signup/callback), OAuthButtons 추가, divider "or use email"
  - `musu-bee`: OnboardingModal 전체 영어화 — UI 언어 Korean → English 진행 완료
  - `musu-bee`: companyScope.ts 신규 (스코프 분리), companySetup.ts 간결화
  - `musu-connects`: tailscale-quic-server / tailscale-quic-client 명령 추가 (+608 lines)
    - Tailscale 네트워크 QUIC ping/pong latency proof (p50/p95 측정)
    - 하드코딩 테스트 인증서 (HARNESS_CERT_PEM/KEY) — localhost SAN, 테스트 전용
  - `musu-control`: run-issue link mismatch 정책 테스트 2개 신규, issueId 전파 수정
  - `musu-port`: channel_hub queue_depth() 추가, health 필드 검증 강화 (cpu/ram/gpu), peer_urls 초기화
  - `musu-indexer`: core.py +18 lines 개선
  - `musu-worker`: test_security_hardening 보강
  - 인덱싱: musu-indexer sync 완료 (scanned 70221, changed 5051, duration 2833s)
  - 감사: `CODE_AUDIT_2026-04-15.md` 작성 — 전 모듈 Pass, 주의사항 2개 (테스트 인증서, 임시 파일)

- `musu-bee`
  - **Wave 2 (2026-04-13) — 전부 구현 완료, tsc + next build 클린:**
    - `src/lib/tasks.ts` + `GET/POST/PATCH/DELETE /api/tasks` — SQLite task queue (node:sqlite DatabaseSync)
    - `src/lib/useChat.ts` — `/task`, `/tasks`, `/done`, `/block`, `/approve`, `/reject`, `@route`, `/learn`, `@wiki` 커맨드
    - `src/app/api/chat/stream/route.ts` — Claude CLI SSE 스트리밍 (`GET /api/chat/stream?message=...`)
    - `src/lib/useAgentsSurface.ts` — bossHost 변경 감지 → `onHandoff(newBoss)` 콜백
    - `src/app/page.tsx` — 7섹션 랜딩 (Hero/Pain/Features/How/Trust/Pricing/CTA), CSS vars 100%
    - `src/app/api/mcp/route.ts` + `public/.well-known/mcp.json` — JSON-RPC 2.0 MCP Layer B (6 tools)
    - `src/app/api/route/route.ts` — musu-port `/handoff/route` 프록시
    - `src/app/api/device-status/route.ts` — `recommended_for` 힌트 추가
  - **Wave 4 (2026-04-13) — 서비스 기동 + 코드 품질 + 마크다운 렌더링:**
    - `scripts/dev-start.sh` — `musu-portd` 사전 빌드 바이너리 직접 실행 (`cargo run` → `./target/release/musu-portd`)
    - `src/lib/chatCommands/` (신규 디렉터리, 7개 파일) — useChat.ts에서 커맨드 핸들러 분리
      - `types.ts` — `CommandContext` 인터페이스
      - `utils.ts` — `makeId()` 공유 유틸
      - `handleTaskCommand.ts` — `/task /tasks /done /block`
      - `handleApprovalCommand.ts` — `/approve /reject`
      - `handleRouteCommand.ts` — `@route`
      - `handleWikiCommand.ts` — `/learn @wiki` (setIsAgentTyping deps 버그 픽스)
      - `handleRunCommand.ts` — `/run --device` (setIsAgentTyping deps 버그 픽스)
      - `index.ts` — 전체 export
    - `src/lib/useChat.ts` — 832줄 → 327줄 (핸들러 오케스트레이터만 유지, tsc + next build 클린)
    - `src/components/ChatArea.tsx` — 인라인 마크다운 렌더러 추가 (라이브러리 0개)
      - ` ``` ` 코드블록 → `<pre><code>` (어두운 배경)
      - `` ` `` 인라인 코드 → `<code>` (보라색 monospace)
      - `**bold**` → `<strong>`
      - AI/worker 메시지에만 적용, 유저 메시지는 plain text 유지
  - **Wave 3 (2026-04-13) — 실서비스 연결:**
    - `musu_send_message` 수정 — musu-bridge `/api/route` 경유 (이전: musu-port `/chat/send` 404)
    - `/run <command>` 커맨드 — musu-worker `/execute/cli` 호출, stdout 코드블록 출력
    - `/task` 생성 시 `/api/route` 자동 호출 → `assigned_device` SQLite 저장
    - `scripts/dev-start.sh` + `scripts/check-services.sh` — 전체 스택 통합 시작 스크립트
    - `src/lib/useServiceHealth.ts` + `/api/service-health` — 5초마다 PORT/BRIDGE/WORKER 상태 폴링
    - `src/components/AppShell.tsx` — 헤더에 서비스 상태 뱃지 (● PORT ● BRIDGE ● WORKER)
    - `src/components/ChatArea.tsx` — `[APPROVAL_REQUIRED]` 메시지 → 승인/거부 버튼 카드 UI
    - `.env.local.example` — Wave 2~3 신규 env vars 추가 (MUSU_BRIDGE_URL, MUSU_WORKER_URL, CLAUDE_CLI_PATH 등)
  - default company operating template is now extracted into product code as a canonical baseline.
  - API surface now exposes `GET /api/company-template`.
  - the current app shell sidebar renders the default company template summary.
  - company setup persistence is now scoped by `workspaceId` + `userKey`.
  - app API now exposes `GET/PUT /api/company-setup` with scoped draft persistence.
  - app API now exposes `GET/POST/PATCH/DELETE /api/company-activation` for company registry management.
  - one scope can now hold multiple companies with one active company.
  - the company template modal now supports:
    - `Save company setup`
    - `Apply template`
    - `Set active`
    - `Sync`
    - `Delete`
  - the top bar now exposes Paperclip sync status from the current active company.
  - sync history is persisted per company and Paperclip writeback is attempted when configured.
  - template contract CI now exists via `.github/workflows/company-template-contract.yml`.
  - OAuth login/signup buttons are present on public auth screens.
  - current template-wave TypeScript blockers in `chat` route and `auth/callback` were cleared.

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
  - result: `changed=9`, `new=28`, `deleted=4`, `2780 symbols` (incremental, refreshed 2026-04-09 22:28 KST)
  - ignore: `**/references/**`, `**/work/**`, `**/target/**`, `**/.git/**`, `**/node_modules/**`, `**/__pycache__/**`
- docs index:
  - repo id: `local/musu-functions`
  - scope: Markdown 중심 재인덱싱
  - result: `changed=3`, `new=0`, `deleted=0`, `4058 sections` (incremental, refreshed 2026-04-09 22:31 KST)
  - ignore: `**/references/**`, `**/work/**`, `**/target/**`, `**/.git/**`, `**/node_modules/**`, `**/__pycache__/**`, `**/*.json`, `**/*.html`, `**/*.txt`

## 2026-04-12 Company Scope + Sync Hardening

- `AppShell` no longer hardcodes `default-workspace` as the primary company scope.
- company scope is now derived from:
  - URL query hints (`workspace`, `workspaceId`)
  - future route workspace slug support (`/workspaces/:slug`)
  - authenticated user identity fallback
- active company context now propagates through:
  - top bar identity + workspace badge
  - sidebar active-company summary
  - chat header/product context
- company registry delete is now a confirm step instead of a single destructive click.
- Paperclip sync contract is now MUSU-specific and stores:
  - Paperclip issue id
  - Paperclip comment id
  - product sync metadata for `/app` company-registry activation
- validation passed with direct local binaries:
  - `node node_modules/tsx/dist/cli.mjs --test src/lib/companyScope.test.ts src/lib/controlPlaneSync.test.ts src/app/api/company-template/route.test.ts src/app/api/company-setup/route.test.ts src/app/api/company-activation/route.test.ts src/app/api/chat/route.test.ts`
  - `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --pretty false`

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
  - CTO approval: `/home/hugh51/musu-functions/plans/87_cto_lcp_approval_2026-04-09.md`
  - live delegation issues created under root project:
    - `MUS-1227` (`4b603b89-4fdf-4dca-81dc-99bd4b4e30a5`) — idle budget + heavy-work blacklist
    - `MUS-1228` (`025f0862-c48c-40c8-9ab5-5d531f8e57bc`) — polling inventory + event-driven refresh
    - `MUS-1229` (`74504b4a-758d-472f-94ba-42461a6476b1`) — core/worker/UI boundary enforcement
  - current audit / next-step docs:
    - `/home/hugh51/musu-functions/docs/REPORT_2026-04-09_lightweight_control_plane_followup_qualitative_eval_and_code_audit.md`
    - `/home/hugh51/musu-functions/docs/NEXT_STEPS_2026-04-09_lightweight_control_plane_followup.md`
  - operational recovery note:
    - local Paperclip board was briefly down due to a syntax error in the local `references_AI/paperclip-main` workspace; the local board was recovered and issue creation resumed.

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
  - issues total: `355`
  - issues status: `backlog=3`, `todo=6`, `in_progress=9`, `blocked=12`, `done=304`, `cancelled=21`
  - dashboard tasks: `open=41`, `inProgress=10`, `blocked=15`, `done=329`
  - agents total: `5` (status: `running=4`, `idle=1`)
- 운영 원칙:
  - run id는 burst window에서 수분 단위로 회전하므로 status-class 기준으로 운영한다.
  - heartbeat-runs에는 `issueId` 대신 `contextSnapshot.issueId`로 issue linkage가 관측되는 projection debt가 남아 있다.
