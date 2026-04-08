# Detail Plan — Token Economy / Output Compaction (2026-04-09)

레퍼런스: `references_AI/rtk-ai` parser 3-tier(Full/Degraded/Passthrough) + TokenFormatter 패턴.

## Goal

MUSU에서 “명령 출력 폭증”을 시스템적으로 줄인다.
LLM이 보는 출력은 raw 로그가 아니라 **결정 가능한 canonical summary**가 기본이 되게 한다.

## Design

- Canonical types (초기 4종):
  - TestResult
  - LintResult
  - BuildOutput
  - DependencyState
- Parser tiers:
  - Tier 1: JSON (가능한 도구는 `--json`/`--reporter=json` 사용)
  - Tier 2: regex 기반 부분 파싱(주요 지표만)
  - Tier 3: passthrough + 안전한 truncation + “DEGRADED” 마커
- Formatter modes:
  - compact(기본), verbose(디버그), ultra(긴 로그 제한)

## Implementation Checklist

1) `remote_process` 결과 스키마에 summary/metrics/artifacts 필드 추가
2) `pytest`, `vitest`, `cargo test`, `pnpm -v`, `git status/diff` 등 고빈도 도구부터 파서 추가
3) 실패 시 “전체 출력”을 바로 던지지 말고:
   - top errors (top 3)
   - repro command
   - log artifact path
   - next action hint

## Verification Commands

```bash
# 예시: 기존 대비 출력 토큰/라인 감소 확인
python3 scripts/musu_remote_process.py --node main-pc -- pytest -q
python3 scripts/musu_remote_process.py --node main-pc -- npx vitest run
python3 scripts/musu_remote_process.py --node main-pc -- cargo test -q
```

## Exit Criteria

- 최소 3개 대표 커맨드에서 “raw stdout 그대로”가 아니라 summary 중심 출력으로 변환되었음.
- operator가 같은 문제를 해결하기 위해 추가 질문을 덜 하게 된다(정성 지표).

