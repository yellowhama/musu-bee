"""Message router — source → agent → adapter → response, with execution_log recording."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from musu_core.adapters.base import AdapterContext, AdapterResult
from musu_core.adapters.registry import get_adapter
from musu_core.backends.local import LocalBackend
from musu_core.config import Config, get_config

if TYPE_CHECKING:
    from musu_core.backends.base import BackendABC


@dataclass
class RouteRequest:
    """A single message dispatch request."""

    # Target agent (by id)
    agent_id: str
    # The prompt / message body
    prompt: str
    # Optional task this execution is linked to
    task_id: str | None = None
    # Resume a previous session with this agent
    session_id: str | None = None
    # Override instructions file for this call
    instructions_path: str | None = None
    # Override working directory for this call
    cwd: str | None = None
    # Arbitrary extra context forwarded to the adapter
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class RouteResult:
    """Outcome returned to the caller after routing a message."""

    run_id: str
    agent_id: str
    success: bool
    summary: str
    session_id: str | None = None
    error: str | None = None
    adapter_result: AdapterResult | None = None


class Router:
    """
    Routes a RouteRequest to the correct agent adapter and records the
    execution in the LocalBackend's execution_log.
    """

    def __init__(self, backend: LocalBackend, config: Config | None = None) -> None:
        self._backend = backend
        self._config = config or get_config()

    async def route(self, req: RouteRequest) -> RouteResult:
        """Dispatch *req* to the target agent and return the result."""
        run_id = str(uuid.uuid4())

        # --- 1. Resolve agent ---
        agent = self._backend.agents.get(req.agent_id)
        if agent is None:
            return RouteResult(
                run_id=run_id,
                agent_id=req.agent_id,
                success=False,
                summary="",
                error=f"Agent not found: {req.agent_id}",
            )

        # --- 2. Resolve adapter ---
        adapter = get_adapter(agent.adapter_type)
        if adapter is None:
            return RouteResult(
                run_id=run_id,
                agent_id=req.agent_id,
                success=False,
                summary="",
                error=f"Unknown adapter type: {agent.adapter_type}",
            )

        # Merge config-level defaults into per-agent config
        adapter_config: dict[str, Any] = {
            "model": self._config.default_model,
            "command": self._config.claude_command,
            "timeout_sec": self._config.adapter_timeout_sec,
        }
        adapter_config.update(agent.adapter_config)

        ctx = AdapterContext(
            run_id=run_id,
            prompt=req.prompt,
            agent_id=agent.id,
            agent_name=agent.name,
            agent_role=agent.role,
            adapter_type=agent.adapter_type,
            config=adapter_config,
            session_id=req.session_id,
            instructions_path=req.instructions_path or adapter_config.get("instructions_path"),
            cwd=req.cwd or adapter_config.get("cwd"),
            task_id=req.task_id,
            extra=req.extra,
        )

        # --- 3. Log start ---
        self._backend.log_execution_started(
            run_id=run_id,
            agent_id=agent.id,
            task_id=req.task_id,
            adapter_type=agent.adapter_type,
            prompt_snippet=req.prompt[:300],
        )

        # --- 4. Execute ---
        try:
            result = await adapter.execute(ctx)
        except Exception as exc:  # noqa: BLE001
            error_msg = f"Adapter raised exception: {exc}"
            from musu_core.adapters.base import AdapterResult as AR  # avoid circular at top

            result = AR(
                run_id=run_id,
                success=False,
                summary="",
                error=error_msg,
            )

        # --- 5. Log result ---
        self._backend.log_execution_result(result, task_id=req.task_id)

        return RouteResult(
            run_id=run_id,
            agent_id=agent.id,
            success=result.success,
            summary=result.summary,
            session_id=result.session_id,
            error=result.error,
            adapter_result=result,
        )


def make_router(db_path: str | None = None, config: Config | None = None) -> Router:
    """Convenience factory: create a Router backed by a LocalBackend."""
    cfg = config or get_config()
    backend = LocalBackend(db_path or cfg.db_path)
    return Router(backend=backend, config=cfg)


async def route_message(
    source: str,
    source_ref: str,
    message: str,
    backend: "BackendABC",
    config: Config | None = None,
) -> str:
    """
    High-level routing entry point.

    Args:
        source:     Channel / source name — used to look up the target agent by name.
        source_ref: Caller-supplied message reference (e.g. message id, user id).
        message:    The prompt body to deliver to the agent.
        backend:    Any BackendABC implementation (LocalBackend, PaperclipBackend, …).
        config:     Optional Config override; falls back to get_config().

    Returns:
        The agent's response summary string.

    Raises:
        ValueError: If no agent is registered under *source*.
        RuntimeError: If the adapter execution fails.
    """
    from musu_core.backends.base import BackendABC as _BackendABC  # runtime import

    cfg = config or get_config()

    # 1. Find agent by source name
    agent_dict = backend.get_agent_by_name(source)
    if agent_dict is None:
        raise ValueError(f"No agent found for source: {source!r}")

    agent_id: str = agent_dict["id"]

    # 2. Find the active task for this source_ref, or create one
    active_tasks = backend.list_tasks(status="in_progress", assignee_agent_id=agent_id)
    # Filter by source_ref stored in task meta
    task_dict = next(
        (t for t in active_tasks if t.get("meta", {}).get("source_ref") == source_ref),
        None,
    )
    if task_dict is None:
        task_dict = backend.create_task(
            title=f"[{source}] {message[:60]}",
            description=message,
            assignee_agent_id=agent_id,
            meta={"source": source, "source_ref": source_ref},
        )

    task_id: str = task_dict["id"]

    # 3. Save incoming message as a user comment
    backend.add_comment(task_id=task_id, body=message, author_kind="user")

    # 4. Execute via adapter
    adapter = get_adapter(agent_dict["adapter_type"])
    if adapter is None:
        raise RuntimeError(f"Unknown adapter type: {agent_dict['adapter_type']!r}")

    adapter_config: dict[str, Any] = {
        "model": cfg.default_model,
        "command": cfg.claude_command,
        "timeout_sec": cfg.adapter_timeout_sec,
    }
    adapter_config.update(agent_dict.get("adapter_config") or {})

    run_id = str(uuid.uuid4())
    ctx = AdapterContext(
        run_id=run_id,
        prompt=message,
        agent_id=agent_id,
        agent_name=agent_dict["name"],
        agent_role=agent_dict.get("role", ""),
        adapter_type=agent_dict["adapter_type"],
        config=adapter_config,
        task_id=task_id,
    )

    try:
        result = await adapter.execute(ctx)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Adapter execution failed: {exc}") from exc

    if not result.success:
        raise RuntimeError(f"Adapter returned failure: {result.error}")

    # 5. Save response as agent comment
    backend.add_comment(
        task_id=task_id,
        body=result.summary,
        author_agent_id=agent_id,
        author_kind="agent",
    )

    # 6. Return summary
    return result.summary
