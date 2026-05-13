# MUSU vs 레퍼런스 보안 비교 리포트

**작성일**: 2026-04-08
**MUSU 보안 성숙도**: 3/10 → **목표**: 8/10
**레퍼런스**: Paperclip (9/10), OpenClaw (8.5/10), Hermes (6/10)

---

## 한눈에 보는 비교

| 보안 영역 | Paperclip | OpenClaw | MUSU | 갭 |
|-----------|-----------|----------|------|-----|
| **토큰 검증** | SHA256 해시 + timing-safe | 안전한 저장 | ❌ 평문 `!=` 비교 | CRITICAL |
| **JWT** | HS256 + claim 검증 + TTL | — | ❌ 없음 | HIGH |
| **CSRF 방어** | Origin/Referer 검증 | 있음 | ❌ 없음 | HIGH |
| **Rate Limiting** | 쿼터 기반 | 슬라이딩 윈도우 per-IP | ❌ 전무 | CRITICAL |
| **시크릿 마스킹** | 9개 패턴 (PEM, JWT, GitHub, DSN 등) | 게이트웨이 레벨 | ❌ 없음 | CRITICAL |
| **권한 시스템** | Full RBAC + 스코프 | 멀티 메서드 | ❌ 없음 (all-or-nothing) | HIGH |
| **호스트네임 가드** | 허용 목록 검증 | 있음 | ❌ 없음 | MEDIUM |
| **입력 검증** | Zod 스키마 전수 | 타입 검사 | ⚠️ Pydantic 있지만 길이 제한 없음 | MODERATE |
| **에러 처리** | 클라이언트에 제네릭만 반환 | 상세 응답 | ⚠️ 내부 경로 노출 가능 | MODERATE |
| **감사 로깅** | 액터 추적 + 활동 로그 | 연결 감사 | ❌ 없음 | HIGH |
| **워크스페이스 격리** | Git worktree per task | 디바이스/부트스트랩 | ❌ 없음 | MEDIUM |
| **WS 플러딩 방어** | — | Per-connection 가드 | ❌ 없음 | MEDIUM |
| **TLS/HTTPS** | 지원 | 지원 | ❌ 없음 (Tailscale 의존) | MODERATE |
| **시크릿 버전 관리** | 프로바이더 + 버전 히스토리 | — | ❌ env var만 | MEDIUM |

---

## CRITICAL 이슈 (즉시 수정)

### 1. 타이밍 공격에 취약한 토큰 비교

**MUSU 현재** (`middleware.py:77`, `auth.py:45`):
```python
if auth[len("Bearer "):] != token:  # ❌ 타이밍 공격 가능
```

**Paperclip 패턴** (`agent-auth-jwt.ts`):
```typescript
timingSafeEqual(Buffer.from(a), Buffer.from(b))  // ✅ 상수 시간 비교
```

**수정**:
```python
import hmac
if not hmac.compare_digest(auth[len("Bearer "):], token):  # ✅
```

**위치**: `musu-core/src/musu_core/middleware.py:77`, `musu-worker/src/musu_worker/auth.py:45`

---

### 2. Rate Limiting 전무

**MUSU**: 모든 엔드포인트에 속도 제한 없음. `/execute/process` (RCE) 포함.

**OpenClaw 패턴** (`auth-rate-limit.ts`):
- 스코프별 추적 (`shared-secret`, `device-token`, `hook-auth`)
- 슬라이딩 윈도우 60초, 최대 10회
- 초과 시 5분 잠금
- 로컬(127.0.0.1) 면제
- X-Forwarded-For + 프록시 신뢰 처리

**수정**: `musu-core/src/musu_core/rate_limit.py` 구현 필요
```python
class SlidingWindowLimiter:
    def __init__(self, max_attempts=10, window_sec=60, lockout_sec=300):
        self._entries: dict[str, list[float]] = {}

    def check(self, key: str) -> tuple[bool, int]:
        """Returns (allowed, retry_after_ms)"""
```

---

### 3. 시크릿 로그 마스킹 없음

**MUSU**: `logger.exception("Unhandled error: %s", exc)` — 스택 트레이스에 API 키, 토큰 노출 가능

**Paperclip 패턴** (`redaction.ts`, `feedback-redaction.ts`) — **9개 패턴**:

| 패턴 | Regex 대상 |
|------|-----------|
| PEM 블록 | `-----BEGIN [^-]+-----` |
| Bearer 토큰 | `Bearer\s+[A-Za-z0-9._~+/-]+=*` |
| GitHub 토큰 | `gh[pousr]_[A-Za-z0-9_]{20,}` |
| Anthropic/OpenAI 키 | `sk-(?:ant-)?[A-Za-z0-9_-]{12,}` |
| DSN 커넥션 문자열 | `postgres://`, `mysql://`, `mongodb://` |
| 이메일 | 표준 이메일 패턴 |
| 전화번호 | 국제 전화번호 패턴 |
| API 키 필드 | `api[-_]?key\s*[:=]\s*` |
| JWT | `[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` |

**수정**: `musu-core/src/musu_core/redaction.py` 구현 필요

---

## HIGH 이슈

### 4. CSRF 방어 없음

**Paperclip 패턴** (`board-mutation-guard.ts`):
- GET/HEAD/OPTIONS 면제
- POST/PUT/DELETE → Origin/Referer 헤더 검증
- 프록시 체인 지원 (X-Forwarded-Host)
- API 키 요청은 면제 (브라우저 세션만 검증)

**MUSU**: CORS만 있고 Origin 검증 없음

---

### 5. 권한 시스템 없음

**Paperclip 패턴** (`access.ts`, `authz.ts`):
```typescript
// 3단계 접근 제어
assertBoard()          // 유저인지
assertCompanyAccess()  // 해당 회사 소속인지
assertInstanceAdmin()  // 관리자인지

// 에이전트 역할별 권한
CEO: canCreateAgents = true
Others: canCreateAgents = false
```

**MUSU**: 토큰 있으면 모든 작업 가능. 역할별 제한 없음.

---

### 6. 감사 로깅 없음

**Paperclip**: 모든 mutation에 `logActivity()` — 누가, 언제, 뭘, 어떤 엔티티에

**MUSU**: `execution_log` 테이블은 있지만 보안 감사용 아님. API 호출 기록 없음.

---

### 7. Open Mode RCE

**`auth.py:25-44`**: `MUSU_WORKER_TOKEN` 미설정 시 `/execute/process` 완전 개방.
- fork bomb, 파일 삭제, 크레덴셜 탈취 가능
- **수정**: 프로덕션 모드에서는 토큰 필수 강제

---

## MODERATE 이슈

### 8. 입력 길이 제한 없음

| 필드 | 현재 | 권장 |
|------|------|------|
| `RouteRequest.text` | 무제한 | `max_length=10000` |
| `CLIRequest.prompt` | 무제한 | `max_length=50000` |
| `ProcessRequest.command` | 무제한 | `max_length=1000` |
| `ProcessRequest.args` | 무제한 | `max_items=100` |

### 9. 환경변수 주입 공격

**`executors.py:47-49`**:
```python
env = os.environ.copy()
env.update(env_extra)  # ❌ LD_PRELOAD, PYTHONPATH 오버라이드 가능
```

**수정**: 허용 접두사 필터링 (`MUSU_*` 만 허용)

### 10. 에러 메시지 정보 유출

```python
error=f"Cannot connect to worker at {worker_url}: {exc}"  # ❌ 인프라 토폴로지 노출
```

---

## Paperclip에서 배워올 핵심 패턴

### 패턴 1: 토큰 해싱 (SHA256)
```python
import hashlib
token_hash = hashlib.sha256(token.encode()).hexdigest()
# DB에 해시만 저장, 평문 절대 저장 안 함
```

### 패턴 2: 미들웨어 스택 순서
```
1. 로깅 (pino-http)
2. 호스트네임 가드
3. 인증 (JWT/API 키)
4. CSRF 가드 (브라우저 세션만)
5. 입력 검증 (Zod)
6. 핸들러
7. 에러 핸들러 (catch-all)
```

### 패턴 3: 시크릿 프로바이더 추상화
```python
class SecretProvider(ABC):
    async def store(self, name: str, value: str) -> str: ...
    async def retrieve(self, name: str, version: int) -> str: ...
    async def rotate(self, name: str, new_value: str) -> str: ...

class LocalEncryptedProvider(SecretProvider): ...
class VaultProvider(SecretProvider): ...
```

### 패턴 4: 에러 응답 분리
```python
# 내부: 전체 스택 트레이스 + 컨텍스트 로깅
logger.error({"err": exc, "url": request.url, "actor": actor_id})

# 클라이언트: 제네릭 메시지만
return {"error": "Internal server error", "code": "internal_error"}
```

---

## OpenClaw에서 배워올 핵심 패턴

### 패턴 5: 슬라이딩 윈도우 Rate Limiter
- 스코프별 분리 (auth, api, ws)
- IP 정규화 (IPv4-mapped IPv6, X-Forwarded-For)
- 잠금 + 자동 해제

### 패턴 6: WebSocket 플러딩 방어
- 연결당 미인증 시도 카운터
- 10회 초과 → 연결 종료
- 100회마다만 로깅 (로그 스팸 방지)

### 패턴 7: 멀티 메서드 인증
- 디바이스 토큰, 부트스트랩 토큰, 공유 시크릿, 비밀번호, Tailscale 프록시
- 각 메서드별 독립 rate limit

---

## 구현 우선순위

### Week 1 — CRITICAL
| # | 작업 | LOC | 파일 |
|---|------|-----|------|
| 1 | `hmac.compare_digest()` 적용 | 5 | middleware.py, auth.py |
| 2 | `SlidingWindowLimiter` 구현 | 60 | rate_limit.py (신규) |
| 3 | `redact_secrets()` 구현 | 40 | redaction.py (신규) |
| 4 | 프로덕션 토큰 필수 강제 | 10 | auth.py |

### Week 2 — HIGH
| # | 작업 | LOC | 파일 |
|---|------|-----|------|
| 5 | CSRF Origin 검증 | 30 | csrf_guard.py (신규) |
| 6 | Pydantic `max_length` 추가 | 20 | server.py, main.py |
| 7 | env_extra 필터링 | 10 | executors.py |
| 8 | 에러 메시지 sanitize | 15 | router.py, remote_process.py |

### Week 3 — MEDIUM
| # | 작업 | LOC | 파일 |
|---|------|-----|------|
| 9 | 감사 로그 테이블 + 기록 | 80 | audit.py (신규), db.py |
| 10 | 호스트네임 가드 | 30 | hostname_guard.py (신규) |
| 11 | WS 플러딩 방어 | 40 | ws_guard.py (신규) |
| 12 | 의존성 상한 고정 | 5 | pyproject.toml |

**총 추가**: ~345 LOC, 6개 신규 파일
**달성**: 3/10 → 8/10

---

## Claude Code에서 배워올 패턴

### 패턴 8: Settings 기반 권한 시스템
```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable",
    "ask": ["Bash"],
    "deny": ["Exec"]
  },
  "allowManagedPermissionRulesOnly": true
}
```
- 도구별 3단계: Allow / Ask(유저 확인) / Deny(차단)
- `settings.json`(공유) + `settings.local.json`(개인) 분리
- 바이패스 모드 비활성화 가능

### 패턴 9: PreToolUse Hook으로 위험 패턴 차단
```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{"type": "command", "command": "python3 validate.py", "timeout": 10}],
      "matcher": "Edit|Write|Bash"
    }]
  }
}
```
- 도구 실행 **전에** 검증 스크립트 실행
- exit code 0 = 허용, 2 = 차단
- 패턴: command injection, XSS, eval(), pickle, os.system()
- 세션별 상태 추적 (같은 경고 반복 안 함)

### 패턴 10: Hookify — 마크다운 기반 보안 규칙
```markdown
---
name: block-dangerous-rm
enabled: true
event: bash
pattern: rm\s+-rf
action: block
---
⚠️ rm -rf 감지. 위험한 명령입니다.
```
- 코딩 불필요 — 마크다운으로 규칙 정의
- regex 패턴 매칭
- 즉시 리로드 (재시작 불필요)

### 패턴 11: 플러그인 파일시스템 격리
- 플러그인별 독립 디렉토리
- 상위 디렉토리 접근 불가 (`../` 차단)
- 절대 경로 불가 (상대 경로만)
- `${PLUGIN_ROOT}` 환경변수로 자기 위치만 참조

### 패턴 12: 네트워크 샌드박스
```json
{
  "sandbox": {
    "network": {
      "allowedDomains": ["api.anthropic.com", "api.github.com"],
      "allowUnixSockets": false,
      "allowLocalBinding": false
    }
  }
}
```
- 허용된 도메인만 접근 가능
- 에이전트 탈취 시에도 데이터 유출 차단

---

## NanoClaw에서 배워올 패턴

### 패턴 13: 컨테이너 격리 (OS 레벨)
- 에이전트를 Linux 컨테이너에서 실행
- 권한 체크가 아닌 **물리적 격리**
- 크레덴셜은 OneCLI Vault에서 주입 (에이전트가 직접 접근 불가)
- 그룹별 독립 파일시스템 마운트

### 패턴 14: 크레덴셜 볼트
- 시크릿을 별도 서비스(Vault)에 저장
- 에이전트/subprocess에 **절대 전달 안 함**
- 요청 시점에 주입, 사용 후 폐기
- 에이전트 탈취되어도 raw 크레덴셜 접근 불가

---

## 전체 레퍼런스 비교

| 보안 영역 | Paperclip | OpenClaw | Claude Code | NanoClaw | MUSU |
|-----------|-----------|----------|-------------|----------|------|
| 토큰 검증 | SHA256+timing-safe | 안전 | Settings 기반 | 컨테이너 격리 | ❌ 평문 != |
| Rate Limit | 쿼터 기반 | 슬라이딩 윈도우 | — | — | ❌ 없음 |
| 시크릿 마스킹 | 9패턴 redaction | 게이트웨이 | Hook 기반 탐지 | Vault 격리 | ❌ 없음 |
| 권한 시스템 | RBAC+스코프 | 에이전트별 역할 | Ask/Deny/Allow | 컨테이너 격리 | ❌ all-or-nothing |
| 입력 검증 | Zod 전수 | 타입 검사 | PreToolUse Hook | — | ⚠️ 부분적 |
| 실행 격리 | Git worktree | 디바이스별 | 샌드박스+Hook | **컨테이너** | ❌ 없음 |
| CSRF | Origin/Referer | 있음 | — | — | ❌ 없음 |
| 플러그인 격리 | — | 확장 디렉토리 | 파일시스템 격리 | 컨테이너 | ❌ 없음 |
| 네트워크 제한 | — | — | 도메인 allowlist | 컨테이너 | ❌ 없음 |
| 보안 규칙 | 코드 | 설정 | **마크다운** | — | ❌ 없음 |

---

## 양호한 부분 ✅

| 항목 | 상태 |
|------|------|
| SQL 파라미터화 | ✅ 전수 적용, injection 불가 |
| `shell=True` 미사용 | ✅ `create_subprocess_exec()` 사용 |
| .gitignore | ✅ .env, *.key, *.pem, credentials 제외 |
| 에러 핸들러 catch-all | ✅ 500 → "Internal server error" 반환 |
| CLI 타입 allowlist | ✅ claude/codex만 허용 |
| cwd 경로 검증 | ✅ exists + is_dir 확인 |
| CORS 제한 | ✅ localhost만 허용 |
| 비밀번호 미하드코딩 | ✅ 환경변수 사용 |
