# 다음 단계 (W-7 종결 후, 2026-06-25)

> 기준: W-7 M1 가드 머지(PR #27, main `ecf90c64`) + 코드 감사 SHIP-CLEAN
> 감사 근거: `W7_CODE_AUDIT_AND_QUALITY_2026_06_25.md`
> 우선순위순. 🔒 = 사용자 게이트(승인/환경 필요).

---

## 0. 현재 상태 스냅샷

| 항목 | 상태 |
|------|------|
| 버전 | `1.15.0-rc.14` (desktop-latest, 5-소스 정합) |
| 열린 PR | 0 (W-7=#27 머지 완료) |
| relay payload 보안 | SHIP-CLEAN (owner_key 격리·auth·원자성·M1 트립와이어 전부 검증) |
| W-7 deferral | 닫힘 (Phase -1 RED → M1만 채택) |
| 미커밋 작업메모 | WSU_FOLLOWUPS(2026-06-24) → 본 문서로 승격 |

---

## 🔴 U-FIX (P0, 신규 — 2026-06-25 실측 확정) 인-앱 업데이트 = ms-appinstaller 프로토콜 차단 딜레마

**증상**: cockpit 토스트 "업데이트" → App Installer 창 뜸 → **"앱 패키지를 열 수 없음"**.

**근본 원인 (App Installer 창 에러 메시지 + deploy 로그로 확정)**:
- App Installer 창 명시: **"ms-appinstaller 프로토콜이 비활성화되었습니다. 공급업체에 웹링크 업데이트를 요청하세요. aka.ms/ms-appinstaller-direct-link..."**
- deploy 로그(`AppXDeploymentServer/Operational`): 오늘 musu `UpdateUsingAppInstallerOperation` 시도 **0건** (마지막 성공=어제 12→13). = 배포 작업 시작 전, 프로토콜 단계에서 OS가 차단.
- **Microsoft가 ms-appinstaller: 프로토콜을 보안상 기본 비활성화**(2022 멀웨어 악용 대응, MSRC). Windows 업데이트로 이 머신에 정책 적용됨 → rc.12→13은 됐는데 지금 차단.
- ❌ 인증서 문제 아님(`.cer` CurrentUser 신뢰 넣어도 무효 — deploy 도달 전 차단). ❌ 버전/호스팅 정상.

**구조적 딜레마 (lib.rs:1729-1738 주석에 박혀있음)**:
- `Add-AppxPackage -AppInstallerFile` (CLI) → `0x80073D02` "실행 중 교체 불가"(cockpit 자기 자신 교체 못 함).
- → 그래서 `ms-appinstaller:` 프로토콜로 우회(`lib.rs:1739`) → **그 프로토콜이 OS 차단.**
- **양쪽 다 막힘.** 이게 진짜 U-FIX.

**근본 수정 설계 후보 (다음 세션 agent-team, Critic 게이트):**
1. **`.msix` 직접 다운로드 + `Add-AppxPackage`(프로토콜 무관)** — cockpit 자기교체 0x80073D02는 별도 프로세스/재시작 핸드오프로 회피(다운로드는 cockpit, 설치는 detached helper가 cockpit 종료 후 실행+재기동). self-contained, 무료. **유력.**
2. ms-appinstaller 프로토콜 **재활성화**(레지스트리/정책) — 사용자 머신 정책 건드림, 멀웨어 벡터 재오픈, self-contained 위반. ❌ 비권장.
3. winget/Store 채널 경유 — Store 등록(blossompark.musu 있음) 활용하나 Store 심사 의존. GA 후보.
- ⚠️ Critic(security-engineer): detached helper의 권한/경로/서명 검증. lazy-solution: helper는 PowerShell 1-스크립트로 충분(새 바이너리 X).
- 검증: rc.15 → 13/14 머신 토스트 업데이트 실클릭 성공(실설치 E2E). "단위테스트≠실동작" — 이 건이 정확한 증거(cargo/Critic/Auditor 다 통과했으나 프로토콜 차단은 실설치만 발견).

**즉시 우회 (이 머신 14 올리기 — 프로토콜 안 거침, `.cer`는 이미 CurrentUser 신뢰됨)**:
```
powershell -Command "irm https://github.com/yellowhama/musu-bee/releases/download/desktop-latest/musu-desktop-x64.msix -OutFile $env:TEMP\m.msix; Add-AppxPackage $env:TEMP\m.msix"
```
→ cockpit 떠 있으면 0x80073D02 날 수 있음. 그땐 cockpit/musu 종료 후 재실행.

---

## 1. 사용자 게이트 — 하드웨어 E2E (P1, 코드 끝, 환경만 남음)

플레이북 준비 완료, 사용자 2머신 환경에서만 실행 가능.

- 🔒 **W-4 — 2머신 relay E2E** (task #43). relay store-and-forward 실하드웨어 검증.
  플레이북: `E2E_FLEET_3STATE_PLAYBOOK_2026_06_23.md`. direct→relay→offline flip 재현.
  ⚠️ hugh-main 머신에 최신 빌드(rc.14) 설치 필요(현재 rc.13).
- 🔒 **uninstall 라이프사이클 E2E** — install→uninstall(cockpit 버튼 + Uninstall-MUSU.ps1)→reinstall.
  체크리스트: WS-B 문서. U-A/U-B/U-C + Method A 수렴 확인.

---

## 2. 큰 작업 후보 (사용자 결정 대기)

- 🔒 **D-1 (P1) cockpit S-tier 디자인 재배치 — KVM 강등.**
  `musu-desktop.pen` 7-스크린 평가 결과: 시각완성도 높으나 **KVM/WebRTC 전면 = thesis(묶고/굴리고/발전=작업위임) 위반.**
  사용자 결정: **KVM 강등→보조.** 작업위임/오케스트레이션 1급, KVM 보조 재배치.
  .pen 재배치 + cockpit 구현 정합. design-gate 정식 통과 대상.
  부수: 내부용어("company"/"KVM tunnels") 사용자向 노출 → 랜딩 평이체 정합.
- 🔒 **N-3 (P1) mesh.env at-rest 암호화.** `install/token.rs:81-153`이 MUSU_MESH_BEARER 평문+0600/ACL 저장.
  DPAPI/Credential Manager 암호화 = 트레이드오프(same-user 악성코드엔 무력하나 `~/.musu` 클라우드 백업/디스크 도난 방어엔 가치).
  Gemini 감사 유일 실재 항목(나머지 4개는 이미구현/환각/YAGNI로 독립검증 종결). **백업 동기화 습관 있으면 할 가치 — 사용자 판단.**
- 🔒 **D-2 (P2) 랜딩 카피 self-contained/antifragile 보강.** 현 히어로("Give a machine work. Walk away.") 좋으나 vs-SaaS 차별 각도 약함. PITCH 문서 "we make your machines smart" 반영. design-gate 대상.
- **B-7 (P2) login 환경변수/안내 정합** (task #28). 잔여 정리.

---

## 3. 코드 후속 (선택, 코스메틱)

- **INFO-1 — relay payload zod `.passthrough()` 제거.** 3개 스키마(`route.ts:33,45,51`)의 `.passthrough()`는 store 침투 불가(명시 allow-list)이나 trust-boundary 의도엔 `.strip()`이 부합. **블로커 아님 — 다음 relay 작업 시 묶음.**

## 4. WS-U 자체 후속 (작은 것)

- **N-1 (P2)** `restart_app` Tauri 커맨드 — ms-appinstaller 전환으로 토스트 버튼은 제거됨. lib.rs 등록은 트레이/설정 재사용 여지로 유지. 무해, 지금은 둠.
- **N-2 (P2)** probe 간격 튜닝 — 현재 시작 1회+6h. OS 24h 백스톱과 중복인지 실사용 후 조정. 데이터 없으면 그대로.

---

## 5. 운영 메모

- ⚠️ **rc 버전 검증용 소진**: rc.10→11→12→13→14 모두 검증 산물. 다음 정식 빌드 전 VERSION 정리 고려.
- **핵심 교훈(WS-U)**: "단위테스트 green ≠ 실동작." cargo 7테스트+Critic+Auditor 통과했으나 실설치 E2E서 버그 3개(Byte[] stdout, 0x80073D02 자기교체, 다운그레이드 가드) — 전부 통합경로라 코드만 읽어선 안 잡힘. → cockpit/설치 기능은 **반드시 패키지 설치본 실측**. 메모리: `reference-powershell-bytearray-stdout`, `reference-cockpit-aumid-launch`.
