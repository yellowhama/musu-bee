# Phase 4B — Company UI 세부 플랜

> 작성: 2026-04-14 | 마스터 플랜: ethereal-squishing-spark.md

## 목표
company 목록 + 생성 UI. musu-bridge SQLite를 SSOT로 사용.

## 태스크

### 4B-1: API 레이어
- `musu-bee/src/app/api/companies/route.ts` — GET(목록), POST(생성) proxy
- `musu-bee/src/app/api/companies/[id]/route.ts` — GET, DELETE, PUT proxy
- `musu-bridge/server.py` + `musu-bridge/handlers.py` — PUT /api/companies/{id} 추가

### 4B-4: CORS envvar
- `musu-bridge/server.py` allow_origins → MUSU_BRIDGE_ALLOWED_ORIGINS 환경변수

### 4B-2: CompanyPanel 컴포넌트
- `musu-bee/src/components/CompanyPanel.tsx` 신규
- company 카드 목록 + 생성 폼 (이름, template_key)

### 4B-3: AppShell 통합
- Sidebar 하단에 Company 섹션
- 선택된 company → activeCompanyId 상태

## MUSU_BRIDGE_URL
- 로컬: `process.env.MUSU_BRIDGE_URL ?? "http://localhost:8070"`
- 기존 패턴 재사용 (agent-route와 동일)
