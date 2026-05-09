"""Crawler integration — uses crawl4ai for real-time platform data."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from ..project_config import PROJECT_ROOT

CRAWLER_SCRIPT = PROJECT_ROOT / "사용도구" / "crawl4ai" / "market_crawler.py"
CRAWLER_VENV = PROJECT_ROOT / "사용도구" / "crawl4ai" / ".venv" / "bin" / "python3"
CRAWL_DIR = PROJECT_ROOT / "research" / "trends" / "crawled"


def crawl_platform(platform: str = "all", timeout: int = 120) -> dict:
    """Run market_crawler.py and return results.

    Args:
        platform: "kakaopage", "novelpia", "munpia", "royalroad", "narou", or "all"
        timeout: Max seconds to wait

    Returns dict with crawl results or error.
    """
    if not CRAWLER_SCRIPT.exists():
        return {"error": f"Crawler script not found: {CRAWLER_SCRIPT}"}

    python = str(CRAWLER_VENV) if CRAWLER_VENV.exists() else sys.executable

    try:
        result = subprocess.run(
            [python, str(CRAWLER_SCRIPT), "--platform", platform],
            capture_output=True, text=True, timeout=timeout,
            cwd=str(CRAWLER_SCRIPT.parent),
        )

        if result.returncode != 0:
            return {
                "error": f"Crawler failed (exit {result.returncode})",
                "stderr": result.stderr[:500],
            }

        # Find the saved file
        today = time.strftime("%Y-%m-%d")
        json_files = sorted(CRAWL_DIR.glob(f"{today}_{platform}_crawl.json"), reverse=True)
        md_files = sorted(CRAWL_DIR.glob(f"{today}_{platform}_crawl.md"), reverse=True)

        return {
            "status": "success",
            "platform": platform,
            "json_path": str(json_files[0]) if json_files else None,
            "markdown_path": str(md_files[0]) if md_files else None,
            "stdout": result.stdout[:500],
        }

    except subprocess.TimeoutExpired:
        return {"error": f"Crawler timed out after {timeout}s"}
    except Exception as e:
        return {"error": str(e)}


def get_latest_crawl(platform: str = "all") -> dict:
    """Get the latest crawl results for a platform."""
    if not CRAWL_DIR.exists():
        return {"error": "No crawl data found. Run crawl_platform first."}

    # Find latest JSON file
    pattern = f"*_{platform}_crawl.json" if platform != "all" else "*_crawl.json"
    files = sorted(CRAWL_DIR.glob(pattern), reverse=True)

    if not files:
        return {"error": f"No crawl data for {platform}"}

    latest = files[0]
    try:
        data = json.loads(latest.read_text(encoding="utf-8"))
        return {
            "path": str(latest),
            "crawled_at": data.get("crawled_at", "unknown"),
            "data": data,
        }
    except Exception as e:
        return {"error": str(e)}
