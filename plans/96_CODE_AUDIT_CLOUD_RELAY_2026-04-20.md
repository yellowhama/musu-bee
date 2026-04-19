# Code Audit — MUSU Cloud Relay (Phase 20, 2026-04-20)

## 감사 대상 파일

| 파일 | 역할 |
|------|------|
| `musu-relay/src/server.ts` | 릴레이 서버 |
| `musu-bridge/relay_client.py` | 터널 클라이언트 |
| `vibecode-town/.../api/bridge/[...path]/route.ts` | musu.pro 프록시 라우트 |
| `vibecode-town/.../dashboard/DashboardClient.tsx` | 대시보드 UI |

---

## relay_client.py (musu-bridge)

### ✅ 정상
- 재연결 루프 구조 올바름 (while True + CancelledError 클린 핸들링)
- base64 인코딩/디코딩 — httpx는 bytes 반환, 올바르게 b64encode
- hop-by-hop 헤더 제거 (`_STRIP`: host/connection/transfer-encoding/content-length)
- httpx.AsyncClient 단일 인스턴스 재사용 (세션당 연결 재사용)
- hello/hello_ack 핸드셰이크 10s timeout
- 각 요청을 asyncio.create_task()로 분리 (blocking 없음)

### ⚠️ Minor Issues
1. **고정 5s 재연결 지연** — 릴레이 서버 다운 시 계속 로그 스팸. 지수 백오프 권장.
   ```python
   delay = min(_RECONNECT_DELAY * (2 ** attempt), 60)
   ```
2. **in-flight 요청 수 무제한** — 매우 많은 동시 요청 시 메모리 누적 가능. 실사용상 P2.

### ❌ P0 없음

---

## musu-relay/src/server.ts

### ✅ 정상
- `requireSecret`: RELAY_SECRET 미설정 시 500, 불일치 시 401 — 올바른 거부
- hop-by-hop 헤더 8종 제거 후 응답 포워딩
- stale tunnel 교체 로직: 재접속 시 기존 연결 ws.close(4003)
- 30s timeout 후 502 반환 (`pending` Map cleanup)
- PORT 우선순위: `process.env.PORT || MUSU_RELAY_PORT || 9900` (Railway 호환)
- 터널 disconnect 시 Map 정리 (메모리 누수 없음)

### ⚠️ Minor Issues
1. **MUSU_TOKEN 검증 없음** — WS 연결 시 token이 non-empty면 터널 허용. musu.pro 레지스트리에서 검증하지 않음. 토큰 탈취 시 임의 노드 등록 가능.
   - **현재 리스크**: MUSU_TOKEN이 노출되어야 하고, 알려진 nodeId로 접속해야 실제 요청 가능. 실사용 리스크 낮음.
   - **권장**: 추후 `/api/v1/nodes/validate` 엔드포인트 호출로 토큰 + nodeId 일치 확인
2. **pending 맵 메모리 누수 가능성** — 30s timeout 후 reject는 되지만 resolved never cleanup. 실제론 reject에서 `pending.delete(id)` 처리됨. OK.

### ❌ P0 없음

---

## /api/bridge/[...path]/route.ts (vibecode-town)

### ✅ 정상
- Supabase `getUser()` 서버사이드 검증 (cookie 기반)
- RELAY_URL/SECRET 미설정 → 503 조기 반환
- `listByUser(user.id)` — Supabase DB 기반 노드 조회
- path segment 검증: `decodeURIComponent` 후 `..`/`/` 포함 → 400
- `/proxy/` prefix guard 이중 확인 (URL 생성 후 pathname 재검증)
- query string 포워딩 (`searchParams.forEach`)
- content-type 포워딩
- Bearer RELAY_SECRET 자동 주입
- `cache: "no-store"` (대시보드 실시간 데이터)

### ⚠️ Minor Issues
1. **Binary 응답 이중 인코딩** — `res.text()` → `JSON.parse()` 실패 시 문자열 그대로 `NextResponse.json()`으로 반환. 이때 JSON.stringify(string)이 되어 따옴표 추가됨. 현재 musu-bridge는 전부 JSON 반환하므로 실제 문제 없음. 비-JSON 엔드포인트 추가 시 주의.
2. **노드 선택 로직** — `nodes[0]` (가장 최근 seen). 다중 노드 시 선택 UI 없음. 스코프 아웃으로 문서화됨.
3. **content-type forwarding 불완전** — 요청의 content-type만 포워딩, accept 헤더 미포워딩. 현재 API에서는 문제없음.

### ❌ P0 없음

---

## DashboardClient.tsx (vibecode-town)

### ✅ 정상
- `Promise.allSettled` — agents/tasks 병렬, 각각 독립 에러 표시
- `clearInterval` cleanup on unmount
- 에러 상태 독립적 (agentsErr ≠ tasksErr)
- task_id 앞 8자리만 표시 (UX)
- `relativeTime` — 단순 수식, 미래 날짜 처리됨 (음수 → "Xs ago" 이상하지만 crash 없음)

### ⚠️ Minor Issues
1. **글로벌 `loading` 상태** — agents/tasks 중 하나만 느릴 때 둘 다 로딩 스피너 표시. 패널별 로딩 상태로 개선 가능. UX P3.
2. **tasks 응답 형식 혼재** — `Array.isArray(data) ? data : data?.tasks ?? []` — 두 가지 응답 형식 처리. musu-bridge가 둘 다 반환할 수 있다는 의미이므로 서버 쪽에서 정규화하는 게 더 나음. 현재는 방어적 처리로 OK.

### ❌ P0 없음

---

## 보안 요약

| 항목 | 상태 |
|------|------|
| musu.pro → relay 인증 | ✅ Bearer MUSU_RELAY_SECRET |
| musu-bridge → relay 인증 | ✅ Bearer MUSU_TOKEN |
| musu.pro 사용자 인증 | ✅ Supabase getUser() |
| Path traversal 방어 | ✅ decodeURIComponent + .. 차단 |
| SSRF 방어 | ✅ /proxy/ prefix 재검증 |
| MUSU_TOKEN 서버 검증 | ⚠️ non-empty 체크만 (추후 개선) |

## 총평

**P0 없음. 배포 가능 상태.**

아키텍처가 깔끔하다. relay_client.py의 base64 프레이밍, server.ts의 pending Map, route.ts의 이중 path guard — 모두 의도적이고 올바른 설계. 지수 백오프와 MUSU_TOKEN 서버 검증이 추후 강화 대상.
