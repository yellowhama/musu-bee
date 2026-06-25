# 핸드오프 — 재설치 복원력 (V29→V31) + V33 잔여 마무리, 2026-06-26

> 다른 에이전트/엔지니어용. 이번 세션(2026-06-25~26)에 main에 들어간 것, 미해결, 다음 행동.
> main HEAD `f9eadede`(V29-31). **V33은 브랜치 `feat/v33-residual-finalize`(5커밋, main 미머지 — push 대기).**
> 버전 **rc.20**.

## V33 잔여 마무리 (브랜치 feat/v33-residual-finalize, 2026-06-26)
사용자 /goal: W-4 relay-fallback + GA EV/Store 잔여를 마스터→투두→/loop 구현. Phase 0 리서치로 8 WS로 분해.
| WS | 무엇 | 커밋 |
|----|------|------|
| WS-1 | stale `Yellowhama.MUSU`→`blossompark.musu` 식별자 정합(7 scripts; runtime detection OR-compat, canonical artifact hard-replace, fixture 6 교체). 호환 5 audit 스크립트 보존. | 91af8801 |
| WS-2 | 버전 일관성 게이트에 `src-tauri\Cargo.toml` 추가(사각지대 제거, dry-run 실증) | d7a337d8 |
| WS-3 | `Install-MUSU.ps1` 견고화 4종(Root cert/0x800B0109 핸들/elevated 에러 trap+pause/PSCommandPath 분기). +버그: irm\|iex param() 리셋이 `$NoLaunch` 날리던 latent 버그 scriptblock 바인딩으로 수정. thumbprint 핀 보존. | b16060bc |
| WS-4 | Store 문서 정합 — **실측: prepare-store-submission-bundle.ps1은 VERSION 추종(하드코딩 없음)**, 1.13.0.0은 옛 디스크 산출물. 남은 blocker 전부 외부 게이트. | c902b554 |
| WS-5a | `fleet.rs` probe→fallback 통합테스트 — `map_probe_response`(ProbeOutcome enum) 추출 + MED-2 direct-override 테스트 2개(0 커버리지였음). cargo 519/519. | b16060bc |
| WS-5b | E2E 3-state 플레이북 정정 — "transited:true relay forward" 모순 제거(표시 flip≠relay 라우팅, router.rs:170 relay 미구현). | 91af8801 |
| WS-6 | 테스트 안전망 복구(audit 발견) — cockpit-contract RED 3개(전부 drift, 의미 보존 갱신, #53 보안 7종 보존) + `test:tauri-shell` CI 연결 + meshBearer/신규 mesh-bearer route.test.ts CI 연결. cockpit 53/53. | 1fb6d564 |
| WS-7 | GA EV 직접서명 설계 큐잉(`GA_EV_SIGNING_DESIGN_2026_06_26.md`, Store 메인·EV 대안). | 91af8801 |

**V33 독립 감사(quality-engineer Auditor): SHIP — 0 HIGH / 0 MEDIUM.** 전체 diff 코드 실측 재확인:
WS-3 보안(핀 보존+Root는 게이트 AFTER+0x800B0109 rethrow+pause 가드+무한루프 없음), WS-6 #53 보안 단언
net-강화(cloud_deregister_self 추가), RED-3은 진짜 test-drift(코드가 앞서감). 519/53/4 통과, 9 PS 파싱 0 에러.

**V33 핵심 배운 것**: (1) **fleet 3-state는 표시/판정 레이어일 뿐 — 실제 task 라우팅은 relay 미선택**
(router.rs:170, QUIC 터널 미구현). "노랑=relay 표시" ≠ "relay로 forward". 플레이북이 이걸 혼동했었음.
(2) `irm|iex`로 받은 스크립트의 `param()` 블록은 호출자 switch를 **재선언/리셋** → scriptblock 바인딩 필요.
(3) cockpit-contract 류 source-string-pin 테스트는 리팩터에 drift — 정확한 문자열 대신 **의미**를 단언해야.
(4) V33 다음 단계는 `NEXT_STEPS_V34_2026_06_26.md`.

---

## (V29-31) TL;DR (한 문장)

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

## ✅ 해소됨 (2026-06-26 실측)
- ✅ **양쪽 머신 rc.20 설치 완료**(사용자 확인 "양쪽다 설치됨. 20"). 닭-달걀 닫힘. 이 머신 실측:
  `Get-AppxPackage blossompark.musu` = `1.15.0.20`, 실행 중 musu.exe 경로 =
  `...blossompark.musu_1.15.0.20_x64...\musu.exe` (rc.20 바이너리 라이브).
- ✅ **install.ps1 0x8008020C root cause 해결**: 정식 자산 `musu-desktop-x64.msix`가 옛 rc.18을
  담고 있었음 → rc.20 재업로드(28087754 bytes), 정식 다운로드 경로 content-length 실측 일치 확인.
  메모리 `reference-musu-desktop-latest-canonical-asset` 참조.
- ✅ **W-4 2머신 fleet E2E 실증 완료**(무당짓 금지, 양방향 authed 실측 2026-06-26):
  `this_node=hugh_second(192.168.1.154:2954)` ↔ `peer=hugh-main(192.168.1.192:9497)`, **둘 다
  rc.20·healthy·reachable_via=direct**, `total_nodes=2 online_nodes=2`. 같은 64-hex mesh bearer로
  **양방향 cross-machine `/api/fleet/status` 401 없이** 성공(V31 정합 직접 증거). hugh-main `/health=200`
  (LAN direct 4ms). **V30 자가정합 증거**: hugh-main이 재설치로 포트 9497로 바뀌었어도 node_name으로
  잡힘(레지스트리 진실원천). 남은 건 relay-fallback(LAN 차단 시 노랑) flip 시나리오뿐 — direct/online은 실증됨.

## ⚠️ 미해결 / 다음 행동
1. 🟡 **W-4 relay-fallback flip만 잔여**: direct/online은 실증 완료(위). 남은 건 LAN bind 차단으로
   direct 실패 유도 → 노랑 "relay" → heartbeat 만료 → offline 3-state 전이 검증(플레이북
   `E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`). 일상 사용엔 direct가 항상 우선이라 우선순위 낮음.
2. 🟡 **DPAPI at-rest retroactive 갭(신규 발견 2026-06-26)**: V31 bearer ensure는 **값이 다를 때만**
   `write_mesh_bearer`를 부른다(compare-then-write, watcher churn 회피 — 의도된 설계). 따라서 **이미
   올바른 평문 bearer를 가진 기존 머신은 영영 평문**으로 남고 DPAPI 암호화가 retroactive 적용 안 됨.
   실측: 이 머신 mesh.env = `MUSU_MESH_BEARER=ec597d…`(평문, DPAPI 키 없음)인데 bearer는 정상 동작.
   **이건 버그 아님 — 재설치/재join/서버 rotate 시에만 DPAPI write 발생(=새 머신은 항상 DPAPI).**
   기존 머신 retroactive hardening이 필요하면 별도 후속(예: ensure가 평문 키 감지 시 1회 강제 재write,
   또는 `musu mesh reseal` 커맨드). 다음 에이전트는 "평문=버그"로 오진 말 것.
3. 🟢 **SmartScreen vs cert 구분**: unsigned NSIS .exe는 SmartScreen "알 수 없는 게시자" 경고(cert
   신뢰로 안 풀림 — Authenticode/평판 필요). "베타 cert" 에러(MSIX 전용)와 혼동 주의. GA에 EV/Store.
4. 🟢 **V32 닫힘**: NSIS .exe는 일반 Win32라 cert 무관 — "NSIS에 cert 박기"는 헛수고로 판정(Researcher).

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
