# Backport Decision Note

작성일: 2026-04-02

## 목적

`MUSU-CRT` canonical 구현을 실제로 원본 repo에 backport할지 판단하는 메모다.

## 현재 판단

기본 방향은 `Go-ready`다.

이유:

- canonical code shape가 있다
- harness proof가 있다
- transport-first 원칙이 문서화됐다
- backport 대상 파일과 순서가 정리됐다

현재 확보된 것:

- original repo `cargo build` pass
- original repo `mcp/health` pass
- original repo `cargo test` pass

아직 남은 것:

- 실제 backport를 지금 할지, 다음 bounded step으로 미룰지 실행 타이밍 결정

## Go 조건

- Windows build pass
- test pass
- runtime smoke pass
- 기존 CRT surface regression 없음

## No-Go 조건

- build/test가 unrelated가 아닌 실제 backport 대상 코드에서 깨짐
- runtime에서 local/remote path 분리가 오히려 surface regression을 유발
- 원본 repo 우선순위가 현재 다른 bounded context에 묶여 있음

## 현재 결론

현재 상태는 `Go-ready`다.
`build + health + targeted cargo test`가 모두 확보됐고, canonical `MUSU-CRT` 산출물을 원본 repo에 반영할 기술적 게이트는 통과했다.
