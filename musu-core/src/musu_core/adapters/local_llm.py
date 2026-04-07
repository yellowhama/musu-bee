"""LocalLLMAdapter — routes to llama.cpp endpoints by task role.

Routing logic:
  agent_role == "indexing"  → Machine A Qwen 9B  (default :18081)
  anything else             → Machine B Qwen 14B (default :18082)

Config keys (in agents.adapter_config):
  indexing_url   str   Base URL for indexing endpoint   [http://100.121.211.105:18081]
  inference_url  str   Base URL for inference endpoint  [http://100.121.211.106:18082]
  model          str   Model name passed to /v1/chat/completions  (optional)
  max_tokens     int   Max tokens in response            [2048]
  timeout        int   HTTP timeout in seconds           [120]
"""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

from musu_core.adapters.base import AdapterContext, AdapterResult, BaseAdapter, UsageSummary

_DEFAULT_INDEXING_URL = "http://100.121.211.105:18081"
_DEFAULT_INFERENCE_URL = "http://100.121.211.106:18082"


class LocalLLMAdapter(BaseAdapter):
    """Adapter that calls a local llama.cpp OpenAI-compatible server."""

    @property
    def adapter_type(self) -> str:
        return "local_llm"

    def _resolve_url(self, ctx: AdapterContext) -> str:
        cfg = ctx.config
        if ctx.agent_role == "indexing":
            return cfg.get("indexing_url", _DEFAULT_INDEXING_URL).rstrip("/")
        return cfg.get("inference_url", _DEFAULT_INFERENCE_URL).rstrip("/")

    def _build_messages(self, ctx: AdapterContext) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        if ctx.instructions_path:
            try:
                with open(ctx.instructions_path) as fh:
                    system_prompt = fh.read().strip()
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
            except OSError:
                pass
        messages.append({"role": "user", "content": ctx.prompt})
        return messages

    async def execute(self, ctx: AdapterContext) -> AdapterResult:
        base_url = self._resolve_url(ctx)
        cfg = ctx.config
        model = cfg.get("model", "local")
        max_tokens = int(cfg.get("max_tokens", 2048))
        timeout = int(cfg.get("timeout", 120))

        payload = {
            "model": model,
            "messages": self._build_messages(ctx),
            "max_tokens": max_tokens,
            "stream": False,
        }

        endpoint = f"{base_url}/v1/chat/completions"
        t0 = time.monotonic()

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(endpoint, json=payload)
                resp.raise_for_status()
                data: dict[str, Any] = resp.json()
        except httpx.HTTPStatusError as exc:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=f"HTTP {exc.response.status_code}: {exc.response.text[:500]}",
            )
        except Exception as exc:  # noqa: BLE001
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error=str(exc),
            )

        elapsed = time.monotonic() - t0
        choices = data.get("choices", [])
        if not choices:
            return AdapterResult(
                run_id=ctx.run_id,
                success=False,
                summary="",
                error="No choices in response",
                raw=data,
            )

        content: str = choices[0].get("message", {}).get("content", "")

        usage_data = data.get("usage", {})
        usage = UsageSummary(
            input_tokens=usage_data.get("prompt_tokens", 0),
            output_tokens=usage_data.get("completion_tokens", 0),
        )

        return AdapterResult(
            run_id=ctx.run_id,
            success=True,
            summary=content,
            usage=usage,
            raw={"elapsed_s": round(elapsed, 2), "endpoint": endpoint},
        )
