"""Async HTTP client for the MUSU bridge API."""

import os
from typing import Any

import httpx

_DEFAULT_API_URL = "http://127.0.0.1:8070/api"


class PaperclipClient:
    """Thin async httpx wrapper around the MUSU bridge REST API.

    Connects to musu-bridge (default: localhost:8070) instead of Paperclip.
    Environment variables:
      MUSU_BRIDGE_URL  — bridge base URL (default: http://127.0.0.1:8070)
      PAPERCLIP_API_URL — legacy alias for MUSU_BRIDGE_URL
      MUSU_BRIDGE_TOKEN — authentication token
      PAPERCLIP_API_KEY — legacy alias for MUSU_BRIDGE_TOKEN
      PAPERCLIP_COMPANY_ID — default company for scoped operations
    """

    def __init__(self) -> None:
        # URL: prefer MUSU_BRIDGE_URL, fallback to PAPERCLIP_API_URL for compat
        raw_url = os.environ.get("MUSU_BRIDGE_URL") or os.environ.get("PAPERCLIP_API_URL", _DEFAULT_API_URL)
        base = raw_url.rstrip("/")
        if not base.endswith("/api"):
            base = base + "/api"
        self.base_url = base
        self.company_id = os.environ.get("PAPERCLIP_COMPANY_ID", "")

        # Token: prefer MUSU_BRIDGE_TOKEN, fallback to PAPERCLIP_API_KEY, then file
        api_key = os.environ.get("MUSU_BRIDGE_TOKEN") or os.environ.get("PAPERCLIP_API_KEY", "")
        if not api_key:
            _token_file = os.path.expanduser("~/.musu/bridge_token")
            try:
                with open(_token_file) as _f:
                    api_key = _f.read().strip()
            except OSError:
                pass
        headers: dict[str, str] = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=15.0,
        )

    async def get(self, path: str, **params: Any) -> Any:
        resp = await self._client.get(path, params={k: v for k, v in params.items() if v is not None})
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, body: dict | None = None) -> Any:
        resp = await self._client.post(path, json=body or {})
        resp.raise_for_status()
        return resp.json()

    async def patch(self, path: str, body: dict) -> Any:
        resp = await self._client.patch(path, json=body)
        resp.raise_for_status()
        return resp.json()

    async def delete(self, path: str) -> Any:
        resp = await self._client.delete(path)
        resp.raise_for_status()
        return resp.json()

    async def aclose(self) -> None:
        await self._client.aclose()
