# MUSU Next Steps

> 업데이트: 2026-04-13 | Wave 5 + Wave 6 완료 후
> 직전 완료: Wave 1~4 (기능 구현) + Wave 5 (라우트 테스트 58개) + Wave 6 (기능 확장 + 핸들러 테스트 44개)

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| tsc 에러 | ✅ 0개 |
| `as any` | ✅ 0개 |
| 신규 테스트 (Wave 5+6) | ✅ 102개 |
| 전체 API 라우트 테스트 | ✅ 16/17 (subscription 제외) |
| chatCommands 테스트 | ✅ 5/5 핸들러 |
| next build | ✅ 에러 0 |
| 프로덕션 준비도 | ✅ 8.0/10 (CODE_AUDIT_2026-04-13.md 참고) |

---

## Wave 7 — 코드 품질 hardening (P1)

### 즉시 가능 (외부 블로커 없음)

| 항목 | 파일 | 예상 소요 |
|------|------|-----------|
| `wiki.ts` 싱글턴 리팩터 | `src/lib/wiki.ts` | 30분 |
| `AppShell.tsx` → `useHealthPopover` 훅 분리 | `src/components/AppShell.tsx` | 30분 |
| `/api/subscription` 테스트 | `src/app/api/subscription/route.test.ts` | 1시간 (KV mock 설계 필요) |
| MCP route.ts 핸들러 파일 분리 | `src/app/api/mcp/` | 45분 |
| prod `authEnabled` 강제 검증 | `src/middleware.ts` | 1시간 |

### 검증
```bash
cd musu-bee
pnpm exec tsx --test src/**/*.test.ts   # 전체 테스트
pnpm exec tsc --noEmit                   # tsc 클린
pnpm next build                          # 빌드 클린
```

---

## Wave 8 — 런타임 타입 + E2E (P2)

| 항목 | 파일 | 내용 |
|------|------|------|
| Zod 런타임 검증 | fetch 응답 경계 전체 | 외부 API 응답 `as { ... }` 캐스트 대체 |
| Playwright E2E | `e2e/` | `/task`, `/done`, `@route`, `/run` 실사용 시나리오 |
| 마크다운 라이브러리 도입 | `src/components/ChatArea.tsx` | 중첩 리스트, 테이블, 링크 지원 |
| `useChat.ts` 유닛 테스트 | `src/lib/useChat.test.ts` | msw 또는 happy-dom 활용 |

---

## Wave 9 — 멀티머신 (외부 블로커 해제 시)

**블로커**: 5070Ti SSH 접근 확보

해제 시 할 것:
- `useDeviceDiscovery` — 원격 musu-port 폴링 추가
- musu-connects P2P 연결 테스트
- `/run echo hi --device 5070ti` 실제 원격 실행
- Sidebar에 두 번째 디바이스 카드

---

## Wave 10 — 런치 (Paddle creds 확보 시)

**블로커**: Paddle creds

해제 시 할 것:
- Pro/Team 실결제 플로우 검증
- Webhook 핸들러 production env 테스트
- 가격 페이지 + Upgrade CTA 활성화

---

## 현재 서비스 의존성 맵

```
채팅 커맨드              의존 서비스                   상태
─────────────────────────────────────────────────────────
일반 메시지              musu-port WS (없으면 CLI fallback)  ✅ 기동 중 (PID 72638)
/run <cmd>              musu-worker :9700                   ✅ 실행 중
/task, /tasks           SQLite local                        ✅ 항상 동작
@route                  musu-port /handoff/route            ✅ (local fallback)
musu_send_message(MCP)  musu-bridge :8070 /api/route        ✅ 기동 중 (PID 78077)
채팅 히스토리            musu-bridge :8070 /api/messages     ✅ 기동 중
WS 채팅                 musu-port :1355                     ✅ 기동 중
서비스 뱃지 WORKER       musu-worker /health                 ✅ 실행 중
```

**서비스 기동 명령**:
```bash
# musu-port (WS :1355)
cd /home/hugh51/musu-functions/musu-port
RUST_LOG=info ./target/release/musu-portd > /tmp/musu-port.log 2>&1 &

# musu-bridge (:8070)
cd /home/hugh51/musu-functions/musu-bridge
PYTHONPATH=/home/hugh51/musu-functions/musu-core/src python3 server.py > /tmp/musu-bridge.log 2>&1 &

# musu-bee (:3001)
cd /home/hugh51/musu-functions/musu-bee
pnpm dev > /tmp/musu-bee.log 2>&1 &
```

---

## Wave 완료 이력

| Wave | 내용 | 완료일 |
|------|------|--------|
| Wave 1~3 | 초기 기능 구현 (WS, 히스토리, 태스크, MCP 기반) | 2026-04 |
| Wave 4 | 아키텍처 리팩터 (chatCommands 분리, 마크다운 기초, dev-start.sh) | 2026-04-12 |
| Wave 5 | 라우트 테스트 58개 (service-health, route, device-status, tasks, wiki, mcp, chat/stream) | 2026-04-13 |
| Wave 6 | 기능 확장 5개 + chatCommands 핸들러 테스트 44개 | 2026-04-13 |
