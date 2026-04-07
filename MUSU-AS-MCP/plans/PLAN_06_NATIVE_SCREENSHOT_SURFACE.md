# PLAN 06: Native Screenshot Surface

> Status: done
> Updated: 2026-04-01 KST

## Goal

Pencil의 `get_screenshot`에 대응하는 `desktop__musu_app_get_native_screenshot` shape를 harness 기준으로 고정한다.

## Scope

- current view screenshot
- target component screenshot
- lightweight image payload contract

## Current Truth

- screenshot surface는 아직 없다.
- 구조 read와 visual proof는 분리돼야 한다.

## Tasks

1. response schema 정의
2. synthetic screenshot generator 구현
3. target_id 기반 분기
4. payload/summary 문서화

## Exit Condition

- `desktop__musu_app_get_native_screenshot`가 harness에서 동작한다.
- target-aware visual proof surface가 확보된다.

## Result

- [`server.py`](/home/hugh51/musu-functions/MUSU-AS-MCP/server.py)에 `desktop__musu_app_get_native_screenshot` 구현 완료
- `target_id`와 `include_window_frame` 인자 처리 확인
- lightweight `image/svg+xml` base64 payload 응답 확인
