"""Unit tests for fleet.runtimes — detection + RuntimeCapability shape.

The detectors call out to shell binaries and HTTP servers. Real network
or real subprocess invocation makes tests flaky and slow, so every test
that's not exercising the actual subprocess wiring uses monkeypatch to
stub `_which`, `_run_version`, or `httpx.get`.
"""

from __future__ import annotations

import asyncio

import pytest

from musu_core.fleet import runtimes
from musu_core.fleet.runtimes import (
    KNOWN_RUNTIMES,
    RuntimeCapability,
    RuntimeHealth,
    RuntimeStatus,
    detect_all_runtimes,
)


# ── Bridge: always installed ─────────────────────────────────────────────────


def test_bridge_always_installed():
    cap = runtimes._detect_bridge()
    assert cap.name == "bridge"
    assert cap.status is RuntimeStatus.INSTALLED
    assert cap.health is RuntimeHealth.HEALTHY
    assert cap.detection_method == "static"
    assert cap.detected_at > 0
    assert cap.state_changed_at > 0


# ── CLI detectors — missing / healthy / degraded paths ───────────────────────


def test_claude_cli_when_binary_missing(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "")
    cap = runtimes._detect_claude_cli()
    assert cap.status is RuntimeStatus.MISSING
    assert cap.health is RuntimeHealth.UNKNOWN
    assert cap.reason == "BinaryNotFound"
    assert cap.binary_path == ""
    assert cap.detection_method == "which"


def test_claude_cli_when_binary_present_and_version_parses(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "/usr/local/bin/claude")
    monkeypatch.setattr(
        runtimes,
        "_run_version",
        lambda args, *, timeout: ("Claude Code 1.5.2 (commit abc)", ""),
    )
    cap = runtimes._detect_claude_cli()
    assert cap.status is RuntimeStatus.INSTALLED
    assert cap.health is RuntimeHealth.HEALTHY
    assert cap.version == "1.5.2"
    assert cap.binary_path == "/usr/local/bin/claude"
    assert cap.detection_method == "subprocess"
    assert cap.reason == ""


def test_claude_cli_when_version_unparseable(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "/usr/local/bin/claude")
    monkeypatch.setattr(
        runtimes,
        "_run_version",
        lambda args, *, timeout: ("garbage output no semver here", ""),
    )
    cap = runtimes._detect_claude_cli()
    assert cap.status is RuntimeStatus.INSTALLED
    assert cap.health is RuntimeHealth.DEGRADED
    assert cap.reason == "VersionParseFailed"
    assert cap.version == ""
    assert "garbage" in cap.probe_error


def test_claude_cli_when_subprocess_times_out(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "/usr/local/bin/claude")
    monkeypatch.setattr(
        runtimes,
        "_run_version",
        lambda args, *, timeout: ("", "ProbeTimeout after 5.0s"),
    )
    cap = runtimes._detect_claude_cli()
    assert cap.status is RuntimeStatus.INSTALLED
    assert cap.health is RuntimeHealth.DEGRADED
    assert cap.reason == "ProbeTimeout"
    assert "Timeout" in cap.probe_error


# ── ollama — bimodal (binary + HTTP) ─────────────────────────────────────────


def test_ollama_binary_only_no_server(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "/usr/local/bin/ollama")

    def boom(*args, **kwargs):
        raise ConnectionError("connection refused")

    import httpx

    monkeypatch.setattr(httpx, "get", boom)

    cap = runtimes._detect_ollama()
    assert cap.status is RuntimeStatus.INSTALLED
    assert cap.health is RuntimeHealth.DEGRADED
    assert cap.reason == "ServerDown"
    assert cap.binary_path == "/usr/local/bin/ollama"
    assert "connection refused" in cap.probe_error.lower()


def test_ollama_full_healthy(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "/usr/local/bin/ollama")

    class _FakeResp:
        status_code = 200

        @staticmethod
        def json():
            return {"version": "0.4.2"}

    import httpx

    monkeypatch.setattr(httpx, "get", lambda url, timeout=None: _FakeResp())

    cap = runtimes._detect_ollama()
    assert cap.status is RuntimeStatus.INSTALLED
    assert cap.health is RuntimeHealth.HEALTHY
    assert cap.version == "0.4.2"
    assert cap.detection_method == "http"


def test_ollama_missing_when_binary_absent(monkeypatch):
    monkeypatch.setattr(runtimes, "_which", lambda cmd: "")
    cap = runtimes._detect_ollama()
    assert cap.status is RuntimeStatus.MISSING
    assert cap.reason == "BinaryNotFound"


# ── Stub detectors — paperclip / openclaw / hermes ───────────────────────────


def test_paperclip_stub_returns_not_yet_implemented():
    cap = runtimes._detect_paperclip()
    assert cap.status is RuntimeStatus.MISSING
    assert cap.reason == "NotYetImplemented"
    assert cap.detection_method == "stub"


# ── RuntimeCapability serialization ──────────────────────────────────────────


def test_to_dict_and_from_dict_roundtrip():
    original = RuntimeCapability(
        name="claude_cli",
        status=RuntimeStatus.INSTALLED,
        health=RuntimeHealth.HEALTHY,
        version="1.5.2",
        binary_path="/usr/local/bin/claude",
        detection_method="subprocess",
        detected_at=1234567890.0,
        last_probe_attempt_at=1234567890.0,
        state_changed_at=1234567890.0,
    )
    data = original.to_dict()
    # Enums serialize to plain strings (DB-friendly, JSON-friendly).
    assert data["status"] == "installed"
    assert data["health"] == "healthy"

    rehydrated = RuntimeCapability.from_dict(data)
    assert rehydrated == original


# ── Aggregator ───────────────────────────────────────────────────────────────


def test_detect_all_returns_every_known_runtime():
    result = asyncio.run(detect_all_runtimes())
    assert set(result.keys()) == set(KNOWN_RUNTIMES)
    # Each value is a RuntimeCapability (not a dict, not an exception).
    for name, cap in result.items():
        assert isinstance(cap, RuntimeCapability), (name, cap)
        assert cap.name == name


def test_detect_all_swallows_detector_crashes(monkeypatch):
    """If a detector raises, detect_all_runtimes still returns a row for it."""

    def broken_detector():
        raise RuntimeError("boom")

    monkeypatch.setitem(runtimes._DETECTORS, "claude_cli", broken_detector)

    result = asyncio.run(detect_all_runtimes())
    cap = result["claude_cli"]
    assert cap.status is RuntimeStatus.MISSING
    assert cap.health is RuntimeHealth.DEGRADED
    assert cap.reason == "DetectorCrashed"
    assert "RuntimeError" in cap.probe_error


# ── Enum stability ───────────────────────────────────────────────────────────


def test_enum_values_are_stable():
    # These strings end up in the DB and on the wire; freezing them
    # prevents silent breakage when someone renames an enum member.
    assert RuntimeStatus.INSTALLED.value == "installed"
    assert RuntimeStatus.MISSING.value == "missing"
    assert RuntimeHealth.HEALTHY.value == "healthy"
    assert RuntimeHealth.DEGRADED.value == "degraded"
    assert RuntimeHealth.UNKNOWN.value == "unknown"
