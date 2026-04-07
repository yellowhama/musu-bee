"""Unit tests for messages table CRUD — LocalBackend.

Coverage targets:
  - create_message: basic, with model + meta, invalid role
  - get_message: hit, miss
  - list_messages: empty, single session, multi-session isolation,
                   limit, before_id pagination, before_id not found
  - delete_message: hit, miss (idempotent)
  - BackendABC abstract enforcement
  - PaperclipBackend stubs raise NotImplementedError
"""

from __future__ import annotations

import pytest

from musu_core.backends.local import LocalBackend
from musu_core.backends.paperclip import PaperclipBackend


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def local(tmp_path):
    return LocalBackend(str(tmp_path / "test.db"))


# ---------------------------------------------------------------------------
# create_message
# ---------------------------------------------------------------------------


def test_create_message_basic(local):
    msg = local.create_message("sess-1", "user", "hello")
    assert msg["id"]
    assert msg["session_id"] == "sess-1"
    assert msg["role"] == "user"
    assert msg["content"] == "hello"
    assert msg["model"] is None
    assert msg["meta"] == {}
    assert msg["created_at"]


def test_create_message_with_model_and_meta(local):
    msg = local.create_message(
        "sess-2",
        "assistant",
        "hi there",
        model="claude-opus-4-6",
        meta={"tokens": 42},
    )
    assert msg["role"] == "assistant"
    assert msg["model"] == "claude-opus-4-6"
    assert msg["meta"] == {"tokens": 42}


def test_create_message_system_role(local):
    msg = local.create_message("sess-3", "system", "You are a helpful assistant.")
    assert msg["role"] == "system"


def test_create_message_invalid_role_raises(local):
    import sqlite3
    with pytest.raises((sqlite3.IntegrityError, Exception)):
        local.create_message("sess-x", "invalid_role", "bad")


# ---------------------------------------------------------------------------
# get_message
# ---------------------------------------------------------------------------


def test_get_message_hit(local):
    created = local.create_message("sess-1", "user", "ping")
    fetched = local.get_message(created["id"])
    assert fetched is not None
    assert fetched["id"] == created["id"]
    assert fetched["content"] == "ping"


def test_get_message_miss(local):
    assert local.get_message("nonexistent-id") is None


# ---------------------------------------------------------------------------
# list_messages
# ---------------------------------------------------------------------------


def test_list_messages_empty(local):
    assert local.list_messages("no-such-session") == []


def test_list_messages_single_session(local):
    local.create_message("s1", "user", "msg1")
    local.create_message("s1", "assistant", "msg2")
    msgs = local.list_messages("s1")
    assert len(msgs) == 2
    assert msgs[0]["content"] == "msg1"
    assert msgs[1]["content"] == "msg2"


def test_list_messages_session_isolation(local):
    local.create_message("s1", "user", "for s1")
    local.create_message("s2", "user", "for s2")
    assert len(local.list_messages("s1")) == 1
    assert len(local.list_messages("s2")) == 1
    assert local.list_messages("s1")[0]["content"] == "for s1"


def test_list_messages_with_limit(local):
    for i in range(5):
        local.create_message("s1", "user", f"msg{i}")
    msgs = local.list_messages("s1", limit=3)
    assert len(msgs) == 3
    # limit from tail — last 3
    assert msgs[-1]["content"] == "msg4"


def test_list_messages_limit_larger_than_total(local):
    local.create_message("s1", "user", "only one")
    msgs = local.list_messages("s1", limit=10)
    assert len(msgs) == 1


def test_list_messages_before_id(local):
    m1 = local.create_message("s1", "user", "first")
    m2 = local.create_message("s1", "assistant", "second")
    local.create_message("s1", "user", "third")

    # Messages before m2 = only m1
    msgs = local.list_messages("s1", before_id=m2["id"])
    assert len(msgs) == 1
    assert msgs[0]["id"] == m1["id"]


def test_list_messages_before_id_not_found(local):
    local.create_message("s1", "user", "x")
    result = local.list_messages("s1", before_id="ghost-id")
    assert result == []


def test_list_messages_before_id_is_first(local):
    m1 = local.create_message("s1", "user", "first")
    local.create_message("s1", "assistant", "second")
    # Nothing before m1
    assert local.list_messages("s1", before_id=m1["id"]) == []


# ---------------------------------------------------------------------------
# delete_message
# ---------------------------------------------------------------------------


def test_delete_message_hit(local):
    msg = local.create_message("s1", "user", "to delete")
    assert local.delete_message(msg["id"]) is True
    assert local.get_message(msg["id"]) is None


def test_delete_message_miss(local):
    assert local.delete_message("ghost-id") is False


def test_delete_message_idempotent(local):
    msg = local.create_message("s1", "user", "once")
    assert local.delete_message(msg["id"]) is True
    assert local.delete_message(msg["id"]) is False


def test_delete_message_only_removes_target(local):
    m1 = local.create_message("s1", "user", "keep")
    m2 = local.create_message("s1", "assistant", "remove")
    local.delete_message(m2["id"])
    assert local.get_message(m1["id"]) is not None
    assert local.get_message(m2["id"]) is None


# ---------------------------------------------------------------------------
# PaperclipBackend stubs raise NotImplementedError
# ---------------------------------------------------------------------------


@pytest.fixture
def pc():
    return PaperclipBackend(api_url="http://x", api_key="k", company_id="c")


def test_paperclip_create_message_raises(pc):
    with pytest.raises(NotImplementedError):
        pc.create_message("s", "user", "hi")


def test_paperclip_get_message_raises(pc):
    with pytest.raises(NotImplementedError):
        pc.get_message("id")


def test_paperclip_list_messages_raises(pc):
    with pytest.raises(NotImplementedError):
        pc.list_messages("s")


def test_paperclip_delete_message_raises(pc):
    with pytest.raises(NotImplementedError):
        pc.delete_message("id")
