# Slice 02 Local Stream Smoke Runbook

작성일: 2026-04-02

## 목적

`Slice 2 - local stream split`의 마지막 남은 proof gap인 local stream smoke를 기존 E2E 진입점 기준으로 닫는다.

## 기존 근거

이미 원본 repo에는 live view 진입 E2E가 있다.

참조:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/e2e/warden-live.spec.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/e2e/warden-live.spec.ts)

이 spec은 아래를 이미 사용한다.

- `LiveView.tsx`
- live tab 진입
- Warden/live shell 진입

즉 local stream smoke를 위한 가장 가까운 기존 automation anchor다.

## smoke 목적

이번 smoke에서는 아래를 보면 충분하다.

1. live view 진입 가능
2. local stream 관련 화면이 regression 없이 렌더됨
3. `useRealtimeStream` helper 분리 이후 live surface가 깨지지 않음

## 실행 후보

### Option A: existing Playwright path reuse

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
npm run test:e2e:warden-live:fast
```

### Option B: UI QA shell manual smoke

1. app 실행
2. live tab 진입
3. stream viewer / live panel 렌더 확인
4. metrics / reconnect UI regression 없는지 확인

## pass 기준

- live tab 진입 성공
- stream/live 관련 화면 렌더 성공
- helper 추출 이후 runtime error 없음

## 현재 상태

runbook은 준비 완료다.
실제 smoke는 실행을 시작했다.

관측:

- 실행 명령:

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
npm run test:e2e:warden-live:fast
```

- 출력:
  - `playwright test --config playwright.warden-live.config.ts e2e/warden-live.spec.ts`
  - `Running 2 tests using 1 worker`
- artifact:
  - `playwright-report/index.html` 생성
  - `test-results/.playwright-artifacts-0/traces/...` 생성

최종 결과:

- `2 failed`
- 두 케이스 모두 `gotoUiQaShell` 단계에서 timeout
- 실패 지점:
  - `My Workspace` 버튼 또는 `라이브` 탭이 `90s` 안에 나타나지 않음

즉 현재 smoke evidence는 `closed / failed`, 단 실패 범위는 local stream helper 자체보다
`UI QA shell navigation precondition` 쪽에 가깝다.
