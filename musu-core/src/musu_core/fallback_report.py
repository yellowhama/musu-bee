"""Weekly fallback report generator for musu-core.

Reads the fallback_metrics table and produces a markdown summary suitable for
posting as a Paperclip comment or writing to a log file.

Usage:
    from musu_core.fallback_report import generate_report
    from musu_core.backends.local import LocalBackend

    backend = LocalBackend("/path/to/musu.db")
    print(generate_report(backend))
"""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from musu_core.backends.local import LocalBackend


def generate_report(backend: "LocalBackend", since_days: int = 7) -> str:
    """Return a markdown fallback report covering the last *since_days* days.

    Includes:
    - Total fallback events
    - Breakdown by reason (error_code)
    - Breakdown by agent
    - Chain-exhaustion count
    """
    rows = backend.get_fallback_metrics(since_days=since_days)

    total = len(rows)
    exhausted = sum(1 for r in rows if r["chain_exhausted"])

    reason_counts: Counter[str] = Counter(r["fallback_reason"] for r in rows)
    agent_counts: Counter[str] = Counter(
        r["agent_id"] or "unknown" for r in rows
    )
    adapter_counts: Counter[str] = Counter(
        r["fallback_adapter"] for r in rows if r["fallback_adapter"]
    )

    lines: list[str] = [
        f"## Weekly Fallback Report (last {since_days} days)",
        "",
        f"- **Total fallback events:** {total}",
        f"- **Chain-exhausted (all adapters failed):** {exhausted}",
        "",
    ]

    if reason_counts:
        lines.append("### By error reason")
        for reason, count in reason_counts.most_common():
            lines.append(f"- `{reason}`: {count}")
        lines.append("")

    if agent_counts:
        lines.append("### By agent")
        for agent_id, count in agent_counts.most_common():
            lines.append(f"- `{agent_id}`: {count}")
        lines.append("")

    if adapter_counts:
        lines.append("### By fallback adapter tried")
        for adapter, count in adapter_counts.most_common():
            lines.append(f"- `{adapter}`: {count}")
        lines.append("")

    if total == 0:
        lines.append("_No fallback events recorded in this period._")

    return "\n".join(lines)
