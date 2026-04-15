"""Async HTTP client for the Paperclip API."""

import os
from typing import Any

import httpx

_DEFAULT_API_URL = "http://127.0.0.1:3100/api"


class PaperclipClient:
    """Thin async httpx wrapper around the Paperclip REST API."""

    def __init__(self) -> None:
        base = os.environ.get("PAPERCLIP_API_URL", _DEFAULT_API_URL).rstrip("/")
        # Accept either "http://host/api" or "http://host" — normalise to /api suffix
        if not base.endswith("/api"):
            base = base + "/api"
        self.base_url = base
        self.company_id = os.environ.get("PAPERCLIP_COMPANY_ID", "f27a9bd2-688a-450b-98b4-f63d24b0ab50")
        api_key = os.environ.get("PAPERCLIP_API_KEY", "")
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

    async def aclose(self) -> None:
        await self._client.aclose()
