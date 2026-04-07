"""AdapterContext / AdapterResult dataclasses + BaseAdapter ABC."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class UsageSummary:
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class AdapterContext:
    """All the information an adapter needs to execute a prompt."""

    # Unique execution ID (maps to execution_log.id)
    run_id: str
    # The prompt to deliver to the agent
    prompt: str
    # Agent info
    agent_id: str
    agent_name: str
    agent_role: str
    adapter_type: str
    # Adapter-specific config (from agents.adapter_config)
    config: dict[str, Any] = field(default_factory=dict)
    # Optional: resume a prior session
    session_id: str | None = None
    # Optional: path to an instructions/system-prompt file
    instructions_path: str | None = None
    # Optional: working directory override
    cwd: str | None = None
    # Optional: task context forwarded as env vars
    task_id: str | None = None
    # Arbitrary extra context
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class AdapterResult:
    """Outcome of a single adapter execution."""

    run_id: str
    success: bool
    # Human-readable response / summary
    summary: str
    # Session ID to pass as session_id for the next call
    session_id: str | None = None
    # Token usage (if available)
    usage: UsageSummary | None = None
    # Cost in USD (if available)
    cost_usd: float | None = None
    # Error message if success=False
    error: str | None = None
    # Raw adapter-specific payload for debugging
    raw: dict[str, Any] = field(default_factory=dict)


class BaseAdapter(ABC):
    """All adapters implement this interface."""

    @property
    @abstractmethod
    def adapter_type(self) -> str:
        """String key used in agents.adapter_type column."""

    @abstractmethod
    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        """Execute a prompt and return a result."""
