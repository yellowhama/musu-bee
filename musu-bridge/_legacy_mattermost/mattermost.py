"""Mattermost REST API client (v4)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class MattermostClient:
    """Thin wrapper around Mattermost REST API v4."""

    def __init__(self, url: str, token: str | None = None) -> None:
        self.url = url.rstrip("/")
        self._token = token
        self._client = httpx.Client(
            base_url=f"{self.url}/api/v4",
            timeout=15.0,
        )

    def _headers(self) -> dict[str, str]:
        if self._token:
            return {"Authorization": f"Bearer {self._token}"}
        return {}

    def login(self, email: str, password: str) -> str:
        """Login and return user token."""
        resp = self._client.post(
            "/users/login",
            json={"login_id": email, "password": password},
        )
        resp.raise_for_status()
        token = resp.headers.get("Token", "")
        self._token = token
        return token

    def get_user(self, user_id: str = "me") -> dict[str, Any]:
        resp = self._client.get(f"/users/{user_id}", headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def get_team_by_name(self, name: str) -> dict[str, Any]:
        resp = self._client.get(f"/teams/name/{name}", headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def create_team(self, name: str, display_name: str) -> dict[str, Any]:
        resp = self._client.post(
            "/teams",
            headers=self._headers(),
            json={"name": name, "display_name": display_name, "type": "O"},
        )
        resp.raise_for_status()
        return resp.json()

    def get_channel_by_name(self, team_id: str, channel_name: str) -> dict[str, Any] | None:
        resp = self._client.get(
            f"/teams/{team_id}/channels/name/{channel_name}",
            headers=self._headers(),
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def create_channel(
        self, team_id: str, name: str, display_name: str, purpose: str = ""
    ) -> dict[str, Any]:
        resp = self._client.post(
            "/channels",
            headers=self._headers(),
            json={
                "team_id": team_id,
                "name": name,
                "display_name": display_name,
                "purpose": purpose,
                "type": "O",
            },
        )
        resp.raise_for_status()
        return resp.json()

    def create_bot(self, username: str, display_name: str, description: str = "") -> dict[str, Any]:
        resp = self._client.post(
            "/bots",
            headers=self._headers(),
            json={
                "username": username,
                "display_name": display_name,
                "description": description,
            },
        )
        resp.raise_for_status()
        return resp.json()

    def get_bot_by_username(self, username: str) -> dict[str, Any] | None:
        resp = self._client.get("/bots", headers=self._headers())
        resp.raise_for_status()
        for bot in resp.json():
            if bot["username"] == username:
                return bot
        return None

    def create_user_access_token(self, user_id: str, description: str) -> dict[str, Any]:
        resp = self._client.post(
            f"/users/{user_id}/tokens",
            headers=self._headers(),
            json={"description": description},
        )
        resp.raise_for_status()
        return resp.json()

    def create_outgoing_webhook(
        self,
        team_id: str,
        channel_id: str,
        display_name: str,
        trigger_words: list[str],
        callback_urls: list[str],
        trigger_when: int = 0,
    ) -> dict[str, Any]:
        resp = self._client.post(
            "/hooks/outgoing",
            headers=self._headers(),
            json={
                "team_id": team_id,
                "channel_id": channel_id,
                "display_name": display_name,
                "trigger_words": trigger_words,
                "callback_urls": callback_urls,
                "content_type": "application/json",
                "trigger_when": trigger_when,
            },
        )
        resp.raise_for_status()
        return resp.json()

    def list_outgoing_webhooks(self, team_id: str) -> list[dict[str, Any]]:
        resp = self._client.get(
            f"/hooks/outgoing?team_id={team_id}", headers=self._headers()
        )
        resp.raise_for_status()
        return resp.json()

    def post_message(
        self, channel_id: str, message: str, token: str | None = None
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {token or self._token}"}
        resp = self._client.post(
            "/posts",
            headers=headers,
            json={"channel_id": channel_id, "message": message},
        )
        resp.raise_for_status()
        return resp.json()

    def add_user_to_team(self, team_id: str, user_id: str) -> dict[str, Any]:
        resp = self._client.post(
            f"/teams/{team_id}/members",
            headers=self._headers(),
            json={"team_id": team_id, "user_id": user_id},
        )
        resp.raise_for_status()
        return resp.json()

    def add_user_to_channel(self, channel_id: str, user_id: str) -> dict[str, Any]:
        resp = self._client.post(
            f"/channels/{channel_id}/members",
            headers=self._headers(),
            json={"user_id": user_id},
        )
        resp.raise_for_status()
        return resp.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "MattermostClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()
