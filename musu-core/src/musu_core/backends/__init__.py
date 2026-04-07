"""Backend abstraction for musu-core."""

from musu_core.backends.base import BackendABC
from musu_core.backends.local import LocalBackend
from musu_core.backends.paperclip import PaperclipBackend

__all__ = ["BackendABC", "LocalBackend", "PaperclipBackend"]
