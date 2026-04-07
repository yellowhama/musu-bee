# MUSU Code Audit — 2026-04-08

## 종합 평가: 7.3/10

| 카테고리 | 점수 | 핵심 이슈 |
|----------|------|-----------|
| 코드 품질 | 7/10 | Router fallback edge case, Rust unwrap() 23개 |
| 의존성 | 8/10 | 상한 미지정, 취약점 스캔 없음 |
| 설정/시크릿 | 9/10 | .gitignore 양호, RCE rate limit 없음 |
| Rust 코드 | 6/10 | unwrap() 남용, unsafe 신호 처리, lock poisoning |
| 테스트 | 7/10 | core 양호(215+), bridge/worker 부족 |
| 문서 | 7/10 | SECURITY.md 없음, 설치 가이드 없음 |

---

## CRITICAL 이슈 (즉시 수정 필요)

### 1. musu-supervisor: `.unwrap()` 23개 — 프로덕션 패닉 위험
- `supervisor.rs`: `lock().unwrap()`, `get_mut().unwrap()`
- `config.rs`: `MusuConfig::from_str().unwrap()`
- `health.rs`: HTTP 파싱 `.unwrap()`
- **수정**: `Result` + `?` 연산자로 교체

### 2. musu-worker: RCE 엔드포인트 rate limiting 없음
- `/execute/process`에 rate limit 없음 — fork bomb 가능
- **수정**: per-token 10 req/min 제한 추가

---

## HIGH 이슈

### 3. Router fallback chain 로직 취약점
- `router.py:141` — `error_code`가 None일 때 fallback 진입 가능
- `_original_failure_reason`이 후속 메트릭에서 오해 유발 가능
- **수정**: fallback 블록 진입 시 error_code 한 번만 추출

### 4. musu-worker 테스트 0개
- `/execute/process` 보안 경계에 테스트 없음
- **수정**: token 검증, timeout, command injection 테스트 추가

### 5. Rust unsafe 신호 처리
- `supervisor.rs`: `libc::kill(p)` PID 검증 없음 (pid=0 → 전체 프로세스 그룹 kill)
- **수정**: `p > 0` 검증 추가

---

## MEDIUM 이슈

### 6. DB 캐시 무효화 없음 (db.py:170-179)
- `_db_instances` dict가 절대 비워지지 않음 — stale connection 위험

### 7. CORS 하드코딩 (musu-bridge/server.py:41-50)
- localhost:3000/3001/1355 고정 — 환경변수로 전환 필요

### 8. 에러 메시지 정보 유출 (musu-bridge/handlers.py:54-62)
- `str(exc)`가 클라이언트에 노출 — 내부 경로/스택 노출 가능

### 9. Rust lock poisoning 미처리 (musu-port/config.rs)
- `PEERS_ENV_LOCK.lock().unwrap()` 3곳 — 패닉 전파

### 10. 의존성 상한 없음
- `fastapi>=0.100` — 1.0 릴리스 시 breaking change 위험
- `mcp>=1.0.0` — 빠르게 변하는 프로토콜

---

## 양호 사항 ✅

- SQL 파라미터화 전수 적용 (injection 불가)
- .gitignore에 .env, *.key, *.pem 포함
- Adapter 추상화 + Fallback chain 설계 우수
- musu-core 테스트 215+ (agents, tasks, router, fallback, errors, middleware)
- musu-connects trust model 설계 우수 (42 테스트)
- errors.py + middleware.py Phase 0 완료
