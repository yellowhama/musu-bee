# PLAN 13: Original App Runtime Proof

## 목표

`MUSU-WORKS` canonical contract를 원본 MUSU 앱의 실제 상태와 대조해서 backport feasibility를 증거 수준으로 확인한다.

## 범위

- project/workspace/policy/approval/agent 현재 truth 재확인
- company layer insertion point 재확인
- desktop UI/MCP read surface 삽입 후보 재검증
- discrepancy 목록 작성

## 입력 문서 / 코드

- [ORIGINAL_APP_BACKPORT_MAP.md](/home/hugh51/musu-functions/MUSU-WORKS/ORIGINAL_APP_BACKPORT_MAP.md)
- [FINAL_TOUCH.md](/home/hugh51/musu-functions/MUSU-WORKS/FINAL_TOUCH.md)
- 원본 MUSU `warden`, `prime`, `desktop` 관련 파일

## 작업 목록

1. backend insertion points 재검토
2. desktop UI insertion points 재검토
3. MCP insertion points 재검토
4. canonical-vs-original discrepancy 작성
5. backport risk 분류

## 완료 기준

- runtime proof 문서가 추가된다.
- backport feasibility가 `low/medium/high risk`로 분류된다.
- final touch 단계로 넘길 discrepancy 리스트가 생긴다.

