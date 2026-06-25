# V29 잔여 마무리 마스터 플랜 (2026-06-25)

## Context (왜)
W-7 M1 가드(PR #27) + 인-앱 업데이트 protocol-free(PR #28, rc.18 실증) 머지 후, 열린 PR 0개.
사용자 /goal: "남은 작업 리스트업 → 디테일 계획 → 투두 → /loop 끝까지 구현. 마스터 먼저, 개별
진행 시 세부 플랜 문서." Phase 0 Researcher 2명(D-1 cockpit + 작은항목 4개) 실측 완료.

**Phase 0 핵심 발견 (계획 전제 교정):**
- 🔴 **D-1 "KVM 강등" 전제가 코드와 불일치.** 레포 전체 grep(`kvm|webrtc|screen.?share|
  remote.?control|vnc|rdp`) = **0 hit**. cockpit은 이미 task-delegation-first(order box
  `index.html:402-419` + task feed `:428-439` + 빈상태 CTA "Give this PC a task" `:344`).
  → **사용자 결정(2026-06-25 AskUserQuestion): D-1 = 네트워킹 jargon 강등으로 재정의.**
- 진짜 secondary 노이즈 = Private Mesh/Headscale/release-proof 존(`index.html:126-307`)이
  fleet list와 order box 사이를 크게 차지 + 사용자向 텍스트에 내부 jargon 노출(Tailscale/
  Headscale+Caddy+DERP/tailnet IP).
- ⚠️ **design-gate는 cockpit을 안 덮음** — `evaluate.cjs` UI_PATH_PREFIXES = `musu-bee/src/{app,
  components,pages,styles}/`+`public/`만. `src-tauri-shell/`은 게이트 밖. cockpit 재배치 PR은
  design-gate 안 걸림(별도 결정 필요: 게이트 확장 vs ungated 인정).
- **`.pen` 파일 없음**(레포 전체). cockpit엔 `.pen` 부재 — 단 cockpit이 게이트 밖이라 무관.
- **N-3**만 진짜 엔지니어링(token.rs DPAPI + watcher 라운드트립). **B-7**=docs-only.
  **N-1**=무해 dead(2줄). **N-2**=이미 6h 완료(`main.js:4871`) — 작업 없음.

**진행 방식**: agent-team(Explore→Plan→Critic→Builder→Auditor→Scribe), /loop 자율,
Const VII 배치 승인(사용자 "싹 다 구현" 기조), production 서버 배포 없음(cockpit/musu-rs/
정적 빌드/문서만). lazy-solution 우선.

---

## 확정 사실 (코드 실측 2026-06-25, Researcher 인용)

| 사실 | 증거 |
|------|------|
| KVM/원격제어 코드 0개 (레포 전체) | grep 0 hit (Researcher abcaca02) |
| cockpit 척추 = order box + task feed (delegation 이미 1급) | `index.html:402-419,428-439,344` |
| secondary 강등 대상 = mesh/proof/Headscale 존 | `index.html:126-307` (mesh-proof strip/release-evidence/add-pc Headscale) |
| 사용자向 jargon 누출 | `index.html:189`(Tailscale)·`195/196`(mesh)·`233/238/255`(Headscale/Caddy/DERP)·`170`(tailnet IP); `main.js:341,15-16`(Private Mesh proof) |
| design-gate scope = web app만 | `scripts/design-gate/evaluate.cjs:1-7` |
| cockpit = `src-tauri-shell/index.html`(582줄) + `main.js`(4984줄) + `lib.rs` commands | Researcher 확인 |
| mesh.env 평문 저장 (0600/icacls) | `musu-rs/src/install/token.rs:81-153` (write 84-89, unix 113, win 127-133) |
| 암호화 0개 (DPAPI/keyring/CryptProtect 전무) | grep: 전부 주석뿐 (Researcher a1ca16b) |
| mesh.env 런타임 재읽기 watcher (DPAPI시 decrypt 필수) | `musu-rs/src/bridge/mod.rs:106-210` (195/204 read), reader `token.rs:52-75` |
| B-7 = server-side operator secret (사용자向 아님), docs/copy gap만 | `api/v1/auth/device/approve/route.ts:25-30,91-103`; `docs/WSC_DEFERRAL_QUEUE:21-26` |
| N-1 restart_app = 등록됨(lib.rs:57,2070-2072), JS 호출 0 (주석만 main.js:4940) | Researcher 확인 |
| N-2 probe = 6h, `setTimeout` self-rearm, 이미 완료 | `main.js:4871,4979,4967` |

---

## Workstream 분해 (우선순위순)

### WS-1. cockpit 네트워킹 jargon 강등 (D-1 재정의, P1, 핵심·내가 구현)
**산출물**: mesh/proof/Headscale 존을 보조로 강등 + 사용자向 jargon 평이체 정합.
order box + task feed = 척추 유지. cockpit은 design-gate 밖 → 정식 통과 불요(but `.png`
스크린샷 before/after는 PR 본문에 첨부해 시각 회귀 방지).
**세부 플랜**: 진행 시 `docs/WS1_COCKPIT_JARGON_DEMOTE_DETAIL_2026_06_25.md`.

- **1-A. 레이아웃 강등** (`index.html`): mesh-proof strip(`126-135`) + release-evidence
  strip(`136-186`) + add-pc Headscale advanced(`233-255`)를 `<details>` 보조 영역(진단
  드로어 `443-476` 패턴 재사용)으로 이동. fleet list + order box가 fold 위 차지.
- **1-B. 카피 평이체** (`index.html`+`main.js`): "Tailscale.com signup"→"no extra signup";
  "Private Mesh evidence/Headscale/Caddy/DERP"→사용자 언어("secure connection between your
  PCs"); "tailnet IP (100.x.y.z)"→"this PC's address". 내부 동작 이름 노출 제거(기능은 유지).
  ⚠️ Critic: 강등이 mesh-proof **기능 제거가 아님**(진단/고급은 접근 가능 유지). 평이체가
  release-proof 동작을 깨지 않는지(문자열만 변경, 핸들러 무변경) 확인.
- **1-C. before/after 스크린샷** (browse/webapp-testing 스킬): dev cockpit 렌더 또는
  설치본 PrintWindow 캡처(메모리 `reference-cockpit-screenshot-printwindow`). PR 본문 첨부.
- ⚠️ **열린 결정**: design-gate를 `src-tauri-shell/`로 확장할지(WS-1 부수) → 별도 작은 PR
  여지. 기본은 ungated 인정(Researcher OQ-2) — 사용자 확인 후.

### WS-2. mesh.env at-rest 암호화 (N-3, P1, 진짜 보안·내가 구현)
**산출물**: Windows DPAPI로 mesh.env bearer at-rest 암호화 + 하위호환 마이그레이션.
**세부 플랜**: 진행 시 `docs/WS2_MESH_ENV_DPAPI_DETAIL_2026_06_25.md`.

- **2-A. write 암호화** (`token.rs:140`): bearer를 `CryptProtectData`(DPAPI, CurrentUser
  scope)로 래핑 후 base64+포맷마커(`MUSU_MESH_BEARER_DPAPI=`)로 저장. `#[cfg(windows)]`.
- **2-B. read 복호화** (`token.rs:60`): 포맷 감지 — `MUSU_MESH_BEARER_DPAPI=`면 DPAPI
  unwrap, `MUSU_MESH_BEARER=`(레거시 평문)면 그대로 읽고 **다음 write에서 재암호화**(silent
  migration). 하위호환 필수(기존 설치 brick 방지).
- **2-C. Unix 분기**: DPAPI=Windows-only. Unix는 평문+0600 유지(`#[cfg(unix)]` 그대로),
  포맷마커 없이. reader가 OS별 라우팅. (keyring/libsecret 도입은 YAGNI — 사용자向 결정 OQ).
- **2-D. watcher 라운드트립 회귀 테스트** (`bridge/mod.rs` 또는 token.rs tests): write→
  watcher reread→decrypt 동등성. 레거시 평문→재암호화→재읽기 마이그레이션 테스트.
- ⚠️ **Critic(security-engineer)**: DPAPI CurrentUser scope 적정성, 위협모델 명시(same-user
  malware엔 무력, 디스크도난/클라우드백업엔 가치 — 솔직 기재), 포맷마커 혼동 방지.
- 🔒 production 배포 없음(client-only). 검증=cargo test.
- **열린 결정**: windows-sys에 이미 `Win32_Security` 있음(Cargo.toml:144) — DPAPI
  `CryptProtectData`는 `Win32_Security_Cryptography` feature 필요할 수 있음. Builder 확인.

### WS-3. B-7 login docs/copy 정합 (P2, docs-only·내가 구현)
**산출물**: device-flow 현실과 안 맞는 stale 로그인 env-var 안내 정리.
- env-var(`MUSU_DEVICE_APPROVER_USER_IDS`/`MUSU_P2P_CONTROL_TOKEN`)는 server-side operator
  secret이지 사용자 설정 아님. 사용자向 안내가 env 설정을 암시하면 device-flow(`musu login`→
  브라우저 승인)로 정합. 대상 = 온보딩/랜딩 카피 + env 문서.
- ⚠️ 타겟 스트링 전수 = Researcher OQ-3(미완) → WS-3 첫 단계 = stale copy 감사(grep).
- design-gate: `src/app|components` 닿으면 정식 통과 대상(brief+png+Approved). 문서만이면 무관.

### WS-4. N-1 dead code 정리 (P3, 2줄·정리 스윕)
- `restart_app` 제거: `lib.rs:57`(invoke_handler) + `lib.rs:2070-2072`(fn). JS 호출 0,
  트레이는 `app.restart()` 직접(`lib.rs:144`) → 무영향. WS-1/WS-2 빌드에 묶어 처리.
- ⚠️ ROADMAP:84 "재사용 여지 유지" 의도 있음 → **선택**. dead-code 스윕 시에만. 기본=둠.

### (작업 없음) N-2 probe 간격
- 이미 6h 완료(`main.js:4871`). 확인만. 신규 작업 0.

### (별도·사용자 게이트) W-4 2머신 relay E2E
- 코드 끝, 2머신 환경 필요 → **내가 못 함.** 다른 머신 rc.18 설치 후 사용자 실행.
  플레이북 `E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`. 마스터 플랜 밖(환경 게이트).

---

## 진행 순서 (/loop, agent-team)
1. **WS-2 (N-3)** 먼저 — 가장 명확하고 self-contained한 보안 작업. 세부플랜→Critic(security-
   engineer)→Builder→Auditor(silent-failure + 마이그레이션)→cargo test→PR→머지.
2. **WS-1 (cockpit jargon)** — 세부플랜→Critic(system-architect, 기능보존)→Builder→
   스크린샷(webapp-testing)→Auditor→PR→머지.
3. **WS-3 (B-7 docs)** — stale copy 감사→정합→PR(문서면 게이트 무관).
4. **WS-4 (N-1)** — WS-1/2 빌드에 묶어 선택적 처리.
5. **Scribe**: closure(HTML) + 스펙/메모리/musubrain 인덱스 + 큐 정리(task #28 docs화).

🔒 게이트: main push=Const VII(배치 승인), production 배포 0, WS-2=client-only/cargo test,
WS-1 cockpit=design-gate 밖(스크린샷 회귀 가드), WS-3=src 닿으면 design-gate 정식.

## 검증 (무당짓 금지)
- WS-2: `cargo test --lib` green + watcher 라운드트립 + 레거시 마이그레이션 테스트 통과.
  DPAPI wrap/unwrap 동등성 단언. 실제 머신 join→reread 실측(가능하면).
- WS-1: `npm run build`(=next build --webpack) green + cockpit tauri 빌드 + before/after
  스크린샷. 기능보존(mesh-proof 핸들러 무변경) 확인.
- WS-3: 변경 카피가 device-flow 현실과 일치 + 링크 유효.

## LOC 추정 (×2 floor)
- WS-2: ~80 첫초안 → ~160 (write+read 분기 + 마이그레이션 + 테스트 + cfg 분기 + Critic 추가).
- WS-1: ~120 (레이아웃 details 이동 + 카피 ~20곳 + main.js 문자열).
- WS-3: ~40 (docs/copy).
- WS-4: ~5 (선택).

## 열린 질문 (구현 중/사용자 해소)
1. design-gate를 `src-tauri-shell/`로 확장? (기본=ungated 인정, 스크린샷 회귀 가드).
2. N-3 Unix 정책: Windows-only DPAPI + Unix 평문 유지(권장) vs Unix keyring(YAGNI).
3. N-3 마이그레이션: silent 재암호화(다음 write) 허용? (권장 — brick 방지).
4. N-1: 제거 vs 유지(ROADMAP 재사용 의도). 기본=유지.
