//! POST /api/system/update — trigger an `musu auto-update` background run.
//!
//! wiki/496 D10 (recalibration) + F2. Replaces the Python-era
//! `system_routes.py:467-475` `sh -c systemctl --user restart` hack with
//! a proper bridge-resident handler that spawns `musu auto-update` as a
//! fully-detached subprocess. The bridge does NOT block on the result;
//! it captures the spawned PID, writes a `~/.musu/system-update.pid`
//! marker, and returns 202 Accepted.
//!
//! S5: this endpoint sits behind the same `require_bearer` middleware as
//! every other `/api/*` route — no separate gate. A non-authenticated
//! caller cannot trigger auto-update remotely.

use std::process::Stdio;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::json;

use crate::bridge::AppState;

/// The PID-marker filename written to ~/.musu/ when we spawn auto-update.
const PID_MARKER_FILENAME: &str = "system-update.pid";

pub async fn post_system_update(State(_state): State<AppState>) -> impl IntoResponse {
    let home = match resolve_musu_home() {
        Ok(h) => h,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "ok": false,
                    "error": format!("cannot resolve musu home: {e}")
                })),
            );
        }
    };

    let musu_bin = home.join("bin").join(musu_binary_name());
    let exe = if musu_bin.exists() {
        musu_bin
    } else {
        // Fall back to the running binary's path so dev/non-installed
        // setups still work for testing.
        match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({
                        "ok": false,
                        "error": format!("cannot resolve musu binary: {e}")
                    })),
                );
            }
        }
    };

    // D10: spawn detached with no inherited fds / console.
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("auto-update");
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // R6 audit-fix (Auditor B QB4 — endpoint-auth HIGH):
        // pre_exec runs in the forked child between fork() and execve().
        // setsid() is async-signal-safe (POSIX). After detaching the
        // session, we MUST also close all inherited fds 3..N so the
        // detached child doesn't pin the bridge's :8070 TCP listener
        // (or any sqlite connection / log file / IPC socket the parent
        // has open). Without this, when auto-update later rebinds :8070
        // it gets EADDRINUSE from the lingering child fd.
        //
        // Stdio::null on cmd already replaces fds 0/1/2 with /dev/null;
        // we start from fd 3.
        //
        // SAFETY: setsid() is async-signal-safe. close() is also
        // async-signal-safe; closing already-closed or invalid fds is a
        // no-op with errno=EBADF which we ignore. We close fds up to a
        // conservative cap (256) which is well above the bridge's
        // working-set (sqlx pool + listener + a few tracing handles).
        unsafe {
            cmd.pre_exec(|| {
                // New session, no controlling terminal — true daemon.
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                // Close inherited fds 3+ so the detached child doesn't
                // hold the bridge's :8070 listener / sqlite pool / log
                // fds (Auditor B QB4 / Critic D10).
                for fd in 3..256 {
                    libc::close(fd);
                }
                Ok(())
            });
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // 0x00000008 = DETACHED_PROCESS
        // 0x00000200 = CREATE_NEW_PROCESS_GROUP
        // 0x08000000 = CREATE_NO_WINDOW
        const FLAGS: u32 = 0x0000_0008 | 0x0000_0200 | 0x0800_0000;
        cmd.creation_flags(FLAGS);
        // R6 audit-fix (Auditor B QB4 — endpoint-auth HIGH, partial):
        //
        // Windows handle inheritance is more involved than the Unix fd
        // case: a comprehensive fix requires STARTUPINFOEXW +
        // UpdateProcThreadAttribute(PROC_THREAD_ATTRIBUTE_HANDLE_LIST)
        // with an explicit empty inherited-handle list. std::process
        // doesn't expose that surface; doing it raw requires unsafe
        // Win32 plumbing that disproportionately enlarges this audit-fix.
        //
        // For R6 we ship the Unix fix (where the auto-update flow is
        // primarily exercised) and document the Windows gap. Operators
        // on Windows who hit "auto-update failed to rebind :8070" should
        // restart the bridge manually (`musu install` re-registers the
        // Scheduled Task which Stop/Starts musud). Tracked for V25.
        tracing::warn!(
            "QB4: Windows handle-inheritance fix pending V25. If auto-update \
             fails to swap (bridge cannot rebind :8070 after child detach), \
             stop musud and restart manually."
        );
    }

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "ok": false,
                    "error": format!("spawn auto-update: {e}")
                })),
            );
        }
    };

    let pid = child.id();
    // Write the PID marker so a follow-up `musu auto-update status` (V25)
    // can find the running child. We do NOT keep `child` alive — the
    // Command's drop just detaches without reaping; the OS reaps when
    // setsid'd / DETACHED.
    let marker = home.join(PID_MARKER_FILENAME);
    if let Err(e) = std::fs::write(&marker, pid.to_string()) {
        tracing::warn!(error = %e, path = %marker.display(), "write pid marker (continuing)");
    }

    // 202 Accepted — the work is async; the bridge doesn't block.
    (
        StatusCode::ACCEPTED,
        Json(json!({
            "ok": true,
            "pid": pid,
            "marker": marker.to_string_lossy(),
        })),
    )
}

fn resolve_musu_home() -> Result<std::path::PathBuf, std::io::Error> {
    dirs::home_dir()
        .map(|h| h.join(".musu"))
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no home directory"))
}

fn musu_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "musu.exe"
    }
    #[cfg(not(windows))]
    {
        "musu"
    }
}

#[cfg(test)]
mod tests {
    //! R6 audit-fix (Auditor B QB6 — endpoint-auth):
    //!
    //! Critic S5 plan amendment required an explicit test that proves
    //! POST /api/system/update sits behind `require_bearer`. The earlier
    //! R6 Builder pass shipped the handler without this regression guard;
    //! we add it here so a future refactor cannot silently drop the auth
    //! layer from the native router.
    use crate::bridge::auth::{require_bearer, AuthState};
    use crate::bridge::handlers::native_router;
    use crate::bridge::AppState;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use std::sync::Arc;
    use tower::ServiceExt; // for `.oneshot`

    /// Build a minimal AppState + AuthState pair, mount native_router with
    /// require_bearer middleware (mirroring bridge::run wiring), and assert
    /// that POST /api/system/update without an Authorization header is 401.
    #[tokio::test]
    async fn system_update_requires_auth() {
        // Minimal in-memory sqlite pool so AppState can be constructed.
        // We do NOT need any tables — auth rejects before the handler runs.
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory sqlite pool");

        let cfg = crate::bridge::config::BridgeConfig {
            bridge_host: "127.0.0.1".to_string(),
            bridge_port: 0,
            python_facade_port: 0,
            public_url: None,
            node_name: "test".to_string(),
            db_path: ":memory:".into(),
            audit_db_path: ":memory:".into(),
            nodes_toml_path: ":memory:".into(),
            token: "test-bearer-token-must-not-leak".to_string(),
            peer_token: None,
            env: crate::bridge::config::AuthMode::Production,
            localhost_auth_required: true,
            rate_limit_per_min: 0,
            rate_limit_disabled: true,
            allow_plaintext_lan: false,
        };
        let cfg = Arc::new(cfg);

        let audit = crate::bridge::audit::AuditState::new(pool.clone());
        let dedup = crate::bridge::dedup::DedupCache::new();
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .unwrap();
        let sse_broadcaster = crate::writer::SseBroadcaster::from_env();
        let task_runner =
            crate::writer::TaskRunnerHandle::new(pool.clone(), sse_broadcaster.clone()).await;

        let state = AppState {
            config: cfg.clone(),
            pool,
            http_client,
            audit,
            dedup,
            task_runner,
            sse_broadcaster,
        };

        let auth_state = AuthState::from_config(&cfg);

        let app = native_router()
            .layer(axum::middleware::from_fn_with_state(
                auth_state,
                require_bearer,
            ))
            .with_state(state);

        let req = Request::builder()
            .method("POST")
            .uri("/api/system/update")
            .body(Body::empty())
            .unwrap();

        let resp = app.oneshot(req).await.expect("router oneshot");
        assert_eq!(
            resp.status(),
            StatusCode::UNAUTHORIZED,
            "POST /api/system/update without bearer must be 401 (S5)"
        );
    }

    /// R6 audit-fix (Auditor B QB4): pre_exec must close inherited fds
    /// so the detached auto-update child doesn't hold the bridge's
    /// listener fd. We can't easily spawn the real `musu auto-update`
    /// here (it'd shell out), so we validate the fd-closure mechanism
    /// directly: open a TCP listener in the parent, spawn `sleep` with
    /// the same pre_exec, then inspect /proc/<child-pid>/fd to confirm
    /// fd 3..N was closed before the child started running.
    ///
    /// Unix-only (the Windows path is documented as a known V25 gap).
    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn pre_exec_closes_inherited_fds() {
        use std::net::TcpListener;
        use std::os::unix::io::AsRawFd;
        use std::os::unix::process::CommandExt;
        use std::process::{Command, Stdio};

        // Open a TCP listener so the parent has a "real" fd >= 3 that we
        // can prove gets closed in the child. Bind to an ephemeral port
        // on loopback so we don't collide with anything.
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral loopback listener");
        let listener_fd = listener.as_raw_fd();
        assert!(
            listener_fd >= 3,
            "test precondition: listener fd must be >= 3 (got {listener_fd})"
        );

        // Spawn `sleep 5` with the same pre_exec shape as the handler.
        let mut cmd = Command::new("sleep");
        cmd.arg("5");
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());
        // SAFETY: same constraints as the handler's pre_exec — only
        // async-signal-safe libc calls.
        unsafe {
            cmd.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                for fd in 3..256 {
                    libc::close(fd);
                }
                Ok(())
            });
        }
        let mut child = cmd.spawn().expect("spawn sleep");
        let child_pid = child.id();

        // Give the child a moment to settle.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        // Inspect /proc/<pid>/fd to confirm the listener fd is NOT
        // present in the child.
        let fd_dir = format!("/proc/{child_pid}/fd");
        let entries = std::fs::read_dir(&fd_dir).expect("read /proc/<pid>/fd");
        let mut child_fds: Vec<i32> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().to_string_lossy().parse::<i32>().ok())
            .collect();
        child_fds.sort();

        // Clean up the child.
        let _ = child.kill();
        let _ = child.wait();

        // The child should have ONLY stdin/stdout/stderr (0, 1, 2) — no
        // inherited listener fd. We allow up to a couple of additional
        // low fds (sleep's own internals) but the original listener fd
        // must not appear.
        assert!(
            !child_fds.contains(&listener_fd),
            "listener fd {listener_fd} leaked into child (open fds: {child_fds:?})"
        );
        // High-fd sanity: nothing above 10 should be open in the child.
        let high_fds: Vec<i32> = child_fds.iter().copied().filter(|fd| *fd > 10).collect();
        assert!(
            high_fds.is_empty(),
            "unexpected high fds in child: {high_fds:?}"
        );
    }
}
