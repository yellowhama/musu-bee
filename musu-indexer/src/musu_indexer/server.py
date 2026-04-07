from pathlib import Path

from .core import (
    cleanup_snapshots,
    find_project_root,
    get_recent,
    get_recent_runs,
    get_snapshot_context_exact,
    get_spy_context,
    log_activity,
    reconcile_index,
    result_has_error,
    search_index,
    sync_core,
)
from .session_manager import manager
from .workspace import resolve_workspace

try:
    from mcp.server.fastmcp import FastMCP
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "MCP runtime is not installed. Install the 'mcp' package to run "
        "'musu-indexer mcp'."
    ) from exc


mcp = FastMCP("Musu Indexer MCP")


def _current_workspace():
    return resolve_workspace()


@mcp.tool()
async def get_spy_logs(window_keyword: str, limit: int = 5) -> str:
    """
    Retrieve recently captured raw text from an external window (mechanical logs).
    Use this to understand the current state of a chat or external tool.
    """
    workspace = _current_workspace()
    project_root = workspace.root
    try:
        results = get_spy_context(project_root, window_keyword, limit=limit)
        if not results:
            return f"No spy logs found for window matching: '{window_keyword}'."

        output = [f"Found {len(results)} recent snapshots for '{window_keyword}':"]
        for r in results:
            output.append(f"--- Timestamp: {r['timestamp']} ---\n{r['content']}\n")
        return "\n".join(output)
    except Exception as e:
        return f"Database error. ({e})"


@mcp.tool()
async def acp_spawn_session(
    session_type: str, command: str, args: list[str] = None
) -> str:
    """
    Spawn a new stateful session (pty or spy).
    Returns the session ID which must be used for interaction.
    """
    workspace = _current_workspace()
    project_root = workspace.root
    args = args or []
    try:
        sid = manager.create_session(session_type, command, args, project_root)
        return f"Session spawned successfully. ID: {sid}"
    except Exception as e:
        return f"Failed to spawn session: {e}"


@mcp.tool()
async def acp_interact(session_id: str, input_text: str) -> str:
    """
    Send keyboard input to an active PTY session.
    """
    session = manager.get_session(session_id)
    if not session:
        return f"Session {session_id} not found."

    try:
        session.write(input_text)
        return f"Input sent to session {session_id}."
    except Exception as e:
        return f"Failed to send input: {e}"


@mcp.tool()
async def acp_list_sessions() -> str:
    """
    List all active stateful sessions currently managed by Musu.
    """
    sessions = manager.list_active_sessions()
    if not sessions:
        return "No active sessions."

    output = ["Active Sessions:"]
    for s in sessions:
        output.append(
            f"- ID: {s['id']}, Type: {s['type']}, Status: {'Running' if s['running'] else 'Stopped'}"
        )
    return "\n".join(output)


@mcp.tool()
async def session_list() -> str:
    """Alias for listing active sessions using CLI-aligned naming."""
    return await acp_list_sessions()


@mcp.tool()
async def acp_read_logs(session_id: str, limit: int = 10) -> str:
    """
    Read the latest output logs from a specific session.
    """
    workspace = _current_workspace()
    project_root = workspace.root
    try:
        info = manager.get_session_info(session_id)
        sources = [f"{info['type']}:{session_id}"] if info else [
            f"pty:{session_id}",
            f"spy:{session_id}",
        ]
        results = get_snapshot_context_exact(project_root, sources, limit=limit)

        if not results:
            return f"No logs found for session {session_id}."

        output = [f"Recent logs for {session_id}:"]
        for r in reversed(results):
            output.append(f"[{r['timestamp']}] {r['content']}")
        return "\n".join(output)
    except Exception as e:
        return f"Error reading logs: {e}"


@mcp.tool()
async def session_logs(session_id: str, limit: int = 10) -> str:
    """Alias for reading session logs using CLI-aligned naming."""
    return await acp_read_logs(session_id, limit=limit)


@mcp.tool()
async def session_status(session_id: str) -> str:
    """Return detailed metadata for a session."""
    workspace = _current_workspace()
    info = manager.get_session_status(session_id, project_root=workspace.root)
    if not info:
        return f"Session {session_id} not found."
    return "\n".join(f"{key}: {value}" for key, value in info.items())


@mcp.tool()
async def session_start(session_type: str, command: str, args: list[str] = None) -> str:
    """CLI-aligned alias for creating a new session."""
    return await acp_spawn_session(session_type, command, args=args)


@mcp.tool()
async def session_write(session_id: str, input_text: str) -> str:
    """CLI-aligned alias for writing to a session."""
    return await acp_interact(session_id, input_text)


@mcp.tool()
async def session_stop(session_id: str) -> str:
    """CLI-aligned alias for stopping a session."""
    stopped = manager.stop_session(session_id)
    return f"Stopped {session_id}." if stopped else f"Session {session_id} not found."


@mcp.tool()
async def session_cleanup(timeout_seconds: int = 3600) -> str:
    """Stop stale sessions older than the timeout."""
    removed = manager.cleanup_stale_sessions(timeout_seconds=timeout_seconds)
    if not removed:
        return "No stale sessions found."
    return "Removed stale sessions:\n" + "\n".join(f"- {sid}" for sid in removed)


@mcp.tool()
async def session_history(limit: int = 10) -> str:
    """Show persisted recent session history, including completed sessions."""
    workspace = _current_workspace()
    history = manager.get_session_history(workspace.root, limit=limit)
    if not history:
        return "No session history."
    output = ["Recent session history:"]
    for session in history:
        output.append(
            f"- ID: {session['id']}, Type: {session['type']}, Status: {session['status']}, "
            f"Exit: {session['exit_code']}, Started: {session['started_at']}"
        )
    return "\n".join(output)


@mcp.tool()
async def session_cleanup_history(hours: int = 168) -> str:
    """Delete old completed session history rows."""
    workspace = _current_workspace()
    deleted = manager.cleanup_session_history(workspace.root, hours=hours)
    return f"Deleted {deleted} completed session history rows older than {hours} hours."


@mcp.tool()
async def sync_workspace(scope: str = "all") -> str:
    """
    Synchronize the local SQLite database with the current file system state.
    """
    workspace = _current_workspace()
    project_root = workspace.root
    try:
        result = sync_core(project_root, scope=scope, workspace=workspace)
        if result_has_error(result):
            return f"Error syncing workspace: {result}"
        return result
    except Exception as e:
        return f"Error syncing workspace: {e}"


@mcp.tool()
async def search_codebase(
    query: str, limit: int = 15, exclude: list[str] = None, scope: str = "all"
) -> str:
    """
    Search the project codebase using smart weighted FTS5.
    """
    workspace = _current_workspace()
    project_root = workspace.root
    try:
        results = search_index(
            project_root,
            query,
            limit=limit,
            exclude_patterns=exclude,
            workspace=workspace,
            scope=scope,
        )
        if not results:
            return f"No results found for '{query}'."

        output = [f"Found {len(results)} matches for '{query}':"]
        for r in results:
            output.append(
                f"[{r['type'].upper()}/{r['category'].upper()}] {r['path']} > {r['title']}\n"
                f"  score={r['score']} ...{r['snippet']}..."
            )
        return "\n".join(output)
    except Exception as e:
        return f"Database error. ({e})"


@mcp.tool()
async def get_sync_runs(limit: int = 10) -> str:
    """Show recent sync/cleanup runs with timing and row-count evidence."""
    workspace = _current_workspace()
    runs = get_recent_runs(workspace.root, limit=limit)
    if not runs:
        return "No sync runs recorded."
    output = ["Recent sync runs:"]
    for run in runs:
        output.append(
            f"- [{run['status'].upper()}] {run['mode']} scope={run['scope']} "
            f"workspace={run['workspace_name']} scanned={run['scanned_rows']} "
            f"changed={run['changed_rows']} reused={run['reused_rows']} "
            f"deleted={run['deleted_rows']} duration_ms={run['duration_ms']} "
            f"started_at={run['started_at']} notes={run['notes']}"
        )
    return "\n".join(output)


@mcp.tool()
async def cleanup_workspace(scope: str = "all", dry_run: bool = True) -> str:
    """Reconcile stale rows that are missing on disk or outside the workspace."""
    workspace = _current_workspace()
    return reconcile_index(
        workspace.root, scope=scope, workspace=workspace, dry_run=dry_run
    )


@mcp.tool()
async def cleanup_snapshot_logs(hours: int = 24) -> str:
    """Purge raw snapshots older than the specified retention window."""
    workspace = _current_workspace()
    deleted = cleanup_snapshots(workspace.root, hours=hours)
    return f"Deleted {deleted} raw snapshots older than {hours} hours."


def main():
    """Entry point for the MCP server."""
    workspace = _current_workspace()
    find_project_root(
        start_path=str(Path.cwd()),
        root_override=str(workspace.root),
        profile_path=str(workspace.profile_path) if workspace.profile_path else None,
    )
    mcp.run()


if __name__ == "__main__":
    main()
