#!/usr/bin/env python3
"""Idempotent Mattermost setup: 6 bots + 6 channels + outgoing webhooks.

Run after `docker compose up` and Mattermost is reachable at MM_URL.
Writes bot tokens back to .env for the bridge server to pick up.
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv, set_key

from config import BridgeConfig, get_config
from mattermost import MattermostClient

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

ENV_PATH = Path(__file__).parent / ".env"

BOTS = [
    ("ceo-bot",    "CEO Bot",    "musu CEO agent"),
    ("cto-bot",    "CTO Bot",    "musu CTO agent"),
    ("eng-bot",    "Eng Bot",    "musu Engineer agent"),
    ("cos-bot",    "CoS Bot",    "musu Chief of Staff agent"),
    ("qa-bot",     "QA Bot",     "musu QA agent"),
    ("worker-bot", "Worker Bot", "musu Worker agent"),
]

CHANNELS = [
    ("ceo",      "CEO",      "CEO 에이전트 채널"),
    ("cto",      "CTO",      "CTO 에이전트 채널"),
    ("engineer", "Engineer", "Engineer 에이전트 채널"),
    ("cos",      "CoS",      "Chief of Staff 채널"),
    ("qa",       "QA",       "QA 에이전트 채널"),
    ("worker",   "Worker",   "Worker 에이전트 채널"),
    ("musu-board",  "Musu Board",  "전체 공유 공지 채널"),
    ("musu-status", "Musu Status", "자동 상태 업데이트 채널"),
]

# channel_name → bot_username that handles it
CHANNEL_BOT = {
    "ceo":      "ceo-bot",
    "cto":      "cto-bot",
    "engineer": "eng-bot",
    "cos":      "cos-bot",
    "qa":       "qa-bot",
    "worker":   "worker-bot",
}


def _ensure_env_file() -> None:
    if not ENV_PATH.exists():
        example = Path(__file__).parent / ".env.example"
        if example.exists():
            ENV_PATH.write_text(example.read_text())
        else:
            ENV_PATH.touch()


def setup(cfg: BridgeConfig) -> None:
    _ensure_env_file()

    with MattermostClient(cfg.mm_url) as mm:
        logger.info("Logging in as admin …")
        mm.login(cfg.mm_admin_email, cfg.mm_admin_password)

        # Team
        try:
            team = mm.get_team_by_name(cfg.mm_team_name)
            logger.info(f"Team '{cfg.mm_team_name}' already exists (id={team['id']})")
        except Exception:
            team = mm.create_team(cfg.mm_team_name, "MUSU")
            logger.info(f"Created team '{cfg.mm_team_name}' (id={team['id']})")
        team_id = team["id"]

        # Channels
        channel_ids: dict[str, str] = {}
        for name, display, purpose in CHANNELS:
            existing = mm.get_channel_by_name(team_id, name)
            if existing:
                logger.info(f"Channel #{name} already exists")
                channel_ids[name] = existing["id"]
            else:
                ch = mm.create_channel(team_id, name, display, purpose)
                logger.info(f"Created channel #{name} (id={ch['id']})")
                channel_ids[name] = ch["id"]

        # Bots + tokens
        bot_user_ids: dict[str, str] = {}
        for username, display_name, description in BOTS:
            existing = mm.get_bot_by_username(username)
            if existing:
                logger.info(f"Bot @{username} already exists")
                bot_user_id = existing["user_id"]
            else:
                bot = mm.create_bot(username, display_name, description)
                logger.info(f"Created bot @{username} (user_id={bot['user_id']})")
                bot_user_id = bot["user_id"]
            bot_user_ids[username] = bot_user_id

            # Create a token for the bot (idempotent: always create new token)
            token_data = mm.create_user_access_token(bot_user_id, f"{username}-bridge-token")
            token = token_data["token"]
            # Map bot username to config key: ceo-bot→CEO, eng-bot→ENG, etc.
            short_key = username.replace("-bot", "").upper()
            env_key = f"BOT_TOKEN_{short_key}"
            set_key(str(ENV_PATH), env_key, token)
            logger.info(f"Wrote {env_key} to .env")

            # Add bot to team first, then to its channel
            try:
                mm.add_user_to_team(team_id, bot_user_id)
                logger.info(f"Added @{username} to team")
            except Exception:
                pass  # already a team member

            short = username.replace("-bot", "")
            ch_name = short if short != "eng" else "engineer"
            if ch_name in channel_ids:
                try:
                    mm.add_user_to_channel(channel_ids[ch_name], bot_user_id)
                    logger.info(f"Added @{username} to #{ch_name}")
                except Exception:
                    pass  # already member

        # Outgoing webhooks (one per agent channel)
        existing_hooks = mm.list_outgoing_webhooks(team_id)
        existing_hook_channels = {h["channel_id"] for h in existing_hooks}
        # Use host.docker.internal so Mattermost container can reach the bridge on the host
        bridge_host = os.getenv("BRIDGE_CALLBACK_HOST", "host.docker.internal")
        bridge_url = f"http://{bridge_host}:{cfg.bridge_port}/hooks/mattermost"

        for ch_name, bot_username in CHANNEL_BOT.items():
            ch_id = channel_ids.get(ch_name)
            if not ch_id:
                continue
            if ch_id in existing_hook_channels:
                logger.info(f"Webhook for #{ch_name} already exists")
                continue
            mm.create_outgoing_webhook(
                team_id=team_id,
                channel_id=ch_id,
                display_name=f"musu-bridge → {ch_name}",
                # trigger_when=1 means "fire when first word does NOT match"
                # with a never-matching word, this fires on ALL messages
                trigger_words=["__never_match__"],
                callback_urls=[bridge_url],
                trigger_when=1,
            )
            logger.info(f"Created outgoing webhook for #{ch_name} → {bridge_url}")

    logger.info("Setup complete. Reload .env before starting the bridge server.")


if __name__ == "__main__":
    load_dotenv(ENV_PATH)
    cfg = get_config()
    setup(cfg)
