# V31 마스터 플랜 — mesh bearer 자동정합 + 토스트 helper 근본수정 (2026-06-25)

## Context (왜)
재설치한 hugh-main이 이 머신→hugh-main cross-machine route에서 **401 "invalid bearer"**.
사용자 요구(verbatim): **"bearer 자동정합을 V31로 근본 수정해"** + (토스트) **"뭔가를 추가로
설치하는 게 아니라 제대로 업데이트시켜야 되는 거 아냐 … helper도 -ForceTargetApplicationShutdown으로
근본 수정해"**. 둘 다 재설치/업데이트 haffree — 하나의 rc.20에 묶음.

## Phase 0 Researcher 결과 (실측 확정)
**서버 bearer는 STABLE/deterministic** — `deriveMeshBearer = HMAC-SHA256(secret,
"musu.mesh_bearer.v1:"+owner_key)`, 같은 account면 모든 머신 동일 64-hex(`meshBearer.ts:49-58`).
재설치가 bearer를 rotate하지 **않음**. 배선도 이미 존재(login→register→auto_join_account_mesh→
request_mesh_join_key→write_mesh_bearer + 45s watcher hot-reload).

**실측 추가 확인 (orchestrator):**
- 이 머신 mesh.env = **64-hex derived account bearer**(정상). 서버 `/api/account/mesh-join-key`가
  account 토큰에 **mesh_bearer 64자 발급**(서버 secret 설정됨 — HIGH-3 배제).
- ∴ 서버·이 머신 정상. **hugh-main만 재설치 후 account bearer 못 받음** = HIGH-4 (auto_join soft-fail).

**근본 원인 = HIGH-4 + 토스트 0x80073D02:**
| # | 결함 | 증거 |
|---|------|------|
| H-4 | 로그인 후 `auto_join_account_mesh` best-effort soft-fail → 재설치 머신이 mesh.env 없이 "logged in" | `device_login.rs:142-162` 에러 catch→warn, login Ok |
| (분리) | bearer write가 full run_join(Headscale/tailscale 의존) 뒤라 네트워크 hiccup이 bearer 기록 막음 | `private_mesh.rs:1190` vs `:1224-1229` |
| (재시도無) | 한 번 soft-fail하면 boot/heartbeat가 재시도 안 함 | heartbeat 루프에 bearer ensure 없음 |
| 토스트 | helper 수동 kill-loop가 lock-holder 놓침 → `0x80073D02` | hugh-main helper log "0x80073D02 … blossompark.musu_1.15.0.18 닫아야" |

## Workstream 분해

### WS-A. bearer 자동정합 (P0, 핵심)
**산출물**: 재설치 후 boot/login/heartbeat가 account bearer를 자동 fetch+write해 양쪽 정합. zero-manual.
**세부**: `docs/WSA_BEARER_AUTORECONCILE_DETAIL_2026_06_25.md`.

- **A-1. bearer write를 run_join에서 분리** (`private_mesh.rs:1176-1230`): `request_mesh_join_key`→
  `write_mesh_bearer`를 Headscale/tailscale 단계 **앞**에 두고 독립 성공/실패. 네트워크 hiccup이
  bearer 기록을 막지 못하게.
- **A-2. heartbeat ensure-bearer** (`bridge/mod.rs` cloud 루프): 매 사이클 `read_mesh_bearer`가
  None이거나 서버 account bearer와 다르면 fetch+write. (watcher가 45s hot-reload하니 재시작 불요.)
  ⚠️ rate-limit: join-key 엔드포인트는 owner당 rate-limited(`route.ts:76-82`) → A-3.
- **A-3. (선택) bearer-only 엔드포인트** (`GET /api/account/mesh-bearer`): preauth key 발급 없이
  `deriveMeshBearer`만 반환 → heartbeat 재시도 cheap. 서버 추가지만 production 배포 게이트.
  **대안**: heartbeat ensure를 자주 안 하고(예: bearer 없을 때만) join-key 재사용 → 서버 무변경.
  Critic이 rate-limit vs 서버변경 트레이드오프 판단.
- ⚠️ Critic: A-1 분리가 기존 join 흐름 안 깨는지, ensure가 정상 bearer를 불필요하게 덮어쓰지 않는지
  (서버 stable이라 같은 값 → 무해하나 write I/O), DPAPI(V30) 정합.

### WS-B. 토스트 helper OS-managed 교체 (P0, 코드 완료)
**산출물**: helper가 수동 kill-loop 대신 `-ForceTargetApplicationShutdown`으로 OS가 패키지 인스턴스
종료 후 교체 → 0x80073D02 해결. ✅ **이미 구현+단위테스트 green**(이 세션).
- `update_helper_script`(`lib.rs:1817`): kill-loop 제거, `Add-AppxPackage -ForceUpdateFromAnyVersion
  -ForceTargetApplicationShutdown`. doc+테스트 정합. helper는 $env:TEMP(패키지 밖)라 자기 안 죽음.
- 검증: `cargo test update_helper` green. 실증=hugh-main rc.20 토스트.

## 진행 순서 (/loop, agent-team)
1. **WS-A 세부 플랜** → Critic(system-architect: rate-limit/A-3 결정, 분리 안전, ensure idempotent) →
   Builder → Auditor(silent-failure: soft-fail 제거 검증, bearer 유실 가드) → cargo test.
2. **WS-B**: 코드 완료 — Auditor가 helper 불변식만 재확인.
3. PR(WS-A+WS-B) → 머지 → rc.20 빌드 + desktop-latest.
4. 양쪽 머신 rc.20 → bearer 자동정합 → cross-machine route 401 해소 실증.
5. Scribe.

🔒 게이트: main push=Const VII 배치 승인. A-3 서버 엔드포인트 추가 시 production 배포=별도 승인
(기본은 서버 무변경 대안). design-gate 무관(Rust). DPAPI write(V30) 재사용.

## 검증 (무당짓 금지)
- `cargo test --lib` green + bearer ensure/분리 신규 테스트.
- 실측: hugh-main rc.20 후 mesh.env=이 머신과 동일 64-hex, cross-machine `route --target hugh-main`
  **401 안 남**(작업 위임 성공).
- 토스트: hugh-main rc.20 토스트 클릭 0x80073D02 없이 적용.

## LOC 추정 (×2)
- WS-A: ~120 (분리 + ensure + 테스트, A-3 없으면). A-3 서버 엔드포인트 시 +40.
- WS-B: 0 (완료).

## 열린 질문 (Critic)
1. A-2 ensure 빈도: 매 heartbeat(rate-limit 위험) vs bearer-없을때만(soft-fail 복구 보장 약화) vs
   A-3 bearer-only 엔드포인트(서버변경). Critic 권장 결정.
2. A-1 분리가 `JoinAccount`/`auto_join_account_mesh`의 다른 호출자 안 깨는지.
3. ensure가 DPAPI 포맷(V30)으로 write하는지 — write_mesh_bearer가 이미 처리(확인).
