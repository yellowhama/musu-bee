# Direct Viewer Smoke Implementation Note

작성일: 2026-04-02

## 목적

`Slice 2 - local stream split`를 shell navigation 전제 없이 검증하기 위해 direct viewer smoke surface와 Playwright spec을 추가한 사실을 기록한다.

## 추가한 원본 파일

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/qa/DirectViewerSmoke.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/qa/DirectViewerSmoke.tsx)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/App.tsx)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/e2e/direct-viewer-smoke.spec.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/e2e/direct-viewer-smoke.spec.ts)

## 추가한 경로

- `/?uiqa=1&surface=stream-viewer`

## 기대 효과

- `My Workspace` / `라이브` 탭 같은 shell navigation 전제를 건너뛴다
- `StreamViewer`와 `useRealtimeStream`에 더 직접 붙는다
- `Slice 2`를 `Type A shell mismatch`와 분리해서 검증할 수 있다

## 현재 실행 상태

spec 실행 시도:

```powershell
npx playwright test e2e/direct-viewer-smoke.spec.ts --reporter=line
```

결과:

- spec 자체 pass/fail 이전에 WSL ↔ Windows bridge 실행 경로에서 실패
- 관측 에러:

```text
<3>WSL (...) ERROR: UtilAcceptVsock:271: accept4 failed 110
```

## 현재 판단

- direct viewer smoke surface: 구현 완료
- direct viewer smoke spec: 구현 완료
- direct viewer smoke execution proof: 런처 환경 이슈로 미확보

즉 남은 것은 설계나 구현이 아니라, native Windows shell에서 이 spec을 한 번 실행해 결과를 캡처하는 일이다.
