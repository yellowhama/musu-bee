# MUSU Next Steps

> 작성: 2026-04-13 | Wave 4 완료 후
> 직전 완료: Wave 2 (TASK-1~7) + Wave 3 (TASK-1~6) + Wave 4 (TASK-A~C)

---

## 즉시 할 수 있는 것 (외부 블로커 없음)

### P0 — 실서비스 가동

| 항목 | 명령 | 예상 소요 |
|------|------|-----------|
| 전체 스택 기동 | `bash scripts/dev-start.sh` | ~10초 (musu-portd 바이너리 존재) |
| 서비스 상태 확인 | `bash scripts/check-services.sh` | 즉시 |

기동 후 검증:
```bash
bash scripts/check-services.sh
# /run echo hello  → <pre> 코드블록으로 렌더링 확인
# /task 테스트     → assigned_device 배정 + 마크다운 **bold** 렌더 확인
```

### P1 — 코드 품질

| 항목 | 파일 | 내용 |
|------|------|------|
| `any` 타입 제거 | `src/lib/subscription.ts:185` | `(kv as any).eval` → 타입 정의 |
| 테스트 미작성 라우트 | `/api/tasks`, `/api/mcp`, `/api/route`, `/api/service-health`, `/api/chat/stream`, `/api/device-status`, `/api/wiki` | 각 라우트 `.test.ts` 작성 |
| chatCommands 테스트 | `src/lib/chatCommands/*.ts` | 핸들러별 unit test 추가 |

### P2 — UX 개선

| 항목 | 파일 | 내용 |
|------|------|------|
| 서비스 헬스 팝오버 | `AppShell.tsx` | PORT/BRIDGE/WORKER 뱃지 클릭 → 버전/지연시간 팝오버 |
| 채팅 히스토리 로컬 캐시 | `useChat.ts` | musu-bridge 다운 시 localStorage에서 최근 50개 복원 |
| `/tasks` 채널 필터 | `handleTaskCommand.ts` | 현재 채널 task만 보이도록 (`channel` 필터 추가) |
| 마크다운 개선 | `ChatArea.tsx` | `_italic_`, `- list` 아이템 지원 추가 |

### P3 — MCP 도구 확장

현재 6개 도구. 추가 후보:
- `musu_run_command` — musu-worker `/execute/cli` 직접 호출
- `musu_get_service_health` — 서비스 상태 반환
- `musu_list_channels` — 채널 목록

---

## 외부 블로커 해제 시 할 것

### 5070Ti SSH 접근 확보 시 → Wave 5 멀티머신

- musu-bee `useDeviceDiscovery` — 원격 musu-port 폴링 추가
- musu-connects 실제 P2P 연결 테스트
- `/run echo hi --device 5070ti` 실제 원격 실행 확인
- 사이드바에 두 번째 디바이스 카드 표시

### Paddle creds 확보 시 → Wave 6 런치

- Pro/Team 실결제 플로우 검증
- webhook 핸들러 production env 테스트

---

## 현재 서비스 의존성 맵

```
채팅 커맨드              의존 서비스                   상태
─────────────────────────────────────────────────────────
일반 메시지              musu-port WS (없으면 CLI fallback)  ❌/✅
/run <cmd>              musu-worker :9700                   ✅ 실행 중
/task, /tasks           SQLite local                        ✅ 항상 동작
@route                  musu-port /handoff/route            ❌ (local fallback)
musu_send_message(MCP)  musu-bridge :8070 /api/route        ❌ 미실행
채팅 히스토리            musu-bridge :8070 /api/messages     ❌ 미실행
WS 채팅                 musu-port :1355                     ❌ 미실행
서비스 뱃지 WORKER       musu-worker /health                 ✅ 실행 중
```

**dev-start.sh 업데이트 완료**: `musu-portd` 바이너리 직접 실행 (`cargo run` 제거됨).
다음 `bash scripts/dev-start.sh` 실행 시 PORT + BRIDGE 뱃지도 녹색으로 전환 예정.

---

## Wave 4에서 완료한 것

| TASK | 파일 | 완료 내용 |
|------|------|-----------|
| TASK-A | `scripts/dev-start.sh` | `cargo run` → `./target/release/musu-portd` 즉시 실행 |
| TASK-B | `src/lib/useChat.ts` + `chatCommands/` | 832줄 → 327줄, 7개 핸들러 파일 분리, deps 버그 픽스 |
| TASK-C | `src/components/ChatArea.tsx` | 인라인 마크다운 렌더러 (라이브러리 0개) |
