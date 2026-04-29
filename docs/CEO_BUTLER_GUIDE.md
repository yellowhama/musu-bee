# CEO Butler — Your AI Steward
# CEO 집사 — 당신의 AI 비서

---

## What is the CEO? / CEO란?

MUSU를 설치하면 **CEO 에이전트**가 자동으로 생성된다.
이 에이전트는 30분마다 시스템을 점검하고, 문제를 감지하고, 에이전트 팀을 관리한다.

When you install MUSU, a **CEO agent** is automatically created.
It checks your system every 30 minutes, detects problems, and manages your agent team.

**첫 부팅 시 CEO가 자동으로 인사한다:**
```
회장님, CEO입니다.
시스템 준비 완료. 에이전트 9명 대기 중.
명령을 기다리겠습니다.
```

---

## How to Talk to the CEO / CEO에게 말 걸기

```bash
# 상태 보고
musu-delegate ceo "지금 상태 보고해"

# 스프린트 계획
musu-delegate ceo "이번 주 스프린트 계획 세워줘. 목표: 인증 시스템 리팩터링"

# 이슈 우선 처리
musu-delegate ceo "이 이슈 최우선으로 처리해: 로그인 버그"

# 리서치 요청
musu-delegate ceo "React Server Components 아키텍처를 조사해서 보고해"

# 팀 상태
musu-delegate ceo "각 에이전트 상태 확인하고 문제 있으면 보고해"
```

---

## What the CEO Does Automatically / CEO가 자동으로 하는 일

Every 30 minutes (heartbeat):

| 단계 | 동작 | MCP Tool |
|------|------|----------|
| 1 | 시스템 점검 | `get_dashboard()` |
| 2 | 노드 상태 확인 | `list_nodes()` |
| 3 | stuck 태스크 감지 → 자동 취소 | `cancel_task()` |
| 4 | 오프라인 노드 기록 | `post_board_message()` |
| 5 | 활성 목표/이슈 확인 | `list_goals()`, `list_issues()` |
| 6 | 비용 추적 | `get_costs_summary()` |
| 7 | #ceo-board에 상태 보고 | `post_board_message()` |

---

## What the CEO Will NOT Do / CEO가 하지 않는 일

| 금지 사항 | 이유 |
|-----------|------|
| 유저 지시 없이 이슈 생성 ❌ | Chairman Principle: 유저가 결정 |
| 유저 지시 없이 태스크 위임 ❌ | 집사는 시키면 하는 사람이 아님 |
| 코드 직접 작성 ❌ | Engineer에게 위임 |
| "뭘 하시겠습니까?" 질문 ❌ | 상황 브리핑만. 물어보지 않음 |

---

## The Chairman Principle / 회장 원칙

```
유저 = 회장 (Chairman)
CEO = 집사 (Butler/Steward)

보고할 때: 결과만. 과정은 말고.
✅ "보안 패치 배포했습니다. 결제만 남았습니다."
❌ "route_executions 277건, pytest 531 pass, migration v16..."

주인이 물으면: 3초 브리핑.
안 물어도: 중요한 건 먼저 보고.
```

---

## CEO + Team Pipeline / CEO와 팀 파이프라인

```
You: "인증 시스템 리팩터링 해줘"
  |
CEO ──→ 이슈 분해 + Lead에게 위임
  |
Lead ──→ Engineer에게 코드 작업 지시
  |
Engineer ──→ 코드 작성 + 테스트
  |
QA ──→ 4기준 점수 매기기 (7/10 이상 = 통과)
  |
  ↓ 미달 시 재작업 (최대 3회)
  |
CEO ──→ 완료 보고: "인증 리팩터링 완료. QA 8.5/10."
```

---

## Monitoring the CEO / CEO 모니터링

```bash
# CEO 보드 메시지 확인
curl http://localhost:8070/api/messages?group_id=ceo-board&limit=5

# 웹 대시보드에서 확인
open http://localhost:3001/app

# 최근 태스크 확인
curl http://localhost:8070/api/tasks?limit=5
```

---

## Troubleshooting / 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| CEO 인사 안 옴 | heartbeat 아직 안 돌았음 | 60초 기다리거나 `systemctl --user restart musu-bridge` |
| "Agent unavailable" | CEO 에이전트 retired/paused | `just purge-retired` 후 bridge 재시작 |
| 응답 느림 | RAM 부족 (8GB WSL2) | `.wslconfig` → `memory=24GB` + `wsl --shutdown` |
| CEO가 엉뚱한 일 함 | instructions 미반영 | bridge 재시작하면 최신 ceo.md 로드 |
