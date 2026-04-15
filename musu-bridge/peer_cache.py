"""Persistent local cache of discovered peers (~/.musu/peers.json).

Peers are added from three sources:
  - "musu.pro"  — fetched from the cloud node registry
  - "mdns"      — discovered via mDNS on LAN
  - "manual"    — added via nodes.toml or env

The cache lets nodes reconnect without consulting musu.pro on every startup.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

_DEFAULT_CACHE_PATH = Path(os.getenv("MUSU_PEER_CACHE", Path.home() / ".musu" / "peers.json"))

SourceType = Literal["musu.pro", "mdns", "manual"]


@dataclass
class PeerEntry:
    node_name: str
    public_url: str
    last_seen: str  # ISO8601 UTC
    source: SourceType = "musu.pro"

    @staticmethod
    def now_iso() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")


class PeerCache:
    """Thread-safe read/write wrapper for peers.json."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _DEFAULT_CACHE_PATH
        self._peers: dict[str, PeerEntry] = {}  # keyed by node_name
        self._load_from_disk()

    # ── Public API ────────────────────────────────────────────────────────────

    def all(self) -> list[PeerEntry]:
        """Return all cached peers."""
        return list(self._peers.values())

    def get(self, node_name: str) -> PeerEntry | None:
        return self._peers.get(node_name)

    def upsert(self, peer: PeerEntry) -> None:
        """Insert or update a peer by node_name."""
        self._peers[peer.node_name] = peer

    def remove(self, node_name: str) -> None:
        self._peers.pop(node_name, None)

    def flush(self) -> None:
        """Persist in-memory state to disk atomically."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": 1,
            "peers": [asdict(p) for p in self._peers.values()],
        }
        # Atomic write via temp file
        try:
            fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".peers_tmp_")
            try:
                with os.fdopen(fd, "w") as f:
                    json.dump(data, f, indent=2)
                os.replace(tmp, self.path)
                logger.debug("peer_cache: flushed %d peers → %s", len(self._peers), self.path)
            except Exception:
                os.unlink(tmp)
                raise
        except Exception:
            logger.exception("peer_cache: flush failed")

    # ── Internal ──────────────────────────────────────────────────────────────

    def _load_from_disk(self) -> None:
        if not self.path.exists():
            logger.debug("peer_cache: no cache file at %s — starting empty", self.path)
            return
        try:
            with self.path.open() as f:
                data = json.load(f)
            for raw in data.get("peers", []):
                peer = PeerEntry(
                    node_name=raw["node_name"],
                    public_url=raw["public_url"],
                    last_seen=raw.get("last_seen", PeerEntry.now_iso()),
                    source=raw.get("source", "manual"),
                )
                self._peers[peer.node_name] = peer
            logger.info("peer_cache: loaded %d peers from %s", len(self._peers), self.path)
        except Exception:
            logger.warning("peer_cache: could not read %s — starting empty", self.path)


# Module-level singleton
_cache: PeerCache | None = None


def get_peer_cache() -> PeerCache:
    global _cache
    if _cache is None:
        _cache = PeerCache()
    return _cache
