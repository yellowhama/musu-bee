# musu-bridge Handoff Document

> Last updated: 2026-04-20 KST
> Status: **Active — Phase 21 CEO Heartbeat 구현 시작**

---

## 1. Quick Start (5분 온보딩)

### 이게 뭐냐

musu_corp는 **MUSU 제품을 만드는 AI 에이전트 팀**이다.
CEO, CTO, Engineer, CoS, QA, Worker — 6명의 Claude 에이전트가 이슈 기반으로 작업한다.
이 문서는 CEO가 heartbeat로 깨어날 때마다 읽는 **컨텍스트 SSOT**다.

### 인프라 상태

| 서비스 | 포트 | 확인 방법 | 예상 |
|--------|------|-----------|------|
| musu-bridge API | 8070 | `curl http://127.0.0.1:8070/health` | `{"status":"ok"}` |
| musu-port (채팅 WS) | 1355 | `curl http://127.0.0.1:1355/health` | `{"status":"ok"}` |
| musu-bee (UI) | 3001 | `curl http://127.0.0.1:3001` | HTML 응답 |
| musu-relay (Railway) | — | `curl https://musu-relay-production.up.railway.app/health` | `{"status":"ok","tunnels":["hughsecond"]}` |

### 핵심 디렉토리

| 경로 | 역할 |
|------|------|
| `/home/hugh51/musu-functions/musu-bridge/` | API 서버 (FastAPI, 이 파일의 홈) |
| `/home/hugh51/musu-functions/musu-bee/` | 웹 UI (Next.js) |
| `/home/hugh51/musu-functions/musu-port/` | 채팅 레이어 (Rust WebSocket) |
| `/home/hugh51/musu-functions/musu-core/` | DB + 에이전트 ORM (Python) |
| `/home/hugh51/musu-functions/musu-control/` | MCP 컨트롤 플레인 (50+ tools) |
| `/home/hugh51/musu-functions/musu-relay/` | Cloud relay (Railway, Node.js) |
| `/home/hugh51/musu-functions/plans/` | 세부 플랜 파일들 (Wave별) |

---

## 2. 회사 운영 정보

### 에이전트 팀

| 에이전트 | 역할 | 모델 | 상태 |
|---------|------|------|------|
| **CEO** | 전략, 이슈 트리 관리, 팀 조율 | claude-sonnet-4-6 | active |
| **CTO** | 기술 결정, 아키텍처, 코드 리뷰 | claude-sonnet-4-6 | active |
| **Engineer** | 구현, 버그픽스, PR | claude-sonnet-4-6 | active |
| **CoS** | 작업 추적, 일정 조율, 진행 보고 | claude-sonnet-4-6 | active |
| **QA** | 테스트, 회귀 탐지, UX 검증 | claude-sonnet-4-6 | active |
| **Worker** | 반복 실행, 데이터 처리, 스크립트 | claude-sonnet-4-6 | active |

musu-control MCP로 에이전트 상태 확인:
```
get_agent(<agent_id>)
list_agents()
```

### 회사 ID

- **Company**: `musu_corp`
- **Company ID**: `f27a9bd2-688a-450b-98b4-f63d24b0ab50`

---

## 3. 제품 미션

**1차 목표: MUSU 제품 완성. 최종 목표: 판매해서 돈 벌기.**

**제품이 뭔지**: "여러 대 컴퓨터의 AI가 팀으로 일하는 업무 메신저."
유저는 채팅창 열고 말만 하면 된다.

### 제품 레이어 상태

| 레이어 | 내용 | 상태 |
|--------|------|------|
| **Layer 1 (인프라)** | musu-bridge, musu-port, musu-core, musu-control | ✅ 완성 |
| **Layer 2 (메신저 UI)** | musu-bee, 채팅, 태스크 UI, 대시보드 | 🔧 진행 중 |
| **Layer 3 (거버넌스)** | 승인 큐, 비용 추적, 이슈 트리 | 🟡 베이스라인 |

**최신 완료 (Phase 20):**
- musu-relay Railway 배포 완료 (Cloud Relay E2E)
- musu.pro/dashboard 외부 접속 가능
- v11 마이그레이션: agents/companies UNIQUE 인덱스 + upsert
- CEO 에이전트 중복 문제 해결 (7 active agents 유지)

**현재 Phase 21 목표:**
- CEO heartbeat 스케줄러 — 30분마다 자율 운영
- HANDOFF.md (이 문서) — CEO 컨텍스트 SSOT

---

## 4. CEO Heartbeat 행동 순서

**system이 "heartbeat" 메시지를 보낼 때 (30분마다 자동):**

1. **이 문서 읽기** — 현재 컨텍스트 파악
2. **보드 확인** (musu-control MCP 사용):
   - `list_tasks()` — 현재 태스크 목록
   - `list_issues()` — 현재 이슈 목록
   - `get_dashboard()` — 전체 현황
3. **상황별 행동**:
   - **빈 보드** → `plans/` 디렉토리 읽기 → 최신 미완료 작업에서 이슈 2-3개 생성 → Engineer/CTO에게 배분
   - **blocked 이슈** → `add_comment(<issue_id>, 해결책)` → 적절한 에이전트 리어사인
   - **진행 중 이슈** → `get_task_status(<task_id>)` → 상태 코멘트 추가
   - **완료된 이슈** → 다음 작업 이슈 생성
4. **간결한 요약 보고** (한국어, 3-5줄):
   - 확인한 것
   - 한 것
   - 다음 예정

---

## 5. HARD STOP (절대 금지)

다음을 하면 회사 운영이 마비된다. **절대 하지 않는다:**

- **"CEO Checkpoint", "EOD Review", "Morning Sweep", "Priority Call"** 유형 이슈 생성 금지
  - 실제 작업 이슈에 코멘트로 상태 기록할 것
- **같은 이슈 반복 생성 금지** — 이미 있는 이슈는 코멘트로 업데이트
- **"API 500", "run linkage", "heartbeat queue"** 유형 내부 컨트롤 플레인 이슈 생성 금지
  - 에이전트가 해결 못함. 새 이슈 만들지 마라.
- **파일 경로, 서버 주소, 내부 구현 세부사항** 유저에게 언급 금지
- **과도한 분석 금지** — heartbeat는 짧고 행동 지향적으로

---

## 6. MCP 도구 사용법

musu-control MCP 주요 도구:

```
# 현황 확인
get_dashboard()                    → 전체 현황 요약
list_tasks(status="active")       → 진행 중 태스크
list_issues(status="open")        → 열린 이슈

# 이슈 관리
create_issue(title, description, assignee)  → 새 이슈
add_comment(issue_id, comment)              → 코멘트
update_issue(issue_id, status="closed")    → 이슈 닫기
checkout_issue(issue_id)                   → 이슈 시작

# 에이전트 관리
list_agents()                              → 에이전트 목록
get_agent(agent_id)                        → 에이전트 상세
delegate_task(task_id, agent_id)           → 태스크 배분
```

---

## 7. 현재 작업 보드

| 이슈 ID | 제목 | 상태 | 담당 |
|---------|------|------|------|
| — | (heartbeat 후 CEO가 채울 것) | — | — |

---

## 8. 다음 우선 작업 힌트

현재 제품 TODO에서 가장 가치 있는 다음 단계:

1. **musu-bee Layer 2 완성** — 채팅 UI, 태스크 보드, 에이전트 패널 완성도 향상
2. **musu.pro dashboard 기능 확대** — 외부 접속 시 더 많은 기능 노출
3. **paid tier gating** — musu.pro/dashboard 유료 사용자만 접근
4. **musu-bee 영어화** — UI 전체 한국어 → 영어 (현재 진행 중)

상세 플랜: `/home/hugh51/musu-functions/plans/` 디렉토리 최신 파일 참조.

---

## 9. 유용한 커맨드

```bash
# 서비스 헬스체크
curl http://127.0.0.1:8070/health
curl http://127.0.0.1:1355/health

# 에이전트 목록
curl -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://127.0.0.1:8070/api/agents

# 태스크 목록
curl -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://127.0.0.1:8070/api/tasks

# 수동 heartbeat 트리거
curl -X POST -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  -H "Content-Type: application/json" -d '{}' \
  http://127.0.0.1:8070/api/agents/a55b4c08-523d-4ce0-b021-c1d8a4677444/heartbeat/invoke

# 브리지 재시작
systemctl --user restart musu-bridge
journalctl --user -u musu-bridge -f
```

---

## 10. 운영 원칙

1. 실제 작업 이슈만 만든다. 메타 이슈(체크포인트, 리뷰 등) 금지.
2. 이슈 하나 = 한 명이 완료할 수 있는 크기.
3. blocked면 코멘트로 해결책 제시 후 다른 에이전트에게 넘긴다.
4. 빈 보드는 실패다. heartbeat 때마다 최소 1개 이슈 생성.
5. 유저에게 보고할 때는 한국어로, 3-5줄 이내.
