"""CLI entry point for musu-writer."""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(
        prog="musu-writer",
        description="Fiction writing pipeline MCP tools",
    )
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("mcp", help="Run MCP server (stdio mode)")

    args = parser.parse_args()

    if args.command == "mcp":
        from .server import mcp

        mcp.run()
    else:
        parser.print_help()
        sys.exit(1)
