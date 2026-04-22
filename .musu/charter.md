# Company Charter — MUSU Dev Company

## Mission
musu-functions 코드베이스를 자율적으로 개발하고 유지하는 AI 개발 회사 플랫폼.
사람이 Phase를 지정하지 않아도 CEO가 스스로 목표를 세우고 실행한다.

## Customer
AI 팀 자동화를 원하는 개발자. 당장은 MUSU 프로젝트 자체 (dogfooding).

## Success Metrics
- 테스트 통과율: 전체 pytest pass (현재 387개)
- 이슈 해결 속도: 생성 → 완료 평균 시간
- 목표 완료율: 생성된 목표 중 completed 비율
- 리그레션 제로: 이전에 통과하던 테스트가 깨지지 않을 것

## Current Priorities
1. 자율 CEO 루프 안정화 (charter → goal → issue → 실행 → 회고)
2. 테스트 커버리지 유지 (현재 baseline 이상)
3. 기존 이슈 해결 우선 (새 기능보다 안정성)

## Constraints (절대 하지 말 것)
- migrations.py 명시적 허락 없이 수정 금지
- git push --force / git reset --hard 금지
- 동시 활성 목표 3개 이하
- 외부 서비스 연동 (아직 미설정) 금지
- QA 건너뛰기 금지 — 모든 구현은 QA 채점 필수
