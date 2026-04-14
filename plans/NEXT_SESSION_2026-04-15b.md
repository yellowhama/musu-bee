# musu-functions 다음 세션 준비 (2026-04-15 PM)

## 이번 세션 완료 항목

### Phase 10 (이전 세션 완료)
- ✅ Tailscale IP 자동 감지 (`get_tailscale_ip()` UDP route trick)
- ✅ retry_count 상한 (crash-loop 방지, v5 migration)
- ✅ zeroconf 미설치 경고 명확화

### Phase 11 (이번 세션 완료)
- ✅ **11A-1**: httpx → main deps (런타임 ImportError 수정)
- ✅ **11A-2**: `musu-bridge init` CLI (`~/.musu/nodes.toml` 자동 생성)
- ✅ **11B-1**: `POST /api/tasks/delegate` + `GET /api/tasks/{id}` (비동기 위임)
- ✅ **11B-2**: MCP `delegate_task()` + `get_task_status()` 도구
- ✅ **11B-3**: response summary layer (≤500자 요약)
- ✅ **감사 수정**: C1(double record), C2(TOML injection), C3(silent failure), W1(validation), W4(import)

---

## 정성적 평가 (Phase 11 완료 후)

### 인간 편의성 점수: 6/10 → **8.5/10**

| 항목 | 이전 | 이후 |
|------|------|------|
| 새 머신 설치 | pip + 수동 nodes.toml | `init --seed` 한 줄 |
| httpx 런타임 | ImportError 발생 | 정상 설치 |
| 노드 이름 설정 | 직접 편집 | hostname 자동 감지 |
| Tailscale URL | 직접 편집 | UDP trick 자동 감지 |
| 에이전트 시딩 | 별도 스크립트 호출 | `--seed` 플래그 |

**남은 갭 (1.5점)**:
- 새 머신에서 `pip install -e musu-bridge/` 후 musu-core path 설정 여전히 필요
- systemd 서비스 파일 없음 (수동 재시작)
- `musu-bridge init` 결과 검증 없음 (노드 연결 확인 절차 없음)

### AI 오케스트레이터 편의성 점수: 4/10 → **8/10**

| 항목 | 이전 | 이후 |
|------|------|------|
| 블로킹 | 최대 300초 | 즉시 task_id 반환 |
| 응답 토큰 | 전체 에이전트 출력 | ≤500자 summary |
| 병렬 위임 | 불가 (순차 블로킹) | 가능 (submit N → poll) |
| MCP 접근성 | HTTP 직접 호출 필요 | `delegate_task()` 도구 |

**남은 갭 (2점)**:
- 폴링 없는 WebSocket push 알림 없음 (완료 시 push 받을 수 없음)
- task 목록 조회 없음 (`GET /api/tasks` — 전체 pending 목록)
- 취소 없음 (`DELETE /api/tasks/{id}` — 실행 중인 태스크 중단)

---

## 코드 감사 결과 요약

| ID | 심각도 | 상태 | 내용 |
|----|--------|------|------|
| C1 | Critical | ✅ 수정 | double route_execution record |
| C2 | Critical | ✅ 수정 | TOML injection via env var |
| C3 | Critical | ✅ 수정 | silent failure on DB error |
| W1 | Warning | ✅ 수정 | DelegateRequest 미검증 |
| W4 | Warning | ✅ 수정 | __main__.py implicit import |
| W2 | Warning | 보류 | channel existence pre-validation |
| W3 | Warning | 보류 | task_id path param validation |
| W5 | Warning | 보류 | no channel check before DB write |
| W6 | Warning | 보류 | HTTP 202 vs 200 for async ops |
| I1-I4 | Info | 보류 | 문서화, 일관성 |

---

## 다음 세션 후보 (Phase 12)

### Option A: 운영 안정성 (★★★)
- **A1**: `GET /api/tasks` — 전체 task 목록 (status 필터, pagination)
- **A2**: `DELETE /api/tasks/{id}` — 실행 취소 + graceful cancel
- **A3**: systemd 서비스 파일 자동 생성 (`musu-bridge init --service`)
- **A4**: W2/W3/W5/W6 감사 수정

### Option B: 오케스트레이터 UX (★★)
- **B1**: WebSocket 태스크 완료 알림 (push model instead of poll)
- **B2**: `list_tasks()` MCP 도구 — 전체 실행 중/완료 태스크 조회
- **B3**: `cancel_task(task_id)` MCP 도구
- **B4**: 멀티 에이전트 파이프라인 — `delegate_pipeline([step1, step2, ...])` 체이닝

### Option C: UI 개선 (★)
- **C1**: musu-bee Task 탭 — 위임된 태스크 실시간 진행 상태
- **C2**: NodePanel — 각 노드의 active tasks 카운트 표시
- **C3**: task 완료 시 musu-bee 채팅 push 알림

### 추천 우선순위
1. **Phase 12A**: 운영 안정성 (A1+A2+A3+감사수정) — 실제 사용에 필요
2. **Phase 12B**: `list_tasks()` + `cancel_task()` MCP 도구 — 오케스트레이터 완성도
3. **Phase 12C**: musu-bee UI 통합 — 가시성

---

## 현재 시스템 상태

```
musu-bridge  :8070  → 실행 중 (systemd 없음, 수동)
musu-bee     :3001  → dev server (Next.js)
musu-port    :1355  → WS gateway
musu-core    SQLite → ~/.musu/musu.db
musu-control MCP    → 26개 도구 (24 + delegate_task + get_task_status)
```

### API 엔드포인트 완전 목록 (현재)
```
POST /api/route                     — 동기 라우팅 (기존)
POST /api/tasks/delegate            — 비동기 위임 (신규)
GET  /api/tasks/{task_id}           — 태스크 상태 조회 (신규)
GET  /api/agents                    — 에이전트 목록
GET  /api/channels                  — 채널 맵
GET  /api/messages                  — 메시지 목록 (pagination)
GET  /api/messages/{id}             — 단건 조회
DELETE /api/messages/{id}           — 삭제
GET  /api/audit                     — 감사 로그
GET  /api/companies                 — 회사 목록
POST /api/companies                 — 회사 생성
GET  /api/companies/{id}            — 단건
PUT  /api/companies/{id}            — 업데이트
DELETE /api/companies/{id}          — 삭제
GET  /api/sync/companies            — 피어 동기화
GET  /api/sync/messages             — 피어 동기화
POST /api/sync/push                 — 피어 데이터 수신
GET  /api/admin/node-info           — 노드 정보
POST /api/admin/pair                — 페어링
POST /api/admin/pair/accept         — 페어링 수락
GET  /api/admin/nodes               — 노드 목록
DELETE /api/admin/nodes/{name}      — 노드 제거
GET  /api/admin/discovered          — mDNS 발견 노드
GET  /.well-known/agent.json        — A2A Agent Card
GET  /health                        — liveness check
```

---

## 커밋 이력 (이번 세션)

- `dcdaf3ab` — Phase 11: human convenience + AI orchestrator async task delegation
- `[fix]` — Phase 11 audit fixes: C1 double record, C2 TOML injection, C3 silent failure, W1/W4

---

*작성: 2026-04-15 | 다음 세션에 이 문서로 컨텍스트 복원 가능*
