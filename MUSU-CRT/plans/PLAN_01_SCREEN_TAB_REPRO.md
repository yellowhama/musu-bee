# PLAN 01: Screen Tab Reproduction

## 목표

원본 MUSU의 `Screen` 탭을 `MUSU-CRT` 안에서 read-only repro viewer로 먼저 재현한다.

## 범위

- screen tab source analysis
- mock fixture
- static repro viewer
- group selector
- focused stream panel mock

## 현재 truth

- 원본의 핵심 source anchor는 확보됐다.
- `MUSU-CRT`에는 아직 실제 screen tab repro viewer가 없다.

## 입력 문서

- [CRT_SOURCE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_SOURCE_MAP.md)
- [SCREEN_TAB_SOURCE_ANALYSIS.md](/home/hugh51/musu-functions/MUSU-CRT/SCREEN_TAB_SOURCE_ANALYSIS.md)

## 작업 목록

1. source analysis 문서 생성
2. mock fixture 작성
3. screen tab repro viewer 생성
4. README/run instruction 추가
5. 마스터 플랜/현재 상태 갱신

## 완료 기준

- `MUSU-CRT` 안에 screen tab repro viewer가 생긴다.
- `device | project | company` group 전환이 mock 기준으로 동작한다.
- focused stream mock panel이 렌더된다.
