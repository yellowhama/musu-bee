#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import http.server
import json
import socket
import socketserver
import threading
import time
import urllib.request
from pathlib import Path


ROOT = Path("/home/hugh51/musu-functions")
OUT = Path("/home/hugh51/musu-functions/MUSU-WORKS/VIEWER_SMOKE_PROOF_2026-04-01.md")
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url) as response:  # nosec - local only
        return json.load(response)


def fetch_status(url: str) -> int:
    with urllib.request.urlopen(url) as response:  # nosec - local only
        return response.status


def find_free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main() -> None:
    port = find_free_port()
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        time.sleep(0.2)
        try:
            page_status = fetch_status(f"http://127.0.0.1:{port}/viewer/")
            js_status = fetch_status(f"http://127.0.0.1:{port}/viewer/app.js")
            css_status = fetch_status(f"http://127.0.0.1:{port}/viewer/styles.css")
            company = fetch_json(f"http://127.0.0.1:{port}/MUSU-WORKS/mock/company_alpha.json")
            roles = fetch_json(f"http://127.0.0.1:{port}/MUSU-WORKS/mock/role_templates_alpha.json")
            attachments = fetch_json(f"http://127.0.0.1:{port}/MUSU-WORKS/mock/agent_attachments_alpha.json")
        finally:
            with contextlib.suppress(Exception):
                httpd.shutdown()
            thread.join(timeout=1)

    project_count = len(attachments["projects"])
    session_count = sum(len(project["sessions"]) for project in attachments["projects"])
    role_count = len(roles["role_templates"])

    OUT.write_text(
        "\n".join(
            [
                "# Viewer Smoke Proof",
                "",
                "작성일: 2026-04-01",
                "",
                f"- local smoke port: {port}",
                f"- `/viewer/`: {page_status}",
                f"- `/viewer/app.js`: {js_status}",
                f"- `/viewer/styles.css`: {css_status}",
                f"- company name: {company['name']}",
                f"- role template count: {role_count}",
                f"- attachment project count: {project_count}",
                f"- live session count: {session_count}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
