"""Runtime configuration for musu-core."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Config:
    db_path: str = field(
        default_factory=lambda: os.environ.get(
            "MUSU_DB_PATH",
            str(Path.home() / ".musu" / "musu.db"),
        )
    )
    default_model: str = field(
        default_factory=lambda: os.environ.get("MUSU_DEFAULT_MODEL", "claude-sonnet-4-5")
    )
    claude_command: str = field(
        default_factory=lambda: os.environ.get("MUSU_CLAUDE_COMMAND", "claude")
    )
    # Timeout in seconds for claude_local adapter
    adapter_timeout_sec: int = field(
        default_factory=lambda: int(os.environ.get("MUSU_ADAPTER_TIMEOUT", "300"))
    )
    # Optional: point at a Paperclip instance
    paperclip_api_url: str | None = field(
        default_factory=lambda: os.environ.get("PAPERCLIP_API_URL")
    )
    paperclip_api_key: str | None = field(
        default_factory=lambda: os.environ.get("PAPERCLIP_API_KEY")
    )
    paperclip_company_id: str | None = field(
        default_factory=lambda: os.environ.get("PAPERCLIP_COMPANY_ID")
    )

    def paperclip_available(self) -> bool:
        return bool(
            self.paperclip_api_url
            and self.paperclip_api_key
            and self.paperclip_company_id
        )


_default: Config | None = None


def get_config() -> Config:
    global _default
    if _default is None:
        _default = Config()
    return _default


def set_config(cfg: Config) -> None:
    global _default
    _default = cfg


def detect_backend(cfg: Config | None = None) -> "Any":
    """
    Return the appropriate backend for the current environment.

    - If Paperclip credentials are present in *cfg* (or get_config()), returns
      a PaperclipBackend pointed at that instance.
    - Otherwise returns a LocalBackend backed by cfg.db_path.
    """
    from typing import Any as _Any  # noqa: F401 — used only for type hint in docstring

    cfg = cfg or get_config()
    if cfg.paperclip_available():
        from musu_core.backends.paperclip import PaperclipBackend

        return PaperclipBackend(
            api_url=cfg.paperclip_api_url,  # type: ignore[arg-type]
            api_key=cfg.paperclip_api_key,  # type: ignore[arg-type]
            company_id=cfg.paperclip_company_id,  # type: ignore[arg-type]
        )

    from musu_core.backends.local import LocalBackend

    return LocalBackend(cfg.db_path)
