# WS-2b — mesh connect/disconnect 분리 세부 플랜 (2026-06-19)

**Master:** `COCKPIT_REDESIGN_MASTER_PLAN_2026_06_18.md` WS-2b. **Critic-gated**(mesh 상태 변경).

## 목표 (스펙 D7/B3)

"Disconnect this machine"(mesh 참여 중단)을 "Sign out"(클라우드 계정 로그아웃)과 **별개 동작으로 분리**. 현재 둘이 혼재 — `account_logout`(`musu logout`)은 cloud만, mesh leave는 아예 없음(에러 메시지 prose로만 "tailscale logout 하라" 안내, `private_mesh.rs:3711/3734`). Tailscale 데스크탑처럼 Connect/Disconnect ≠ Log Out.

## 핵심 안전 (WS-1 auto-join 교훈 재사용)

WS-1에서 `assert_safe_to_reset_tailscale`(private_mesh.rs:3667)가 **개인 Tailscale 보존**을 위해 `tailscale status --json`의 control host를 우리 login_server와 비교했다. leave도 같은 위험: 사용자가 우리 mesh가 *아닌* 개인 tailnet에 붙어있으면 `tailscale down`이 그걸 끊는다.

→ **leave는 현재 활성 tailnet이 우리 mesh일 때만 `tailscale down` 실행.** 다른(개인) tailnet이면 거부 + "이건 네 개인 tailnet이라 MUSU가 안 건드린다" 안내. assert_safe_to_reset_tailscale의 host-compare 로직을 재사용/대칭.

## 구현

### Rust (musu-rs/src/install/private_mesh.rs + lib.rs)
- **`run_leave()` / `private_mesh_leave` command**:
  1. `private_mesh.toml`에서 login_server 로드(없으면 "not in a MUSU mesh" 반환, no-op).
  2. host-compare 가드: 현재 tailnet control host == 우리 login_server host 인가? 아니면 거부(개인 tailnet 보존).
  3. 맞으면 `run_tail_command(["down"])` (private_mesh.rs:3881 헬퍼 재사용). `logout`은 아님 — down은 재연결 쉬움(재join이 `up --reset`), logout은 키 폐기라 과함.
  4. PrivateMeshDesktopStatus 반환(연결 끊긴 상태 반영).
- lib.rs: `private_mesh_leave` Tauri command(private_mesh_join 옆 36-37) + handler 등록.
- **account_logout과 독립** — leave는 cloud 토큰 안 건드림, logout은 mesh 안 건드림(현 상태 유지).

### Shell (index.html/main.js/styles.css)
- 설정창 Account 섹션 또는 fleet strip에 **"Disconnect this machine"** 버튼(Sign out과 시각 분리 — 다른 행, 다른 톤). `invoke("private_mesh_leave")`.
- Sign out 옆이 아니라 **mesh 영역**(Private connection strip 근처)에 배치 = "연결 끊기"는 mesh 동작임을 시각적으로.
- 확인 다이얼로그("이 PC를 mesh에서 끊으면 다른 기기가 도달 못 함. 재연결은 로그인으로"). 되돌리기 쉬움(재join) 안내.

## 4상태 (검증)
| 상태 | leave 동작 |
|------|-----------|
| MUSU mesh 연결됨 | `tailscale down` 실행 → 끊김. 재join 가능 |
| 개인 tailnet 연결됨 | **거부** + 개인 tailnet 보존 안내 |
| tailscale 미설치/미연결 | no-op + "이미 연결 안 됨" |
| private_mesh.toml 없음 | no-op + "MUSU mesh에 없음" |

## 위험
- host-compare 오판(WS-1에서 한 번 버그: Name vs URL raw 비교 → 우리 mesh 오판) → assert_safe_to_reset_tailscale의 *검증된* 로직 그대로 재사용(새로 안 짬).
- `tailscale down`이 시스템 tailscaled 권한 필요할 수 있음(NoState 워밍업 이슈, 메모리). 에러 시 안내.
- 실기기 검증 한계(단일 머신) — down 후 재join은 cargo test/dry-run + 로컬 1회.

## Critic 대상
frontend-architect 또는 security-engineer(mesh 상태 변경) Critic: host-compare 가드가 개인 tailnet 정말 보존하나 + leave/logout 분리 정확한가 + 확인 다이얼로그 충분한가.
