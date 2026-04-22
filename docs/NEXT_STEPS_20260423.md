# Next Steps & Code Audit (2026-04-23)

## 1. 정성적 평가 (Qualitative Assessment)
- **현황**: Phase 68까지 완료된 "멀티 컴퍼니 하트비트" 인프라 위에, 유동적인 모델 전환 시스템(Model Switching)이 성공적으로 통합됨.
- **강점**: 시스템이 특정 벤더(Anthropic) 의존성을 탈피하여 Gemini, Codex 등 다양한 엔진을 상황에 맞춰(비용, 가용성, 성능) 조합할 수 있는 **"Agile LLM Runtime"**의 형태를 갖춤.
- **리스크**: 모델마다 프롬프트 해석 능력이 다르므로, Claude에 최적화된 복잡한 인스트럭션이 Gemini나 Codex에서 기대와 다르게 작동할 가능성이 존재함 (모델별 Instructions 분리 필요).

## 2. Code Audit 결과
- **Type Safety**: `RouteRequest`와 `AdapterContext`에 `adapter_override` 타입이 정상적으로 전파됨.
- **Mesh Integrity**: `MeshRouter`가 원격 노드 포워딩 시에도 오버라이드 값을 누락하지 않도록 수정됨.
- **Error Handling**: `gemini_local.py`와 `claude_local.py`가 상호 호환되는 `ErrorCode.RATE_LIMIT` 패턴을 사용하여 폴백 메커니즘이 안정적으로 작동함.
- **Frontend**: `useChat.ts`에서 명령어를 가로채고 상태를 유지하는 방식이 React 패턴에 적합하게 구현됨.

## 3. 완료된 과제 (Implemented Today)

### P0: 모델별 인스트럭션 최적화 (Implemented)
- `resolve_instructions` 헬퍼를 통해 `ceo.gemini.md`와 같이 모델 접미사가 붙은 파일을 자동으로 우선 선택하도록 구현함.
- `GeminiLocalAdapter`가 `--append-system-prompt-file`을 지원하도록 업데이트됨.

### P1: 가시성 강화 (Implemented)
- `musu-bridge`가 응답에 `adapter_type`을 포함하도록 수정됨.
- `musu-bee` UI에 `AdapterBadge`를 추가하여 각 메시지가 어떤 모델로 생성되었는지(CLAUDE, GEMINI 등) 시각적으로 표시함.

### P2: 비용 기반 자동 라우팅 (Implemented)
- `musu_core/complexity.py`에 `ComplexityScorer` 구현 (프롬프트 길이 및 키워드 기반 난이도 측정).
- 단순 요청(Score < 0.4)은 저비용 모델(Gemini)로, 복잡한 요청은 고성능 모델(Claude)로 자동 라우팅하는 `cost_optimized` 로직을 `router.py`에 추가.

### P3: P2P 보안 실구현 (Implemented)
- `musu-connects` (Rust)의 `FingerprintVerifier`가 실제 서명 검증을 수행하도록 보강됨.
- `FingerprintClientVerifier`를 구현하여 서버측에서도 클라이언트의 인증서를 검증하는 mTLS 구조를 완성함.
- `MeshRouter`와 `registry.py`가 노드의 TLS 지문을 추적하고 전달하도록 업데이트됨.

### P4: 실시간 성능/비용 지표 (Implemented)
- `route_executions` DB 스키마 업데이트 (`duration_sec` 추가).
- 메시지마다 지연 시간(Latency)과 소모 비용(USD)을 수집하여 UI의 뱃지에 실시간 노출.
- `/api/companies/{id}/metrics` API를 생성하여 회사별 시계열 데이터(비용, 속도) 제공 기반 마련.

### P5: MUSU Design System 통합 (Implemented)
- `colors_and_type.css` 토큰을 `globals.css`에 통합하여 일관된 다크 테마("Musu Dark") 구축.
- `ChatArea.tsx` 및 `Sidebar.tsx` 전면 리팩터링: 채널 디자인, 입력창(Composer) 액션 버튼, 스크롤바 커스텀 적용.
- 역할별(CE, CT, EN, QA) 전용 아바타(Avatar) 컴포넌트 신규 개발 및 `ApprovalCard` 디자인 고도화.

## 4. 향후 과제 (Remaining Next Steps)
- **대시보드 UI 확장**: 새로 추가된 `/metrics` 엔드포인트를 활용해 `musu-bee` 메인 화면에 시계열 그래프(Chart) 컴포넌트 추가.
- **포트 충돌 완화 로직 개선**: 윈도우-WSL 환경에서의 네트워크 충돌이나 오프라인 렌더링 버그 발생 시 `musu-portd`를 안전하게 자동 복구하는 Watchdog 강화.
