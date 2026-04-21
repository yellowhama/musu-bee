# MUSU Phase 37-40 마스터 플랜
**날짜**: 2026-04-22
**참고**: wiki/120_MUSU_PHASE37_NEXT_STEPS_2026-04-22.md

---

## 개요

| Phase | 기능 | 상태 | 예상 시간 |
|-------|------|------|-----------|
| 37 | QUIC cert pinning | **완료됨** (검증만 필요) | 10분 |
| 38 | route_executions Runs/비용 UI | 미구현 | 1-2시간 |
| 39 | AgentGrid 낙관적 업데이트 | 미구현 | 30분 |
| 40 | musu-bridge 테스트 rate-limit 수정 | 미구현 | 30분 |

---

## Phase 37: QUIC Cert Pinning (이미 완료)

### 발견 내용
코드 감사 결과 Phase 37이 이미 완전히 구현되어 있음:
- `bridge_proxy.rs`: `FingerprintVerifier`, `fetch_fingerprint()` 존재
- `start-bridge.sh`: `~/.musu/quic_cert.der` → SHA-256 → `MUSU_QUIC_FINGERPRINT` export
- `registry.py`: `cert_fingerprint` 필드를 musu.pro 등록 페이로드에 포함
- Supabase `nodes` 테이블 `cert_fingerprint` 컬럼 존재 (확인됨)
- 라이브 데이터:
  - 5070: `4d:85:2a:f6:24:27:74...`
  - 4060: `41:d6:e1:04:14:e3:fc...` (로컬 일치 확인)

### 필요 작업
- [ ] `bash scripts/verify-fingerprint.sh` 스모크 테스트 실행
- [ ] wiki 문서에 "Phase 37 이미 완료" 기록

---

## Phase 38: Runs/비용 UI

**세부 플랜**: `plans/PLAN_38_RUNS_UI.md`

### 구현 범위
1. `GET /api/bridge/companies/{id}/costs/summary` — 노드 이름별 총 비용
2. `GET /api/bridge/companies/{id}/costs/by-agent` — 에이전트별 비용
3. DashboardClient에 "Runs" 탭 추가
4. 비용 표 + 최근 실행 목록 (status 컬러 뱃지)

### 핵심 파일
- `vibecode-town/src/app/dashboard/DashboardClient.tsx` — Runs 탭 추가
- `vibecode-town/src/app/api/bridge/companies/` — 이미 존재하는 proxy route 확인 필요
- `musu-bridge/server.py` — `/api/routes/recent` 이미 존재

---

## Phase 39: AgentGrid 낙관적 업데이트

**세부 플랜**: `plans/PLAN_39_OPTIMISTIC_UPDATE.md`

### 구현 범위
```typescript
interface AgentGridProps {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  onAgentUpdated?: (agentId: string, patch: Partial<LiveAgent>) => void;
}
```

DashboardClient에 `agentOverrides` state → AgentGrid에서 `onAgentUpdated` 콜백으로 즉각 반영.

---

## Phase 40: 테스트 Rate-Limit 수정

**세부 플랜**: `plans/PLAN_40_TEST_RATELIMIT.md`

### 구현 범위
`musu-bridge/conftest.py`에서 각 테스트 전 rate limiter 리셋:
```python
@pytest.fixture(autouse=True)
def reset_rate_limiter():
    from server import app
    # rate_limiter 상태 리셋
    yield
```

또는 환경변수 `MUSU_DISABLE_RATE_LIMIT=1`로 테스트 환경에서 비활성화.

---

## 작업 순서

```
[지금] Phase 37 스모크 테스트 검증 (10분)
  ↓
[다음] Phase 40 테스트 수정 (30분) — 다른 구현 작업 전에 테스트 통과 필요
  ↓
Phase 39 낙관적 업데이트 (30분)
  ↓
Phase 38 Runs UI (1-2시간)
```

**Phase 40을 먼저 하는 이유**: Phase 38/39 구현 시 새 테스트가 기존 rate-limit 이슈로 오염될 수 있음.
