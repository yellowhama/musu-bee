"""conftest.py — ensure musu-core is on sys.path for bridge tests."""
from __future__ import annotations

import sys
from pathlib import Path

# musu-bridge/tests/ -> musu-bridge/ -> musu-functions/
_ROOT = Path(__file__).parent.parent.parent
_MUSU_CORE = _ROOT / "musu-core" / "src"
_BRIDGE = Path(__file__).parent.parent

for p in (_MUSU_CORE, _BRIDGE):
    s = str(p)
    if s not in sys.path:
        sys.path.insert(0, s)
