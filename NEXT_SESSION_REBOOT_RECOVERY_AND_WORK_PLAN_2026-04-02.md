# Next Session Reboot Recovery And Work Plan

Date: 2026-04-02

## Why This Document Exists

현재 세션 마지막에 Windows 쪽에서 다음 오류가 발생했다.

- `\\wsl.localhost\Ubuntu-22.04\...`
- `Wsl/Service/0x8007274c`

즉, 다음 세션의 첫 작업은 기능 구현이 아니라 WSL 복구와 현재 작업 상태 재확인이다.

## First Priority: Recover WSL After Reboot

Windows PowerShell에서 먼저 확인:

```powershell
wsl --status
wsl -l -v
wsl -d Ubuntu-22.04
```

기대 결과:

- `Ubuntu-22.04` distro가 정상 표시됨
- interactive shell 진입 가능

그 다음 UNC 확인:

```powershell
dir \\wsl.localhost\Ubuntu-22.04\home\hugh51\musu-functions
```

기대 결과:

- `musu-functions` 루트가 정상 열림

만약 여전히 안 되면 다음 순서:

```powershell
wsl --shutdown
wsl -l -v
wsl -d Ubuntu-22.04
```

재부팅 후에도 `0x8007274c`가 반복되면, 다음 세션에서는 먼저 WSL service / UNC 문제부터 진단하고 repo 작업은 그 다음에 시작한다.

## Repo 1: `musu-computer-tools`

작업 위치:

- `/home/hugh51/musu-functions/musu-computer-tools`

다음 세션 시작 직후 읽을 문서:

- `MASTER_PLAN.md`
- `CURRENT_STATE.md`
- `TODO_EXECUTION_BOARD.md`
- `README.md`
- `WINDOWS_INTEROP_HANDOFF_2026-04-01.md`
- `BRIDGE_DOGFOOD_PROOF_2026-04-02.md`
- `BROWSER_CDP_LIVE_VALIDATION_PROOF_2026-04-02.md`

현재 상태 요약:

- Windows helper는 `online`
- helper install state는 `startup-folder`
- `probe-interop.sh` 결과는 `recommended_mode=helper`
- `probe-browser-cdp.sh` 결과는 live로 `reachable`
- browser boundary는 이제 spawn 문제가 아니라 CDP consumer 문제로 봐야 함

다음 세션에서 Codex에게 시킬 일:

1. `musu-computer-tools` 현재 코드/문서/evidence 기준으로 정성 평가
2. `CURRENT_STATE.md`, `TODO_EXECUTION_BOARD.md`, `MASTER_PLAN.md` 상태 드리프트 정리
3. code audit 수행
4. 다음 phase 문서 준비

구체 목표:

- Phase 10/11/12 상태를 루트 문서와 일치시킬 것
- browser/CDP consumer contract가 실제 consumer-facing surface로 닫혔는지 판단할 것
- 다음 phase를 문서로 먼저 열고 backlog에 올릴 것

완료 기준:

- 루트 상태 문서와 proof 문서가 서로 모순되지 않음
- 정성 평가 문서 1개 생성
- code audit 결과와 다음 phase runbook이 문서화됨

## Repo 2: `musu-indexer`

작업 위치:

- `/home/hugh51/musu-functions/musu-indexer`

다음 세션 시작 직후 읽을 문서:

- `MASTER_PLAN.md`
- `TODO.md`
- `HANDOFF.md`
- `README.md`
- `NEXT_STEPS.md`
- `QUALITY_AUDIT_2026-04-02.md`
- `PACKAGED_INSTALL_BLOCKER_RESEARCH_2026-04-02.md`

현재 상태 요약:

- local smoke 통과
- packaged validation은 automation까지 끝남
- 남은 건 Phase 09: suitable host에서 packaged validation evidence 확정

최신 evidence:

- `work/validation/validation-bundle-20260402T121838Z.txt`
- `work/validation/packaged-host-prereqs-20260402T121838Z.txt`
- `work/validation/packaged-install-smoke-20260402T121838Z.txt`
- `work/validation/smoke-20260402T121838Z.log`

다음 세션에서 Codex에게 시킬 일:

1. WSL 복구 후 `uv`를 sudo 없이 설치 가능한지 먼저 시도
2. 안 되면 sudo가 필요한 명령만 분리해서 제시
3. `bash scripts/run-validation-bundle.sh`
4. 가능하면 `bash scripts/run-validation-bundle.sh --online-extras`
5. 성공 시 Phase 09 닫기

완료 기준:

- `bundle_status: success`
- `host_prereqs_status: ready`
- `packaged_status: success`
- `RELEASE_CHECKLIST.md`, `HANDOFF.md`, `MASTER_PLAN.md`, `TODO.md` 반영

## What To Tell Codex Next Session

다음 세션 첫 메시지는 이렇게 주면 된다:

```text
먼저 /home/hugh51/musu-functions/NEXT_SESSION_REBOOT_RECOVERY_AND_WORK_PLAN_2026-04-02.md 읽고 그대로 진행해.
1) WSL 복구 상태부터 확인
2) musu-computer-tools 정성평가/문서정리/code audit/다음 phase 문서화
3) 그 다음 musu-indexer packaged validation 마무리
플랜 먼저 갱신하고, 문서 만들고, 구현/검증까지 끝까지 진행해.
```

## Important Guardrails

- `musu-computer-tools`는 direct interop보다 helper path를 우선 현실적 운영 경로로 봐야 한다.
- `musu-computer-tools` browser task는 Windows spawn이 아니라 CDP endpoint consumer 기준으로 봐야 한다.
- `musu-indexer`는 source tree 실행 문제보다 packaged install host prerequisite 문제가 남아 있다.
- 다음 세션도 phase-first, doc-first로 진행한다.
