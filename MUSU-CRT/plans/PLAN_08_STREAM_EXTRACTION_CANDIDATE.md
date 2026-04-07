# PLAN 08: Stream Extraction Candidate

## 목표

`useRealtimeStream`를 실제로 분리할 때의 후보 단위를 미리 고정한다.

## 범위

- stream adapter
- frame parser
- metrics collector
- reconnect policy

## 현재 truth

- signaling-only가 첫 추출 후보다.
- stream은 그 다음 후보라서 내부 단위 정리가 필요하다.

## 작업 목록

1. source anchor 확인
2. extraction units 정리
3. 분리 순서 추천

## 완료 기준

- [STREAM_EXTRACTION_CANDIDATE.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_EXTRACTION_CANDIDATE.md) 가 존재한다.
