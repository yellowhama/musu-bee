# MUSU 마스터 플랜 — 2026-04-22

> 작성: 2026-04-22 | 기반: Phase 41 완료 후 전체 코드 감사 결과
> 이 문서가 진행 SSOT. 각 Phase 구현 시 `docs/PHASE_{N}_DETAIL.md` 세부 플랜 별도 작성.

---

## 현재 상태 요약 (Phase 41 완료 기준)

| 항목 | 상태 | 비고 |
|------|------|------|
| musu-bridge API | ✅ 완료 | 55+ 엔드포인트, 모든 핵심 기능 |
| musu-relay WS 터널 | ✅ 완료 | first-message handshake 배포됨 (Phase 41) |
| musu-connectsd QUIC | ✅ 완료 | watchdog forward/status 포함 |
| vibecode-town 대시보드 | ✅ 완료 | agent grid, costs, runs, wiki, watchdog UI |
| VNC 원격 데스크톱 | ✅ 배포 | 검증 필요 (auto-update 후) |
| Company 관리 UI | ❌ 없음 | API는 있음, 웹 UI 없음 |
| Paddle 결제 | ❌ 없음 | 크레덴셜 수령 전까지 블로커 |
| watchdog 레이트 리밋 | ❌ 없음 | 보안 취약점 |
| relay 토큰 검증 | ⚠️ fail-open | 네트워크 오류 시 모든 토큰 허용 |

---

## Phase 우선순위 로드맵

```
Phase 42  ─ VNC 안정화 + 소소한 픽스       (오늘, 1~2h)
Phase 43  ─ Company 관리 UI                (오늘, 2~3h)
Phase 44  ─ 보안 강화                      (오늘, 1h)
Phase 45  ─ 위키 기능 완성                 (다음 세션)
Phase 46  ─ QUIC cert pinning             (다음 세션)
Phase 47  ─ Paddle 결제 연동              (크레덴셜 수령 후)
Phase 48  ─ musu.pro 프로덕션 런치        (결제 후)
```

---

## Phase 42: VNC 안정화 + 소소한 픽스

**목표**: Phase 41 배포 결과 안정화. 사용자 가이드 없이도 VNC가 켜지는 상태.

### 42-A: relay_client.py — _WS_PROXY_TARGET 환경변수화
- **파일**: `musu-bridge/relay_client.py`
- **현재**: `_WS_PROXY_TARGET = "ws://localhost:1355"` 하드코딩
- **수정**: `os.getenv("MUSU_WS_PROXY_TARGET", "ws://localhost:1355")`
- **규모**: 2줄 수정

### 42-B: VNC 검증 체크리스트
- main-pc Xorg 전환 안내 (gear icon at GDM → Ubuntu on Xorg)
- auto-update가 relay 핸드셰이크 코드 당기는지 확인 방법
- 브라우저 테스트 시나리오

### 42-C: ScreenClient — 에러 메시지 개선
- x11vnc 없을 때 → "auto-install 중" 메시지
- Wayland 감지 시 → Xorg 전환 안내 메시지
- relay 연결 실패 → 구체적인 오류 메시지

**세부 플랜**: `docs/PHASE_42_VNC_STABILIZATION.md`

---

## Phase 43: Company 관리 UI

**목표**: vibecode-town에서 Company(workspace) 생성·선택·관리 가능.

### 43-A: `/home` 페이지에 Company 선택기 통합
- 노드 선택기 위에 Company 드롭다운 추가
- `GET /api/bridge/companies` → company 목록 로드
- company 선택 → 해당 company ID로 task 생성

### 43-B: Company 생성 모달
- "새 Workspace" 버튼 → 이름 입력 모달
- `POST /api/bridge/companies` → 생성
- 생성 후 자동 선택

### 43-C: API 라우트 (불필요 — catch-all 처리)
- `/api/bridge/[...path]` catch-all이 companies 엔드포인트 모두 처리
- 별도 라우트 불필요

**데이터 구조**:
```typescript
interface Company {
  id: string;
  name: string;
  created_at: string;
  agent_count?: number;
}
```

**세부 플랜**: `docs/PHASE_43_COMPANY_UI.md`

---

## Phase 44: 보안 강화

**목표**: 프로덕션에서 악용될 수 있는 취약점 3개 수정.

### 44-A: watchdog 레이트 리밋 (musu-bridge)
- **위치**: `musu-bridge/server.py` 또는 별도 미들웨어
- **규칙**: (user_id, node, command) 튜플당 10초에 1회
- **구현**: in-memory dict + timestamp 체크 (Redis 없음)
- **규모**: 20줄

### 44-B: relay 토큰 검증 circuit breaker (musu-relay)
- **위치**: `musu-relay/src/server.ts` `validateToken()`
- **현재**: 네트워크 오류 시 `return true` (fail-open)
- **수정**: 연속 실패 N회 → 새 연결 거절 (fail-secure)
- **구현**: 간단한 circuit breaker (실패 카운터 + 쿨다운)
- **규모**: 30줄

### 44-C: relay_client.py WS_PROXY_TARGET 환경변수화
- Phase 42-A와 동일 (여기서 처리)

**세부 플랜**: `docs/PHASE_44_SECURITY.md`

---

## Phase 45: 위키 기능 완성

**목표**: Wiki 탭이 실제로 유용하게 동작. 페이지 생성/편집/검색.

### 현재 상태
- musu-bridge: `/api/wiki/pages`, `/api/wiki/search`, `/api/wiki/page/{id}` 존재
- vibecode-town: WikiClient.tsx (19.3KB) — 읽기 가능, 편집 여부 미확인

### 45-A: Wiki 편집 기능 확인 및 보완
- WikiClient.tsx 읽고 편집 기능 유무 파악
- 없으면 마크다운 편집기 추가 (기존 컴포넌트 활용)

### 45-B: LLM 위키 ingest 자동화
- Phase 33에서 계획된 wiki cleanup
- `/home/hugh51/llm-wiki/` → musu-bridge wiki API로 ingest

**세부 플랜**: `docs/PHASE_45_WIKI.md` (작업 시 작성)

---

## Phase 46: QUIC Cert Pinning

**목표**: musu.pro fingerprint를 connectsd에 등록해 MITM 방어.

### 현재 상태
- `start-bridge.sh`: `MUSU_QUIC_FINGERPRINT` 환경변수 export 이미 있음
- `bridge_proxy.rs`: 핑거프린트 검증 로직 여부 미확인

### 46-A: bridge_proxy.rs 핑거프린트 검증 추가
- 연결 시 서버 인증서 SHA-256 비교
- 불일치 → 연결 거절

**세부 플랜**: `docs/PHASE_46_QUIC_PINNING.md` (작업 시 작성)

---

## Phase 47: Paddle 결제 연동 [BLOCKED]

**블로커**: Paddle 크레덴셜 (vendor_id, API key, webhook secret) 수령 필요

### 47-A: Paddle checkout
- Pro 플랜 checkout URL 생성
- `/pricing` 페이지에 "Subscribe" 버튼

### 47-B: Paddle webhook
- `subscription.created` → `subscriptions` 테이블 업데이트
- `subscription.cancelled` → plan downgrade

### 47-C: 에이전트 사용 한도
- Free: 50 task/day
- Pro: 무제한

**세부 플랜**: `docs/PHASE_47_PAYMENTS.md` (크레덴셜 수령 후 작성)

---

## Phase 48: musu.pro 프로덕션 런치

**전제 조건**: Phase 47 완료
- Vercel 환경변수 검증
- musu-relay Railway 배포 확인
- 랜딩 페이지 최종 검토
- Paddle live 모드 전환

---

## 구현 원칙

1. **세부 플랜 먼저**: 각 Phase 시작 시 `docs/PHASE_{N}_*.md` 작성 후 구현
2. **투두 기반**: TaskCreate로 세부 항목 추적, 완료 즉시 TaskUpdate
3. **최소 변경**: 필요한 것만 수정, 관련 없는 리팩터링 없음
4. **빌드 확인**: 코드 변경 후 `rtk tsc` / `rtk next build` / `rtk cargo check`
5. **커밋 단위**: Phase 단위 커밋 (세부 픽스는 같이 묶음)

---

## 진행 상황 추적

| Phase | 상태 | 완료일 |
|-------|------|--------|
| Phase 41 (VNC) | ✅ 완료 | 2026-04-22 |
| Phase 42 (VNC 안정화) | ✅ 완료 | 2026-04-22 |
| Phase 43 (Company UI) | ✅ 완료 | 2026-04-22 |
| Phase 44 (보안) | ✅ 완료 | 2026-04-22 |
| Phase 45 (Wiki) | ✅ 완료 | 2026-04-22 | 편집 UI + ingest 스크립트 |
| Phase 46 (QUIC pinning) | ✅ 완료 | 2026-04-22 (코드 이미 구현됨) |
| Phase 47 (Paddle) | ⏸ 블로커 | 크레덴셜 대기 |
| Phase 48 (런치) | ⏸ 블로커 | Phase 47 후 |
