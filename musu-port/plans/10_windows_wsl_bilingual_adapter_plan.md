# 10 Windows WSL Bilingual Adapter Plan

## 목표

`musu-port`를 Windows 메인 + WSL2 타겟 제품으로 확장하기 위해 필요한 adapter/translator 분해를 확정한다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`

## 이번 단계 범위

- `musu-port` 기능을 shared core / translator / native adapter로 분해
- Windows/WSL adapter backlog 정의
- 리팩터링 우선순위 정의

## 제외 범위

- 실제 Windows discovery 구현
- 실제 launcher 구현
- packaging 자동화 구현

## 구현 작업 목록

- 현재 코드 파일별 층 분류 고정
- discovery provider 분리 타깃 정의
- runtime context / path bridge / executable resolver 계약 정의
- export/data dir resolution 이동 경로 정의
- 최소 Windows/WSL 테스트 매트릭스 정의

## 검증 방법

- 문서 리뷰
- 현재 코드와 adapter backlog 대응표 검토

## 보류 항목

- Windows discovery API 최종 선택
- `.exe` / AppImage 배포 구조 최종 레이아웃

## 완료 기준

- `musu-port`의 바이링구얼 제품화에 필요한 adapter backlog를 한 문서에서 설명 가능
- 다음 구현 단계에서 무엇을 shared core로 유지하고 무엇을 adapter로 뽑아야 하는지 모호함이 남지 않음
