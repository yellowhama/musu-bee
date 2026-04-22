# 96. CEO→팀장 구조 — 다음 단계 (2026-04-23)

## 오늘 완성한 것

### CEO→팀장 3-tier 계층 (SPEC-229)
- `team_lead.md` 인스트럭션 파일 생성
- 회사 템플릿에 team_lead 역할 추가
- CEO는 엔지니어 직접 관리 안 함 → 팀장에게 위임
- heartbeat에서 CEO→팀장 위임 로직 반영

### #ceo-board 단톡방 (SPEC-230)
- migration v16: `messages.group_id` 컬럼
- REST API: POST/GET `/api/groups`, POST/GET `/api/groups/{id}/messages`
- MCP 도구: `create_group`, `send_group_message`, `get_group_messages`
- 멀티 디바이스 CEO 간 소통 채널 확보

### 3-Panel UI (SPEC-231)
- NavTab(64px) | AIDisplay(Chrome tabs) | Chat(420px)
- Files, Dashboard 고정 탭 + 동적 탭 지원
- per-channel route timeout: CEO/engineer 300s

## 감사 결과
- **Bridge 테스트**: 277 passed (1 deselected)
- **Core 테스트**: 254 passed
- **합계**: 531 tests pass
- **TODO/FIXME**: server.py 0건, handlers.py 0건
- **인덱서**: DB locked (다른 프로세스 점유중 — 재시도 필요)

## 남은 작업

### P0: Forgejo 셋업
- 자체 호스팅 Git 서버 구축
- 에이전트가 코드를 push/pull 할 실제 리포지토리 필요
- Forgejo + SSH 키 자동 프로비저닝

### P0: 멀티 디바이스 실제 테스트
- 현재 #ceo-board는 코드만 있고 실물 테스트 미완료
- 두 대 이상의 기기에서 CEO 간 메시지 교환 검증
- WebSocket relay를 통한 cross-device 그룹 메시징 확인

### P1: 팀장 heartbeat 분리
- 현재 팀장 heartbeat가 CEO heartbeat 내부에서 호출됨
- 팀장 고유의 heartbeat 주기/로직 필요 (CEO와 독립)
- 팀장 자체 진단(diagnostic) + 상태 보고 분리

### P1: Skill Library 인구화
- `extract_skill` 파이프라인은 구축됨 (Phase 65)
- 실제 성공 trajectory에서 스킬 축적 필요
- 엔지니어 인스트럭션에 skill lookup 패턴 보강

### P2: 아키텍처 다이어그램 업데이트
- 기존 다이어그램은 CEO→Engineer 2-tier 기준
- CEO→TeamLead→Engineer 3-tier 반영 필요
- #ceo-board 그룹 메시징 플로우 추가
- 3-panel UI 레이아웃 다이어그램 작성
