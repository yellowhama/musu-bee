"""adapter_type → BaseAdapter instance mapping."""

from __future__ import annotations

from musu_core.adapters.base import BaseAdapter
from musu_core.adapters.claude_local import ClaudeLocalAdapter
from musu_core.adapters.local_llm import LocalLLMAdapter
from musu_core.adapters.process import ProcessAdapter

_registry: dict[str, BaseAdapter] = {}


def _default_registry() -> dict[str, BaseAdapter]:
    claude = ClaudeLocalAdapter()
    process = ProcessAdapter()
    local_llm = LocalLLMAdapter()
    return {
        claude.adapter_type: claude,
        process.adapter_type: process,
        local_llm.adapter_type: local_llm,
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
