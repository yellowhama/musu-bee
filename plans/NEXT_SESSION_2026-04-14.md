# 다음 세션 TODO — 2026-04-14 세션 후

> 작성: 2026-04-14 | 이 세션에서 완료된 것 기준으로 남은 것 정리

---

## 즉시 해야 할 것 (세션 시작 5분 안에)

### 1. Claude Code 재시작 → musu-control MCP 확인
```bash
# Claude Code 재시작 후
/mcp
# → musu-control이 목록에 있어야 함 (24개 도구)
```
등록 위치: `~/.claude/mcp-servers.json`
`PAPERCLIP_API_URL=http://localhost:8070/api` → musu-bridge LocalBackend 연결

### 2. musu-bee dev 서버 재시작 → LOCAL/REMOTE 토글 확인
```bash
cd musu-functions/musu-bee && npm run dev
```
- 에이전트 채널(ceo/cto 등)에서 채널 헤더에 LOCAL/REMOTE 버튼 보여야 함
- REMOTE 선택 → `MUSU_BRIDGE_REMOTE_URL=http://100.121.211.106:8070` 로 라우팅
- Devices 사이드바: 2개 노드 표시 (로컬 + hugh-main-1)

### 3. musu-bridge 재시작 → company layer 검증
```bash
# musu-bridge 재시작 (이미 실행 중이면 restart)
curl localhost:8070/api/companies
# → []

curl -X POST localhost:8070/api/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Corp", "workspace_id": "ws-001"}'
# → {"id": "...", "name": "Test Corp", ...}
```

### 4. musu-core pytest → company layer 검증
```bash
cd musu-functions/musu-core
python -m pytest tests/ -v --tb=short
# → 전체 pass (231 기존 + company layer)
```

---

## 마무리 잔여 작업

### 5. OPERATOR_INGRESS_ACCEPTANCE.md 업데이트 (2B)
```
파일: musu-functions/musu-port/OPERATOR_INGRESS_ACCEPTANCE.md
내용: WSL parity 테스트 결과 기록
  - standalone_runtime_matches_parity_baseline: PASS (2026-04-14)
  - 수정: state.rs L974-979 — promote 후 즉시 reconcile_routes 호출
  - 6/6 parity tests pass
```

### 6. tsc + build 최종 확인
```bash
cd musu-functions/musu-bee
rtk tsc         # → 0 errors (이미 확인됨)
rtk next build  # → production build clean
```

---

## Phase 3 검증 (멀티머신)

### 7. /peers 엔드포인트 검증
```bash
# musu-port가 MUSU_PORT_PEERS=http://100.121.211.106:1355 로 실행 중인지 확인
curl http://localhost:1355/peers
# → [{"device_id": "hugh-main", "status": "ok", "ip": "100.121.211.106"}]
```

### 8. 원격 에이전트 라우팅 E2E 테스트
musu-bee UI → REMOTE 선택 → CEO 채널 메시지 전송
→ 원격(100.121.211.106:8070) CEO 응답 확인

---

## Phase 4 아키텍처 결정 필요

### 9. musu-control MCP → 기본 인터페이스 전환 검토

현재:
```
Claude Code → HTTP → musu-bridge → agent adapters
```

목표:
```
Claude Code → MCP tools (musu-control) → musu-bridge → agent adapters
```

musu-control 24개 도구 중 musu-bridge LocalBackend와 API 매핑 확인 필요.
현재 musu-control은 Paperclip API를 바라보는데, LocalBackend (/api/agents, /api/tasks 등)와
엔드포인트가 일치하는지 검증.

테스트:
```bash
# musu-bridge 실행 중 상태에서
# MCP 도구 직접 호출: mcp__musu-control__list_agents
```

---

## 커밋 필요 파일 목록

이 세션에서 수정됐지만 커밋 안 된 파일들:

| 파일 | 변경 내용 |
|------|----------|
| `musu-bee/src/components/CommandPalette.tsx` | 신규 (cmd+K 팔레트) |
| `musu-bee/src/components/AppShell.tsx` | cmd+K 리스너 + CommandPalette 마운트 + LOCAL/REMOTE state |
| `musu-bee/src/components/ChatArea.tsx` | externalInput + LOCAL/REMOTE 토글 버튼 |
| `musu-bee/src/lib/useChat.ts` | activeNode state + setActiveNode |
| `musu-bee/src/app/api/agent-route/route.ts` | node param + REMOTE 라우팅 |
| `musu-bee/src/app/api/index-search/route.ts` | FTS5 코드 검색 API (tsc 픽스 포함) |
| `musu-bee/src/lib/chatCommands/handleWikiCommand.ts` | @wiki + code index 병렬 검색 |
| `musu-bee/.env.local` | MUSU_PORT_PEERS + MUSU_BRIDGE_REMOTE_URL |
| `musu-core/src/musu_core/db.py` | company layer 4개 테이블 |
| `musu-core/src/musu_core/migrations.py` | v4_company_layer |
| `musu-core/src/musu_core/backends/local.py` | company CRUD 5개 메서드 |
| `musu-bridge/server.py` | /api/companies 4개 엔드포인트 |
| `musu-indexer/pyproject.toml` | pytest pythonpath 픽스 |
| `musu-port/crates/musu-port-core/src/state.rs` | L4 parity 즉시 reconcile 픽스 |
| `musu-connects/NAT_RELAY_FALLBACK_RISK_REGISTER.md` | NAT 리스크 레지스터 |
| `~/.claude/mcp-servers.json` | musu-control MCP 등록 |

커밋 전 `rtk git status` 로 전체 확인.

---

## 세션 시작 체크리스트

```
[ ] Claude Code 재시작 완료
[ ] /mcp → musu-control 24개 도구 확인
[ ] musu-bee dev 재시작 → LOCAL/REMOTE 토글 UI 확인
[ ] curl /api/companies → [] 반환 확인
[ ] musu-core pytest → 전부 pass
[ ] OPERATOR_INGRESS_ACCEPTANCE.md 업데이트
[ ] curl /peers → hugh-main-1 표시 확인
[ ] git commit (위 파일 목록 전부)
```
