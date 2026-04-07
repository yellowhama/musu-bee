# Backport Slice 02 Local Stream Status

작성일: 2026-04-02

## 목적

`Slice 2 - local stream split`의 현재 적용 상태와 남은 proof gap을 한 장으로 기록한다.

## 현재 상태

`Slice 2`는 원본 repo에 일부 반영된 상태다.

근거:

- `useRealtimeStream.ts`에서 inline parser / metrics / reconnect 로직이 helper import로 이동했다
- `useRealtimeStreamSupport.ts`가 새 helper 파일로 존재한다

## 확보된 것

- frontend build proof

확인 결과:

- Windows `npm run build` pass
- `vite build` 완료
- `3499 modules transformed`
- `✓ built in 1m 14s`
- `dist/` 산출물 생성 확인

## 아직 닫히지 않은 것

- local stream smoke proof

실행한 경로:

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
npm run test:e2e:warden-live:fast
```

현재 관측:

- Playwright runner 기동 확인
- `playwright test --config playwright.warden-live.config.ts e2e/warden-live.spec.ts`
- Windows `node` 프로세스 다수 실행 중
- `Running 2 tests using 1 worker`
- `playwright-report/index.html` 생성
- `test-results/.playwright-artifacts-0/traces/...` 생성

최종 결과:

- `2 failed`
- 두 테스트 모두 `gotoUiQaShell` timeout
- 실패 원인:
  - `My Workspace` 버튼 또는 `라이브` 탭이 `APP_READY_TIMEOUT_MS` 안에 나타나지 않음
- error context snapshot 기준:
  - 앱은 떠 있음
  - 그러나 기대한 workspace/live shell 대신 fleet/dashboard 계열 화면에 머물러 있음

즉 local stream smoke proof는 `closed / failed`다.
다만 현재 failure scope는 `local stream split regression`으로 단정할 수 없고,
`E2E shell precondition mismatch` 가능성이 크다.

## 현재 관측

- Windows에서 `npm run build`를 실행했다
- 출력:
  - `vite build`
  - `building client environment for production...`
  - `transforming...`
- 같은 시점에 Windows `node` 프로세스 다수가 살아 있는 상태를 확인했다

즉 frontend build proof는 `closed / pass` 상태다.

## 현재 판단

상태는 `applied candidate / frontend build proven / smoke failed with precondition mismatch`다.

즉 다음 행동은 새 설계가 아니라:

1. local stream smoke를 더 직접적인 viewer 진입 기준으로 재검증하거나
2. 현재 E2E shell precondition mismatch를 별도 failure scope로 분리하는 것

이다.
