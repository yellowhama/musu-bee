# musu-bee Code Audit — 2026-04-13

> Wave 5 + Wave 6 완료 후 정성적 평가
> 기준: 타입 안전성 / 테스트 커버리지 / 보안 / 아키텍처 / 프로덕션 준비도

---

## 총평: **B+ → A-** (이전 감사 대비 +1 등급)

Wave 5/6 이후 실질적인 갭이 크게 줄었다. tsc 에러 0, 라우트 단위 테스트 전 커버, `any` 타입 0개. 남은 과제는 E2E/통합 테스트와 인증 레이어 보강이다.

---

## 1. 타입 안전성

| 항목 | 상태 | 비고 |
|------|------|------|
| `as any` 사용 | ✅ 0개 | `subscription.ts:191` → `KvWithEval` 인터페이스로 대체 완료 |
| tsc `--noEmit` | ✅ 에러 0 | |
| 외부 fetch 응답 타입 | ⚠️ `as { ... }` 캐스트 다수 | 런타임 검증 없음 — Zod 도입 시 개선 가능 |
| `unknown` 경유 캐스트 | ✅ 올바름 | `as unknown as T` 패턴 준수 |

**결론**: 컴파일 타임 안전성은 확보됨. 런타임 타입 검증(Zod/valibot)은 Wave 7 후보.

---

## 2. 테스트 커버리지

### API 라우트 (17개 route.ts)

| 라우트 | test.ts | 테스트 수 |
|--------|---------|----------|
| `/api/service-health` | ✅ | 5 |
| `/api/route` | ✅ | 4 |
| `/api/device-status` | ✅ | 5 |
| `/api/tasks` | ✅ | 13 |
| `/api/wiki` | ✅ | 9 |
| `/api/mcp` | ✅ | 13 |
| `/api/chat/stream` | ✅ | 6 |
| `/api/chat` | ✅ (기존) | - |
| `/api/agents` | ✅ (기존) | - |
| `/api/history` | ✅ (기존) | - |
| `/api/waitlist` | ✅ (기존) | - |
| `/api/checkout` | ✅ (기존) | - |
| `/api/company-*` | ✅ (기존) | - |
| `/api/webhooks/paddle` | ✅ (기존) | - |
| `/api/subscription` | ❌ 미작성 | Vercel KV 의존 — mock 어려움 |

### chatCommands 핸들러 (5개)

| 핸들러 | 테스트 수 |
|--------|----------|
| handleTaskCommand | 10 |
| handleApprovalCommand | 8 |
| handleRouteCommand | 8 |
| handleWikiCommand | 9 |
| handleRunCommand | 9 |

**총 신규 테스트**: Wave 5 58개 + Wave 6 44개 = **102개**
**전체 테스트 (Wave 1~6)**: 160+ 추정 (기존 포함)

**미커버 영역**:
- `useChat.ts` — React 훅, jsdom 없이 테스트 어려움
- `AppShell.tsx`, `ChatArea.tsx` — UI 컴포넌트, Playwright 범주
- `/api/subscription` — Vercel KV 실서비스 의존

---

## 3. 보안

| 항목 | 상태 | 비고 |
|------|------|------|
| XSS | ✅ 안전 | `dangerouslySetInnerHTML` 0개, 마크다운 직접 JSX 렌더 |
| SQL Injection | ✅ 안전 | `better-sqlite3` prepared statement 전용 |
| 환경변수 노출 | ✅ 안전 | `NEXT_PUBLIC_` 분리 준수 |
| Rate Limiting | ✅ 구현 | `/api/chat`, `/api/chat/stream` — 인메모리 슬라이딩 윈도우 |
| CSRF | ⚠️ 부분 | musu-bridge에 `csrf_guard.py` 있으나, musu-bee API는 미적용 |
| Command Injection | ✅ 안전 | `/run` 커맨드 → worker에 전달, musu-bee에서 exec 없음 |
| Auth (Supabase) | ⚠️ 선택적 | `authEnabled` 플래그 — dev 환경 우회 가능, prod 강제 필요 |

**최우선 보안 개선**: prod 배포 시 `authEnabled` 강제 + API 라우트 JWT 검증 추가.

---

## 4. 아키텍처

### 잘 된 것

- **chatCommands 분리**: 832줄 monolith → 5개 핸들러 파일, 의존성 명확
- **SQLite 싱글턴 패턴**: `tasks.ts` lazy-init — `:memory:` 테스트 격리 완벽
- **MCP 서버 자체 구현**: 외부 SDK 없이 JSON-RPC 2.0 직접 구현, 9개 도구
- **history localStorage 캐시**: musu-bridge 다운 시 오프라인 복원
- **서비스 헬스 팝오버**: 클릭 한 번에 버전 + 레이턴시 확인

### 개선 여지

- **`wiki.ts` 싱글턴 없음**: 매 호출마다 `new DatabaseSync()` — 성능 누수 가능, tasks.ts 패턴으로 통일 권장
- **`AppShell.tsx` 비대**: 700줄 근접, `useHealthPopover` 훅 분리 권장
- **`ChatArea.tsx` renderTextBlock**: 중첩 리스트 미지원, 마크다운 테이블 미지원 — 요구사항 증가 시 마크다운 라이브러리 도입 검토
- **MCP route.ts 356줄**: 핸들러 함수 별도 파일 분리 고려

---

## 5. 프로덕션 준비도

| 영역 | 점수 | 비고 |
|------|------|------|
| 타입 안전성 | 9/10 | Zod 없음 -1 |
| 테스트 커버리지 | 8/10 | E2E/통합 미비 -2 |
| 보안 | 7/10 | Auth 선택적, CSRF 미적용 -3 |
| 아키텍처 | 8/10 | wiki.ts 패턴 불일치 -1, AppShell 비대 -1 |
| 에러 핸들링 | 9/10 | 모든 fetch에 try/catch, fallback 메시지 |
| 문서화 | 7/10 | 코드 내 주석 최소, API 스펙 문서 없음 |

**종합: 8.0/10** (이전 감사 7.2 → +0.8 향상)

---

## 6. 즉시 수정 필요 (P0)

없음. 치명적 버그 미발견.

## 7. Wave 7 권장 개선 (P1)

1. `wiki.ts` 싱글턴 패턴으로 리팩터
2. `/api/subscription/route.test.ts` — KV mock 방법 설계
3. prod 배포 시 `authEnabled` 환경변수 강제 검증
4. `AppShell.tsx` → `useHealthPopover` 훅 분리 (100줄)

## 8. Wave 8 권장 개선 (P2)

1. Zod 런타임 타입 검증 — fetch 응답 경계
2. Playwright E2E — `/task`, `/done`, `@route` 실사용 시나리오
3. MCP route.ts 핸들러 파일 분리
4. 마크다운 라이브러리 (marked 또는 remark) 도입 검토
