# 다음 세션 TODO — 2026-04-15

## 현재 상태 요약

**Phase 7 구현 완료** (musu.pro 클라우드 레지스트리 + musu-bridge 하트비트 + musu-bee NodePanel)
**코드 감사 4 Critical 픽스 완료**
**정성적 점수: 89/100** (Phase 5: 79 → Phase 6: 86 → Phase 7: 89)

### 스택 현황
| 컴포넌트 | 상태 | 포트 |
|---------|------|------|
| musu-bridge (main-pc) | 실행 중 (Phase 6 코드) | :8070 |
| musu-bridge (원격 hugh-main-1) | 실행 중 | :8070 |
| musu-bee | dev 재시작 필요 | :3001 |
| musu.pro | Vercel 배포됨 (Phase 7 코드) | — |

---

## P0 — 즉시 처리 (다음 세션 시작 시)

### 1. main-pc musu-bridge Phase 7 배포
```bash
# musu-bridge 재시작 (MUSU_TOKEN + MUSU_BRIDGE_PUBLIC_URL 추가)
cd /home/hugh51/musu-functions/musu-bridge
# .env 또는 직접 export:
export MUSU_TOKEN=b20dab7b57b34d18675574e6a8308ef9f61239a63d44bcd3
export MUSU_BRIDGE_PUBLIC_URL=http://100.x.x.x:8070  # ← main-pc Tailscale IP
export MUSU_NODE_NAME=main-pc
nohup python server.py > /tmp/bridge.log 2>&1 &
# 로그에서 "registry: heartbeat task started" 확인
```

### 2. musu-bee 재시작
```bash
cd /home/hugh51/musu-functions/musu-bee
# .env.local에 이미 MUSU_TOKEN 설정됨
# MUSU_REGISTRY_URL=http://localhost:3000  # (로컬 musu.pro dev라면)
npm run dev
# NodePanel → "My Nodes (musu.pro)" 섹션 확인
```

### 3. Account 페이지 브라우저 검증
- musu.pro/account 접속
- "Node Tokens" 섹션 존재 확인
- 토큰 생성 → 복사 버튼 동작 확인
- 토큰 삭제 동작 확인

### 4. E2E 페어링 검증
```
[ ] musu.pro Account에서 토큰 발급
[ ] musu-bridge MUSU_TOKEN 설정 + 재시작
[ ] Supabase nodes 테이블 row 확인 (heartbeat 작동 여부)
[ ] musu-bee NodePanel → "My Nodes" 섹션에 노드 표시 확인
[ ] "Pair" 클릭 → 페어링 성공 확인
[ ] MUSU_TOKEN 없을 때 → 기존 IP 폼만 표시 확인
```

---

## P1 — 다음 주요 기능

### Phase 8A — musu-bee 메시지 히스토리 UI
- 현재: 메시지를 `/api/messages?session_id=` 로 가져올 수 있지만 UI 없음
- ChatArea에 히스토리 로드 + 스크롤 페이지네이션 추가
- `before_id` cursor-based pagination 활용

### Phase 8B — Company 컨텍스트 → 채팅 연동
- 현재: Company 정보가 있으나 채팅 시 컨텍스트로 주입 안 됨
- `route_chat()` 호출 시 active company 정보 system prompt에 포함

### Phase 8C — 원격 노드 상태 대시보드
- NodePanel에 각 노드의 agents 목록 표시 (pair 시 agents 정보 이미 수신)
- 노드별 마지막 응답 시간 표시

### Phase 9 — musu.pro 기능 확장
- 노드 온라인/오프라인 상태를 musu.pro에서도 표시
- 노드 last_seen을 실시간 업데이트 (현재 30초 간격)
- 다중 토큰 지원 (현재 1토큰/노드 가정)

---

## Warning Items

### 원격 머신 (hugh-main-1) Phase 7 미배포
- 현재 원격 머신은 Phase 6 코드 실행 중
- MUSU_TOKEN, MUSU_NODE_NAME 환경변수 설정 + 재시작 필요
- 접속 방법: Tailscale VPN → 직접 또는 SSH

### Warning 수준 감사 항목 (P0 아님, 다음 iteration에서 처리)
- W1: `sync_engine.py` — 노드 URL 검증 없음 (임의 URL sync 요청 가능)
- W2: `pair_with_node()` — 포트 범위 검증 없음 (1-65535 체크 추가 권장)
- W3: musu.pro `nodes` 테이블 — stale 노드 자동 만료 없음 (90초 UI 필터링만 있음)
- W4: `_write_toml()` — 프로세스 간 locking 없음 (같은 파일 여러 프로세스 쓰기 시 race)

---

## 정성적 평가 (2026-04-15 기준)

### 아키텍처 완성도: A-
```
[완료] Layer 1 인프라: musu-bridge HTTP 라우팅 + 상태 동기화
[완료] Layer 1 P2P: HTTP 페어링 (IP 입력)
[완료] Layer 1 Cloud: musu.pro 레지스트리 (IP-free 자동 발견)
[진행] Layer 2 UI: musu-bee 기본 채팅 + 노드 패널 (히스토리 미구현)
[미착수] Layer 3 거버넌스: 자율 에이전트 스케줄링
```

### 개발자 경험 (DX): B+
- 설치: Python 환경 + npm 환경 수동 설정 필요 (Docker/패키지 없음)
- 설정: MUSU_TOKEN 1개 복사 후 .env 설정 → 나머지 자동
- 페어링: 클라우드 토큰 있으면 1-click, 없으면 IP 입력 (여전히 동작)

### 시스템 안정성: B
- 강점: heartbeat 실패 시 graceful degradation (NodePanel IP 폼 fallback)
- 강점: mesh disabled 상태에서도 로컬 에이전트 정상 동작
- 약점: 노드 재시작 시 nodes.toml 상태 의존 (volatile)
- 약점: 동기화 충돌 해결 전략 단순 (last-write-wins)

### 보안: B+
- 강점: MUSU_BRIDGE_TOKEN Bearer 인증, Rate limiting (60req/min), CSRF/Hostname guard
- 강점: Phase 7 코드 감사 4 Critical 픽스 완료
- 약점: 노드 간 통신 암호화 없음 (Tailscale VPN 레이어에 의존)
- 약점: musu.pro 토큰 노출 시 해당 계정의 모든 노드 목록 노출
