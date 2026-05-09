"""CLI entry point for musu-ai-detector."""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(
        prog="musu-ai-detector",
        description="AI text detection features extractor (MCP tool)",
    )
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("mcp", help="Run MCP server (stdio mode)")

    detect_parser = subparsers.add_parser("detect", help="Extract AI detection features")
    detect_parser.add_argument("file", help="Text file to analyze")
    detect_parser.add_argument(
        "--language",
        choices=["auto", "ko", "en"],
        default="auto",
    )

    args = parser.parse_args()

    if args.command == "mcp":
        from .server import mcp

        mcp.run()
    elif args.command == "detect":
        _run_detect(args)
    else:
        parser.print_help()
        sys.exit(1)


def _run_detect(args):
    import asyncio
    import json

    from .router import run_detection

    with open(args.file, encoding="utf-8") as f:
        text = f.read()

    result = asyncio.run(run_detection(text, language=args.language))
    print(json.dumps(result.to_dict(), indent=2, ensure_ascii=False))
