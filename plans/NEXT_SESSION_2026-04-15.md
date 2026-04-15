# 다음 세션 TODO — 2026-04-15 세션 후

> 작성: 2026-04-15 | Wave 6 커밋 + MCP auth fix 완료 기준

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| musu-control MCP (24 tools) | ✅ 연결됨 (list_agents, list_tasks 작동) |
| musu-bridge auth | ✅ 토큰 인증 작동 (`~/.musu/bridge_token`) |
| Superpowers plugin | ✅ v5.0.7 설치됨 |
| Wave 6 커밋 | ✅ `3f29cabf` 푸시됨 |
| musu-control/client.py | ✅ bridge_token fallback + company_id default |
| musu-control/server.py | ✅ `_bridge_headers()` — 6곳 auth 적용 |
| get_dashboard MCP | ❌ bridge에 endpoint 없음 (미구현) |
| Phase 5 멀티머신 E2E | ❌ main-pc 미연결 (다음 세션) |

---

## 즉시 할 것 (세션 시작)

### 1. musu-bridge 재시작 확인
```bash
lsof -i :8070  # python3 프로세스 있어야 함
# 없으면:
cd ~/musu-functions && bash scripts/start-bridge.sh > /tmp/musu-bridge.log 2>&1 &
```

### 2. MCP 확인
```
list_agents → 7명 active
list_tasks  → {"count": 0, "tasks": []}
```

---

## Phase 5 E2E — 로컬 남은 것

### 3. nodes.toml URL 수정
```bash
sed -i 's|url = "http://127.0.0.1:8070"|url = "http://100.121.211.106:8070"|g' ~/.musu/nodes.toml
grep "url" ~/.musu/nodes.toml
```

### 4. LOCAL/REMOTE 토글 활성화
```bash
# musu-bee/src/components/ChatArea.tsx:650
grep -n "false &&" musu-bee/src/components/ChatArea.tsx
# {false && isAgentChannel → {isAgentChannel 로 수정
```

### 5. 커밋 필요 파일
```
musu-control/src/musu_control/client.py
musu-control/src/musu_control/server.py
scripts/musu-control-mcp.sh
```

---

## 코드 감사 결과 요약

**허용 가능 (개발 환경)**

| 항목 | 등급 | 설명 |
|------|------|------|
| `company_id` 하드코딩 | WARN | 멀티 회사 환경에서 문제, 현재는 OK |
| `bridge_token` 파일 읽기 | OK | OSError catch, graceful degradation |
| `_bridge_headers()` | OK | env 우선, 파일 fallback |
| 매번 파일 I/O | WARN | lru_cache 권장 (선택) |
| 42/42 테스트 | ✅ | 회귀 없음 |

