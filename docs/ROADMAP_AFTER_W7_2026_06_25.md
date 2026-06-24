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
