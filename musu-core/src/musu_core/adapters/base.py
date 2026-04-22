"""AdapterContext / AdapterResult dataclasses + BaseAdapter ABC."""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


def resolve_instructions(base_path: str | None, adapter_type: str) -> str | None:
    """
    If base_path is 'ceo.md' and adapter_type is 'gemini_local',
    checks for 'ceo.gemini.md'. Returns it if exists, else base_path.
    
    If adapter_type contains '_local', the suffix used is the part before '_local'.
    Example: 'gemini_local' -> '.gemini.md'
    """
    if not base_path:
        return None

    path = Path(base_path)
    if not path.exists():
        return base_path

    # Extract short name from adapter_type (e.g., 'gemini_local' -> 'gemini')
    short_type = adapter_type.split("_")[0]
    
    # Try suffixing before the extension: ceo.md -> ceo.gemini.md
    stem = path.stem
    suffix = path.suffix # .md
    specific_path = path.parent / f"{stem}.{short_type}{suffix}"

    if specific_path.exists():
        return str(specific_path)
    
    return base_path


class ErrorCode(str, Enum):
    """Structured error category for a failed AdapterResult.

    Retriable codes (safe to try the next adapter in fallback_chain):
        RATE_LIMIT, TIMEOUT, MODEL_UNAVAILABLE, UNKNOWN

    Non-retriable codes (fallback unlikely to help):
        CONTEXT_EXCEEDED
    """

    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    CONTEXT_EXCEEDED = "context_exceeded"
    MODEL_UNAVAILABLE = "model_unavailable"
    UNKNOWN = "unknown"


#: Error codes for which the router should attempt the fallback chain.
RETRIABLE_ERROR_CODES: frozenset[ErrorCode] = frozenset(
    {ErrorCode.RATE_LIMIT, ErrorCode.TIMEOUT, ErrorCode.MODEL_UNAVAILABLE, ErrorCode.UNKNOWN}
)


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
    # True = infrastructure failure (rate limit, timeout, connect error) — safe to retry with next
    # adapter in fallback_chain. False = logic/prompt failure — stop immediately.
    is_retriable: bool = False
    # Structured error category (None on success)
    error_code: ErrorCode | None = None


class BaseAdapter(ABC):
    """All adapters implement this interface."""

    @property
    @abstractmethod
    def adapter_type(self) -> str:
        """String key used in agents.adapter_type column."""

    @abstractmethod
    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        """Execute a prompt and return a result."""
