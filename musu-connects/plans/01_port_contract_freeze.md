# 01 Port Contract Freeze

## 목표

`musu-connects`가 `musu-port`와 주고받을 route contract를 고정한다.

## 참조 문서

- `/home/hugh51/musu-functions/musu-port/README.md`
- `/home/hugh51/musu-functions/musu-port/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md`

## 이번 단계 범위

- advertised route 모델
- imported route 모델
- peer/source/visibility 필드
- stale/freshness/health 필드

## 제외 범위

- 실제 transport 구현
- cryptography 세부 구현
- lifecycle supervisor 구현

## 구현 작업 목록

- local managed route -> advertised route 변환 모델 정의
- imported route가 local route와 함께 alias registry에 들어갈 수 있는 조건 정의
- source collision 규칙 정의
- visibility/scope 규칙 정의
- freshness/health 기준 정의

## 검증 방법

- 문서 리뷰
- 예시 route payload 설계
- `musu-port` 쪽 모델과 필드 대응표 작성

## 보류 항목

- peer identity의 최종 포맷
- transport 레벨 reachability signal 포맷

## 완료 기준

- `musu-port`와 `musu-connects`의 route contract를 한 문서에서 설명 가능
- 이후 구현 단계가 field-level ambiguity 없이 진행 가능
