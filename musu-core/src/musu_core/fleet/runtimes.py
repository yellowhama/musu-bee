"""Runtime capability detection and data model.

Each `RuntimeCapability` represents one (node, runtime) pair: is it installed,
does it work, what version. The model deliberately separates `status`
(presence — does the binary exist) from `health` (does it work) — collapsing
them into one field loses the "installed but broken" case that fleet
operators most need to see (Kubernetes NodeCondition / Nomad fingerprints
make the same split).

The eight known runtimes (KNOWN_RUNTIMES) cluster into three groups:

  Always-on    bridge          — this process; static answer.
  External CLI claude_cli      — `claude --version`
               codex_cli       — `codex --version`
               gemini_cli      — `gemini --version`
               ollama          — `which ollama` + `GET /api/version`
  Future       paperclip, openclaw, hermes — stubs until v18.B builds the
                                 real detectors. They report MISSING with
                                 reason="NotYetImplemented" so dashboards
                                 don't pretend they're present.

`detect_all_runtimes` runs every detector in parallel (asyncio.to_thread
over the sync subprocess calls) and returns a {name: capability} dict. The
caller (Phase 2's persistence layer) is responsible for diffing against
prior state to set `state_changed_at` — detectors only fill in the new
snapshot.
"""

from __future__ import annotations

import asyncio
import importlib.metadata
import re
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Callable


class RuntimeStatus(str, Enum):
    """Whether the runtime is installed on this node.

    Kept narrow on purpose — "is the binary there." Health is separate.
    """

    INSTALLED = "installed"
    MISSING = "missing"


class RuntimeHealth(str, Enum):
    """Whether the runtime actually works when probed."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class RuntimeCapability:
    """One (node, runtime) state row.

    Fields map 1:1 to the v27 `node_runtimes` columns (Phase 2). `node_name`
    is not stored here because a single `detect_all_runtimes()` call lives
    on one node; the caller stamps the node_name when persisting.
    """

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

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        # Enum members serialize to their string value for JSON / DB.
        data["status"] = self.status.value
        data["health"] = self.health.value
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RuntimeCapability":
        return cls(
            name=data["name"],
            status=RuntimeStatus(data["status"]),
            health=RuntimeHealth(data.get("health", "unknown")),
            reason=data.get("reason", ""),
            version=data.get("version", ""),
            detection_method=data.get("detection_method", ""),
            binary_path=data.get("binary_path", ""),
            notes=data.get("notes", ""),
            probe_error=data.get("probe_error", ""),
            detected_at=float(data.get("detected_at", 0.0)),
            last_probe_attempt_at=float(data.get("last_probe_attempt_at", 0.0)),
            state_changed_at=float(data.get("state_changed_at", 0.0)),
        )


KNOWN_RUNTIMES: tuple[str, ...] = (
    "bridge",
    "paperclip",
    "openclaw",
    "hermes",
    "claude_cli",
    "codex_cli",
    "gemini_cli",
    "ollama",
)

_VERSION_RE = re.compile(r"(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)")


# ── Helpers ─────────────────────────────────────────────────────────────────


def _which(cmd: str) -> str:
    """Cross-platform `which`/`where`. Empty string if not found."""
    path = shutil.which(cmd)
    return path or ""


def _run_version(args: list[str], *, timeout: float) -> tuple[str, str]:
    """Run a `--version`-style command. Returns (stdout, error_message).

    Error message is non-empty when the call timed out or the binary refused
    to launch. A non-zero exit code with usable stdout still counts as a
    successful probe — many CLIs print their version then exit 1 on missing
    args.
    """
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            timeout=timeout,
            text=False,
        )
    except subprocess.TimeoutExpired as exc:
        return "", f"ProbeTimeout after {timeout:.1f}s"
    except (FileNotFoundError, OSError) as exc:
        return "", f"LaunchFailed: {exc.__class__.__name__}: {exc}"

    out = (proc.stdout or b"").decode("utf-8", errors="replace").strip()
    err = (proc.stderr or b"").decode("utf-8", errors="replace").strip()
    if not out and err:
        # Some CLIs print --version to stderr (looking at you, java).
        return err, ""
    return out, ""


def _parse_semver(text: str) -> str:
    match = _VERSION_RE.search(text)
    return match.group(1) if match else ""


def _now() -> float:
    return time.time()


# ── Detectors ───────────────────────────────────────────────────────────────


def _detect_bridge() -> RuntimeCapability:
    """The bridge is always installed if this code is running."""
    try:
        version = importlib.metadata.version("musu-core")
    except importlib.metadata.PackageNotFoundError:
        version = "dev"
    now = _now()
    return RuntimeCapability(
        name="bridge",
        status=RuntimeStatus.INSTALLED,
        health=RuntimeHealth.HEALTHY,
        version=version,
        detection_method="static",
        detected_at=now,
        last_probe_attempt_at=now,
        state_changed_at=now,
    )


def _detect_cli_via_version_flag(
    runtime_name: str,
    binary: str,
    args: list[str] | None = None,
    *,
    timeout: float,
) -> RuntimeCapability:
    """Common shape for CLI runtimes whose presence is `binary --version`."""
    args = args or ["--version"]
    now = _now()
    path = _which(binary)
    if not path:
        return RuntimeCapability(
            name=runtime_name,
            status=RuntimeStatus.MISSING,
            health=RuntimeHealth.UNKNOWN,
            reason="BinaryNotFound",
            detection_method="which",
            last_probe_attempt_at=now,
            state_changed_at=now,
        )

    out, err = _run_version([path, *args], timeout=timeout)
    if err:
        return RuntimeCapability(
            name=runtime_name,
            status=RuntimeStatus.INSTALLED,
            health=RuntimeHealth.DEGRADED,
            reason="ProbeTimeout" if "Timeout" in err else "LaunchFailed",
            binary_path=path,
            detection_method="subprocess",
            probe_error=err,
            last_probe_attempt_at=now,
            state_changed_at=now,
        )

    version = _parse_semver(out)
    if not version:
        return RuntimeCapability(
            name=runtime_name,
            status=RuntimeStatus.INSTALLED,
            health=RuntimeHealth.DEGRADED,
            reason="VersionParseFailed",
            binary_path=path,
            detection_method="subprocess",
            probe_error=out[:200],
            detected_at=now,
            last_probe_attempt_at=now,
            state_changed_at=now,
        )

    return RuntimeCapability(
        name=runtime_name,
        status=RuntimeStatus.INSTALLED,
        health=RuntimeHealth.HEALTHY,
        version=version,
        binary_path=path,
        detection_method="subprocess",
        detected_at=now,
        last_probe_attempt_at=now,
        state_changed_at=now,
    )


def _detect_claude_cli(*, timeout: float = 5.0) -> RuntimeCapability:
    return _detect_cli_via_version_flag("claude_cli", "claude", timeout=timeout)


def _detect_codex_cli(*, timeout: float = 5.0) -> RuntimeCapability:
    return _detect_cli_via_version_flag("codex_cli", "codex", timeout=timeout)


def _detect_gemini_cli(*, timeout: float = 5.0) -> RuntimeCapability:
    return _detect_cli_via_version_flag("gemini_cli", "gemini", timeout=timeout)


def _detect_ollama(*, timeout: float = 5.0) -> RuntimeCapability:
    """ollama is bimodal — binary present, server may or may not be running.

    Two probes: which() for the CLI, then a short HTTP GET to localhost:11434
    for the version endpoint. Binary present + server down = INSTALLED but
    DEGRADED, which is the real-world failure mode worth surfacing.
    """
    now = _now()
    path = _which("ollama")
    if not path:
        return RuntimeCapability(
            name="ollama",
            status=RuntimeStatus.MISSING,
            health=RuntimeHealth.UNKNOWN,
            reason="BinaryNotFound",
            detection_method="which",
            last_probe_attempt_at=now,
            state_changed_at=now,
        )

    # Server probe via httpx — kept short (1s) so total detect stays under
    # the 5s budget even when ollama's HTTP listener is misconfigured.
    try:
        import httpx

        resp = httpx.get("http://127.0.0.1:11434/api/version", timeout=1.0)
        if resp.status_code == 200:
            payload = resp.json()
            version = str(payload.get("version", ""))
            return RuntimeCapability(
                name="ollama",
                status=RuntimeStatus.INSTALLED,
                health=RuntimeHealth.HEALTHY,
                version=version or _parse_semver(payload.get("version", "")),
                binary_path=path,
                detection_method="http",
                detected_at=now,
                last_probe_attempt_at=now,
                state_changed_at=now,
            )
        return RuntimeCapability(
            name="ollama",
            status=RuntimeStatus.INSTALLED,
            health=RuntimeHealth.DEGRADED,
            reason="ServerBadResponse",
            binary_path=path,
            detection_method="http",
            probe_error=f"HTTP {resp.status_code}",
            last_probe_attempt_at=now,
            state_changed_at=now,
        )
    except Exception as exc:  # httpx.ConnectError, TimeoutException, etc.
        return RuntimeCapability(
            name="ollama",
            status=RuntimeStatus.INSTALLED,
            health=RuntimeHealth.DEGRADED,
            reason="ServerDown",
            binary_path=path,
            detection_method="http",
            probe_error=f"{exc.__class__.__name__}: {exc}",
            last_probe_attempt_at=now,
            state_changed_at=now,
        )


def _stub_missing(runtime_name: str) -> RuntimeCapability:
    """Detectors that don't exist yet — v18.B will replace these."""
    now = _now()
    return RuntimeCapability(
        name=runtime_name,
        status=RuntimeStatus.MISSING,
        health=RuntimeHealth.UNKNOWN,
        reason="NotYetImplemented",
        detection_method="stub",
        last_probe_attempt_at=now,
        state_changed_at=now,
    )


def _detect_paperclip() -> RuntimeCapability:
    return _stub_missing("paperclip")


def _detect_openclaw() -> RuntimeCapability:
    return _stub_missing("openclaw")


def _detect_hermes() -> RuntimeCapability:
    return _stub_missing("hermes")


_DETECTORS: dict[str, Callable[[], RuntimeCapability]] = {
    "bridge": _detect_bridge,
    "paperclip": _detect_paperclip,
    "openclaw": _detect_openclaw,
    "hermes": _detect_hermes,
    "claude_cli": _detect_claude_cli,
    "codex_cli": _detect_codex_cli,
    "gemini_cli": _detect_gemini_cli,
    "ollama": _detect_ollama,
}


async def detect_all_runtimes(
    *, timeout: float = 5.0
) -> dict[str, RuntimeCapability]:
    """Run all known detectors in parallel.

    Each detector runs in a worker thread (asyncio.to_thread) so the slow
    subprocess calls don't serialize. Total wall-clock time is bounded by
    the slowest single detector, not the sum.
    """
    loop = asyncio.get_running_loop()
    tasks = [
        loop.run_in_executor(None, detector) for detector in _DETECTORS.values()
    ]
    capabilities = await asyncio.gather(*tasks, return_exceptions=True)

    result: dict[str, RuntimeCapability] = {}
    now = _now()
    for runtime_name, cap in zip(_DETECTORS.keys(), capabilities):
        if isinstance(cap, BaseException):
            # A detector crashed outright — record it as DEGRADED so the
            # next phase doesn't silently lose the row.
            result[runtime_name] = RuntimeCapability(
                name=runtime_name,
                status=RuntimeStatus.MISSING,
                health=RuntimeHealth.DEGRADED,
                reason="DetectorCrashed",
                detection_method="error",
                probe_error=f"{cap.__class__.__name__}: {cap}",
                last_probe_attempt_at=now,
                state_changed_at=now,
            )
        else:
            result[runtime_name] = cap
    return result
