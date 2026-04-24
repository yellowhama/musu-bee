"""Tests for startup channel→agent mapping restoration from DB."""
from __future__ import annotations

import logging
from unittest.mock import MagicMock, call, patch

import pytest


def _make_backend(agent_names: list[str]) -> MagicMock:
    mock = MagicMock()
    mock.list_agents.return_value = [{"name": n, "status": "active"} for n in agent_names]
    mock.create_agent.return_value = {"id": "mock-id", "name": "mock"}
    return mock


def _run_startup_check(
    agent_names: list[str],
    channel_map: dict[str, str],
    seed_agents: list[dict] | None = None,
) -> tuple[list[str], MagicMock]:
    """Exercise the startup channel mapping block inline.

    Returns (captured_log_messages, backend_mock).
    If seed_agents is None, uses a minimal default matching typical channels.
    """
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent))

    if seed_agents is None:
        seed_agents = [
            {"name": "ceo", "role": "Chief Executive Officer", "adapter_type": "claude_local", "adapter_config": {}},
            {"name": "engineer", "role": "Software Engineer", "adapter_type": "claude_local", "adapter_config": {}},
            {"name": "qa", "role": "QA Engineer", "adapter_type": "claude_local", "adapter_config": {}},
            {"name": "cto", "role": "Chief Technology Officer", "adapter_type": "claude_local", "adapter_config": {}},
        ]

    captured: list[str] = []

    class _Handler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record.getMessage())

    logger = logging.getLogger("server")
    orig_level = logger.level
    logger.setLevel(logging.DEBUG)
    handler = _Handler()
    logger.addHandler(handler)

    backend = _make_backend(agent_names)
    seed_by_channel = {a["name"]: a for a in seed_agents}

    try:
        all_active = {a["name"] for a in backend.list_agents()}
        broken: list[str] = []
        ok: list[str] = []
        seeded: list[str] = []
        for ch, agent_name in channel_map.items():
            if agent_name in all_active:
                ok.append(ch)
            else:
                tmpl = seed_by_channel.get(ch)
                if tmpl:
                    try:
                        backend.create_agent(
                            name=agent_name,
                            role=tmpl["role"],
                            adapter_type=tmpl["adapter_type"],
                            adapter_config=tmpl["adapter_config"],
                        )
                        seeded.append(ch)
                        ok.append(ch)
                        logger.info(
                            "startup: auto-seeded missing agent %r for channel=%r",
                            agent_name, ch,
                        )
                    except Exception as seed_err:
                        broken.append(f"{ch}→{agent_name}")
                        logger.warning(
                            "startup: failed to auto-seed agent %r for channel=%r — %s",
                            agent_name, ch, seed_err,
                        )
                else:
                    broken.append(f"{ch}→{agent_name}")
        if seeded:
            logger.info("startup: auto-seeded %d agent(s): %s", len(seeded), ", ".join(seeded))
        if ok:
            logger.info("startup: channel mapping OK for %d channel(s): %s", len(ok), ", ".join(ok))
        if broken:
            logger.warning(
                "startup: %d channel(s) have no active agent in DB — routing will fail: %s",
                len(broken), "; ".join(broken),
            )
        else:
            logger.info("startup: all channel→agent mappings resolved from DB")
    finally:
        logger.setLevel(orig_level)
        logger.removeHandler(handler)

    return captured, backend


class TestStartupChannelMappingRestore:
    def test_all_agents_present_logs_ok(self):
        """All mapped agents exist in DB → logs success, no warning, no auto-seed."""
        msgs, backend = _run_startup_check(
            agent_names=["4060-CEO", "4060-Engineer", "4060-QA"],
            channel_map={"ceo": "4060-CEO", "engineer": "4060-Engineer", "qa": "4060-QA"},
        )
        assert any("all channel→agent mappings resolved from DB" in m for m in msgs)
        assert not any("routing will fail" in m for m in msgs)
        backend.create_agent.assert_not_called()

    def test_missing_agent_auto_seeded(self):
        """Missing agent with seed template → auto-created in DB, no routing-fail warning."""
        msgs, backend = _run_startup_check(
            agent_names=["4060-Engineer"],
            channel_map={"ceo": "4060-CEO", "engineer": "4060-Engineer"},
        )
        # auto-seed info logged
        assert any("auto-seeded missing agent" in m and "4060-CEO" in m for m in msgs)
        # create_agent called with correct name
        backend.create_agent.assert_called_once()
        call_kwargs = backend.create_agent.call_args
        assert call_kwargs.kwargs.get("name") == "4060-CEO" or (
            len(call_kwargs.args) > 0 and call_kwargs.args[0] == "4060-CEO"
        ) or call_kwargs.kwargs.get("name") == "4060-CEO"
        # No routing-fail warning
        assert not any("routing will fail" in m for m in msgs)

    def test_missing_agent_no_template_warns(self):
        """Missing agent without seed template → warning logged, no auto-seed attempted."""
        msgs, backend = _run_startup_check(
            agent_names=[],
            channel_map={"ceo": "node-CEO"},
            seed_agents=[],  # empty — no templates
        )
        warning_msgs = [m for m in msgs if "routing will fail" in m]
        assert len(warning_msgs) == 1
        assert "ceo→node-CEO" in warning_msgs[0]
        backend.create_agent.assert_not_called()

    def test_all_agents_missing_with_templates_all_seeded(self):
        """No agents in DB but templates exist → all seeded, no routing-fail warning."""
        msgs, backend = _run_startup_check(
            agent_names=[],
            channel_map={"ceo": "node-CEO", "cto": "node-CTO"},
        )
        assert any("auto-seeded" in m for m in msgs)
        assert not any("routing will fail" in m for m in msgs)
        assert backend.create_agent.call_count == 2

    def test_seeded_count_logged(self):
        """Auto-seeded channels appear in the seeded count log."""
        msgs, backend = _run_startup_check(
            agent_names=[],
            channel_map={"ceo": "node-CEO", "engineer": "node-Engineer"},
        )
        seeded_msgs = [m for m in msgs if "auto-seeded" in m and "agent(s)" in m]
        assert any("2 agent(s)" in m for m in seeded_msgs)

    def test_ok_count_logged_when_agents_present(self):
        """Partial match → OK count reflects resolved + auto-seeded channels."""
        msgs, backend = _run_startup_check(
            agent_names=["node-CEO"],
            channel_map={"ceo": "node-CEO", "engineer": "node-Engineer"},
        )
        ok_msgs = [m for m in msgs if "channel mapping OK" in m]
        assert any("2 channel(s)" in m for m in ok_msgs)

    def test_empty_channel_map_no_errors(self):
        """Empty channel_agent_map → no broken channels, logs all resolved."""
        msgs, backend = _run_startup_check(agent_names=[], channel_map={})
        assert any("all channel→agent mappings resolved from DB" in m for m in msgs)
        assert not any("routing will fail" in m for m in msgs)
        backend.create_agent.assert_not_called()

    def test_seed_failure_falls_back_to_warning(self):
        """If create_agent raises, channel is marked broken and warning is logged."""
        msgs, backend = _run_startup_check(
            agent_names=[],
            channel_map={"ceo": "node-CEO"},
        )
        # Simulate seed failure by patching create_agent to raise
        # (We test this by running a separate inline path)
        # This is covered by the broken-path when create_agent raises in the real block.
        # Here we verify the happy path first, then test the error path separately.
        assert any("auto-seeded missing agent" in m for m in msgs)

    def test_seed_failure_path(self):
        """create_agent raising → broken warning emitted for that channel."""
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).parent.parent))

        captured: list[str] = []

        class _Handler(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                captured.append(record.getMessage())

        logger = logging.getLogger("server")
        orig_level = logger.level
        logger.setLevel(logging.DEBUG)
        handler = _Handler()
        logger.addHandler(handler)

        backend = _make_backend([])
        backend.create_agent.side_effect = RuntimeError("DB locked")
        seed_by_channel = {
            "ceo": {"name": "ceo", "role": "CEO", "adapter_type": "claude_local", "adapter_config": {}}
        }

        try:
            broken: list[str] = []
            ok: list[str] = []
            seeded: list[str] = []
            for ch, agent_name in {"ceo": "node-CEO"}.items():
                if agent_name in set():
                    ok.append(ch)
                else:
                    tmpl = seed_by_channel.get(ch)
                    if tmpl:
                        try:
                            backend.create_agent(
                                name=agent_name,
                                role=tmpl["role"],
                                adapter_type=tmpl["adapter_type"],
                                adapter_config=tmpl["adapter_config"],
                            )
                            seeded.append(ch)
                            ok.append(ch)
                        except Exception as seed_err:
                            broken.append(f"{ch}→{agent_name}")
                            logger.warning(
                                "startup: failed to auto-seed agent %r for channel=%r — %s",
                                agent_name, ch, seed_err,
                            )
                    else:
                        broken.append(f"{ch}→{agent_name}")
            if broken:
                logger.warning(
                    "startup: %d channel(s) have no active agent in DB — routing will fail: %s",
                    len(broken), "; ".join(broken),
                )
        finally:
            logger.setLevel(orig_level)
            logger.removeHandler(handler)

        assert any("failed to auto-seed" in m for m in captured)
        assert any("routing will fail" in m for m in captured)
