# MUSU-CRT Screen Tab Source Analysis

작성일: 2026-04-01

## 목적

원본 MUSU의 `Screen` 탭이 어떤 파일 조합으로 이루어지는지 `MUSU-CRT` 기준으로 다시 고정한다.

## 핵심 원본 파일

### gallery shell

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/ScreenGalleryView.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/ScreenGalleryView.tsx)

역할:

- 스크린 탭 메인 shell
- `device | project | company` grouping
- refresh
- focused window overlay 진입

### compact gallery

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/messenger/ScreenGalleryGrid.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/messenger/ScreenGalleryGrid.tsx)

역할:

- read-only gallery 변형
- device section 반복
- refresh / empty state

### discovery + thumbnail refresh

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useScreenGallery.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useScreenGallery.ts)

역할:

- `listRemoteWindows()`
- `getWindowSnapshot()`
- window poll
- snapshot poll
- device grouping용 데이터 shape 생성

### focused stream

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)

역할:

- 선택된 window의 focused stream
- stream metrics overlay
- WebRTC stage overlay
- terminal / gui interaction

### live shell integration

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx)

역할:

- GUI / Terminal channel focus mode
- focused stream을 `StreamViewer`로 연결

## 최소 재현 경계

`MUSU-CRT`에서 먼저 재현할 최소 범위는 아래다.

1. Screen tab header
2. group selector
3. device/project/company section rendering
4. thumbnail card grid
5. focused stream panel mock
6. status/metrics strip

## 아직 재현하지 않는 것

- 실제 WebRTC 세션 연결
- 실제 thumbnail polling
- terminal attach
- clipboard sync
- live input delegation

## 현재 결론

원본 Screen 탭은 단일 컴포넌트 하나가 아니라:

- gallery shell
- discovery hook
- stream viewer
- live shell integration

이 네 층의 결합이다.
