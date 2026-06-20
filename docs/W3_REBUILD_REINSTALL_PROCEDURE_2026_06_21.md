# W-3 절차 — rc.7 재빌드 + 양쪽 머신 재설치 (relay 코드 탑재)

> 마스터: `CONNECTION_COMPLETION_MASTER_PLAN_2026_06_20.md` · 세션 플랜: `~/.claude/plans/cosmic-honking-cake.md`
> 선행: PR #12 (W-1/W-2/W-5/W-6) **main 머지 완료** 후 실행 (relay 코드가 main에 있어야 빌드가 그걸 탑재).
> ⚠️ **실제 빌드·설치는 사용자(Hugh)가 실행** — 새빌드 설치 게이트. 이 문서는 절차서.

## 왜 W-3가 필요한가

현재 설치된 desktop 바이너리는 **rc.4 기반 = relay 코드(W-1/W-2) 없음**. cockpit이 설치된 WindowsApps 패키지의 `musu.exe`를 spawn하므로([[reference-musu-cockpit-spawns-installed-msix]]), relay를 실기기에서 쓰려면 **MSIX 재빌드 + 양쪽 머신 재설치**가 필수. W-4(2머신 E2E)의 선행 조건.

## 핵심 사실 (build-msix.ps1 실측)

- **auto-bump 기본 ON**: 빌드 성공 시 VERSION `rc.6 → rc.7` 자동 증가(빌드 전 수동 bump 불필요 — working tree는 rc.6으로 둠). `-NoBump`로 opt-out.
- **메모리-safe 기본 ON**: `CARGO_BUILD_JOBS=1` + `RUST_MIN_STACK=64MiB`(대형 lib.rs LTO OOM 방지). RAM 충분하면 `-FastBuild`.
- **빌드 산출물**: `.local-build/msix/output/` — `musu_1.15.0.7_x64_<contract>.msix`, `musu-desktop-x64.msix`(hosted 고정명 복사본), `musu.appinstaller`.
- **서명키**: `.local-build/signing/blossompark.musu.pfx`(canonical, gitignored). 있으면 자동 재사용. 없으면 `-GenerateCert` 1회(이후 canonical로 저장). 🔴 .pfx는 커밋 금지.
- **3개 실행파일**: `musu.exe`(런타임), `musu-startup.exe`(startup shim), `musu-desktop.exe`(Tauri shell). cargo `--bin musu --bin musu-startup` + `npm run tauri build --no-bundle`.
- **hosting**: `github.com/yellowhama/musu-bee/releases/download/desktop-latest`(고정 태그). 자산 덮어쓰기. App Installer가 `musu.appinstaller`의 Version 상승을 감지해 자동 업데이트.

## 절차 (사용자 실행)

### 0) 선행 확인
```powershell
# PR #12가 main에 머지됐고 로컬 main이 최신인지
git -C F:\workspace\musu-bee checkout main
git -C F:\workspace\musu-bee pull origin main
git -C F:\workspace\musu-bee log --oneline -5   # W-1/W-2/W-5/W-6 보여야 함
Get-Content F:\workspace\musu-bee\VERSION         # 1.15.0-rc.6 (빌드가 rc.7로 올림)
```

### 1) dry-run으로 빌드 계획 확인 (선택)
```powershell
cd F:\workspace\musu-bee
.\scripts\windows\build-msix.ps1 -DryRun
```

### 2) MSIX 빌드 (auto-bump rc.6→rc.7, 메모리-safe)
```powershell
cd F:\workspace\musu-bee
# canonical 서명키 있으면 그대로:
.\scripts\windows\build-msix.ps1
# 서명키 처음 만들면(최초 1회만):
# .\scripts\windows\build-msix.ps1 -GenerateCert -InstallCert
```
- 성공 시 VERSION이 rc.7로 커밋됨(파일에 기록). 산출물 경로가 출력됨.
- ⚠️ 빌드 실패 시 VERSION 무변경(double-bump 방지 설계).

### 3) desktop-latest 릴리스 자산 교체 (auto-update 배포)
```powershell
$out = "F:\workspace\musu-bee\.local-build\msix\output"
# 고정명 MSIX + appinstaller 업로드(덮어쓰기). cer/Install-MUSU.ps1은 기존 유지.
gh release upload desktop-latest `
  "$out\musu-desktop-x64.msix" `
  "$out\musu.appinstaller" `
  --clobber --repo yellowhama/musu-bee
# 확인
gh release view desktop-latest --json assets --jq '.assets[].name' --repo yellowhama/musu-bee
```

### 4) 양쪽 머신 재설치
- **이 머신**: App Installer가 `musu.appinstaller` Version(1.15.0.7) 상승을 24h 내 자동 감지, 또는 즉시:
  ```powershell
  Add-AppxPackage -AppInstallerFile "https://github.com/yellowhama/musu-bee/releases/download/desktop-latest/musu.appinstaller"
  ```
- **hugh-main(상대 머신)**: 동일 명령 또는 `Install-MUSU.ps1` 재실행. 로그인은 같은 계정(자동 mesh join, W-5 UX대로).

### 5) 탑재 검증
```powershell
# 설치본 버전이 rc.7인지
musu --version    # 1.15.0-rc.7 기대
# relay 코드 탑재 확인(W-1/W-2 경로 존재)
musu relay status # blockers 실측
```

## 검증 (무당짓 금지)
- 빌드: MSIX 산출 + 서명 성공 + VERSION rc.7 기록.
- 배포: `gh release view`에 새 musu-desktop-x64.msix + appinstaller(Version 1.15.0.7).
- 설치: `musu --version` = rc.7 (양쪽 머신).
- → 이후 **W-4 2머신 E2E** 가능(hugh-main online 시).

## 게이트
- 🔒 빌드·릴리스 업로드·설치 = **사용자 실행**(새빌드 설치 + production 자산 배포 게이트).
- 🔴 .pfx 서명키 절대 커밋 금지(.local-build/signing/ gitignored).
