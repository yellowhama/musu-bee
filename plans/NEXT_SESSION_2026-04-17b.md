# 다음 세션 TODO — 2026-04-17 (Phase 12 완료 후)

> 작성: 2026-04-17 | Phase 12 (SyncOrchestrator wire-up + bridge hardening) 완료 기준

---

## 이번 세션에서 완료된 것 (Phase 12)

| 태스크 | 상태 | 내용 |
|--------|------|------|
| A-3 | ✅ | musu-bee E2E 8개 파일 커밋, scripts/*.log untrack |
| A-1 | ✅ | sync_engine.py _BRIDGE_TOKEN → _get_bridge_token() lazy getter |
| A-2 | ✅ | bridge_proxy.rs:265 unwrap → expect |
| B-1 | ✅ | SyncOrchestrator → bridge-proxy 3-way tokio::select! 통합 |
| C | ✅ | cargo 49 + pytest 231 + npm build pass, 4커밋, push |

---

## 남은 Phase 3 항목 (다음 세션 대상)

### P0: MUSU_TOKEN peer discovery 활성화

```bash
# musu.pro 계정에서 node token 발급
# ~/.musu/bridge_token + MUSU_TOKEN 환경변수 설정
# bridge-proxy 재시작 후 fingerprint verification 로그 확인
# [bridge-proxy] MUSU_TOKEN present — fingerprint verification enabled
```

### P1: QUIC connection pool

현재 bridge_proxy.rs의 `quic_send_simple()`이 매 forward마다 새 QUIC 연결 생성.
개선: `DashMap<SocketAddr, quinn::Connection>` 연결 캐시 + TTL/idle 정리.

**파일:** `musu-connects/apps/musu-connectsd/src/bridge_proxy.rs`
- `quic_send_simple()` 함수 → connection pool 사용으로 변경
- `ProxyState`에 `conn_pool` 추가 (이미 있음, 단 현재 사용 안 함)

### P2: cert fingerprint 기반 peer 인증

현재 NoVerifier (암호화만, peer 인증 없음).
- 시작 시 `~/.musu/quic_cert.pem` 저장
- musu.pro에 fingerprint 등록
- 클라이언트: 연결 전 musu.pro에서 fingerprint 조회 후 검증

### P3: musu-control MCP 검증

```bash
# musu-bridge 실행 상태에서
# MCP 도구 호출: mcp__musu-control__list_agents
# → musu-bridge LocalBackend /api/agents와 연결 확인
```

---

## 체크리스트

```
[ ] MUSU_TOKEN 발급 + bridge-proxy fingerprint 로그 확인
[ ] QUIC connection pool 구현 (bridge_proxy.rs)
[ ] musu-control MCP list_agents 도구 테스트
[ ] cargo test → 49+ pass
[ ] git push
```
