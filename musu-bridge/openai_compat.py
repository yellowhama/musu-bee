"""OpenAI-compatible API proxy — lets external tools use MUSU's LLM adapters.

Hermes, OpenClaw, or any OpenAI-compatible client can set:
  base_url: http://localhost:8070/v1
  api_key: anything (MUSU_BRIDGE_TOKEN or "no-key")

Requests to /v1/chat/completions are routed through MUSU's existing
channel→agent→adapter chain (claude_local, gemini_local, codex_local, etc).
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Any

logger = logging.getLogger("musu.openai_compat")

# Model name → MUSU channel mapping.
# Accepts both standard model names and direct channel names.
_MODEL_CHANNEL_MAP: dict[str, str] = {
    # Standard model aliases → default channels
    "gpt-4": "ceo",
    "gpt-4o": "ceo",
    "gpt-3.5-turbo": "engineer",
    "claude-3.5-sonnet": "cto",
    "claude-3-opus": "ceo",
    "gemini-pro": "engineer",
    "gemini-flash": "engineer",
    "codex": "engineer",
    # Direct channel names (pass-through)
    "ceo": "CEO",
    "cto": "cto",
    "engineer": "Founding Engineer",
    "qa": "qa",
    "team_lead": "MD-Lead",
    "planner": "planner",
    "cos": "Chief of Staff",
}


async def handle_chat_completion(body: dict[str, Any]) -> dict[str, Any]:
    """Process an OpenAI-compatible chat completion request via MUSU route_chat.

    Accepts standard OpenAI request format, routes through MUSU adapters,
    returns standard OpenAI response format.
    """
    from handlers import route_chat

    model = body.get("model", "engineer")
    messages = body.get("messages", [])

    if not messages:
        return _error_response("No messages provided", model)

    # Extract text from messages (concatenate all user messages)
    text_parts = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            text_parts.insert(0, f"[System] {content}")
        elif role == "user":
            text_parts.append(content)

    text = "\n\n".join(text_parts).strip()
    if not text:
        return _error_response("Empty message content", model)

    # Map model name to MUSU channel
    channel = _MODEL_CHANNEL_MAP.get(model, model)

    logger.info("openai_compat: model=%r → channel=%r, text=%d chars", model, channel, len(text))

    # Route through MUSU
    result = await route_chat(
        channel=channel,
        sender_id="openai-compat",
        text=text,
        cost_optimized=True,
    )

    response_text = result.get("response", "")
    error = result.get("error")

    if error and not response_text:
        return _error_response(error, model)

    # Build OpenAI-compatible response
    return {
        "id": f"chatcmpl-musu-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": response_text,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": result.get("input_tokens") or 0,
            "completion_tokens": result.get("output_tokens") or 0,
            "total_tokens": (result.get("input_tokens") or 0) + (result.get("output_tokens") or 0),
        },
    }


def get_models_list() -> dict[str, Any]:
    """Return available models in OpenAI /v1/models format."""
    channels = sorted(set(_MODEL_CHANNEL_MAP.values()))
    return {
        "object": "list",
        "data": [
            {
                "id": ch,
                "object": "model",
                "created": 1700000000,
                "owned_by": "musu",
            }
            for ch in channels
        ],
    }


def _error_response(error: str, model: str) -> dict[str, Any]:
    return {
        "id": f"chatcmpl-musu-err-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": f"Error: {error}"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
