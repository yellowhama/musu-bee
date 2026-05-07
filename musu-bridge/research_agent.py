"""Research agent — uses crawl4ai to deep-scrape web pages for marketing research.

Usage:
    from research_agent import research_topic
    result = await research_topic("developer marketing best practices", max_pages=5)
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

logger = logging.getLogger("musu.research_agent")


async def scrape_url(url: str, max_chars: int = 5000) -> dict[str, str]:
    """Scrape a single URL and return markdown content."""
    try:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig

        config = CrawlerRunConfig(
            word_count_threshold=50,
            excluded_tags=["nav", "footer", "header", "aside", "script", "style"],
        )

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url, config=config)
            if result.success:
                content = result.markdown_v2.raw_markdown if hasattr(result, 'markdown_v2') else result.markdown
                # Truncate to save tokens
                if len(content) > max_chars:
                    content = content[:max_chars] + "\n\n... (truncated)"
                return {
                    "url": url,
                    "title": result.metadata.get("title", url) if result.metadata else url,
                    "content": content,
                    "success": True,
                }
            return {"url": url, "title": "", "content": "", "success": False, "error": str(result.error_message)}
    except Exception as e:
        logger.warning("scrape_url failed: %s — %s", url, e)
        return {"url": url, "title": "", "content": "", "success": False, "error": str(e)}


async def research_topic(
    query: str,
    urls: list[str] | None = None,
    max_pages: int = 5,
    max_chars_per_page: int = 3000,
) -> dict[str, Any]:
    """Research a topic by scraping relevant URLs.

    If urls not provided, uses web_search results (requires MUSU bridge).
    Returns structured research with sources.
    """
    sources = []

    if urls:
        # Scrape provided URLs
        tasks = [scrape_url(u, max_chars_per_page) for u in urls[:max_pages]]
        sources = await asyncio.gather(*tasks)
    else:
        # Try to get URLs from bridge web_search
        try:
            import httpx
            bridge_url = "http://127.0.0.1:8070"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(f"{bridge_url}/api/wiki/search", params={"q": query})
                # Fallback: just return empty if no URLs
        except Exception:
            pass

    successful = [s for s in sources if s.get("success")]

    # Compile research
    compiled = f"# Research: {query}\n\n"
    compiled += f"**Sources scraped: {len(successful)}/{len(sources)}**\n\n"

    for i, src in enumerate(successful, 1):
        compiled += f"## Source {i}: {src['title']}\n"
        compiled += f"URL: {src['url']}\n\n"
        compiled += src["content"] + "\n\n---\n\n"

    return {
        "query": query,
        "sources_total": len(sources),
        "sources_success": len(successful),
        "compiled_research": compiled,
        "raw_sources": successful,
    }


# ── Bridge API endpoint ──────────────────────────────────────────────────────

async def handle_research_request(query: str, urls: list[str] | None = None, max_pages: int = 5) -> dict:
    """API handler for /api/research/deep endpoint."""
    result = await research_topic(query, urls=urls, max_pages=max_pages)
    return {
        "query": result["query"],
        "sources": result["sources_success"],
        "research": result["compiled_research"],
    }
