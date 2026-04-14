"""mDNS zero-config discovery for musu-bridge nodes.

Advertises this node as _musu-bridge._tcp.local. and scans for peers
on the same LAN/Tailscale network.

Requires: pip install zeroconf
"""
from __future__ import annotations

import logging
import socket
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

SERVICE_TYPE = "_musu-bridge._tcp.local."


class MusuDiscovery:
    """mDNS advertiser + scanner for musu-bridge peers."""

    def __init__(self) -> None:
        self._zeroconf: Any = None
        self._service_info: Any = None
        self._browser: Any = None
        self._discovered: dict[str, dict] = {}  # name → {name, ip, port, url}
        self._discovered_lock = threading.Lock()
        self._self_name: str = ""

    # ── Advertise ─────────────────────────────────────────────────────────────

    def advertise(self, node_name: str, ip: str, port: int) -> None:
        """Announce this node on the local network via mDNS."""
        try:
            from zeroconf import ServiceInfo, Zeroconf

            self._self_name = node_name
            self._zeroconf = Zeroconf()

            self._service_info = ServiceInfo(
                SERVICE_TYPE,
                f"{node_name}.{SERVICE_TYPE}",
                addresses=[socket.inet_aton(ip)],
                port=port,
                properties={
                    b"version": b"0.2.0",
                    b"node": node_name.encode(),
                },
            )
            self._zeroconf.register_service(self._service_info)
            logger.info("discovery: advertising %r at %s:%d", node_name, ip, port)
        except ImportError:
            logger.warning("discovery: zeroconf not installed — mDNS disabled (pip install zeroconf)")
        except Exception:
            logger.exception("discovery: failed to start mDNS advertise")

    # ── Scan ──────────────────────────────────────────────────────────────────

    def start_browser(self) -> None:
        """Start background mDNS browser to discover peers."""
        if self._zeroconf is None:
            return
        try:
            from zeroconf import ServiceBrowser

            self._browser = ServiceBrowser(
                self._zeroconf,
                SERVICE_TYPE,
                handlers=[self._on_service_state_change],
            )
            logger.info("discovery: mDNS browser started")
        except Exception:
            logger.exception("discovery: failed to start mDNS browser")

    def _on_service_state_change(
        self,
        zeroconf: Any,
        service_type: str,
        name: str,
        state_change: Any,
    ) -> None:
        from zeroconf import ServiceStateChange

        if state_change is ServiceStateChange.Added:
            info = zeroconf.get_service_info(service_type, name)
            if info is None:
                return
            try:
                ip = socket.inet_ntoa(info.addresses[0])
                port = info.port
                props = {
                    k.decode() if isinstance(k, bytes) else k: (
                        v.decode() if isinstance(v, bytes) else v
                    )
                    for k, v in (info.properties or {}).items()
                }
                node_name = props.get("node", name.split(".")[0])
                if node_name == self._self_name:
                    return  # skip self
                url = f"http://{ip}:{port}"
                with self._discovered_lock:
                    self._discovered[node_name] = {
                        "name": node_name,
                        "ip": ip,
                        "port": port,
                        "url": url,
                        "discovered_at": time.time(),
                    }
                logger.info("discovery: found peer %r at %s:%d", node_name, ip, port)
            except Exception:
                logger.exception("discovery: error processing service %r", name)
        elif state_change is ServiceStateChange.Removed:
            node_name = name.split(".")[0]
            with self._discovered_lock:
                self._discovered.pop(node_name, None)
            logger.info("discovery: peer removed %r", node_name)

    def get_discovered(self) -> list[dict]:
        """Return list of discovered peers (excluding stale entries > 5 min)."""
        cutoff = time.time() - 300
        with self._discovered_lock:
            snapshot = list(self._discovered.values())
        return [p for p in snapshot if p.get("discovered_at", 0) > cutoff]

    # ── Cleanup ───────────────────────────────────────────────────────────────

    def close(self) -> None:
        if self._zeroconf is None:
            return
        try:
            if self._service_info:
                self._zeroconf.unregister_service(self._service_info)
            self._zeroconf.close()
            logger.info("discovery: mDNS closed")
        except Exception:
            logger.exception("discovery: error during close")


async def enrich_with_agent_card(peer: dict) -> dict:
    """Fetch /.well-known/agent.json from a discovered peer and attach agents list."""
    import httpx

    url = peer.get("url", "")
    result = dict(peer)
    result.setdefault("agents", [])
    if not url:
        return result
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/.well-known/agent.json")
            if resp.status_code == 200:
                card = resp.json()
                result["agents"] = [
                    a["id"]
                    for a in card.get("capabilities", {}).get("agents", [])
                    if isinstance(a, dict) and a.get("id")
                ]
    except Exception:
        pass
    return result


# ── Module-level singleton ────────────────────────────────────────────────────

_discovery: MusuDiscovery | None = None


def get_discovery() -> MusuDiscovery:
    global _discovery
    if _discovery is None:
        _discovery = MusuDiscovery()
    return _discovery
