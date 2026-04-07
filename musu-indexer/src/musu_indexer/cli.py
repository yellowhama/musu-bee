import argparse
import os
from pathlib import Path

from .core import (
    cleanup_snapshots,
    get_recent,
    get_recent_runs,
    get_snapshot_context_exact,
    log_activity,
    reconcile_index,
    result_has_error,
    search_index,
    sync_bottom_up,
    sync_core,
)
from .workspace import resolve_workspace


def _add_workspace_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--root",
        type=str,
        help="Explicit workspace root. Overrides git/cwd discovery.",
    )
    parser.add_argument(
        "--profile",
        type=str,
        help="Path to a .musu-indexer.json workspace profile.",
    )


def _resolve_cli_workspace(args) -> object:
    return resolve_workspace(
        root_override=getattr(args, "root", None),
        profile_path=getattr(args, "profile", None),
    )


def _lazy_load_mcp() -> object:
    try:
        from .server import mcp
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "MCP runtime is not installed. Install with 'pip install .[mcp]' or run "
            "local commands like sync/search/log without the 'mcp' subcommand."
        ) from exc
    return mcp


def _lazy_load_watcher():
    try:
        from .watcher import start_watcher
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Watcher runtime is not installed. Install with 'pip install .[watch]' to use "
            "'musu-indexer watch'."
        ) from exc
    return start_watcher


def _lazy_load_spy():
    from .spy_sink import start_spy_logging

    return start_spy_logging


def _lazy_load_session_manager():
    from .session_manager import manager

    return manager


def _resolve_session_log_sources(manager, session_id: str) -> list[str]:
    info = manager.get_session_info(session_id)
    if info:
        return [f"{info['type']}:{session_id}"]
    return [f"pty:{session_id}", f"spy:{session_id}"]


def _print_result_and_exit(result: str) -> None:
    print(result)
    if result_has_error(result):
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Musu Indexer: High-performance codebase indexer and MCP server"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    sync_parser = subparsers.add_parser("sync", help="Standard incremental sync")
    sync_parser.add_argument(
        "--scope",
        type=str,
        default="all",
        choices=["all", "code", "doc"],
        help="Scope of the sync",
    )
    _add_workspace_args(sync_parser)

    map_parser = subparsers.add_parser(
        "sync-map", help="Deep-first bottom-up sync strategy for massive projects"
    )
    map_parser.add_argument(
        "--scope",
        type=str,
        default="all",
        choices=["all", "code", "doc"],
        help="Scope of the sync",
    )
    _add_workspace_args(map_parser)

    spy_parser = subparsers.add_parser(
        "spy", help="Start the mechanical chat logger for a specific window"
    )
    spy_parser.add_argument("window", type=str, help="Window title keyword to watch")
    _add_workspace_args(spy_parser)

    session_parser = subparsers.add_parser(
        "session", help="Manage stateful PTY/Spy sessions"
    )
    _add_workspace_args(session_parser)
    session_sub = session_parser.add_subparsers(dest="subcommand", help="Session actions")

    s_start = session_sub.add_parser("start", help="Spawn a new session")
    s_start.add_argument("type", choices=["pty", "spy"], help="Type of session")
    s_start.add_argument("cmd", nargs="+", help="Command and arguments to run")
    s_start.add_argument("--id", type=str, help="Optional custom session ID")
    _add_workspace_args(s_start)

    s_list = session_sub.add_parser("list", help="List all active sessions")
    _add_workspace_args(s_list)

    s_status = session_sub.add_parser("status", help="Show one session in detail")
    s_status.add_argument("id", type=str, help="Session ID")
    _add_workspace_args(s_status)

    s_stop = session_sub.add_parser("stop", help="Terminate a session")
    s_stop.add_argument("id", type=str, help="Session ID to stop")
    _add_workspace_args(s_stop)

    s_write = session_sub.add_parser("write", help="Send input to a session")
    s_write.add_argument("id", type=str, help="Session ID")
    s_write.add_argument("text", type=str, help="Text to send")
    _add_workspace_args(s_write)

    s_logs = session_sub.add_parser("logs", help="Show recent logs for a session")
    s_logs.add_argument("id", type=str, help="Session ID")
    s_logs.add_argument("--limit", type=int, default=20, help="Number of lines")
    _add_workspace_args(s_logs)

    s_history = session_sub.add_parser(
        "history", help="Show persisted recent session history"
    )
    s_history.add_argument("--limit", type=int, default=10, help="Number of rows")
    _add_workspace_args(s_history)

    s_cleanup = session_sub.add_parser(
        "cleanup", help="Stop stale sessions older than the timeout"
    )
    s_cleanup.add_argument(
        "--timeout-seconds",
        type=int,
        default=3600,
        help="Idle timeout before a session is considered stale",
    )
    _add_workspace_args(s_cleanup)

    s_cleanup_history = session_sub.add_parser(
        "cleanup-history", help="Delete old completed session history rows"
    )
    s_cleanup_history.add_argument(
        "--hours",
        type=int,
        default=168,
        help="Delete completed session rows older than this many hours",
    )
    _add_workspace_args(s_cleanup_history)

    mcp_parser = subparsers.add_parser("mcp", help="Run the MCP server (stdio mode)")
    _add_workspace_args(mcp_parser)

    watch_parser = subparsers.add_parser("watch", help="Start the Auto-Ingest Daemon")
    watch_parser.add_argument("--debounce", type=int, default=2, help="Debounce time in seconds")
    _add_workspace_args(watch_parser)

    search_parser = subparsers.add_parser("search", help="Search the codebase")
    search_parser.add_argument("query", type=str, help="Search query")
    search_parser.add_argument("--limit", type=int, default=15, help="Max results")
    search_parser.add_argument("--exclude", nargs="+", help="Exclude glob patterns")
    search_parser.add_argument(
        "--scope",
        type=str,
        default="all",
        choices=["all", "code", "doc"],
        help="Filter search results by scope",
    )
    _add_workspace_args(search_parser)

    recent_parser = subparsers.add_parser("recent", help="View recent files")
    recent_parser.add_argument("--limit", type=int, default=10, help="Max results")
    _add_workspace_args(recent_parser)

    log_parser = subparsers.add_parser("log", help="Log an activity")
    log_parser.add_argument("message", type=str, help="Activity description")
    _add_workspace_args(log_parser)

    cleanup_parser = subparsers.add_parser(
        "cleanup", help="Reconcile stale DB rows against the workspace"
    )
    cleanup_parser.add_argument(
        "--scope",
        type=str,
        default="all",
        choices=["all", "code", "doc"],
        help="Scope of the cleanup",
    )
    cleanup_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report stale rows without deleting them",
    )
    _add_workspace_args(cleanup_parser)

    runs_parser = subparsers.add_parser("runs", help="Show recent sync/cleanup runs")
    runs_parser.add_argument("--limit", type=int, default=10, help="Max results")
    _add_workspace_args(runs_parser)

    snapshot_cleanup = subparsers.add_parser(
        "cleanup-snapshots", help="Purge old raw snapshots"
    )
    snapshot_cleanup.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Delete raw snapshots older than this many hours",
    )
    _add_workspace_args(snapshot_cleanup)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return

    if args.command == "mcp":
        if args.root:
            os.environ["MUSU_INDEXER_ROOT"] = str(Path(args.root).expanduser().resolve())
        if args.profile:
            os.environ["MUSU_INDEXER_PROFILE"] = str(
                Path(args.profile).expanduser().resolve()
            )
        _lazy_load_mcp().run()
        return

    workspace = _resolve_cli_workspace(args)
    project_root = workspace.root

    if args.command == "sync":
        _print_result_and_exit(sync_core(project_root, scope=args.scope, workspace=workspace))
        return

    if args.command == "sync-map":
        _print_result_and_exit(
            sync_bottom_up(project_root, scope=args.scope, workspace=workspace)
        )
        return

    if args.command == "session":
        manager = _lazy_load_session_manager()
        if args.subcommand == "start":
            sid = manager.create_session(
                args.type,
                args.cmd[0],
                args.cmd[1:],
                project_root,
                custom_id=args.id,
            )
            manager.wait_for_settle(sid, timeout_seconds=0.5)
            print(f"✅ Session started: {sid}")
            return
        if args.subcommand == "list":
            sessions = manager.list_active_sessions()
            if not sessions:
                print("No active sessions.")
            else:
                print(
                    f"{'ID':<10} | {'TYPE':<10} | {'STATUS':<10} | {'IDLE(s)':<8} | {'LAST ACTIVITY'}"
                )
                print("-" * 90)
                for session in sessions:
                    status = "Running" if session["running"] else "Stopped"
                    print(
                        f"{session['id']:<10} | {session['type']:<10} | "
                        f"{status:<10} | {session['idle_seconds']:<8} | {session['last_activity']}"
                    )
            return
        if args.subcommand == "status":
            session = manager.get_session_status(args.id, project_root=project_root)
            if not session:
                print(f"❌ Session {args.id} not found.")
            else:
                for key, value in session.items():
                    print(f"{key}: {value}")
            return
        if args.subcommand == "stop":
            stopped = manager.stop_session(args.id)
            if stopped:
                print(f"🛑 Session {args.id} stopped.")
            else:
                print(f"❌ Session {args.id} not found.")
            return
        if args.subcommand == "write":
            session = manager.get_session(args.id)
            if session:
                session.write(args.text)
                print(f"⌨️  Sent to {args.id}: {args.text}")
            else:
                print(f"❌ Session {args.id} not found.")
            return
        if args.subcommand == "logs":
            results = get_snapshot_context_exact(
                project_root,
                _resolve_session_log_sources(manager, args.id),
                limit=args.limit,
            )
            if not results:
                print("No logs found.")
            else:
                for row in reversed(results):
                    print(f"[{row['timestamp']}] {row['content']}")
            return
        if args.subcommand == "history":
            history = manager.get_session_history(project_root, limit=args.limit)
            if not history:
                print("No session history.")
            else:
                print(
                    f"{'ID':<10} | {'TYPE':<6} | {'STATUS':<10} | {'EXIT':<5} | {'STARTED'}"
                )
                print("-" * 80)
                for session in history:
                    exit_code = (
                        str(session["exit_code"])
                        if session["exit_code"] is not None
                        else "-"
                    )
                    print(
                        f"{session['id']:<10} | {session['type']:<6} | "
                        f"{session['status']:<10} | {exit_code:<5} | {session['started_at']}"
                    )
            return
        if args.subcommand == "cleanup":
            removed = manager.cleanup_stale_sessions(
                timeout_seconds=args.timeout_seconds
            )
            if not removed:
                print("No stale sessions found.")
            else:
                print("Removed stale sessions:")
                for session_id in removed:
                    print(f"- {session_id}")
            return
        if args.subcommand == "cleanup-history":
            deleted = manager.cleanup_session_history(project_root, hours=args.hours)
            print(
                f"Deleted {deleted} completed session history rows older than {args.hours} hours."
            )
            return
        session_parser.print_help()
        return

    if args.command == "spy":
        _lazy_load_spy()(project_root, args.window)
        return

    if args.command == "watch":
        _lazy_load_watcher()(project_root, debounce_seconds=args.debounce, workspace=workspace)
        return

    if args.command == "search":
        results = search_index(
            project_root,
            args.query,
            limit=args.limit,
            exclude_patterns=args.exclude,
            workspace=workspace,
            scope=args.scope,
        )
        for row in results:
            print(
                f"[{row['type'].upper()}/{row['category'].upper()}] "
                f"{row['path']} > {row['title']}\n  score={row['score']} ...{row['snippet']}..."
            )
        return

    if args.command == "recent":
        results = get_recent(project_root, limit=args.limit, workspace=workspace)
        for row in results:
            print(f"[{row['category'].upper()}] {row['path']} ({row['modified']})")
        return

    if args.command == "log":
        log_activity(project_root, args.message)
        print(f"✅ Logged: {args.message}")
        return

    if args.command == "cleanup":
        print(
            reconcile_index(
                project_root,
                scope=args.scope,
                workspace=workspace,
                dry_run=args.dry_run,
            )
        )
        return

    if args.command == "runs":
        runs = get_recent_runs(project_root, limit=args.limit)
        if not runs:
            print("No sync runs recorded.")
        else:
            for run in runs:
                print(
                    f"[{run['status'].upper()}] {run['mode']} scope={run['scope']} "
                    f"workspace={run['workspace_name']} scanned={run['scanned_rows']} "
                    f"changed={run['changed_rows']} reused={run['reused_rows']} "
                    f"deleted={run['deleted_rows']} duration_ms={run['duration_ms']} "
                    f"started_at={run['started_at']} notes={run['notes']}"
                )
        return

    if args.command == "cleanup-snapshots":
        deleted = cleanup_snapshots(project_root, hours=args.hours)
        print(f"Deleted {deleted} raw snapshots older than {args.hours} hours.")


if __name__ == "__main__":
    main()
