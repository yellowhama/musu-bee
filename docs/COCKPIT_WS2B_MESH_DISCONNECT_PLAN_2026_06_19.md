# WS-2b — mesh connect/disconnect 분리 세부 플랜 (2026-06-19)

**Master:** `COCKPIT_REDESIGN_MASTER_PLAN_2026_06_18.md` WS-2b. **Critic 통과(HIGH 인버전 + 2 MED 반영, 코드 전 reshape).**

## 목표 (스펙 D7/B3)

"Disconnect this machine"(mesh 참여 중단)을 "Sign out"(클라우드 계정 로그아웃)과 **별개 동작으로 분리**. 현재 둘이 혼재 — `account_logout`(`musu logout`)은 cloud만, mesh leave는 아예 없음(에러 메시지 prose로만 "tailscale logout 하라" 안내, `private_mesh.rs:3711/3734`). Tailscale 데스크탑처럼 Connect/Disconnect ≠ Log Out.

## 핵심 안전 (Critic HIGH 반영 — 인버전 버그 회피)

**⚠️ Critic가 코드 전에 잡은 HIGH:** `assert_safe_to_reset_tailscale`(private_mesh.rs:3667)는 **refuse-if-DIFFERENT** 가드다 — `up --reset`용으로 5개 pass-through(client없음/empty/unparseable/backend≠Running/same-host)가 모두 `Ok(())`. 이걸 leave의 **proceed-if-SAME**에 재사용하면 **인버전 버그**: not-running/unparseable/backend≠Running 케이스가 `Ok()`라 → 개인 tailnet에 `down` 실행. "검증된 로직 재사용"이 함정(반대 게이트용으로 검증됨).

→ **새 positive predicate `active_tailnet_is_ours(login_server) → Ours | NotOurs | Indeterminate`** 작성. `host_of` 헬퍼(private_mesh.rs:3716-3725)만 free fn으로 추출해 공유, bail-or-Ok 함수는 재사용 안 함.
- **Ours**(same control host + backend Running)일 때만 `tailscale down`.
- **NotOurs**(다른 host) → 거부 + 개인 tailnet 보존 안내.
- **Indeterminate**(not-running/empty/unparseable/backend≠Running/control 미확정) → **no-op, down 안 함** + "MUSU mesh 연결 확인 못 함, 안 건드림". **default-to-refuse.**

## 구현

### Rust (musu-rs/src/install/private_mesh.rs + lib.rs)
- **`active_tailnet_is_ours(login_server) -> Ours|NotOurs|Indeterminate`** (신규): `host_of` 추출 공유. same control host + backend Running → Ours; 다른 host → NotOurs; 그 외 전부 → Indeterminate.
- **`run_leave()` / `private_mesh_leave` command**:
  1. `private_mesh.toml` login_server 로드(없으면 no-op "MUSU mesh에 없음").
  2. `active_tailnet_is_ours`: **Ours만 진행**, NotOurs/Indeterminate → no-op-refuse(개인 tailnet 보존 / 미확정 보존).
  3. `run_tail_command(["down"])`. `logout` 아님(키 폐기 과함). **`private_mesh.toml` 보존**(재join은 같은 노드키, 단 account-join은 cloud 토큰으로 새 preauth 발급 → 토큰 있어야 재연결).
  4. **MED1: false-state 방지** — exit_code==Some(0) 확인 AND `tailscale status` 재쿼리해 backend≠Running/control 더는 ours 확인 후에만 "끊김" 보고. 비0/elevation 에러면 stderr 노출 + state=여전히-연결됨.
  5. PrivateMeshDesktopStatus 반환.
- lib.rs: `private_mesh_leave` Tauri command + handler 등록.
- **INFO: leave/logout 독립** — `private_mesh_leave`는 `~/.musu/token` 절대 안 읽음/씀(negative assertion 테스트). account_logout(lib.rs:646)은 tailscale 안 건드림(현 상태).

### Shell (index.html/main.js/styles.css)
- mesh 영역(Private connection strip 근처)에 **"Disconnect this machine"** 버튼 — Sign out과 시각 분리. `invoke("private_mesh_leave")`.
- **MED2: 확인 다이얼로그**에 in-flight task 경고 포함: "이 기기에서 실행 중인 작업의 결과 전송이 끊길 수 있음 + 다른 기기가 도달 못 함. 재연결은 다시 로그인/join." (메모리 `pattern-cross-machine-callback-auth`: mesh 못 닿으면 콜백 영원히 pending).

## 6상태 (predicate 분기 기준, 검증)
| status | predicate | leave 동작 |
|--------|-----------|-----------|
| same host + backend Running | **Ours** | `down` 실행 → exit0+재쿼리 확인 → 끊김 보고 |
| 다른 control host | **NotOurs** | 거부, 개인 tailnet 보존 |
| backend≠Running (NeedsLogin/Stopped) | Indeterminate | no-op, down 안 함 |
| status 미설치/empty/unparseable | Indeterminate | no-op, down 안 함 |
| control 미확정 | Indeterminate | no-op, down 안 함 |
| private_mesh.toml 없음 | (pre-check) | no-op "MUSU mesh에 없음" |

## 위험 (Critic 반영 후)
- ~~host-compare 재사용~~ → 새 positive predicate(인버전 회피, Critic HIGH).
- `tailscale down` 권한(시스템 tailscaled / NoState 워밍업) → MED1 재쿼리로 false-state 방지.
- 실기기 검증 한계(단일 머신) — predicate 6분기 cargo test + down/재join 로컬 1회. personal-tailnet-but-unparseable→refuse 테스트 필수(Critic).

## Critic 대상
frontend-architect 또는 security-engineer(mesh 상태 변경) Critic: host-compare 가드가 개인 tailnet 정말 보존하나 + leave/logout 분리 정확한가 + 확인 다이얼로그 충분한가.
