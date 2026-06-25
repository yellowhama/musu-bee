# WS-1 세부 플랜 — cockpit 네트워킹 jargon 강등 (D-1 재정의)

> 마스터: `V29_RESIDUAL_MASTER_PLAN_2026_06_25.md`. cockpit `src-tauri-shell/`은 design-gate
> 밖(웹앱 src/**만 게이트). before/after 스크린샷으로 시각 회귀 가드. 기능 무변경.

## 목표 (D-1 재정의)
KVM 강등이 아니라 **네트워킹 jargon 강등**. cockpit 척추(order box `index.html:402-419` +
task feed `:428-439` + 빈상태 CTA `:344`)는 1급 유지. mesh/proof/Headscale 존을 보조로 내리고,
사용자向 텍스트의 내부 jargon(Tailscale/Headscale/Caddy/DERP/tailnet/Private Mesh proof)을
평이체로. **데이터 필드명(`tailscale_ip`)·CLI 명령(`musu mesh ...`)·핸들러는 무변경**(기능보존).

## 사용자 결정 (2026-06-25)
D-1 = 네트워킹 jargon 강등으로 재정의 (KVM 코드 0개 — 레포 전체 grep).

## 핵심 구분 (Critic 검증 대상)
| 변경함 (사용자向 카피) | 변경 안 함 (내부/기능) |
|---|---|
| `index.html` UI 텍스트(strong/p/span/label) | `data-*` 속성, id, class 이름 |
| `main.js` 사용자 노출 메시지(text:/title: 일부) | `tailscale_ip`/`tailnet_ip` 데이터 필드 |
| "Private connection", "secure connection between your PCs" | `musu mesh verify/release-proof` CLI 명령 문자열 |
| "this PC's address" (← tailnet IP 라벨) | schema 상수(`musu.private_mesh_release_proof...`) |
| | release-proof 핸들러(`private_mesh_release_proof_target`) |

## 구현

### 1-A. 레이아웃 강등 (`index.html`)
- **mesh-proof-strip(`126-135`)**: 유지하되 "Private connection" 카피 평이체. fold 위 자리
  최소화(이미 작음 — 카피만).
- **release-evidence-strip(`136-186`)**: **`<details>` 보조로 강등**. 이건 릴리스 증거 생성
  (개발/검증용)이라 일반 사용자 첫 화면에 불필요. 진단 드로어(`443-476`) 패턴 재사용 —
  `<details><summary>Release evidence (advanced)</summary>...</details>`. 내부 입력
  (tailnet IP/control URL/evidence path)은 그 안에 둠.
- **add-pc-panel Headscale advanced(`233-255` 부근)**: 자가호스트 Headscale/Caddy/DERP 설정은
  이미 advanced 성격 — `<details>` 안에 있는지 확인, 아니면 강등. 카피 평이체.
- ⚠️ order box(`402-419`) + task feed(`428-439`) + fleet list(`334-351`)는 **fold 위 유지**.

### 1-B. 카피 평이체 (`index.html` + `main.js`)
사용자向 텍스트만:
- `index.html:189` "No Tailscale.com signup required." → "No extra signup."
- `index.html:190` "MUSU Private Mesh" → "Secure connection"
- `index.html:195/196` "Checking mesh status"/"Looking for local Private Mesh evidence." →
  "Checking connection"/"Checking the secure link between your PCs."
- `index.html:129/130` "Private connection"/"…only through your own private network…" → 유지
  가능(이미 평이) 또는 소폭 다듬기.
- `index.html:170` "Peer tailnet IP (100.x.y.z)" → "This PC's address (100.x.y.z)" (release-
  evidence details 안으로 이동됨).
- `main.js:341` "…over MUSU-managed Headscale/private routing. No Tailscale.com signup…" →
  "…over MUSU's secure private connection." (내부 라우팅 메커니즘 이름 제거).
- `main.js:348/354/442/444` "Private Mesh proof"/"tailnet" 사용자 메시지 → "verify the secure
  connection"/"this PC's address" 류. ⚠️ CLI 명령 생성부(`musu mesh ...`)는 무변경.
- `main.js:540/563` 등 `label: "Private Mesh"`(fleet 배지) → "Secure" 또는 "Private". title=
  내부설명은 유지 가능(hover, 덜 노출).

### 1-C. before/after 스크린샷 (webapp-testing/browse)
- dev cockpit 또는 설치본 PrintWindow(메모리 `reference-cockpit-screenshot-printwindow`).
- fleet+order box(fold 위) / release-evidence 강등(details 접힘) before·after. PR 본문 첨부.

## 검증 (무당짓 금지)
- `npm run build`(=next build --webpack) green — cockpit shell은 정적이라 빌드 영향 적으나 확인.
- cockpit tauri 빌드 또는 최소 HTML 파싱 정합(닫는 태그/details 구조).
- **기능보존**: release-proof 핸들러·CLI 명령·데이터 필드 무변경 — grep diff로 확인.
  `private_mesh_release_proof_target` invoke 경로, `tailscale_ip` 참조 수 before==after.
- 스크린샷 시각 회귀.

## 게이트
- cockpit = design-gate 밖 → 정식 통과 불요(스크린샷 회귀 가드로 대체).
- Critic=system-architect (강등이 기능 제거 아님 확인 + 사용자向/내부 스트링 경계).
- Auditor=quality-engineer (핸들러/필드/명령 무변경 + details 구조 정합).
- 🔒 main push=Const VII 배치 승인. production 배포 0.

## LOC 추정 (×2)
- ~120 (details 이동 ~30 + 카피 ~20곳 × index/main).

---

## Critic Findings (resolved) — system-architect, 2026-06-25
방향 OK, 단 **3 HIGH = 내가 놓친 load-bearing 위험**. Builder는 이 표를 PRIOR ARTIFACT로 읽고
**SAFE 목록만 reword, DO-NOT-TOUCH 절대 무변경**.

| # | Sev | Claim | Resolution |
|---|-----|-------|------------|
| H-1 | 🔴 | `"private"/"external"/"lan"/"mesh-needed"/"unverified"` 등은 **display 아님 = state-machine enum 토큰**. `dataset.meshState`로 쓰이고(`main.js:486,2923,2969`) `=== "private"`로 비교(`:338,345,575,586`). reword하면 컴파일 에러·스크린샷 차이 없이 order 라우팅+release-proof 게이트 조용히 깨짐. | **VALUE 리터럴(`state:`/`boundary:` 필드 + 모든 `=== "..."`) 절대 무변경.** 옆의 `label:`/`text:`만 reword. DO-NOT-TOUCH 목록 박음(아래). |
| H-2 | 🔴 | release-evidence-strip은 JS `strip.hidden`(`:1855`)+`data-state`(`:3207`)로 제어. naive `<details><summary>…<div id=strip>`로 래핑하면 `strip.hidden=false`여도 **outer details는 collapsed → strip 영영 안 보임**(dev 검증 경로 회귀). 스크린샷(기본 collapsed)으론 못 잡음. | **`id="release-evidence-strip"`+`class`+`data-state`를 `<details>` 엘리먼트 자체에 둠**(div에서 이동). `:1855`의 `strip.hidden`은 `<details>`에서 summary+content 다 숨김 = idle 의도와 일치. **OQ-1 결정: proof 실행 시 자동 확장** — `renderReleaseProofEvidence`의 `strip.hidden` 라인 뒤 `if(d.tagName==="DETAILS") d.open = !d.hidden && state!=="idle";`. 내부 `<details id=release-evidence-checks-drawer>`(`:146`)는 그대로(중첩 valid). |
| H-3 | 🟢 | 데모트된 strip 내부 버튼(`data-mesh-copy-proof` 등)은 `querySelectorAll`(`<details>` 투명)로 배선 → **살아남음**. disabled 토글도 OK. 확장 후 도달 필요 = 의도된 강등. | 코드 무변경. Auditor가 회귀로 오인 안 하게 명시. |
| M-1 | 🟡 | `title:` hover에 "Headscale" 남기면 jargon 한 번 hover면 노출. | **OQ-3 결정: title hover도 탈jargon**(thesis=사용자向 jargon 0). 단 advanced `<details>` 내부 title은 유지 가능. |
| M-2 | 🟡 | 스크린샷-only 게이트는 H-1/H-2 기능 깨짐 못 잡음(기본상태 동일 스크린샷). | **검증 보강**: grep-diff로 `=== "private"`/`=== "external"`/`mesh?.state`/`dataset.meshState`/`state: "`/`invoke("private_mesh`/`"musu mesh`/`musu.private_mesh_`/`tailscale_ip` **COUNT byte-identical before==after** 단언. + 수동 스모크: verified 노드 order-target이 boundary `"private"`(not unverified) 유지 + 데모트 details 확장 시 `#release-proof-run`/`#physical-peer-evidence-check` 존재. |
| L-1 | 🟢 | add-pc Headscale는 **이미 `<details id="add-pc-advanced">`(`:229`) 안**. | "wrap in details" 태스크 **삭제**(no-op). add-pc는 **카피만**(`:233,238,255,296-298`). |
| L-2/INFO | 🟢 | 설정모달 `:500`은 이미 평이. 한국어 UI(`:325-332,527-557`)는 의도된 것 — 무변경. | 무변경. |

### Builder 정밀 목록 (Critic HANDOFF)
**SAFE to reword (pure display):**
- index.html: `:189`(Tailscale signup), `:190`(MUSU Private Mesh strong), `:195/196`(checking mesh),
  `:170`(tailnet IP label), `:233/238/255`(Headscale/Caddy/DERP advanced body), `:296-298`(proof/musu mesh advanced), `:140`(Run proof on Private Mesh peer).
- main.js DISPLAY: `:16`(proof order text — coherent 유지), `:341/348/354`(boundary text:), `:386`(label return),
  `:442/444`(retry msg), `:431`("tailnet IP changed" diff reason), `:540/554/562/569`(badge **label:만**),
  `:1687/1697/1709`(release-proof status), `:2197-2220`(renderPrivateMeshStatus title/detail block), `:2266`(copy-proof button title), `:2182-2194/2224/2260`(DERP 진단 라벨 — optional).

**DO NOT TOUCH (load-bearing):**
- VALUE 리터럴 `"private"/"external"/"lan"/"mesh-needed"/"unverified"/"auto"/"local"`가 `state:`/`boundary:`
  필드나 `=== "..."`인 곳: `:338,345,386(switch),430,486,539(state),545,553,561,568,575,586,2909,2923,2969`.
- 백엔드 필드명 `tailscale_ip`/`tailnet_ip`/`mesh_mode`, mode enum `"musu_headscale"/"external_tailscale_opt_in"/"external_tailnet"`, 모든 `dataset.*` 키.
- CLI 문자열 `"musu mesh verify/release-proof/physical-peer-evidence…"`(`:578,600-610,620`), index.html:204 `musu mesh doctor`.
- schema 상수 `"musu.private_mesh_*"`(`:1131 등 — :1131은 equality check`).
- IPC 명령 `invoke("private_mesh_*")`(`:1700,2040,2464,…,4524`) + `private_mesh_release_proof_target`.
- IP 검증 `isTailnetIpv4` + `100.(6[4-9]…)` regex(`:517,1686`).

**OQ 해소(orchestrator, /loop 자율 기본값):** OQ-1=proof 실행 시 details 자동확장. OQ-2=mesh-proof-strip
유지+카피만(작고 "연결됨"=1급 신호; master "move"보다 detail 우선). OQ-3=title hover도 탈jargon(advanced 내부 제외).
