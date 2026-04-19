# MUSU Master Plan — Phase 19 (4-Track)

> 작성: 2026-04-19 | 상태: ACTIVE
> Phase 18 완료 기준 (commit `20377b9a`) → 다음 단계

---

## 현재 상태 체크포인트

| 레이어 | 상태 |
|--------|------|
| musu-core (SQLite) | ✅ v9 migration, goals/projects CRUD, 76 tests pass |
| musu-bridge (FastAPI, 35 MCP endpoints) | ✅ 완성 |
| musu-control (MCP 서버, 35 tools) | ✅ 완성 |
| musu-port (WebSocket proxy) | ✅ running |
| musu-bee (Next.js UI) | ✅ GoalsPanel + SearchPanel + 5개 company 채널 |
| musu-connects (QUIC P2P) | ✅ daemon + mDNS→SyncOrchestrator |
| musu.pro (vibecode-town) | ✅ node_tokens + nodes API + account page 토큰 발급 UI |

---

## 4-Track 구조

각 트랙은 독립 세션에서 실행. 세션 시작 시 해당 트랙 세부 플랜 작성.

```
Track A: MCP Smoke Test          ── P0, ~1h
Track B: MUSU_TOKEN 활성화        ── P1, ~2h
Track C: Plan 232 Workspace      ── P1, ~3h
Track D: 제품 피벗                ── 피벗, ~4h
```

의존관계: Track B → Track D의 E2E cloud 검증 (D의 나머지는 독립)

---

## Track A — MCP 35도구 Smoke Test

**목표**: musu-control 35개 MCP 도구가 musu-bridge와 실제로 연동되는지 전수 확인

**범위**:
- musu-bridge 서버 실행 상태에서 musu-control 경유 각 도구 호출
- 200 응답 + 기대 포맷 반환 확인
- 실패 도구 목록화 → 즉시 픽스 또는 P1 이슈 등록

**성공 기준**: 35/35 도구 non-5xx 응답

**세부 플랜 파일**: `plans/TRACK_A_MCP_SMOKE_TEST.md` (세션 시작 시 작성)

---

## Track B — MUSU_TOKEN 활성화 + peer-status 실동작

**목표**: musu-bridge가 musu.pro 클라우드 레지스트리에 하트비트를 전송하고, peer-status 엔드포인트에서 `cloud_registry_enabled: true` 확인

**현재 infra (이미 구현됨)**:
- vibecode-town: `node_tokens.repo.ts`, `nodes.repo.ts`, `nodes.service.ts`, `/api/v1/nodes/register`, Account 페이지 토큰 발급 UI
- musu-bridge: `registry.py` heartbeat_loop, MUSU_TOKEN config 필드, `/api/admin/peer-status`

**작업**:
1. musu.pro/account 접속 → 토큰 발급
2. musu-bridge `.env.local`에 `MUSU_TOKEN=<token>` 설정
3. musu-bridge 재시작 → heartbeat 로그 확인
4. `GET /api/admin/peer-status` → `cloud_registry_enabled: true` 확인
5. 원격 노드(hugh-main-1)에도 동일 설정 → peer 목록에 표시 확인

**성공 기준**: 두 노드 모두 musu.pro 레지스트리에 등록, peer-status에서 서로 보임

**잠재 블로커**: musu.pro nodes API Supabase 마이그레이션 실제 적용 여부 확인 필요

**세부 플랜 파일**: `plans/TRACK_B_MUSU_TOKEN.md`

---

## Track C — Plan 232 Workspace Registry Followthrough

**목표**: 선택된 company가 musu-bridge에 백업되어 다른 연결 클라이언트에서도 동일한 active company를 볼 수 있도록, 그리고 app action 전파 완성

**현재 상태 (코드 분석 기반)**:
- `useCompanyState` 훅이 `handleSelectActiveCompany` → PATCH `/api/company-activation` 이미 구현
- URL sync (`?company=<id>`) 이미 있음 → 새로고침 시 URL로 복원 가능
- 단, `/api/company-activation`이 Next.js API 레이어에만 persist됨 → musu-bridge에 전파 없음
- 다른 클라이언트(원격 노드의 musu-bee)에서 같은 company 선택을 볼 수 없음

**갭**:
1. musu-bridge에 `workspace.active_company` 백업 엔드포인트 없음
2. company 선택 변경 시 musu-bridge를 통한 app action(예: 에이전트 context 스위치) 전파 없음

**작업**:
1. musu-bridge에 `GET/PUT /api/workspace` 엔드포인트 추가 (active_company_id 저장)
2. `handleSelectActiveCompany`에서 musu-bridge workspace PUT 호출 추가
3. 에이전트 채널의 system context에 active company 반영 확인
4. 원격 노드에서 같은 company가 보이는지 E2E 확인

**성공 기준**: company 선택이 musu-bridge에 persist, 다른 클라이언트에서 같은 active company 조회 가능

**세부 플랜 파일**: `plans/TRACK_C_WORKSPACE_REGISTRY.md`

---

## Track D — 제품 피벗

**목표 1 — Hero 카피 재작성**

타겟: 자동화 머니메이커 (드랍쉬핑/채굴/봇 다중 기기 운영자)
현재 Hero: AI 안전/enforcement 테마 → 바꿔야 함
방향: "컴퓨터 N대, 화면 1개"

파일: `/mnt/f/Aisaak/Projects/vibecode-town/src/app/page.tsx`

**작업**:
1. branding/voice.md → narrative.md → examples.md → platforms.md 순서로 읽기 (필수)
2. Hero headline + subhead + CTA 재작성
3. 불필요한 기술 용어(HMAC, QUIC, STRIDE) 제거 또는 하위 섹션으로 이동
4. 카피 유저 승인 후 푸시

**목표 2 — 핵심 E2E 플로우 확인**

"노트북 → 데스크탑 2대 보임 → 자동화 관리 가능한가?"

두 경로:
- Local (mDNS): `musu-connectsd daemon --mdns` 실행 → musu-bee NodePanel에 노드 표시 확인
- Cloud (MUSU_TOKEN): Track B 완료 후 → 두 노드가 peer-status로 서로 발견

**성공 기준**: musu-bee에서 2개 노드 표시 + 한쪽에서 다른쪽 프로세스 시작/중지 가능

**세부 플랜 파일**: `plans/TRACK_D_PRODUCT_PIVOT.md`

---

## 실행 순서 (권장)

```
세션 1: Track A (MCP smoke test, 빠름) + Track B (MUSU_TOKEN 검증)
세션 2: Track C (Workspace Registry, musu-bee 집중)
세션 3: Track D (제품 피벗, vibecode-town + E2E)
```

Track A + B는 같은 세션에 묶을 수 있음 (B가 env 설정이라 짧음).

---

## 관련 파일

- musu-bridge: `musu-bridge/server.py`, `musu-bridge/registry.py`, `musu-bridge/config.py`
- musu-bee: `musu-bee/src/components/AppShell.tsx`, `musu-bee/src/components/CompanyPanel.tsx`
- musu-control: `musu-control/` (MCP 35 tools)
- vibecode-town: `src/app/page.tsx`, `src/app/account/`, `src/lib/services/nodes.service.ts`
- 이전 Phase 7 플랜: `musu-functions/plans/PHASE7_NODE_REGISTRY_2026-04-15.md`
