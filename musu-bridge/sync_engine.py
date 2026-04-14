"""Sync engine — pulls company records and message history from peer musu-bridge nodes."""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from mesh_router import MeshRouter
    from musu_core.backends.local import LocalBackend

logger = logging.getLogger(__name__)

_SYNC_STATE_PATH = Path.home() / ".musu" / "sync_state.json"
_EPOCH = "1970-01-01T00:00:00Z"


def _load_state() -> dict:
    try:
        if _SYNC_STATE_PATH.exists():
            return json.loads(_SYNC_STATE_PATH.read_text())
    except Exception:
        pass
    return {}


def _save_state(state: dict) -> None:
    try:
        _SYNC_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SYNC_STATE_PATH.write_text(json.dumps(state, indent=2))
    except Exception as exc:
        logger.warning("sync_engine: failed to save state — %s", exc)


class SyncEngine:
    """Periodically pulls company records and message history from peer nodes.

    Pull-based, last-write-wins for companies, insert-or-ignore for messages.
    State (last sync timestamps per peer) persisted at ~/.musu/sync_state.json.
    """

    def __init__(
        self,
        router: MeshRouter,
        backend: LocalBackend,
        interval_sec: int = 30,
    ) -> None:
        self._router = router
        self._backend = backend
        self._interval = interval_sec
        self._state: dict = _load_state()  # {peer_url: {companies_since, messages_since}}

    def _since(self, peer_url: str, key: str) -> str:
        return self._state.get(peer_url, {}).get(key, _EPOCH)

    def _update_since(self, peer_url: str, key: str, value: str) -> None:
        if peer_url not in self._state:
            self._state[peer_url] = {}
        self._state[peer_url][key] = value
        _save_state(self._state)

    async def run(self) -> None:
        """Main loop: boot pull then periodic delta pulls."""
        logger.info("sync_engine: starting (interval=%ds)", self._interval)
        # Initial full pull on boot
        await self._pull_all()
        while True:
            await asyncio.sleep(self._interval)
            await self._pull_all()

    async def _pull_all(self) -> None:
        """Pull from all remote peer nodes."""
        if not self._router.enabled:
            return
        # Collect remote node URLs (nodes that are not self)
        for node_name, node_url in self._router._node_urls.items():
            if node_name == self._router._self_name:
                continue
            try:
                await self._pull_from(node_url)
            except Exception as exc:
                logger.warning("sync_engine: pull from %s failed — %s", node_url, exc)

    async def _pull_from(self, peer_url: str) -> None:
        """Pull companies and messages from a single peer musu-bridge URL."""
        base = peer_url.rstrip("/")
        async with httpx.AsyncClient(timeout=30.0) as client:
            # --- Companies ---
            c_since = self._since(peer_url, "companies_since")
            try:
                resp = await client.get(
                    f"{base}/api/sync/companies",
                    params={"since": c_since, "limit": 500},
                )
                if resp.status_code == 200:
                    companies = resp.json()
                    if companies:
                        written = self._backend.bulk_upsert_companies(companies)
                        logger.info(
                            "sync_engine: %s companies pulled from %s, %d written",
                            len(companies), peer_url, written,
                        )
                        # Advance cursor to the newest updated_at we received
                        newest = max(c.get("updated_at", "") for c in companies)
                        if newest > c_since:
                            self._update_since(peer_url, "companies_since", newest)
                else:
                    logger.warning(
                        "sync_engine: /api/sync/companies from %s returned %s",
                        peer_url, resp.status_code,
                    )
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                logger.warning("sync_engine: cannot reach %s for companies — %s", peer_url, exc)
                return

            # --- Messages ---
            m_since = self._since(peer_url, "messages_since")
            try:
                resp = await client.get(
                    f"{base}/api/sync/messages",
                    params={"since": m_since, "limit": 500},
                )
                if resp.status_code == 200:
                    messages = resp.json()
                    if messages:
                        written = self._backend.bulk_insert_messages(messages)
                        logger.info(
                            "sync_engine: %s messages pulled from %s, %d written",
                            len(messages), peer_url, written,
                        )
                        newest = max(m.get("created_at", "") for m in messages)
                        if newest > m_since:
                            self._update_since(peer_url, "messages_since", newest)
                else:
                    logger.warning(
                        "sync_engine: /api/sync/messages from %s returned %s",
                        peer_url, resp.status_code,
                    )
            except (httpx.ConnectError, httpx.TimeoutException) as exc:
                logger.warning("sync_engine: cannot reach %s for messages — %s", peer_url, exc)


# ── Module-level singleton ──────────────────────────────────────────────────────

_engine: SyncEngine | None = None


def get_sync_engine(router: MeshRouter, backend: LocalBackend) -> SyncEngine:
    global _engine
    if _engine is None:
        _engine = SyncEngine(router=router, backend=backend)
    return _engine
