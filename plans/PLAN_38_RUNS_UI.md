# Plan 38: Runs/비용 UI
**날짜**: 2026-04-22

## 현재 상태
- `/api/companies/{id}/costs/summary` — company_id 필요
- `/api/companies/{id}/costs/by-agent` — company_id 필요
- 전역(global) costs 엔드포인트 없음
- `/api/runs/recent` 없음

## 구현 범위

### Task 1: musu-core — 전역 costs/runs 메서드 추가 (TDD)
**파일**: `musu-core/src/musu_core/backends/local.py`
```python
def get_runs_recent(self, limit: int = 50) -> list[dict]:
    """전체 route_executions 최근 N개 반환."""

def get_costs_global(self) -> dict:
    """전체 company 합산 비용 요약."""

def get_costs_by_agent_global(self) -> list[dict]:
    """전체 company 합산 에이전트별 비용."""
```

### Task 2: musu-bridge — 전역 엔드포인트 추가
**파일**: `musu-bridge/server.py`
```
GET /api/runs/recent?limit=50
GET /api/costs/summary
GET /api/costs/by-agent
```

### Task 3: vibecode-town — DashboardClient Runs 탭
**파일**: `vibecode-town/src/app/dashboard/DashboardClient.tsx`
- "Runs" 탭 버튼 (기존 뷰 오른쪽에)
- 탭 상태: "agents" | "runs"
- Runs 뷰:
  - 비용 요약 헤더 (total_requests, done, failed)
  - 에이전트별 비용 테이블
  - (옵션) 최근 실행 목록

## 응답 형태
```json
// GET /api/runs/recent
[{"id": "...", "channel": "ceo", "status": "done", "created_at": "...", "company_id": "..."}]

// GET /api/costs/summary
{"total_requests": 15634, "by_status": {"done": 145, "failed": 15619}, "period": "all_time"}

// GET /api/costs/by-agent
[{"agent_name": "ceo", "total_requests": 50, "done": 45, "failed": 5}]
```
