#!/usr/bin/env python3
"""DEPRECATED — replaced by generic company_loader (v11-iso1).

This module used to hardcode 7 Bloodline Writers agents and the writer
workspace path. Both moved to the user-owned manifest at
``~/.musu/companies/bloodline-writers.yaml``.

Run instead:

    MUSU_COMPANY_YAML=~/.musu/companies/bloodline-writers.yaml \
        python -m musu_bridge.seed_company

or import :func:`company_loader.seed_company_agents` directly.

This shim is preserved so legacy callers and tests do not break during the
migration window; it forwards to the new loader. Remove after all callers are
migrated.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

_MUSU_CORE = Path(__file__).parent.parent / "musu-core" / "src"
if str(_MUSU_CORE) not in sys.path:
    sys.path.insert(0, str(_MUSU_CORE))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def main() -> int:
    from company_loader import load_company_manifest, seed_company_agents

    manifest = load_company_manifest()
    if not manifest:
        logger.warning(
            "seed_bw_agents (legacy shim): no company manifest configured. "
            "Set MUSU_COMPANY_YAML to your company yaml (e.g. "
            "~/.musu/companies/bloodline-writers.yaml) and re-run."
        )
        return 1

    created = seed_company_agents(manifest)
    logger.info(
        "Seeded %d new agents for company %r (id=%s)",
        created,
        manifest.get("name"),
        manifest.get("id"),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
