# Plan 40: 테스트 Rate-Limit 수정
**날짜**: 2026-04-22

## 문제
musu-bridge 전체 테스트 병렬 실행 시 429 발생 (10개 실패).
원인: `apply_musu_middlewares(rate_limit_capacity=60)` — TestClient가 공유 rate limiter 인스턴스 사용.
모든 테스트 파일이 같은 process의 `server.app`을 공유 → 60 req/60s 초과.

## 해결
`MUSU_DISABLE_RATE_LIMIT=1` 환경변수 지원 추가.
- `musu_core/middleware.py`: env var 체크 → rate limiter 건너뜀
- `musu-bridge/tests/conftest.py`: `os.environ["MUSU_DISABLE_RATE_LIMIT"] = "1"` 추가

## TDD 순서

### Task 1: musu-core middleware 수정
**파일**: `musu-core/src/musu_core/middleware.py`
**테스트**: `musu-core/tests/test_middleware_disable_rate_limit.py`

### Task 2: conftest.py 수정
**파일**: `musu-bridge/tests/conftest.py`

## 검증
```bash
cd musu-functions && rtk pytest musu-bridge/tests/ -x -q
# 기대: 0 failures (rate-limit 관련 429 없음)
```
