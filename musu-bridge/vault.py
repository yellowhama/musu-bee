"""MUSU Vault — simple secrets manager.

Stores credentials in ~/.musu/secrets/ with file permissions 0600.
No encryption (relies on filesystem permissions). Future: add age/sops encryption.

Usage:
    from vault import get_secret, set_secret, list_secrets

    token = get_secret("bridge_token")
    set_secret("github_token", "ghp_xxx")
    names = list_secrets()
"""
from __future__ import annotations

import logging
import os
import stat
from pathlib import Path

logger = logging.getLogger(__name__)

VAULT_DIR = Path(os.environ.get("MUSU_VAULT_DIR", os.path.expanduser("~/.musu/secrets")))


def _ensure_dir() -> None:
    VAULT_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(VAULT_DIR, stat.S_IRWXU)  # 0700


def get_secret(name: str) -> str | None:
    """Read a secret by name. Returns None if not found."""
    path = VAULT_DIR / name
    if not path.exists():
        return None
    try:
        return path.read_text().strip()
    except Exception:
        logger.warning("vault: failed to read secret %r", name)
        return None


def set_secret(name: str, value: str) -> bool:
    """Store a secret. Returns True on success."""
    _ensure_dir()
    path = VAULT_DIR / name
    try:
        path.write_text(value)
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
        logger.info("vault: stored secret %r", name)
        return True
    except Exception as exc:
        logger.warning("vault: failed to store secret %r — %s", name, exc)
        return False


def delete_secret(name: str) -> bool:
    """Delete a secret. Returns True if existed."""
    path = VAULT_DIR / name
    if path.exists():
        path.unlink()
        return True
    return False


def list_secrets() -> list[str]:
    """List all secret names (not values)."""
    _ensure_dir()
    return sorted(f.name for f in VAULT_DIR.iterdir() if f.is_file())


def migrate_existing() -> int:
    """Migrate existing tokens to vault."""
    migrated = 0
    # bridge_token
    bt_path = Path("~/.musu/bridge_token").expanduser()
    if bt_path.exists() and not (VAULT_DIR / "bridge_token").exists():
        set_secret("bridge_token", bt_path.read_text().strip())
        migrated += 1
    # musu_token
    mt_path = Path("~/.musu/musu_token").expanduser()
    if mt_path.exists() and not (VAULT_DIR / "musu_token").exists():
        set_secret("musu_token", mt_path.read_text().strip())
        migrated += 1
    return migrated
