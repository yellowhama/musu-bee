# Plan 92 — musu.pro Dashboard 페이지 (Wave 4)

**목표:** musu.pro /dashboard — 유료 유저가 핸드폰/외부 기기에서 musu-bridge 현황 확인

## 변경 파일
- `vibecode-town/src/app/dashboard/page.tsx` (신규)

## 핵심 구조
- Server Component: Supabase session 체크 → 미로그인 시 /login 리다이렉트
- Client Component (DashboardClient): /api/bridge/agents + /api/bridge/tasks 호출
- 15초 폴링 (live status)

## UI (MVP subset)
1. **Agents 섹션**: 이름 + 역할 + 상태(active/paused) 뱃지
2. **Tasks 섹션**: task_id(앞 8자) + channel + status 점 + summary + 시간

## API 호출
- `GET /api/bridge/agents` → musu-relay → musu-bridge /api/agents
- `GET /api/bridge/tasks?limit=20&status=all` → musu-relay → musu-bridge /api/tasks

## 검증
```bash
# 로그인한 상태에서 http://localhost:3000/dashboard 접속
# agents 목록, tasks 목록 표시 확인
```

## 다음 단계 (Wave 5, 별도)
- paid tier 체크 미들웨어 추가
- Chat 인터페이스 포팅
- 노드 선택 UI (multi-node 지원)
