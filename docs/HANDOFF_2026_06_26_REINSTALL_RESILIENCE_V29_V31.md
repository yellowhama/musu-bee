# 핸드오프 — 재설치 복원력 (V29→V31), 2026-06-26

> 다른 에이전트/엔지니어용. 이번 세션(2026-06-25~26)에 main에 들어간 것, 미해결, 다음 행동.
> main HEAD `f9eadede`, 버전 **rc.20**, 열린 PR 0, 트리 clean.

## TL;DR (한 문장)
musu fleet이 **재설치/포트변경/업데이트에도 손 안 대고 복원**되도록 4겹 근본수정을 머지했고
(rc.20 호스팅 완료), **남은 단 하나는 hugh-main을 rc.20으로 1회 올리는 것**(그 머신 옛 코드라
원격 자가치유 불가 — 닭-달걀).

## 머지된 것 (PR #29~#33)
| 영역 | 무엇 | 근본 원인 | 파일 |
|------|------|----------|------|
| **DPAPI**(#29) | mesh.env bearer Windows at-rest 암호화 | 평문 저장 | `musu-rs/src/install/token.rs` (dpapi_protect/unprotect, `MUSU_MESH_BEARER_DPAPI=`), `bridge/mod.rs` watcher spawn_blocking |
| **cockpit jargon**(#30) | 네트워킹 용어 평이체 + release-evidence `<details>` 강등 | thesis(작업위임)에 jargon 노출 | `src-tauri-shell/index.html`+`main.js`, 테스트 2종 |
| **dead code**(#31) | `restart_app` 제거 + B-7 login env docs | — | `lib.rs`, `docs/CONFIG.md` |
| **fleet 주소**(#32) | 레지스트리 진실원천 + ghost prune + mDNS 무조건 광고 | identity가 host:port에 묶임 / mDNS opt-in 게이트 OFF | `musu-rs/src/peer/discovery.rs`(`resolve_all_peers` name-authority, `reconcile_manual_against_registry`), `bridge/mod.rs`(heartbeat prune, mDNS advertise ungated) |
| **bearer 정합**(#33) | account bearer heartbeat 자동정합 | 재설치 머신이 per-machine 토큰 fallback, auto_join soft-fail | 신규 `GET /api/account/mesh-bearer`, `cloud/mod.rs::request_mesh_bearer`, `bridge/mod.rs` ensure(compare-then-write) |
| **토스트 update**(#33) | helper `-ForceTargetApplicationShutdown` | 수동 kill-loop가 lock-holder 놓침 → 0x80073D02 | `lib.rs::update_helper_script` |

## 핵심 불변식 (건드리면 깨짐)
1. **fleet 주소 = musu.pro 레지스트리(cache)가 진실원천**. `resolve_all_peers`가 레지스트리에 있는
   node_name의 manual/nodes.toml stale addr를 배제. 라우팅도 같은 함수 공유 → display+routing 동시.
   node_name이 안정 식별자(서버가 uniqueness 강제: `nodeRegistryStore.ts` sha256(owner+name) upsert).
2. **bearer = stable HMAC**(account당 동일 64-hex). heartbeat ensure는 **compare-then-write**(다를
   때만 write — DPAPI 재암호화/watcher churn 회피). best-effort, login은 soft-fail 유지.
3. **prune 가드**: 빈 레지스트리=no-op(데이터유실 방지), same-name-different-addr만 제거, LAN-only 보존.
4. **토스트 helper**: OS가 패키지 인스턴스 종료(`-ForceTargetApplicationShutdown`), 수동 kill 금지.
   helper는 `$env:TEMP`(패키지 밖)라 자기 안 죽음.

## ⚠️ 미해결 / 다음 행동
1. 🔴 **hugh-main rc.20 1회 진입**(사용자 게이트, 닭-달걀): 옛 코드라 원격 route bearer 불일치 401 →
   자가치유 코드가 아직 없음. 첫 진입은 그 머신에서 `irm https://musu.pro/install.ps1 | iex`(cert 신뢰
   [2/4]+MSIX 설치 [3/4] 한 번에, admin self-elevate). **rc.20 되면 그 다음부터 영구 자동정합.**
2. 🟡 **install.ps1 "저번에 안 됐다" 미진단**: 사용자가 그 머신 실행 출력을 안 줘서 root cause 미확보.
   install.ps1은 cert 신뢰를 하는데도 실패라면 별도 버그. **다음: 그 머신 `[1/4]~[4/4]` 출력 확보 →
   thumbprint mismatch(호스팅 cer) / 권한(elevation) / 0x80073D02 중 어느 단계인지.**
3. 🟡 **W-4 2머신 relay E2E**: 양쪽 rc.20 후 direct→relay→offline flip 검증(플레이북
   `E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`). 1번 해소가 전제.
4. 🟢 **SmartScreen vs cert 구분**: unsigned NSIS .exe는 SmartScreen "알 수 없는 게시자" 경고(cert
   신뢰로 안 풀림 — Authenticode/평판 필요). "베타 cert" 에러(MSIX 전용)와 혼동 주의. GA에 EV/Store.
5. 🟢 **V32 닫힘**: NSIS .exe는 일반 Win32라 cert 무관 — "NSIS에 cert 박기"는 헛수고로 판정(Researcher).

## 검증 방법 (무당짓 금지)
- `cd musu-rs && cargo test --lib` → 517 pass. `cd musu-bee/src-tauri && cargo test --lib update_helper` → 1 pass.
- 실측: rc.20 머신 `musu status`가 peer를 **현재 레지스트리 주소**로 healthy 표시 + mesh.env bearer 64-hex.
- 양쪽 rc.20: `musu route --target <peer> --explain` 401 없이 plan.

## 참고 문서/메모리
- 마스터: `V29_RESIDUAL_MASTER_PLAN` / `V30_FLEET_DYNAMIC_ADDR_MASTER_PLAN` / `V31_MESH_BEARER_AUTORECONCILE_MASTER_PLAN` (전부 2026-06-25).
- closure HTML: `CLOSURE_V29_RESIDUAL` / `CLOSURE_V30_FLEET_DYNAMIC_ADDR`.
- 메모리: `reference-musu-fleet-registry-authority`, `reference-musu-bearer-autoreconcile-toast-osmanaged`,
  `feedback-reword-update-pinned-tests`(reword 시 pin 테스트 동반 갱신).
- thesis(사용자 확정): **느슨한 연합** — 각 PC 서버화 + musu.pro 레지스트리로 하나처럼, 중앙 단일홈서버 X.
