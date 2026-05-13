# Phase 1 — Runtime schema + detection (2026-05-14)

> Master plan §Phase 1. v18.A Fleet Runtimes 의 foundation.

## Scope

이 phase 는 musu-core 안에서 닫혀있음 — DB / API / bridge 어디도 안 건드림.
Pure data layer + detection.

## 산출물

### `musu-core/src/musu_core/fleet/__init__.py` 신규
빈 marker (`__all__ = []`) + package docstring.

### `musu-core/src/musu_core/fleet/runtimes.py` 신규

**Public surface**:
```python
class RuntimeStatus(StrEnum):
    INSTALLED = "installed"
    MISSING = "missing"

class RuntimeHealth(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"

@dataclass(slots=True)
class RuntimeCapability:
    name: str
    status: RuntimeStatus
    health: RuntimeHealth = RuntimeHealth.UNKNOWN
    reason: str = ""
    version: str = ""
    detection_method: str = ""
    binary_path: str = ""
    notes: str = ""
    probe_error: str = ""
    detected_at: float = 0.0
    last_probe_attempt_at: float = 0.0
    state_changed_at: float = 0.0

    def to_dict(self) -> dict[str, Any]: ...
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RuntimeCapability": ...

KNOWN_RUNTIMES: tuple[str, ...] = (
    "bridge", "paperclip", "openclaw", "hermes",
    "claude_cli", "codex_cli", "gemini_cli", "ollama",
)

async def detect_all_runtimes(*, timeout: float = 5.0) -> dict[str, RuntimeCapability]:
    """Run all detectors in parallel. Returns name → capability."""
    ...

# Per-runtime detector functions (sync; detect_all wraps in asyncio.to_thread):
def _detect_bridge() -> RuntimeCapability: ...
def _detect_claude_cli() -> RuntimeCapability: ...
def _detect_codex_cli() -> RuntimeCapability: ...
def _detect_gemini_cli() -> RuntimeCapability: ...
def _detect_ollama() -> RuntimeCapability: ...
def _detect_paperclip() -> RuntimeCapability: ...  # stub
def _detect_openclaw() -> RuntimeCapability: ...   # stub
def _detect_hermes() -> RuntimeCapability: ...     # stub
```

**Detector 구현 디테일**:

- 공통 helper `_which(cmd: str) -> str | None` (cross-platform `which`/`where`).
- 공통 helper `_run_version(cmd: list[str], timeout: float) -> tuple[str, str]` →
  `(stdout, error_msg)`. timeout/CalledProcessError 다 잡고 graceful.
- `_detect_bridge()`:
  - status = INSTALLED, health = HEALTHY, version = `musu_core.__version__` 또는 fallback "dev".
  - detection_method = "static".
- `_detect_claude_cli()`:
  - `_which("claude")` 결과 → binary_path.
  - 없으면 status=MISSING / reason="BinaryNotFound" / health=UNKNOWN.
  - 있으면 `claude --version` 실행. exit 0 + stdout 파싱 → version.
  - 파싱 실패 시 health=DEGRADED / reason="VersionParseFailed" / probe_error=<stderr>.
- `_detect_codex_cli` / `_detect_gemini_cli`: 같은 패턴, binary names `codex` / `gemini`.
- `_detect_ollama`:
  - 1단계: `_which("ollama")` (binary 있는지).
  - 2단계: `http://127.0.0.1:11434/api/version` GET (server 살아있는지) — 짧은 timeout (1s).
  - binary 있는데 server down → status=INSTALLED, health=DEGRADED, reason="ServerDown".
  - 둘 다 OK → INSTALLED + HEALTHY + version 채움.
- `_detect_paperclip/openclaw/hermes`:
  - **stub**: status=MISSING, reason="NotYetImplemented", detection_method="stub".
  - v18.B 의 별 cycle 에서 진짜 detector. 지금은 placeholder.

**Version parsing**:
각 CLI 의 `--version` 포맷 다름. regex 한 줄로 first semver-like token 추출:
`r"(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)"`. 매치 실패해도 fail-loud 안 함 — empty version
+ degraded.

**Timing**:
모든 detector 호출은 `state_changed_at` 비교를 위해 이전 state 알아야 함 — 그건
caller (Phase 2 의 DB write 단계) 가 하고, detector 자체는 새 state 만 반환. 단,
detector 안에서 detected_at/last_probe_attempt_at/state_changed_at = `time.time()`
으로 일단 세팅. state_changed_at 은 caller 가 diff 후 정정.

### `musu-core/tests/test_fleet_runtimes.py`

12 cases:

1. `test_bridge_always_installed` — _detect_bridge() returns INSTALLED+HEALTHY.
2. `test_claude_cli_when_binary_missing` (monkeypatch `_which` → None) → MISSING / reason="BinaryNotFound".
3. `test_claude_cli_when_binary_present_version_ok` (monkeypatch `_which` + `_run_version`) → INSTALLED + HEALTHY + version 매치.
4. `test_claude_cli_when_version_unparseable` (mocked stdout "garbage") → INSTALLED + DEGRADED + reason="VersionParseFailed".
5. `test_claude_cli_when_subprocess_times_out` → INSTALLED + DEGRADED + reason="ProbeTimeout" + probe_error.
6. `test_ollama_binary_only_no_server` → INSTALLED + DEGRADED + reason="ServerDown".
7. `test_ollama_full_healthy` → INSTALLED + HEALTHY + version from http.
8. `test_paperclip_stub_returns_missing_not_yet` — stub case.
9. `test_to_dict_roundtrip` — RuntimeCapability serialization.
10. `test_detect_all_runs_all_known` — KNOWN_RUNTIMES 다 detect 됨, len(result)==8.
11. `test_detect_all_parallel_under_timeout` (시간 측정) — total time < 2× max detector time.
12. `test_runtime_status_enum_values` — Enum string values 안 깨짐.

### 실제 host 확인

이 머신에 `claude_cli`, `ollama` 둘 다 깔려있다고 알려져 있음 (CLAUDE.md 의 도구 목록).
test 외에 한 번:

```python
import asyncio
from musu_core.fleet.runtimes import detect_all_runtimes
print(asyncio.run(detect_all_runtimes()))
```

로 결과 확인. 적어도 `bridge` + `claude_cli` + `ollama` 가 health=HEALTHY 으로 나와야.

## 검증 기준

- 12 pytest pass.
- 기존 musu-core test suite regression 없음.
- 실제 host 에서 detect_all_runtimes() 한 번 돌려서 결과 시각 확인.

## 위험

- **`StrEnum` 은 Python 3.11+** — `pyproject.toml` 의 `requires-python = ">=3.10"` 와 충돌.
  대안: `class RuntimeStatus(str, Enum)` (3.10 호환). 이걸로 시작.
- **subprocess timeout on Windows** — `subprocess.run(..., timeout=5)` 는 cmd 가 자체로 hang 하면 child process 안 죽음. `process.kill()` 명시.
- **ollama HTTP probe** — `httpx` 또는 `urllib.request`? musu-core 의 deps 가 `httpx` 이미 있으면 그걸로. 아니면 stdlib urllib.

## Status

- [ ] musu-core/src/musu_core/fleet/__init__.py + runtimes.py 작성
- [ ] 12 pytest cases (테스트 먼저 → 구현 → green 순서, TDD)
- [ ] 실제 host detect_all 한 번 실행 확인
- [ ] musu-core 전체 pytest regression
- [ ] commit
