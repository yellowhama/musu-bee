# Phase 36 마스터 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**날짜**: 2026-04-22
**이전**: Phase 35 — musu-watchdog P2P Remote Control (완료)

---

## 목표

3개의 독립 기능을 순서대로 완성한다.
각 기능은 자체 세부 플랜 파일을 가진다.

---

## 기능 목록 및 우선순위

| # | 기능 | 예상 시간 | 세부 플랜 파일 | 상태 |
|---|------|----------|--------------|------|
| A | route_executions purge | 30분 | `PLAN_36A_PURGE.md` | 대기 |
| B | Dashboard 에이전트 편집 UI | 2시간 | `PLAN_36B_AGENT_EDIT.md` | 대기 |
| C | Screen 탭 다중 모니터 | 1시간 | `PLAN_36C_SCREEN_MONITORS.md` | 대기 |

**진행 순서: A → B → C** (A가 가장 급함 — OOM 재발 방지)

---

## 기능 A: route_executions Purge

### 문제
`route_executions` 테이블에 failed 레코드 15,619개 누적.
bridge 재시작마다 running 레코드를 재실행 → OOM. 이미 임시 수정했지만 장기 방지책 없음.

### 해결
`LocalBackend`에 `purge_old_executions(days=30)` 함수 추가.
`server.py` startup에서 1회 호출 + sync_engine 주기적 실행.

### 파일
- 수정: `musu-core/src/musu_core/backends/local.py` — purge 함수 추가
- 수정: `musu-bridge/server.py` — startup에서 purge 1회 호출
- 테스트: `musu-core/tests/test_purge.py` (신규)

---

## 기능 B: Dashboard 에이전트 편집 UI

### 문제
AgentGrid는 읽기 전용. 에이전트의 role, model, adapter_type을 musu.pro 대시보드에서 변경 불가.

### 해결
1. musu-bridge: `PATCH /api/agents/{agent_id}` 엔드포인트 추가 (백엔드 이미 존재)
2. vibecode-town: catch-all proxy가 이미 PATCH를 통과시킴 → 추가 라우트 불필요
3. AgentGrid: 클릭 시 인라인 편집 모드 (role, model 드롭다운)

### 파일
- 수정: `musu-bridge/server.py` — PATCH /api/agents/{agent_id} 추가
- 수정: `musu-bridge/handlers.py` — update_agent_fields() 추가
- 수정: `vibecode-town/src/app/dashboard/AgentGrid.tsx` — 인라인 편집 UI
- 테스트: `musu-bridge/tests/test_agent_patch.py` (신규)

---

## 기능 C: Screen 탭 다중 모니터

### 문제
`/api/screen/snapshot`이 `sct.monitors[1]` 고정. 다중 모니터 환경에서 모니터 선택 불가.

### 해결
1. musu-bridge: `GET /api/screen/monitors` 추가 (mss 모니터 목록 반환)
2. musu-bridge: `GET /api/screen/snapshot?monitor=N` 파라미터 추가
3. ScreenClient: 모니터 선택 드롭다운 추가 (노드 선택 옆)

### 파일
- 수정: `musu-bridge/server.py` — /api/screen/monitors + snapshot?monitor=N
- 수정: `vibecode-town/src/app/screen/ScreenClient.tsx` — 모니터 선택 UI
- 테스트: 수동 (X11 환경 필요)

---

## 아키텍처 경계

- **musu-core**: DB 조작 함수. 순수 Python, FastAPI 의존 없음.
- **musu-bridge/handlers.py**: musu-core 백엔드 wrapping. 비즈니스 로직.
- **musu-bridge/server.py**: FastAPI 엔드포인트. handlers.py 호출.
- **vibecode-town**: Next.js 프론트엔드. catch-all proxy로 bridge API 통과.

---

## 금지 사항 (CLAUDE.md)

- DB 스키마 수정 시 반드시 신규 migration 추가 (migrations.py 직접 수정 금지)
- 모든 CLI 명령어에 `rtk` 접두사
- git push --force, reset --hard 금지
- MUSU_BRIDGE_TOKEN 하드코딩 금지
