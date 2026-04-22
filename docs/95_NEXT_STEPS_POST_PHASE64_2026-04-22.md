# Phase 64 이후 다음 단계 (2026-04-22)

## 현재 평가 점수

| 항목 | Phase 57 이전 | Phase 64 이후 | 비고 |
|------|-------------|-------------|------|
| 전체 점수 | 68/100 | **78/100** | +10 향상 |
| 자율성 (Autonomy) | 5/10 | 7/10 | CEO 의사결정 루프 + 리서치 |
| 자기 치유 (Self-healing) | 2/10 | 6/10 | PreHeartbeatDiagnostic + auto-cancel |
| 자기 개선 (Self-improvement) | 1/10 | 4/10 | Level 2 (경험 저장/재사용) |
| 에이전트 협업 | 4/10 | 7/10 | 피어 통신 + 피드백 채널 |
| 프로덕션 안정성 | 6/10 | 8/10 | 자동 재시도 + 성공률 추적 |
| 테스트 커버리지 | 378 pass | 423 pass | +45 테스트 |

## Phase 64에서 변경된 것

1. **레거시 정리**: 구형 실패 기록 코드 제거, 에러 패턴 정리
2. **경험 저장소 (Experience Store)**: 성공 trajectory 저장 + 유사 작업 재사용 (자기 개선 Level 2)
3. **자동 재시도**: 실패 원인 분류 (transient/permanent) → transient 자동 재시도, permanent skip
4. **성공률 추적**: 에이전트별 성공률 노출

## 남은 갭 (eval 기준)

### P0 — 즉시 해결 필요
- **자기 개선 Level 3+**: 현재 Level 2 (경험 재사용)까지만 구현. Level 3 (전략 자체 수정) 미구현
  - CEO가 charter.md를 실제로 자동 수정하는 피드백 루프 필요
  - 반복 실패 패턴 → 자동 인스트럭션 조정
- **비용 추적 통합**: musu-control에 `get_costs_summary`/`get_costs_by_agent` MCP 도구는 있으나, 실제 LLM API 비용 연동 미완성
  - 토큰 사용량 → 달러 변환 파이프라인 필요
  - CEO가 비용 인식하고 예산 내 운영하는 로직 필요

### P1 — 단기 (1-2 세션)
- **datetime.utcnow() 제거**: server.py에 DeprecationWarning 1건 (datetime.UTC 전환)
- **E2E 통합 테스트**: 현재 유닛 테스트 423개만. 실제 멀티 에이전트 시나리오 E2E 부족
- **WebSocket relay 안정성**: relay_client.py 연결 끊김 시 재연결 로직 강화

### P2 — 중기
- **멀티 회사 동시 운영**: 현재 단일 회사 시나리오 위주. 3+ 회사 동시 구동 시 리소스 관리
- **에이전트 스케일링**: 회사당 에이전트 수 증가 시 heartbeat 스케줄러 부하
- **Wiki 검색 품질**: write_wiki_page로 쌓인 지식의 검색/활용 파이프라인

## 권장 다음 Phase

### Phase 65: Self-Improvement Level 3 — 전략 자동 조정
- CEO가 반복 실패 패턴 감지 → charter.md 자동 수정 제안 (승인 필요)
- 에이전트 인스트럭션 자동 튜닝 (성공률 기반)
- 예상 점수: 자기 개선 4/10 → 6/10

### Phase 66: Cost-Aware Operations
- LLM API 호출별 토큰/비용 기록 (experience store 확장)
- CEO 의사결정에 비용 변수 추가 ("이 작업은 $X 예상, 예산 내?")
- 일일/주간 비용 리포트 자동 생성

### Phase 67: E2E Integration Tests
- 3개 에이전트(CEO/CTO/Eng) 풀 시나리오 테스트
- 장애 주입 (agent crash, timeout, invalid response)
- 자기 치유 동작 검증

### Phase 68: Multi-Company Orchestration
- 회사 간 리소스 격리 강화
- 동시 3+ 회사 부하 테스트
- heartbeat 스케줄러 샤딩

## 목표

- Phase 65-66 완료 시 예상 점수: **85/100**
- Phase 67-68 완료 시 예상 점수: **90/100**
- 100점 기준: 완전 자율 운영 + 비용 최적화 + 멀티 테넌트 프로덕션
