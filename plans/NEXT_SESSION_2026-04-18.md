# NEXT SESSION — 2026-04-18 (Phase 10 완료 이후)

> **업데이트**: Phase 10 Production Hardening 완료. 현재 스코어 99/100.

---

## Phase 10에서 완료된 것 (이번 세션)

| 작업 | 커밋 |
|------|------|
| H3: stale route eviction (server.rs) | `1294145d` |
| pydantic max_length (musu-worker) | `35e64567` |
| 5D-3: canonical_name_for_agent + agents_on_node | `fb3e31a4` |
| list_messages LEFT JOIN agent_name | `fb3e31a4` |
| SQLite check_same_thread 주석 | `d6f9b261` |
| msgCounter → crypto.randomUUID() | `5c947803` |
| Promise.allSettled in chat commands | `d98f07a9` |
| TOCTOU fix: free_local_tcp_port | `3e03aaec` |
| .env.example 프로덕션 템플릿 | `b675ec40` |
| musu-bee/DEPLOY.md | `0fb0213b` |
| Remote machine runbook | `05e263ee` |
| Workspace index (408 files) | — |
| LLM wiki 69, SPEC-149~151 | — |

---

## 다음 세션 우선순위

### P0 — FastAPI on_event → lifespan (5분)
`musu-bridge/server.py` + `musu-worker/src/musu_worker/main.py`의 `@app.on_event("startup")` → lifespan 마이그레이션.
현재 pytest에서 DeprecationWarning 4개 발생.

### P1 — WoL E2E 검증

---

# NEXT SESSION — 2026-04-18 (P4 완료 이후) [원본]

## 완료된 것 (2026-04-17 P4 세션)

| 작업 | 상태 |
|------|------|
| CSO 보안 감사 (/cso 스킬) | ✅ |
| F1: Next.js 16.2.4 CVE 패치 | ✅ |
| F3: CI SHA 고정 (dtolnay/rust-toolchain, Swatinem/rust-cache) | ✅ |
| F4: BRIDGE_HOST 기본값 127.0.0.1 | ✅ |
| A1: Migration 014 (nodes.bridge_token) — Supabase 적용 완료 | ✅ |
| A2: nodes.repo.ts — upsertNode + findActiveProxyForWol | ✅ |
| A3: nodes.service.ts — tokenValue → bridge_token 저장 | ✅ |
| A4: wol/route.ts — Bearer 토큰 전송 (WoL auth 완성) | ✅ |
| L1: polling curl 2회→1회 | ✅ |
| L2: MAC 감지 실패 WARN 로그 | ✅ |
| L3: detect_public_ip 1h TTL | ✅ |
| llm-wiki 68 작성, musu-specs SPEC-145~148 | ✅ |

---

## 세션 시작 즉시 할 것

### E2E 검증 — WoL auth

```bash
# 1. bridge 재시작 (MUSU_BRIDGE_TOKEN 환경변수 설정된 상태에서)
bash scripts/start-bridge.sh
# → "WoL MAC: xx:xx:xx:xx:xx:xx broadcast: ..." 출력 확인

# 2. Supabase Dashboard에서 bridge_token 컬럼 확인
# nodes 테이블 → bridge_token 컬럼에 값 들어갔는지 확인

# 3. musu.pro Account → offline 노드 Wake 버튼 클릭
# → 이전: 502 에러
# → 기대: {"ok":true, "via":"node-name"}
```

---

## 파일 위치 SSOT

| 항목 | 경로 |
|------|------|
| WoL route | `vibecode-town/src/app/api/v1/nodes/[id]/wol/route.ts` |
| nodes repo (findActiveProxyForWol) | `vibecode-town/src/lib/db/repositories/nodes.repo.ts` |
| nodes service (tokenValue) | `vibecode-town/src/lib/services/nodes.service.ts` |
| Migration 014 | `vibecode-town/docs/migrations/014_nodes_bridge_token.sql` |
| BRIDGE_HOST | `musu-functions/musu-bridge/config.py:10` |
| polling 1-curl | `musu-functions/scripts/start-bridge.sh:73-76` |
| LLM Wiki | `/home/hugh51/llm-wiki/wiki/68_MUSU_PHASE9_P4_SECURITY_WOL.md` |
| Specs | `~/.claude/projects/-home-hugh51/memory/musu-specs.md` (SPEC-145~148) |
