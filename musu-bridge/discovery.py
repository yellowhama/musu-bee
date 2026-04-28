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

    async def advertise_async(self, node_name: str, ip: str, port: int) -> None:
        """Announce this node on the local network via mDNS (async-safe).

        Uses AsyncZeroconf so registration doesn't block the uvicorn event loop.
        Falls back gracefully if zeroconf is not installed.
        """
        try:
            from zeroconf import ServiceInfo
            from zeroconf.asyncio import AsyncZeroconf

            self._self_name = node_name
            azc = AsyncZeroconf()
            self._zeroconf = azc.zeroconf  # expose sync handle for ServiceBrowser

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
            await azc.async_register_service(self._service_info)
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
    """Fetch node card from a discovered peer and attach agents list."""
    import httpx

    url = peer.get("url", "")
    result = dict(peer)
    result.setdefault("agents", [])
    if not url:
        return result
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url.rstrip('/')}/api/admin/node-card")
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


# ── Tailscale IP detection ────────────────────────────────────────────────────

def get_tailscale_ip() -> str | None:
    """Detect this machine's Tailscale IP (100.x.x.x CGNAT range).

    Priority:
    1. MUSU_TAILSCALE_IP environment variable (explicit override)
    2. Route-based: UDP connect to 100.100.100.100 (Tailscale DNS) —
       OS selects the correct source IP without sending any packet
    3. hostname resolution fallback — only used if result is 100.x.x.x
    4. Returns None if Tailscale not detected
    """
    import os

    if env_ip := os.getenv("MUSU_TAILSCALE_IP"):
        return env_ip

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("100.100.100.100", 80))
            ip = s.getsockname()[0]
            if ip.startswith("100."):
                return ip
    except Exception:
        pass

    try:
        hostname_ip = socket.gethostbyname(socket.gethostname())
        if hostname_ip.startswith("100."):
            return hostname_ip
    except Exception:
        pass

    return None


# ── Module-level singleton ────────────────────────────────────────────────────

_discovery: MusuDiscovery | None = None


def get_discovery() -> MusuDiscovery:
    global _discovery
    if _discovery is None:
        _discovery = MusuDiscovery()
    return _discovery


# ── Public IP detection ───────────────────────────────────────────────────────

import ipaddress

_PUBLIC_IP_APIS = [
    "https://api.ipify.org",
    "https://api4.ipify.org",
    "https://checkip.amazonaws.com",
]

_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),   # CGNAT
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
]

_cached_public_ip: str | None = None
_cached_public_ip_ts: float = 0.0
_PUBLIC_IP_TTL: float = 3600.0  # 1 hour


async def detect_public_ip(timeout: float = 5.0) -> str | None:
    """ipify 계열 API로 공인 IPv4 감지. 1시간 TTL 캐시.

    사설/CGNAT IP는 거부. 실패 시 None 반환.
    """
    global _cached_public_ip, _cached_public_ip_ts
    now = time.monotonic()
    if _cached_public_ip and (now - _cached_public_ip_ts) < _PUBLIC_IP_TTL:
        return _cached_public_ip
    import httpx

    for url in _PUBLIC_IP_APIS:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    ip = resp.text.strip()
                    try:
                        addr = ipaddress.ip_address(ip)
                    except ValueError:
                        continue
                    if not any(addr in net for net in _PRIVATE_NETS):
                        logger.info("discovery: public IP → %s (via %s)", ip, url)
                        _cached_public_ip = ip
                        _cached_public_ip_ts = now
                        return ip
        except Exception:
            pass

    logger.warning(
        "discovery: 공인 IP 감지 실패 — MUSU_BRIDGE_PUBLIC_URL 수동 설정 권장"
    )
    return None
