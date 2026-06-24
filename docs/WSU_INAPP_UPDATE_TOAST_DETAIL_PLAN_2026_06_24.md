# WS-U 인-앱 업데이트 알림 토스트 — 세부 플랜 (2026-06-24)

## Context (왜)
musu MSIX 자동업데이트는 OS 위임(.appinstaller 24h 백그라운드)만 있고 **인-앱 가시성/제어가 0**.
Pencil(electron-updater)은 30분마다 체크 → "업데이트 준비됨, 지금 설치?" 토스트 → 사용자 동의
시 적용. musu cockpit엔 이게 없어 사용자가 새 버전이 떴는지 모르고, 24h를 기다려야 함.

목표(사용자 /goal verbatim): "MSIX는 자기복제를 못 하므로 인-앱에서 [버전 비교]로 '업데이트
있음' 감지 → cockpit 토스트 → '지금 재시작해서 적용' 버튼. self-replace가 아니라 OS 업뎃을
앞당겨 트리거 + 알림하는 방식."

## 사용자 결정 (이번 턴 AskUserQuestion)
- probe 방식 = **appinstaller XML 파싱** (WinRT 정석에서 재고 후 전환).
  근거: no-YAGNI/lazy-ladder, 신규 dep 0, musu 스케일에 충분. ForceUpdateFromAnyVersion=true라
  "릴리스 Version > 설치 Version"이면 항상 적용 가능 → 정확성 손실 사실상 0.
- 적용 + 재시작 = 기존 OS 경로 재사용 (새 self-replace 안 만듦).

## 확정 사실 (코드/리서치 실측 2026-06-24)
| 사실 | 증거 |
|------|------|
| cockpit shell = `src-tauri-shell/main.js`(4862줄) + `index.html` | Explore |
| 기존 `check_for_updates`(적용 액션, Add-AppxPackage) + APPINSTALLER_URL 상수 | lib.rs:1703-1737 |
| 30 커맨드 단일 `generate_handler!` 블록 | lib.rs:22-56 |
| cockpit↔Rust = `invoke(name,args)`(main.js:230-235) → `#[tauri::command] fn ... -> Result<T,String>` | Explore |
| 현재버전 = `env!("CARGO_PKG_VERSION")` → desktop_status/cockpit_state → 헤더/설정 3표면 | lib.rs:509,531,612; main.js:4456-4469 |
| cockpit_state ~15s 폴이 이미 version 운반 | Explore |
| 토스트 컴포넌트 없음. 재사용 패턴: `#first-task-aha` show/hide+pulse-once(main.js:3983), `announce()` ARIA(main.js:241), 설정 `#set-update-state`(main.js:4493) | Explore |
| 트레이 "Check for updates"+"Restart MUSU"(app.restart()) | lib.rs:94,100,112-115 |
| .appinstaller Version 형식 = MSIX 4-part `1.15.0.11` (rc.11) | rc11 검증 |
| windows-sys만 src-tauri에 있음(WinRT windows crate는 musu-rs에만) → XML 파싱은 dep 추가 불필요 | Cargo.toml:31-32 |

## 설계 (lazy-ladder: 새 self-replace/WinRT 안 만듦, probe만 추가)

### U-1. Rust `probe_update` 커맨드 (신규, 비변경)
- `#[tauri::command] fn probe_update() -> Result<UpdateProbe, String>` (lib.rs generate_handler에 등록).
- 동작: 호스팅 `APPINSTALLER_URL`(상수 공유 — check_for_updates에서 추출해 모듈 const로) HTTP GET
  → XML에서 `AppInstaller`/`MainPackage` `Version="x.y.z.w"` 추출 → `env!("CARGO_PKG_VERSION")`을
  MSIX 4-part로 정규화 → 비교.
- 반환 struct: `{ update_available: bool, current: String, available: Option<String>, ok: bool, message: String }`
  (DesktopStatus/CockpitState shape 미러).
- Windows 외: `ok:false`, update_available:false (기존 check_for_updates off-Windows 패턴 동일).
- 네트워크 실패 = graceful (update_available:false, message에 사유) — 토스트 안 띄움. dev에서도 무해.
- HTTP: 기존 reqwest(이미 dep) 재사용. XML 파싱은 정규식 1줄 또는 quick-xml(이미 있나 확인). 새 무거운 dep 금지.

### U-2. cockpit 토스트 UI (신규, 최소)
- `index.html`에 토스트 엘리먼트 1개(`#update-toast`, 기본 hidden) — `#first-task-aha` 마크업 패턴 미러.
  내용: "새 버전 vX 사용 가능" + "지금 재시작해서 적용" 버튼 + "나중에"(닫기).
- `main.js`: 기존 ~15s `cockpit_state` 폴에 `probe_update` 호출을 **얹지 않고**(폴 빈도 과다),
  앱 시작 시 1회 + 이후 긴 간격(예: 6h) `setInterval`로 `invoke("probe_update")`. 결과 update_available=true면
  토스트 show + `announce()` ARIA. (Pencil은 30분이지만 musu는 OS가 24h 하므로 6h 인-앱이면 충분.)
- "지금 적용" 버튼 → `invoke("check_for_updates")`(기존 적용 액션) 호출. App Installer가 OS UI로
  받아서 적용. 적용 후 재시작은 App Installer/OS가 처리(next launch) — 명시적 app.restart()는
  App Installer 흐름과 충돌 가능하니 ⚠️ 열린질문에서 확정.
- "나중에" → 토스트 hide, 해당 세션 재표시 안 함(in-memory 플래그).

### U-3. 설정 표면 정합
- 기존 `#set-update-state` 텍스트("Auto-updates on launch")를 probe 결과와 동기화:
  최신이면 "최신 버전(vX)", 있으면 "vY 사용 가능 — 지금 적용". 기존 `#set-check-update` 버튼 유지.

## Critic Findings (resolved) — 2026-06-24 (system-architect)
Builder는 이 표를 PRIOR ARTIFACTS로 읽을 것. 4개 열린질문 전부 코드 실측으로 닫힘.

| # | Sev | 결론 | 증거 | Builder 지시 |
|---|-----|------|------|-------------|
| H-1 | 🔴 | 버전 정규화 규칙 = `Normalize-Version`. `+meta` strip → 첫 `-`로 core/pre 분리 → core=3숫자 → pre의 **첫 숫자런**이 4번째 옥텟(`rc.11`→11), prerelease 없으면 **`.0`**(`1.15.0`→`1.15.0.0`). | build-msix.ps1:149-184 | 이 fn을 **순수 Rust로 정확히 포팅** + 단위테스트(ps1 라인 인용). 비교는 **숫자 4-튜플** `[maj,min,build,rev]`, **문자열 비교 금지**("1.15.0.9">"1.15.0.11" 오류). |
| H-1b | 🔴 | rc→GA 같은-core false-negative: GA `1.15.0`(=`1.15.0.0`) < `1.15.0.11`(rc) → 토스트 못 뜸. | Normalize 규칙 귀결 | **3-part core가 다르면 4옥텟 무관하게 update_available=true**. 같은 core면 4-튜플 비교. OS 24h가 백스톱. |
| H-2 | 🔴 | "reqwest 이미 dep"는 **거짓** — reqwest/quick-xml은 Cargo.lock transitive일 뿐 Cargo.toml에 없음. | Cargo.toml:20-32; grep 무매치 | **신규 dep 0** 경로: PowerShell `Invoke-RestMethod`로 .appinstaller GET(기존 check_for_updates의 PS idiom 미러, lib.rs:1727-1731) → Rust에서 regex `Version` 파싱. reqwest/quick-xml 추가 금지. |
| H-3 | 🔴 | 적용≠재시작: Add-AppxPackage는 실행 중 cockpit 자동 재시작 안 함(rc.11 실측 일치). | lib.rs:1724-1731 | 토스트 **2단계**: ①"vX 사용가능"+"지금 적용"→`invoke("check_for_updates")` ②ok시 "받음 — 다시 시작 필요"+"지금 다시 시작"→`app.restart()`(lib.rs:112-115 패턴). **즉시 auto-restart 금지**(설치 in-flight). |
| M-4 | 🟡 | 읽을 Version attr = 루트 `<AppInstaller Version=>`(업뎃 결정 권위값, MainPackage와 동일하나 루트가 canonical). | build-msix.ps1:406-424 | regex를 `<AppInstaller` 엘리먼트에 **앵커**, bare 첫 `Version=` 금지. |
| L-5 | 🟢 | probe graceful 3경로 확인. | lib.rs:1715-1721 | off-Windows=ok:false 미러; 네트워크실패=ok:false,update_available:false **never throw**; `cfg!(debug_assertions)`면 early-return(dev 노이즈 차단). JS는 `invoke("probe_update")` try/catch(자체 6h interval이라 15s 폴 무관). |
| INFO-6 | ⚪ | design-gate(`musu-bee/src/{app,components,pages,styles}+public`) + saas-gate(`musu-bee/src/`+`musu-rs/src/`) 둘 다 **범위 밖**. src-tauri-shell/ + src-tauri/src/lib.rs는 어느 prefix도 아님. | evaluate.cjs:2-5,20 | 게이트 막힘 없음. |
| L-8 | 🟢 | APPINSTALLER_URL을 모듈 const로 hoist(probe+apply 동일 URL 보장). | lib.rs:1712 | check_for_updates에서 추출. |

### 원래 열린질문 4개 → 전부 closed
1. ✅ rc매핑 = H-1 (Normalize-Version 포팅 + 4-튜플 + core-differs 규칙).
2. ✅ 적용→재시작 = H-3 (2단계 토스트, auto-restart 금지).
3. ✅ probe 간격 = L-5 (시작1회+6h, 자체 interval, graceful).
4. ✅ XML파서 = H-2 (PS Invoke-RestMethod + regex, 신규 dep 0).

## 진행 순서 (agent-team)
1. 세부 플랜(이 문서) → Critic(system-architect: rc버전매핑/적용재시작시퀀스/probe graceful-fail 검증).
2. Critic HIGH 해소 → Builder(U-1 Rust probe + U-2 토스트 + U-3 설정).
3. Auditor(quality-engineer: 버전비교 정확성 + dev/off-Windows graceful + 토스트 a11y).
4. 빌드(rc.12) + 이 머신 설치 + 실제 토스트 동작 검증(rc.11→rc.12 "있음" 떠야 함).
5. Scribe: closure + 메모리.

🔒 게이트: main push=Const VII, design-gate=토스트가 UI 파일(src-tauri-shell)이라 대상인지 확인
(index.html/main.js는 musu-bee/src/ 아니라 design-gate 범위 밖일 수 있음 — evaluate.cjs 경로 확인).

## 검증 (무당짓 금지)
- U-1: probe_update가 실 호스팅 appinstaller에서 Version 추출 + 버전비교 정확(rc매핑 실측 인용).
- 정확성: 같은 버전이면 update_available:false, 더 높으면 true. cargo test로 버전비교 함수 단위테스트.
- U-2: rc.11 설치본에서 rc.12 릴리스 올린 뒤 토스트 실제로 뜸(실측, 추측 금지).
- graceful: 네트워크 끊김/dev 빌드에서 토스트 안 뜨고 cockpit 안 깨짐.

## LOC 추정 (×2 floor)
- U-1: ~40 첫초안 → ~80 (버전 정규화 + 단위테스트 + off-Windows 분기).
- U-2: ~50 (토스트 마크업 + show/hide + probe 인터벌 + a11y).
- U-3: ~15 (설정 텍스트 동기화).
- 합 ~145 실제.
