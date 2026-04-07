"""Unit tests for tasks.py — TaskQueue + Comments CRUD."""

from __future__ import annotations

import pytest

from musu_core.db import Database
from musu_core.agents import AgentRegistry
from musu_core.tasks import Comment, Task, TaskQueue


@pytest.fixture
def db(tmp_path):
    return Database(str(tmp_path / "test.db"))


@pytest.fixture
def queue(db):
    return TaskQueue(db)


@pytest.fixture
def agent_id(db):
    reg = AgentRegistry(db)
    return reg.create(name="worker", role="engineer").id


def test_create_task_minimal(queue):
    task = queue.create(title="do something")
    assert task.id
    assert task.title == "do something"
    assert task.description == ""
    assert task.status == "todo"
    assert task.priority == "medium"
    assert task.assignee_agent_id is None
    assert task.parent_id is None
    assert task.meta == {}
    assert task.created_at
    assert task.updated_at


def test_create_task_full(queue, agent_id):
    task = queue.create(
        title="ship feature",
        description="implement X",
        priority="high",
        assignee_agent_id=agent_id,
        meta={"source": "paperclip", "ref": "MUS-844"},
    )
    assert task.title == "ship feature"
    assert task.description == "implement X"
    assert task.priority == "high"
    assert task.assignee_agent_id == agent_id
    assert task.meta == {"source": "paperclip", "ref": "MUS-844"}


def test_create_task_with_explicit_id(queue):
    task = queue.create(title="fixed", task_id="tid-001")
    assert task.id == "tid-001"


def test_get_task_roundtrip(queue, agent_id):
    created = queue.create(title="roundtrip", priority="critical", assignee_agent_id=agent_id)
    fetched = queue.get(created.id)
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.title == created.title
    assert fetched.priority == created.priority
    assert fetched.assignee_agent_id == created.assignee_agent_id
    assert fetched.status == created.status


def test_get_task_missing_returns_none(queue):
    assert queue.get("no-such-id") is None


def test_list_tasks_empty(queue):
    assert queue.list() == []


def test_list_tasks(queue):
    queue.create(title="t1")
    queue.create(title="t2")
    tasks = queue.list()
    assert len(tasks) == 2


def test_list_tasks_by_status(queue):
    queue.create(title="todo-task")
    t2 = queue.create(title="done-task")
    queue.update(t2.id, status="done")
    todos = queue.list(status="todo")
    dones = queue.list(status="done")
    assert len(todos) == 1
    assert todos[0].title == "todo-task"
    assert len(dones) == 1
    assert dones[0].title == "done-task"


def test_list_tasks_by_assignee(queue, agent_id):
    queue.create(title="unassigned")
    queue.create(title="assigned", assignee_agent_id=agent_id)
    assigned = queue.list(assignee_agent_id=agent_id)
    assert len(assigned) == 1
    assert assigned[0].title == "assigned"


def test_update_task_title(queue):
    task = queue.create(title="old")
    updated = queue.update(task.id, title="new")
    assert updated is not None
    assert updated.title == "new"
    assert updated.status == task.status  # unchanged


def test_update_task_status(queue):
    task = queue.create(title="work")
    updated = queue.update(task.id, status="in_progress")
    assert updated is not None
    assert updated.status == "in_progress"
    # verify via get
    fetched = queue.get(task.id)
    assert fetched.status == "in_progress"


def test_update_task_priority(queue):
    task = queue.create(title="low-pri")
    updated = queue.update(task.id, priority="critical")
    assert updated.priority == "critical"


def test_update_task_meta(queue):
    task = queue.create(title="meta-task", meta={"k": "v1"})
    updated = queue.update(task.id, meta={"k": "v2", "extra": 42})
    assert updated.meta == {"k": "v2", "extra": 42}


def test_update_task_missing_returns_none(queue):
    assert queue.update("no-such-id", title="x") is None


def test_next_todo_priority_order(queue):
    queue.create(title="low", priority="low")
    queue.create(title="critical", priority="critical")
    queue.create(title="medium", priority="medium")
    next_task = queue.next_todo()
    assert next_task is not None
    assert next_task.priority == "critical"


def test_next_todo_by_assignee(queue, agent_id):
    queue.create(title="unassigned-hi", priority="critical")
    queue.create(title="assigned-med", priority="medium", assignee_agent_id=agent_id)
    next_task = queue.next_todo(assignee_agent_id=agent_id)
    assert next_task is not None
    assert next_task.title == "assigned-med"


def test_next_todo_empty_returns_none(queue):
    assert queue.next_todo() is None


def test_next_todo_no_todo_returns_none(queue):
    t = queue.create(title="done-one")
    queue.update(t.id, status="done")
    assert queue.next_todo() is None


# --- Comments ---

def test_add_and_get_comments(queue):
    task = queue.create(title="commented task")
    c1 = queue.add_comment(task.id, body="first comment")
    c2 = queue.add_comment(task.id, body="second comment")
    comments = queue.get_comments(task.id)
    assert len(comments) == 2
    assert comments[0].body == "first comment"
    assert comments[1].body == "second comment"


def test_add_comment_fields(queue, agent_id):
    task = queue.create(title="task")
    c = queue.add_comment(
        task.id,
        body="agent says hi",
        author_agent_id=agent_id,
        author_kind="agent",
    )
    assert c.id
    assert c.task_id == task.id
    assert c.author_agent_id == agent_id
    assert c.author_kind == "agent"
    assert c.body == "agent says hi"
    assert c.created_at


def test_add_comment_explicit_id(queue):
    task = queue.create(title="t")
    c = queue.add_comment(task.id, body="x", comment_id="cid-001")
    assert c.id == "cid-001"


def test_get_comments_empty(queue):
    task = queue.create(title="silent")
    assert queue.get_comments(task.id) == []


def test_comment_roundtrip(queue):
    task = queue.create(title="roundtrip-comments")
    queue.add_comment(task.id, body="hello", author_kind="user")
    comments = queue.get_comments(task.id)
    assert len(comments) == 1
    c = comments[0]
    assert c.body == "hello"
    assert c.author_kind == "user"
    assert c.task_id == task.id


def test_task_dataclass_fields():
    import dataclasses
    field_names = {f.name for f in dataclasses.fields(Task)}
    expected = {"id", "title", "description", "status", "priority", "assignee_agent_id", "parent_id", "meta", "created_at", "updated_at"}
    assert expected.issubset(field_names)


def test_comment_dataclass_fields():
    import dataclasses
    field_names = {f.name for f in dataclasses.fields(Comment)}
    expected = {"id", "task_id", "author_agent_id", "author_kind", "body", "created_at"}
    assert expected.issubset(field_names)
