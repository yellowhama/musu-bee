"""Instruction Learner — auto-detect repeated agent failures and add rules.

When an agent fails with the same error pattern 3+ times, automatically
appends a "NEVER" rule to their instructions file. This is the MUSU
implementation of the "Hookify" / harness engineering pattern.

Mitchell Hashimoto: "When an agent makes a mistake, engineer the environment
so that mistake never happens again."
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger("musu.instruction_learner")

INSTRUCTIONS_DIR = Path(__file__).parent / "instructions"
FAILURE_THRESHOLD = 3  # errors before auto-rule
LOOKBACK_HOURS = 24
AUTO_RULES_HEADER = "\n## Auto-learned rules\n"


def _error_hash(error: str) -> str:
    """Normalize and hash an error message for dedup."""
    # Strip timestamps, IDs, paths that vary
    normalized = re.sub(r"\b[0-9a-f]{8,}\b", "<ID>", error)
    normalized = re.sub(r"/home/\w+/", "/home/<USER>/", normalized)
    normalized = re.sub(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}", "<TS>", normalized)
    normalized = normalized.strip().lower()
    return hashlib.sha256(normalized.encode()).hexdigest()[:12]


def _extract_rule_text(error: str) -> str:
    """Extract a human-readable rule from an error message."""
    # Take first line, max 100 chars
    first_line = error.strip().split("\n")[0][:100]
    return first_line


def detect_repeated_failures(db, channel: str) -> list[dict]:
    """Find error patterns that repeated 3+ times for a channel."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).isoformat()
    try:
        rows = db.execute(
            "SELECT error FROM route_executions "
            "WHERE channel = ? AND status = 'failed' AND error IS NOT NULL "
            "AND created_at > ? ORDER BY created_at DESC LIMIT 50",
            (channel, cutoff),
        ).fetchall()
    except Exception:
        return []

    # Group by error hash
    error_counts: dict[str, dict] = {}
    for row in rows:
        err = row[0] if isinstance(row, (list, tuple)) else row.get("error", "")
        if not err:
            continue
        h = _error_hash(err)
        if h not in error_counts:
            error_counts[h] = {"hash": h, "error": err, "count": 0}
        error_counts[h]["count"] += 1

    # Filter to threshold
    return [v for v in error_counts.values() if v["count"] >= FAILURE_THRESHOLD]


def get_existing_rules(role: str) -> set[str]:
    """Get hashes of already-learned rules from instructions file."""
    instructions_path = INSTRUCTIONS_DIR / f"{role}.md"
    if not instructions_path.exists():
        return set()
    content = instructions_path.read_text()
    # Extract hashes from auto-learned rules section
    hashes = set()
    in_section = False
    for line in content.split("\n"):
        if "Auto-learned rules" in line:
            in_section = True
            continue
        if in_section and line.startswith("## "):
            break
        if in_section and line.startswith("- NEVER:"):
            # Extract hash from end of line (hash=XXXX)
            match = re.search(r"hash=([a-f0-9]+)", line)
            if match:
                hashes.add(match.group(1))
    return hashes


def append_rule(role: str, error: str, error_hash: str, count: int) -> bool:
    """Append an auto-learned rule to the instructions file."""
    instructions_path = INSTRUCTIONS_DIR / f"{role}.md"
    if not instructions_path.exists():
        logger.warning("instruction_learner: no file for role %s", role)
        return False

    content = instructions_path.read_text()
    rule_text = _extract_rule_text(error)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rule_line = f"- NEVER: {rule_text} (detected {count}x on {date_str}, hash={error_hash})\n"

    # Check if auto-learned section exists
    if AUTO_RULES_HEADER.strip() in content:
        # Append to existing section
        content = content.rstrip() + "\n" + rule_line
    else:
        # Create section
        content = content.rstrip() + "\n" + AUTO_RULES_HEADER + rule_line

    instructions_path.write_text(content)
    logger.info("instruction_learner: added rule for %s — %s (%dx)", role, rule_text[:50], count)
    return True


def learn_from_failures(db, channel: str, role: str | None = None) -> list[str]:
    """Main entry: detect repeated failures and auto-add rules.

    Returns list of newly added rule descriptions.
    """
    if role is None:
        role = channel  # Default: channel name = role name

    repeated = detect_repeated_failures(db, channel)
    if not repeated:
        return []

    existing = get_existing_rules(role)
    added = []

    for pattern in repeated:
        if pattern["hash"] in existing:
            continue  # Already learned
        if append_rule(role, pattern["error"], pattern["hash"], pattern["count"]):
            added.append(f"{pattern['error'][:60]}... ({pattern['count']}x)")

    return added
