"""Message router — source → agent → adapter → response, with execution_log recording."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from typing import TYPE_CHECKING, Any

from musu_core.adapters.base import AdapterContext, AdapterResult, RETRIABLE_ERROR_CODES
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
                is_retriable=True,  # unknown exception treated as infra failure
            )

        # --- 4b. Fallback chain ---
        # Use error_code when set; otherwise fall back to is_retriable flag.
        fallback_chain = agent.fallback_chain or []
        _should_fallback = (
            not result.success
            and fallback_chain
            and (
                (result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES)
                or (result.error_code is None and result.is_retriable)
            )
        )
        # Capture the original failure reason before the fallback loop overwrites result.
        _original_failure_reason = (result.error_code.value if result.error_code else "unknown")
        _fallback_adapters_tried: list[str] = []
        if _should_fallback:
            # --- Depth limit + cycle prevention ---
            _max_depth: int = self._config.max_fallback_depth
            _depth: int = 0
            # Seed with primary adapter so it is never retried as a fallback.
            _seen_adapter_types: set[str] = {agent.adapter_type}

            for fallback_spec in fallback_chain:
                if _depth >= _max_depth:
                    # Hard cap reached — stop walking the chain.
                    break

                fb_adapter_type = fallback_spec.get("adapter_type", "")
                if fb_adapter_type in _seen_adapter_types:
                    # Cycle detected — skip this entry, do NOT count toward depth.
                    continue

                fb_adapter = get_adapter(fb_adapter_type)
                if fb_adapter is None:
                    continue

                _seen_adapter_types.add(fb_adapter_type)
                _depth += 1
                _fallback_adapters_tried.append(fb_adapter_type)
                fb_config: dict[str, Any] = {**adapter_config, **fallback_spec}
                fb_ctx = replace(ctx, adapter_type=fb_adapter_type, config=fb_config)
                try:
                    result = await fb_adapter.execute(fb_ctx)
                except Exception as exc:  # noqa: BLE001
                    from musu_core.adapters.base import AdapterResult as AR, ErrorCode as EC

                    result = AR(
                        run_id=run_id,
                        success=False,
                        summary="",
                        error=f"Fallback adapter {fb_adapter_type!r} raised: {exc}",
                        is_retriable=True,
                        error_code=EC.UNKNOWN,
                    )
                _fb_retriable = (
                    result.error_code is not None and result.error_code in RETRIABLE_ERROR_CODES
                ) or (result.error_code is None and result.is_retriable)

                # Record per-attempt metric using the reason that triggered this fallback.
                self._backend.record_fallback_metric(
                    agent_id=agent.id,
                    run_id=run_id,
                    fallback_reason=_original_failure_reason,
                    fallback_adapter=fb_adapter_type,
                    chain_exhausted=False,
                )

                if result.success or not _fb_retriable:
                    if result.success:
                        result.raw["fallback_used"] = fb_adapter_type
                    break

        # Record chain-exhausted metric + escalate when every adapter failed
        if _fallback_adapters_tried and not result.success:
            _last_reason = (result.error_code.value if result.error_code else "unknown")
            self._backend.record_fallback_metric(
                agent_id=agent.id,
                run_id=run_id,
                fallback_reason=_last_reason,
                fallback_adapter="",
                chain_exhausted=True,
            )
            from musu_core.escalation import escalate_chain_exhausted
            escalate_chain_exhausted(
                agent_id=agent.id,
                agent_name=agent.name,
                run_id=run_id,
                error=result.error or "",
                fallback_adapters_tried=_fallback_adapters_tried,
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


async def _forward_to_bridge(bridge_url: str, channel: str, sender_id: str, message: str) -> str:
    """Forward a message to a remote musu-bridge node and return the response text."""
    import logging
    import httpx

    logger = logging.getLogger(__name__)
    target = f"{bridge_url.rstrip('/')}/api/route"
    payload = {"channel": channel, "sender_id": sender_id, "text": message}
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(target, json=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Remote bridge returned HTTP {resp.status_code}")
            data = resp.json()
            if data.get("error"):
                raise RuntimeError(f"Remote bridge error: {data['error']}")
            return data.get("response") or ""
    except httpx.ConnectError as exc:
        logger.warning("mesh forward: cannot connect to %s — %s", target, exc)
        raise RuntimeError(f"Remote node unreachable: {bridge_url}") from exc
    except httpx.TimeoutException as exc:
        logger.warning("mesh forward: timeout waiting for %s", target)
        raise RuntimeError("Remote agent timed out") from exc


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
        # Mesh fallback: forward to remote node if agent is assigned there
        from musu_core.mesh import get_registry
        registry = get_registry()
        bridge_url = registry.bridge_url_for_agent(source)
        if bridge_url and not registry.is_local(registry.node_for_agent(source) or ""):
            return await _forward_to_bridge(bridge_url, source, source_ref, message)
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

    # 4. Execute via Router (supports fallback chain) when possible, else direct adapter call
    if isinstance(backend, LocalBackend):
        _router = Router(backend=backend, config=cfg)
        route_result = await _router.route(
            RouteRequest(agent_id=agent_id, prompt=message, task_id=task_id)
        )
        if not route_result.success:
            raise RuntimeError(f"Adapter returned failure: {route_result.error}")
        response_summary = route_result.summary
    else:
        # Non-local backend (e.g. PaperclipBackend): direct adapter call without fallback chain
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
        response_summary = result.summary

    # 5. Save response as agent comment
    backend.add_comment(
        task_id=task_id,
        body=response_summary,
        author_agent_id=agent_id,
        author_kind="agent",
    )

    # 6. Return summary
    return response_summary
