"""Research-to-Wiki — web search → fetch → synthesize → LLM Wiki page.

Inspired by NotebookLM + Karpathy's LLM Wiki concept.
Chains existing tools: web_search → web_fetch → LLM synthesis → write_wiki_page.
"""
from __future__ import annotations

import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("musu.research")

_WIKI_PATH = Path(os.environ.get("MUSU_WIKI_PATH", str(Path.home() / "llm-wiki" / "wiki")))
_SEARCH_API_KEY = os.environ.get("MUSU_SEARCH_API_KEY", "")
_SEARCH_API_URL = "https://api.tavily.com/search"


async def _web_search(topic: str, max_results: int = 5) -> list[dict]:
    """Search the web for a topic using Tavily API."""
    if not _SEARCH_API_KEY:
        logger.warning("research: MUSU_SEARCH_API_KEY not set — using mock results")
        return [{"title": f"Result for: {topic}", "url": "https://example.com", "content": "No search API configured."}]

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(_SEARCH_API_URL, json={
            "api_key": _SEARCH_API_KEY,
            "query": topic,
            "max_results": max_results,
            "search_depth": "advanced",
        })
        if resp.status_code != 200:
            logger.warning("research: search API returned %d", resp.status_code)
            return []
        data = resp.json()
        return data.get("results", [])


async def _web_fetch(url: str, max_bytes: int = 5000) -> str:
    """Fetch a URL and return stripped text content."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "MUSU-Research/1.0"})
            if resp.status_code != 200:
                return ""
            text = resp.text
            # Strip HTML tags
            text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
            text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:max_bytes]
    except Exception as exc:
        logger.debug("research: fetch failed for %s — %s", url, exc)
        return ""


def _build_synthesis_prompt(topic: str, sources: list[dict]) -> str:
    """Build a prompt that asks the LLM to synthesize sources into wiki format."""
    source_block = ""
    for i, s in enumerate(sources, 1):
        source_block += f"\n### Source {i}: {s.get('title', 'Unknown')}\nURL: {s.get('url', '')}\n{s.get('content', '')[:2000]}\n"

    return f"""## Research Task

Topic: {topic}

You have been given {len(sources)} source(s) below. Synthesize them into a structured wiki page.

### Output Format (LLM Wiki)

```markdown
# {{topic}}

## Summary
(3-line summary of key findings)

## Key Points
- bullet 1
- bullet 2
- ...

## Evidence
- [Source Title](url) — "key quote or finding"
- ...

## Related
- [[Related Topic 1]]
- [[Related Topic 2]]

## Open Questions
- Unanswered question 1
- ...
```

### Sources
{source_block}

Write the wiki page now. Use the exact format above. Include all evidence with URLs."""


def _generate_page_id(topic: str) -> str:
    """Generate a wiki page ID from a topic string."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Clean topic to safe filename
    clean = re.sub(r"[^a-zA-Z0-9가-힣\s]", "", topic)
    clean = re.sub(r"\s+", "_", clean.strip())[:50]
    # Get next available number
    existing = list(_WIKI_PATH.glob("*.md"))
    max_num = 0
    for f in existing:
        match = re.match(r"(\d+)_", f.stem)
        if match:
            max_num = max(max_num, int(match.group(1)))
    return f"{max_num + 1:03d}_{clean}_{today}"


async def research_and_wiki(topic: str, max_sources: int = 5) -> dict[str, Any]:
    """Full research flow: search → fetch → synthesize → wiki.

    Returns:
        {"page_id": str, "sources": int, "topic": str, "wiki_path": str}
    """
    start = time.monotonic()

    # 1. Search
    logger.info("research: searching for %r (max_sources=%d)", topic, max_sources)
    search_results = await _web_search(topic, max_sources)
    if not search_results:
        return {"error": "No search results found", "topic": topic}

    # 2. Fetch each source
    sources = []
    for result in search_results:
        url = result.get("url", "")
        content = result.get("content", "")
        if url and not content:
            content = await _web_fetch(url)
        sources.append({
            "title": result.get("title", "Unknown"),
            "url": url,
            "content": content[:3000],
        })
    logger.info("research: fetched %d sources", len(sources))

    # 3. Synthesize via LLM (route_chat)
    synthesis_prompt = _build_synthesis_prompt(topic, sources)
    wiki_content = ""
    try:
        from handlers import route_chat
        result = await route_chat(
            channel="cto",
            sender_id="research-bot",
            text=synthesis_prompt,
        )
        wiki_content = result.get("response", "")
    except Exception as exc:
        logger.warning("research: LLM synthesis failed — %s. Using raw sources.", exc)
        # Fallback: raw source compilation
        wiki_content = f"# {topic}\n\n## Sources\n\n"
        for s in sources:
            wiki_content += f"### {s['title']}\n{s['url']}\n\n{s['content'][:500]}\n\n"

    # 4. Save to wiki
    page_id = _generate_page_id(topic)
    wiki_file = _WIKI_PATH / f"{page_id}.md"
    _WIKI_PATH.mkdir(parents=True, exist_ok=True)
    wiki_file.write_text(wiki_content, encoding="utf-8")

    duration = time.monotonic() - start
    logger.info("research: saved wiki page %s (%.1fs)", page_id, duration)

    return {
        "page_id": page_id,
        "sources": len(sources),
        "topic": topic,
        "wiki_path": str(wiki_file),
        "duration_ms": round(duration * 1000),
    }
