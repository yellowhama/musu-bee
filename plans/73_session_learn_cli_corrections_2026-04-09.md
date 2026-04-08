# Detail Plan — Session Learn / CLI Corrections (2026-04-09)

레퍼런스: `references_AI/rtk-ai`의 `rtk learn` (실패→성공 커맨드 페어로 룰 생성).

## Goal

운영/개발 세션에서 반복되는 CLI 실수를 자동으로 감지하고,
룰/런북/프리플라이트로 승격해서 같은 실수를 줄인다.

## Inputs (수집 소스)

- MUSU worker/bridge/control 로그
- operator가 실행한 표준 runbook 커맨드(history)
- (가능하면) JSONL 형태의 실행 기록(향후 표준화)

## Detection Model (초기)

- fail-then-succeed 페어 감지:
  - 같은 base command(예: `cd`, `curl`, `git`, `nohup`, `python3`)
  - 첫 실행 실패(대표 에러 패턴) 후, 근접 시간에 교정된 성공
- ErrorType 분류:
  - WrongPath / CommandNotFound / PortInUse / PermissionDenied / MissingEnv / Other
- Rule 출력:
  - wrong_pattern → right_pattern
  - occurrence_count
  - confidence

## Outputs

- `docs/runbooks/` 또는 `.musu/rules/`에 “교정 룰” 저장(초기엔 docs로 시작)
- 프리플라이트 스크립트(예: worker 실행 전 port/token/nodes.toml 검사)

## Verification Commands

```bash
# (구현 후) learn 실행 예시
python3 scripts/musu_learn_cli_corrections.py --since-days 7 --min-occurrences 2 --min-confidence 0.6
```

## Exit Criteria

- 최소 10개 룰이 생성되고, 그중 3개는 실제 운영에서 재발 방지 효과가 확인된다.

