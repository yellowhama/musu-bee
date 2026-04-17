# 다음 세션 TODO — 2026-04-17 세션 후

> 작성: 2026-04-17 | Phase 11 (프로세스 관리 + P2P + infra) 완료 기준

---

## 이번 세션에서 완료된 것

| 태스크 | 상태 | 내용 |
|--------|------|------|
| W-1 | ✅ | FastAPI lifespan migration |
| W-2 | ✅ | .env.example 6개 변수 추가 |
| W-3 | ✅ | musu-connects 미커밋 커밋 |
| PM-1 | ✅ | musu-worker 프로세스 엔드포인트 (psutil) |
| PM-2 | ✅ | musu-bridge /api/processes 프록시 |
| PM-3 | ✅ | musu-bee ProcessesPanel UI |
| MC-1 | ✅ | musu-connects P2P diff 커밋 |
| MC-2 | ✅ | SyncOrchestrator 구현 (49 tests pass) |
| IS-1/2 | ✅ | install.sh macOS + Docker 지원 |
| SPEC-163~165 | ✅ | 스펙 문서 업데이트 |

---

## 즉시 확인 (다음 세션 시작 5분)

### 1. 프로세스 관리 E2E 검증
```bash
curl http://localhost:9700/processes -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN"
# musu-bee UI에서 Processes 탭 확인
```

### 2. musu-connects cargo test
```bash
cd musu-functions/musu-connects && rtk cargo test
# → 49 passed
```

### 3. git push
```bash
cd musu-functions && rtk git push
```

---

## 남은 작업 (우선순위 순)

### P0: 2026-04-14 NEXT_SESSION 미완료 항목

1. **OPERATOR_INGRESS_ACCEPTANCE.md 업데이트**
   - `musu-port/OPERATOR_INGRESS_ACCEPTANCE.md`
   - WSL parity 테스트 결과 기록 (state.rs L974-979 픽스)

2. **musu-control MCP 검증**
   - `mcp__musu-control__list_agents` 직접 호출 테스트
   - musu-bridge LocalBackend `/api/agents` 매핑 확인

3. **원격 에이전트 라우팅 E2E**
   - musu-bee REMOTE → CEO → 원격 응답 확인

### P1: SyncOrchestrator → musu-connectsd 통합 (P2P 80% → 100%)

SyncOrchestrator를 main.rs에 실제 연결:
- tokio::spawn으로 올리는 통합 코드 작성
- Tailscale P2P 전송 레이어 안정화 검증

---

## 체크리스트

```
[ ] musu-worker /processes curl 테스트
[ ] musu-bee Processes 탭 브라우저 확인
[ ] musu-connects cargo test → 49 pass
[ ] OPERATOR_INGRESS_ACCEPTANCE.md 업데이트
[ ] musu-control MCP list_agents 도구 테스트
[ ] git push
```
