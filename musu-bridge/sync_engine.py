"""Sync engine — pulls company records and message history from peer musu-bridge nodes."""
from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import httpx

if TYPE_CHECKING:
    from mesh_router import MeshRouter
    from musu_core.backends.local import LocalBackend

def _get_bridge_token() -> str:
    """Read MUSU_BRIDGE_TOKEN lazily — avoids stale value if env changes post-import."""
    return os.getenv("MUSU_BRIDGE_TOKEN", "")


def _get_sync_token() -> str:
    """Token to use for outbound peer sync requests.

    Prefer MUSU_TOKEN (account-level, same on all nodes of the same account)
    so peer nodes accept it via their peer_token middleware slot.
    Falls back to MUSU_BRIDGE_TOKEN for dev/offline setups.
    """
    return os.getenv("MUSU_TOKEN", "") or os.getenv("MUSU_BRIDGE_TOKEN", "")


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


_MAX_CONSECUTIVE_FAILURES = 5  # back-off after this many consecutive 4xx/5xx per peer

# RFC 1918 + link-local ranges — never pull from these as peer URLs
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _is_safe_peer_url(url: str) -> bool:
    """Return True if peer_url is safe to pull from (not a private/loopback address).

    Hostnames are allowed (trusted from nodes.toml / musu.pro registry).
    IP literals are checked against RFC 1918 and link-local ranges.
    """
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return False
    if not host:
        return False
    try:
        ip = ipaddress.ip_address(host)
        return not any(ip in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        # Not an IP literal — it's a hostname; trust it
        return True

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
        self._failures: dict[str, int] = {}  # consecutive failure count per peer_url

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
            failures = self._failures.get(node_url, 0)
            if failures >= _MAX_CONSECUTIVE_FAILURES:
                # Back-off: skip every (failures - MAX + 1) cycles, then retry
                skip_n = min(failures - _MAX_CONSECUTIVE_FAILURES + 1, 10)
                if (failures % (skip_n + 1)) != 0:
                    logger.debug("sync_engine: skipping %s (backoff, %d failures)", node_url, failures)
                    self._failures[node_url] = failures + 1
                    continue
            if not _is_safe_peer_url(node_url):
                logger.warning("sync_engine: skipping unsafe peer url: %s", node_url)
                continue
            # Per-peer token from nodes.toml takes priority, then account token, then local token
            peer_token = self._router.token_for_node(node_name) or _get_sync_token()
            try:
                await self._pull_from(node_url, token=peer_token)
                self._failures[node_url] = 0  # reset on success
            except Exception as exc:
                logger.warning("sync_engine: pull from %s failed — %s", node_url, exc)
                self._failures[node_url] = failures + 1

    async def _pull_from(self, peer_url: str, token: str = "") -> None:
        """Pull companies and messages from a single peer musu-bridge URL."""
        base = peer_url.rstrip("/")
        _tok = token or _get_bridge_token()
        headers = {"Authorization": f"Bearer {_tok}"} if _tok else {}
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
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
                elif resp.status_code in (401, 403):
                    logger.warning(
                        "sync_engine: auth error from %s (%s) — check MUSU_BRIDGE_TOKEN",
                        peer_url, resp.status_code,
                    )
                    raise httpx.HTTPStatusError("auth", request=resp.request, response=resp)
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
