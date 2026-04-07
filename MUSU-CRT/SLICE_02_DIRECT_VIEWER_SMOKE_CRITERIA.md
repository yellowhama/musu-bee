# Slice 02 Direct Viewer Smoke Criteria

작성일: 2026-04-02

## 목적

`Slice 2 - local stream split`를 검증할 때, shell navigation 전제에 강하게 묶인 E2E 대신 `StreamViewer`와 `LiveView`에 더 직접 붙는 smoke 기준을 정의한다.

## 왜 새 기준이 필요한가

기존 `warden-live.spec.ts`는 아래 전제를 가진다.

- `/?uiqa=1&shell=v1` 진입
- `My Workspace` 버튼 존재
- `라이브` 탭 존재

실패 결과는 이 전제에서 막혔다.

즉 이 경로는 `local stream split` helper regression보다 `UI QA shell 진입 조건`에 더 민감하다.

## 직접 smoke anchor

컴포넌트 anchor:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts)

QA anchor:

- `/?uiqa=1`
- 필요 시 `/?uiqa=1&shell=v1`

## smoke 기준

### Direct StreamViewer 기준

최소 확인:

1. `StreamViewer`가 mount된다
2. `useRealtimeStream`에서 runtime error가 바로 발생하지 않는다
3. metrics overlay / WebRTC status overlay 관련 surface가 깨지지 않는다

### LiveView 기준

최소 확인:

1. `LiveView`가 mount된다
2. GUI channel이 `StreamViewer` wrapper로 연결된다
3. live surface 진입 시 console/runtime error가 없다

## pass 기준

- direct viewer 진입 가능
- helper 분리 이후 immediate runtime error 없음
- local stream 관련 UI shell이 깨지지 않음

## fail 분류

### Type A

`shell navigation mismatch`

예:

- workspace button 없음
- live tab 없음
- UI QA shell route shape mismatch

### Type B

`direct viewer/local stream regression`

예:

- `StreamViewer` mount 실패
- `useRealtimeStream` runtime error
- metrics / reconnect surface 오류

## 현재 권장

`Slice 2`는 앞으로 `Type A`와 `Type B`를 분리해서 본다.

즉 `warden-live.spec.ts` 단일 결과로 `local stream split` regression이라고 결론 내리지 않는다.
