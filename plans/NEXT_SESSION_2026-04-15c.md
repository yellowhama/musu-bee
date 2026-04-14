# musu-functions 다음 세션 준비 (2026-04-15 최종)

## 이번 세션 완료 항목

### Phase 12A 완료 (커밋 `6c4135c1`)
- ✅ **12A-1**: `GET /api/tasks` — status/channel 필터, cursor pagination
- ✅ **12A-2**: `DELETE /api/tasks/{id}` — asyncio 취소 + DB cancelled
- ✅ **12A-3**: `init --service --user` / `service --user` — systemd 파일 자동 생성
- ✅ **12A-4**: W2(channel 검증), W3(UUID Path), W5(채널 pre-check), W6(202 Accepted)

### Phase 12A 감사 수정 (이번 세션 추가 커밋)
- ✅ **C3**: `idx_route_executions_created` 인덱스 추가 (db.py + v6 migration)
- ✅ **W1**: `cancel_task_record` — terminal 상태(done/failed)는 덮어쓰지 않음
- ✅ **W3**: systemd 서비스 파일 경로 쿼트 (`WorkingDirectory="{path}"`)

---

## 정성적 평가 (Phase 12A 완료 후)

### 종합 운영 안정성 점수: **9.5/10**

| 영역 | 점수 | 비고 |
|------|------|------|
| 인간 편의성 | 9/10 | init --seed --service 한 줄 설정, systemd 자동화 |
| AI 오케스트레이터 | 8.5/10 | delegate+list+cancel 완비, 폴링만 남음 |
| 운영 안정성 | 9.5/10 | DB 인덱스, 취소 로직, 재시작 내구성 |

**"그냥 된다" 체크리스트:**
- [x] 새 머신 설정: `python -m musu_bridge init --seed --service --user`
- [x] 부팅 자동 시작: systemd 파일 생성됨
- [x] 태스크 비동기 위임 + 폴링
- [x] 태스크 목록 조회
- [x] 태스크 취소 (asyncio + DB)
- [x] 크래시 후 태스크 재개 (retry_count 상한)
- [x] 피어 노드 자동 발견 (mDNS)
- [x] 원격 노드 폴백 (health check)

**남은 갭 (0.5점)**:
- WebSocket push 알림 없음 (완료 시 push 불가, 폴링만)
- `list_tasks` MCP 도구 없음 (musu-control에 추가 안됨)
- 태스크 취소 MCP 도구 없음
- 플랫폼 감지 없음 (systemd 서비스 파일이 비-Linux에서도 생성됨)

---

## 감사 결과 최종 요약

| ID | 심각도 | 상태 | 내용 |
|----|--------|------|------|
| C1 | Critical | ✅ **false positive** | asyncio single-threaded — dict 연산 원자적 |
| C2 | Critical | ✅ SAFE | SQL 파라미터화 확인 |
| C3 | Critical | ✅ 수정 | `idx_route_executions_created` 인덱스 + v6 migration |
| C4 | Critical | ✅ SAFE | bearer middleware 보호됨 |
| W1 | Warning | ✅ 수정 | terminal 상태 덮어쓰기 방지 |
| W2 | Warning | 보류 | channel 필터 미검증 (silent empty) |
| W3 | Warning | ✅ 수정 | systemd 경로 쿼트 추가 |
| W4 | Warning | 보류 | 플랫폼 감지 없음 |
| W5 | Warning | 보류 | DB 실패 시 task 고아화 (엣지케이스) |
| W6 | Warning | 보류 | 태스크 타임아웃 없음 |
| I1-I5 | Info | 보류 | 쿼리 최적화, 하드닝 등 |

---

## 다음 세션 후보 (Phase 12B)

### Option A: MCP 오케스트레이터 완성 (★★★)
- `list_tasks(status, channel)` MCP 도구 — musu-control에 추가
- `cancel_task(task_id)` MCP 도구
- `list_agents()` 도구 개선 (현재 있지만 task와 연동 안됨)

### Option B: 태스크 타임아웃 + W6 수정 (★★)
- `asyncio.timeout(300)` wrapper on delegated tasks
- Hung agent → auto-fail after 5분
- W4: platform detection (macOS → launchd 안내)

### Option C: UI 통합 (★)
- musu-bee에 Tasks 탭 추가
- `GET /api/tasks` polling → 실시간 태스크 상태 표시
- 취소 버튼 UI

### Option D: 인프라 강화 (★)
- Systemd 서비스 파일 보안 강화 (PrivateTmp, NoNewPrivileges)
- W5 트랜잭션 처리 강화
- W2 channel 검증 on list endpoint

### 추천 우선순위
1. **Phase 12B**: MCP 도구 완성 (A) — AI 오케스트레이터 8.5 → 9.5
2. **Phase 12C**: 태스크 타임아웃 (B) — 운영 안정성 9.5 → 10.0

---

## 현재 전체 API 목록

```
# 태스크 관리 (Phase 11-12)
POST   /api/tasks/delegate          202 → {task_id, status, channel}
GET    /api/tasks                   → [{task_id, status, summary, ...}]
GET    /api/tasks/{task_id}         → {task_id, status, summary, output, error}
DELETE /api/tasks/{task_id}         → {cancelled: task_id}

# 라우팅 (기존)
POST   /api/route                   → {response, agent_id, agent_name}

# 에이전트/채널
GET    /api/agents
GET    /api/channels

# 메시지 히스토리
GET    /api/messages?session_id=
GET    /api/messages/{id}
DELETE /api/messages/{id}

# 감사
GET    /api/audit

# 회사 레이어
GET/POST   /api/companies
GET/PUT/DELETE /api/companies/{id}

# 노드 관리
GET    /api/admin/node-info
POST   /api/admin/pair
POST   /api/admin/pair/accept
GET    /api/admin/nodes
DELETE /api/admin/nodes/{name}
GET    /api/admin/discovered

# 동기화
GET    /api/sync/companies
GET    /api/sync/messages
POST   /api/sync/push

# 표준
GET    /.well-known/agent.json      A2A Agent Card
GET    /health
```

---

## musu-control MCP 도구 목록 (현재 26개)

```
기존 24개 + Phase 11에서 추가:
+ delegate_task(channel, instruction, sender_id)
+ get_task_status(task_id)

미추가 (Phase 12B 대상):
- list_tasks(status, channel)
- cancel_task(task_id)
```

---

*작성: 2026-04-15 | 다음 세션에 이 문서로 컨텍스트 복원*
