# Plan 91 — musu.pro Bridge Proxy Route (Wave 3)

**목표:** musu.pro 유료 유저가 /api/bridge/[...path] 호출 시 musu-relay를 경유해 로컬 musu-bridge로 포워딩

## 변경 파일
- `vibecode-town/src/app/api/bridge/[...path]/route.ts` (신규)
- `vibecode-town/.env.local` (MUSU_RELAY_URL, MUSU_RELAY_SECRET 주석 추가)

## 핵심 로직
1. Supabase 세션에서 `user.id` 추출 (`createClient` → `supabase.auth.getUser()`)
2. `listByUser(user.id)` → 가장 최근 등록된 노드 선택
3. `${MUSU_RELAY_URL}/proxy/${node.node_name}/api/${path}` 로 HTTP 포워딩
4. `Authorization: Bearer ${MUSU_RELAY_SECRET}` 헤더 추가
5. musu-bee 패턴 동일: path sanitization (`..`, `/` 거부), 모든 HTTP 메서드 지원

## 환경변수
- `MUSU_RELAY_URL` — relay 서버 URL (e.g. https://musu-relay.railway.app)
- `MUSU_RELAY_SECRET` — relay 인증 시크릿

## 검증
```bash
# relay 서버 로컬 실행 후
MUSU_RELAY_URL=http://localhost:9900 MUSU_RELAY_SECRET=test \
  curl -H "Cookie: sb-session=..." http://localhost:3000/api/bridge/agents
# → musu-relay → musu-bridge /api/agents 응답
```

## 다음 단계 (Wave 4)
- `vibecode-town/src/app/dashboard/page.tsx` — MVP UI (agents + tasks 목록)
- 로그인 게이트 + paid tier 체크
- musu-bee 컴포넌트 포팅 (AgentsPanel, TasksPanel)
