# musu-functions 보안 감사 (2026-04-15)

## 감사 범위

- musu-bridge (FastAPI :8070) — 주요 API 서버
- musu-bee (Next.js :3001) — 프론트엔드 + API 프록시
- musu-core (SQLite backend)
- musu-control (MCP 28 tools)
- musu-worker (프로세스 실행기)
- musu-port (WS :1355)

## 종합 점수

| 단계 | 점수 | 비고 |
|------|------|------|
| Phase 12B+C 완료 직후 | 5.5/10 | 심각 취약점 다수 존재 |
| Phase 13 보안 강화 후 (예상) | 8.5/10 | Critical 전부 해소 후 |

---

## 취약점 목록

### Critical (즉시 수정)

| ID | 파일 | 내용 | 상태 |
|----|------|------|------|
| A-1 | server.py | MUSU_BRIDGE_TOKEN 미설정 시 인증 없이 모든 엔드포인트 접근 가능 | ✅ Phase 13 수정 |
| WS-1 | musu-port/main.rs | WS :1355 인증 없음 — 로컬 네트워크에서 누구나 WS 연결 가능 | 🔴 Rust 복잡, 차기 Phase |
| SSRF-2 | handlers.py | `accept_pair()` — 피어가 보낸 URL 검증 없이 저장/사용 → SSRF | ✅ Phase 13 수정 |

### High

| ID | 파일 | 내용 | 상태 |
|----|------|------|------|
| SSRF-1 | handlers.py | httpx 호출에 `follow_redirects=True` (기본값) → 리다이렉트 기반 SSRF | ✅ Phase 13 수정 |
| R-1 | server.py | 기본 rate limit 60/min — AI 태스크 위임에 너무 관대 | ✅ _active_tasks cap으로 보완 |
| W-HOST | musu-worker/main.py | MUSU_WORKER_HOST 기본값 0.0.0.0 → 모든 인터페이스 노출 | ✅ Phase 13 수정 |

### Medium

| ID | 파일 | 내용 | 상태 |
|----|------|------|------|
| CONC-1 | server.py | `_active_tasks` 동시 태스크 제한 없음 → DoS 가능 | ✅ Phase 13 수정 |
| SYNC-1 | server.py | `SyncPushRequest` 아이템 개수 제한 없음 | ✅ Phase 13 수정 |
| SEC-HDR | musu-core | SecurityHeadersMiddleware 없음 (X-Frame-Options, CSP 등) | ✅ Phase 13 수정 |
| DB-PERM | musu-core | SQLite 파일 권한 0644 (기본) — 0600이어야 함 | ✅ Phase 13 수정 |

### Low

| ID | 파일 | 내용 | 상태 |
|----|------|------|------|
| CORS-1 | server.py | CORS origin 리스트와 CSRF 허용 목록 불일치 가능 | ⚠️ 검토 필요 |
| A5 | server.py | 202 응답에 Location 헤더 없음 (RFC 7231) | ✅ Phase 12B 수정 |
| A6 | server.py | /api/tasks/delegate 감사 로깅 없음 | ✅ Phase 12B 수정 |

### False Positives

| ID | 내용 | 판정 이유 |
|----|------|----------|
| F1 | handlers.py SQL injection | parameterized query 사용 — 안전 |
| F2 | TasksPanel XSS | React 기본 HTML escaping — 안전 |
| F3 | cli.py linux2 체크 | Python 3.3+ "linux" 고정 — 안전 |

---

## Phase 13 보안 강화 항목 (구현 완료)

### A-1: startup 인증 토큰 강제
```python
# server.py lifespan():
_token = os.environ.get("MUSU_BRIDGE_TOKEN", "")
if not _token:
    sys.exit("FATAL: MUSU_BRIDGE_TOKEN is not set")
```

### SSRF-2: accept_pair URL 검증
```python
# handlers.py:
def _validate_external_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"): raise HTTPException(400, "Invalid URL scheme")
    host = parsed.hostname or ""
    if host in ("localhost", "localhost.localdomain"): raise HTTPException(400, "Loopback rejected")
    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback: raise HTTPException(400, "Private IP rejected")
    except ValueError: pass
```

### SSRF-1: follow_redirects=False
```python
# handlers.py 모든 httpx 호출:
async with httpx.AsyncClient(follow_redirects=False) as client:
    ...
```

### CONC-1: 동시 태스크 캡
```python
# server.py:
_MAX_CONCURRENT_TASKS = int(os.environ.get("MUSU_MAX_CONCURRENT_TASKS", "20"))
if len(_active_tasks) >= _MAX_CONCURRENT_TASKS:
    raise HTTPException(429, f"Too many concurrent tasks (max {_MAX_CONCURRENT_TASKS})")
```

### W-HOST: worker 기본 바인딩 제한
```python
# musu-worker/main.py:
host = os.environ.get("MUSU_WORKER_HOST", "127.0.0.1")  # was: "0.0.0.0"
```

### DB-PERM: SQLite 0600
```python
# musu-core/db.py:
os.chmod(_db_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
```

---

## WS-1 미해결 (차기 Phase)

musu-port WS(:1355) 인증은 Rust 코드 수정이 필요하여 별도 Phase로 분리:
- `musu-port/main.rs` WebSocket upgrade 핸들러에서 `Authorization: Bearer` 헤더 또는 query param token 검증 추가 필요
- 예상 공수: 2-3시간 (Rust WS 미들웨어 패턴 리서치 포함)
- 위험도: 로컬넷 공격자만 악용 가능 (인터넷 직접 노출 아닌 경우)

---

## 보안 레퍼런스

- OWASP Top 10: A01(Broken Access Control), A07(SSRF), A09(Logging)
- awesome-design-md: `/home/hugh51/musu-functions/references/awesome-design-md/`
- 감사 수행: Claude Sonnet 4.6 × 2 parallel agents (딥리서치 모드)

---

*작성: 2026-04-15 | Phase 13 보안 강화 완료 후*
