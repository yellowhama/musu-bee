# v18.B Candidates — Next Cycle Options (2026-05-14)

> v18.A 사이클 끝에서 surface 된 work items. 다음 사이클 scope 결정용.
> 사용자가 read → 골라서 새 master plan 으로 진입.

## 후보 7개

각 항목: **가치**, **시간**, **의존성**.

### A. 보안 fix: loopback auth bypass + cross-tenant token leak (P1)

v18.A audit 의 P1-A + P1-B.

- **현 위험**: `/api/*` 가 127.0.0.1 에서 무인증. 같은 머신의 다른 process 가
  probe trigger / agent state 조회 가능. peer 가 token mismatch 면 bridge 의
  admin token 자체가 fallback 으로 forward → 잘못된 nodes.toml URL → 외부 유출.
- **fix**: middleware.py 의 loopback bypass 를 unix-domain socket 또는 path
  allowlist 로 제한. `_forward_to_peer` 가 peer-specific token 없으면 admin
  token fallback 대신 explicit fail. HTTPS scheme 강제 + nodes.toml URL allowlist.
- **시간**: 90분
- **의존성**: 없음. 독립.
- **install/update mutation API 추가 전에 반드시**. C/E 와 함께 묶음 권장.

### B. Lifespan probe → background task (P1-D)

worst case 5s startup delay. orchestrator health flap 위험.

- **fix**: `await probe_self_on_startup()` → `asyncio.create_task(...)` after yield. 또는 `lifespan` 의 `yield` 전에 task 만 만들고 await 안 함.
- **시간**: 15분
- **의존성**: 없음. 가장 가벼움.

### C. `state_changed_at` race fix (P1-C)

server-side computation 으로 R-M-W 제거.

- **fix**: ON CONFLICT 절에서 `state_changed_at = CASE WHEN node_runtimes.status != excluded.status OR node_runtimes.health != excluded.health THEN excluded.state_changed_at ELSE node_runtimes.state_changed_at END`. 한 UPDATE 안에서 atomic.
- **시간**: 30분 (+ store.py 테스트 갱신).
- **의존성**: 없음.

### D. paperclip/openclaw/hermes real detector

v18.A 의 3 stub → 실 detector.

- **현재**: status=MISSING, reason="NotYetImplemented".
- **fix**: 각 runtime 의 install 방식 spec 파악 필요. paperclip 은 우리 product, openclaw/hermes 는 외부 — README 보고 detect 방법 정해야. paperclip 은 musu-bridge `/health` 같은 endpoint 있으면 그것 probe.
- **시간**: 90분-3시간 (spec 조사 시간 따라). spec 부재 시 위험.
- **의존성**: 외부 spec / README 의 detection hint. **D 진입 전에 spec 조사 → 가능 여부 판단** 필요.

### E. per-runtime probe + install/update API (P2 마무리)

- **현재**: `POST .../runtimes/probe` 가 8개 다. 개별 ollama 만 다시 보는 게 안 됨. install/update 는 아예 없음.
- **fix**: `POST /api/nodes/{name}/runtimes/{runtime}/probe` 분리 endpoint. install/update 는 explicit confirmation token + audit log 필수.
- **시간**: 60분 (probe 분리) + 90분 (install/update 의 confirmation pattern).
- **의존성**: A (loopback bypass fix). install/update 는 mutation 이라 **보안 fix 안 됐으면 절대 안 됨**.

### F. Dashboard UI (P3)

musu-bee Next.js 에 runtime badges + fleet readiness summary.

- **fix**: `NodePanel.tsx` 의 node card 에 runtime status icon × 8. "fleet readiness" 위젯 (online nodes / installed runtimes / nodes needing setup).
- **시간**: 2-3시간 (React component + API integration + skeleton 디자인).
- **의존성**: A/B/C 다 끝나야 dashboard 가 보여주는 데이터가 신뢰 가능.

### G. Canonical pointer 회복 (P6)

`docs/PRODUCT_CHARTER/MUSU_BLUEPRINT.md` + `PRODUCT_CONTROL_SURFACE_MAP.md` 의
pointer 가 끊김 (`../../*.md` 가리키는데 실파일 없음).

- **fix**: pointer 제거 + 실 content 를 PRODUCT_CHARTER 안으로 이전, 또는 root 에
  canonical 파일 생성. 어느 쪽이 의도였는지 git history + git blame 으로 판단.
- **시간**: 30분.
- **의존성**: 없음. cleanup task.

## 추천 사이클 구성

**v18.B-α (보안 + 안정 fix 우선) — 추천**

  A (90m) + B (15m) + C (30m) + G (30m) = **2시간 45분**.

  v18.A 의 audit P1 모두 닫힘 + canonical pointer 회복. install/update / dashboard
  같은 mutation/UI 진입 안전한 base 만들어둠.

**v18.B-β (product feature 가속)**

  D (3h) + E (2.5h) = **5.5시간**. spec 조사 + install/update 의 confirmation 디자인
  포함이라 1세션 좀 빡빡. A/B/C 안 한 채 진행하면 위험 누적.

**v18.B-γ (full)**

  A + B + C + D + E + F + G = **약 9-10시간**. 한 세션엔 안 맞음. 2개 세션으로 분할 의미.

**제일 가벼운 (한 시간)**: B + C + G = **75분**. P1 두개만 fix + cleanup.

## 권장

**A + B + C + G (v18.B-α)** 가 최고 ROI:
- audit 의 P1 finding 4 중 3 닫힘 (A=P1-A/B, B=P1-D, C=P1-C).
- 다음 사이클 (mutation/UI) 의 base 안전.
- 약 2.7시간 = 한 세션 적정.
- v18.A 의 "Windows session 0 reload 문제로 라이브 검증 못 한 것" 도 새 세션 진입 시 자연스럽게 logoff/logon 거치며 해결.

권장 안 사이클 명: **v18.B Security & Stability Hardening**.

D/E/F 는 v18.C 이후.
