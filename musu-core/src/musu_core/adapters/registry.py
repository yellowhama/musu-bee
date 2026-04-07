"""adapter_type → BaseAdapter instance mapping."""

from __future__ import annotations

from musu_core.adapters.base import BaseAdapter
from musu_core.adapters.claude_local import ClaudeLocalAdapter
from musu_core.adapters.codex_local import CodexLocalAdapter
from musu_core.adapters.gemini_local import GeminiLocalAdapter
from musu_core.adapters.hermes import HermesAdapter
from musu_core.adapters.local_llm import LocalLLMAdapter
from musu_core.adapters.process import ProcessAdapter
from musu_core.adapters.remote_cli import RemoteCLIAdapter
from musu_core.adapters.remote_process import RemoteProcessAdapter

_registry: dict[str, BaseAdapter] = {}


def _default_registry() -> dict[str, BaseAdapter]:
    claude = ClaudeLocalAdapter()
    codex = CodexLocalAdapter()
    gemini = GeminiLocalAdapter()
    hermes = HermesAdapter()
    process = ProcessAdapter()
    local_llm = LocalLLMAdapter()
    remote_cli = RemoteCLIAdapter()
    remote_process = RemoteProcessAdapter()
    return {
        claude.adapter_type: claude,
        codex.adapter_type: codex,
        gemini.adapter_type: gemini,
        hermes.adapter_type: hermes,
        process.adapter_type: process,
        local_llm.adapter_type: local_llm,
        remote_cli.adapter_type: remote_cli,
        remote_process.adapter_type: remote_process,
    }


def get_adapter(adapter_type: str) -> BaseAdapter | None:
    if not _registry:
        _registry.update(_default_registry())
    return _registry.get(adapter_type)


def register_adapter(adapter: BaseAdapter) -> None:
    _registry[adapter.adapter_type] = adapter


def list_adapter_types() -> list[str]:
    if not _registry:
        _registry.update(_default_registry())
    return list(_registry.keys())
