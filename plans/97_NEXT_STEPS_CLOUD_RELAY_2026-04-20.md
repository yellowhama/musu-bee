# Next Steps — MUSU Cloud Relay Phase 21 (2026-04-20)

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| musu-relay Railway 배포 | ✅ 라이브 |
| musu-bridge WS 터널 | ✅ `hughsecond` 연결됨 |
| musu.pro /api/bridge 프록시 | ✅ Vercel 배포됨 |
| musu.pro /dashboard 페이지 | ✅ 라이브 (로그인 필요) |
| 핸드폰 E2E 테스트 | 유저 직접 확인 필요 |

---

## Priority 1: 안정성 강화

### P1-A: relay_client.py 지수 백오프
- 현재: 고정 5s 재연결
- 목표: min(5 × 2^n, 60) 지수 백오프
- 파일: `musu-bridge/relay_client.py`

### P1-B: musu-bridge systemd 서비스 등록
- 현재: 수동 `bash scripts/start-bridge.sh`로 실행, relay env vars 별도 export 필요
- 목표: `~/.config/systemd/user/musu-bridge.service` 에 `MUSU_RELAY_ENABLED=true` 환경변수 포함
- 재부팅 후 자동 시작 + relay 자동 연결

### P1-C: start-bridge.sh .env 로딩
- 현재: `.env` 파일 무시, MUSU_TOKEN은 `~/.musu/musu_token`에서 별도 로딩
- 목표: `set -a && source musu-bridge/.env && set +a` 패턴 추가 (또는 dotenv 패키지)
- 그러면 `MUSU_RELAY_ENABLED`, `MUSU_RELAY_URL` 자동으로 주입됨

---

## Priority 2: 기능 확장

### P2-A: paid tier 게이팅
- 현재: 로그인만 확인 (`if (!user) redirect`)
- 목표: Supabase에서 subscription tier 확인 → free tier는 "로컬 전용" 안내
- 파일: `vibecode-town/src/app/dashboard/page.tsx`

### P2-B: 다중 노드 선택 UI
- 현재: `nodes[0]` (가장 최근 seen 노드) 자동 선택
- 목표: 드롭다운으로 등록된 노드 목록 선택
- 파일: `DashboardClient.tsx`, `route.ts` (node 파라미터 추가)

### P2-C: MUSU_TOKEN 서버사이드 검증
- 현재: relay 서버에서 token non-empty만 확인
- 목표: `https://musu.pro/api/v1/nodes/validate` 호출로 token + node_id 쌍 검증
- 파일: `musu-relay/src/server.ts`
- 주의: musu.pro API rate limit 고려 (캐시 30s TTL)

### P2-D: WebSocket 스트리밍 relay
- 현재: REST HTTP만 지원 (musu-bridge :8070)
- 목표: musu-port(:1355) WS 채팅도 relay 경유
- 별도 WS-to-WS 프록시 레이어 필요 (현재 JSON 프레이밍과 다른 프로토콜)

---

## Priority 3: 대시보드 UX

### P3-A: 실시간 업데이트 (SSE or WebSocket)
- 현재: 15s 폴링
- 목표: Server-Sent Events로 musu-bridge 변경사항 push
- 의존: P2-D (WS relay)

### P3-B: 패널별 로딩 상태
- 현재: 글로벌 `loading` 상태
- 목표: `agentsLoading`, `tasksLoading` 분리 → 한쪽 로드되면 즉시 표시

### P3-C: Task 상세 뷰 + 메시지 히스토리
- 현재: task 행 클릭 없음
- 목표: 클릭 → 사이드 패널에서 `/api/bridge/tasks/{id}/messages` 표시

---

## 즉시 실행 가능한 한 가지

**P1-C (start-bridge.sh .env 로딩)** — 가장 간단, 지금 당장 bridge 재시작 시 relay env 자동 포함되어 수동 export 불필요.

```bash
# scripts/start-bridge.sh 상단에 추가 (MUSU_TOKEN 로딩 전):
_ENV_FILE="${ROOT}/musu-bridge/.env"
if [[ -f "$_ENV_FILE" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$_ENV_FILE"
    set +a
fi
```
