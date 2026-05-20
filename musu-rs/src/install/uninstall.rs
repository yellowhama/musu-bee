//! `musu uninstall` — inverse of install.
//!
//! wiki/496 §3 + Q6 / S6:
//!   1. Stop bridge via supervisor IPC.
//!   2. Deregister platform service (delegate to platform::current()).
//!   3. (Optional) `--purge`: delete `~/.musu/` after a typed-string
//!      confirmation ("PURGE MY MUSU DATA"). Refuse `--yes`/`-y` quiet
//!      bypass. Refuse in non-TTY unless also `--i-understand-this-deletes-data`.
//!      Refuse if musu.db mtime is within 7 days unless a separate ack.

use anyhow::{Context, Result};
use std::io::{BufRead, Write};
use std::path::Path;
use std::time::SystemTime;

use super::platform;
use super::UninstallOpts;

const PURGE_CONFIRM_STRING: &str = "PURGE MY MUSU DATA";
const RECENT_DB_WINDOW_SECS: u64 = 7 * 24 * 60 * 60;

pub async fn run(opts: UninstallOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;

    if !home.exists() {
        eprintln!(
            "musu uninstall: {} does not exist — nothing to do.",
            home.display()
        );
        return Ok(());
    }

    // 1. Best-effort: stop the bridge via supervisor IPC. The supervisor
    //    may already be stopped; we don't fail on connection refused.
    if let Err(e) = stop_bridge_via_ipc(&home).await {
        tracing::warn!(error = %e, "supervisor IPC stop failed (continuing)");
    }

    // 2. Deregister the platform service.
    let svc = platform::current();
    if let Err(e) = svc.unregister() {
        tracing::warn!(error = %e, "platform service unregister failed (continuing)");
    }

    // 3. Purge if requested.
    if opts.purge {
        confirm_purge(
            &home,
            opts.i_understand_this_deletes_data,
            opts.i_have_a_backup,
        )?;
        std::fs::remove_dir_all(&home).with_context(|| format!("remove {}", home.display()))?;
        eprintln!("musu uninstall: removed {}", home.display());
    } else {
        eprintln!(
            "musu uninstall: platform service deregistered.\n\
             Data preserved at {}.\n\
             Pass --purge to delete it as well (requires interactive confirmation).",
            home.display()
        );
    }

    Ok(())
}

/// S6: enforce typed-string confirmation in TTY, refuse quiet bypass.
///
/// R6 audit-fix (Auditor B QB5 — operator-gate MED): if `musu.db` was
/// modified within the last 7 days, refuse the purge unless the operator
/// passes `--i-have-a-backup`. The previous code printed only a WARNING
/// line then proceeded to the typed-string prompt, which an operator on
/// auto-pilot could blow through.
fn confirm_purge(home: &Path, accept_non_tty_flag: bool, i_have_a_backup: bool) -> Result<()> {
    let is_tty = is_stdin_tty();
    let db = home.join("db").join("musu.db");
    let db_recent = is_recent_file(&db);

    eprintln!(
        "\n\
================================================================\n\
 musu uninstall --purge  (DESTRUCTIVE)\n\
================================================================\n\
 This will DELETE the entire directory:\n\
   {}\n\
 \n\
 Including:\n\
   - SQLite DB (companies, route history, audit log)\n\
   - bridge.env (CSPRNG bridge token)\n\
   - update.toml + musu.toml\n\
   - All logs and writer output\n\
 \n\
 There is no undo.\n\
================================================================",
        home.display()
    );

    // Auditor B QB5: hard refusal on recent DB without explicit backup ack.
    // The earlier code printed a WARNING and continued; that's not enough
    // when the data is load-bearing for the operator's same-day work.
    if db_recent && !i_have_a_backup {
        anyhow::bail!(
            "musu.db modified within the last 7 days — refusing --purge. \
             Make a backup of {} and re-run with --i-have-a-backup to \
             explicitly acknowledge that you have one. \
             (Auditor B QB5: prevents silent same-day data loss.)",
            db.display()
        );
    }

    if db_recent && i_have_a_backup {
        eprintln!(
            "musu.db is recent but --i-have-a-backup was passed; proceeding \
             with operator-acknowledged backup."
        );
    }

    if !is_tty {
        if !accept_non_tty_flag {
            anyhow::bail!(
                "--purge refuses non-TTY invocation. Pass \
                 --i-understand-this-deletes-data alongside --purge to permit \
                 automation/CI deletes (S6)."
            );
        }
        eprintln!("non-TTY purge accepted via --i-understand-this-deletes-data flag.");
        return Ok(());
    }

    // Typed-string confirmation.
    eprint!("\nType exactly '{PURGE_CONFIRM_STRING}' to proceed (anything else aborts): ");
    std::io::stderr().flush().ok();
    let stdin = std::io::stdin();
    let mut line = String::new();
    stdin.lock().read_line(&mut line).context("read stdin")?;
    if line.trim() != PURGE_CONFIRM_STRING {
        anyhow::bail!("purge aborted (typed input did not match)");
    }
    Ok(())
}

fn is_stdin_tty() -> bool {
    #[cfg(unix)]
    {
        // SAFETY: STDIN_FILENO is a well-known constant; isatty has no
        // side effects beyond the syscall.
        unsafe { libc::isatty(libc::STDIN_FILENO) == 1 }
    }
    #[cfg(windows)]
    {
        // Best-effort: check GetConsoleMode on stdin's handle.
        use windows_sys::Win32::Foundation::HANDLE;
        use windows_sys::Win32::System::Console::{GetConsoleMode, GetStdHandle, STD_INPUT_HANDLE};
        // SAFETY: GetStdHandle / GetConsoleMode are documented thread-safe;
        // we pass them well-formed inputs and check return values.
        unsafe {
            let h: HANDLE = GetStdHandle(STD_INPUT_HANDLE);
            if h.is_null() || (h as isize) == -1 {
                return false;
            }
            let mut mode: u32 = 0;
            GetConsoleMode(h, &mut mode) != 0
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        false
    }
}

fn is_recent_file(path: &Path) -> bool {
    let m = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };
    let modified = match m.modified() {
        Ok(t) => t,
        Err(_) => return false,
    };
    SystemTime::now()
        .duration_since(modified)
        .map(|d| d.as_secs() < RECENT_DB_WINDOW_SECS)
        .unwrap_or(false)
}

/// R6 audit-fix (Auditor B QB2): read MUSU_BRIDGE_TOKEN from env or
/// `~/.musu/bridge.env` so we can include it in the IPC stop request.
///
/// V24-R3 wiki/493 Critic C4 (HIGH): delegates to the shared resolver in
/// `crate::install::token`. Behavior preserved.
fn read_ipc_token(home: &Path) -> Option<String> {
    super::token::read_bridge_token(home)
}

/// Compose the stop-all IPC request JSON, including the bearer token
/// when available (Auditor B QB2).
fn stop_request_json(token: &Option<String>) -> String {
    let mut obj = serde_json::Map::new();
    obj.insert(
        "cmd".to_string(),
        serde_json::Value::String("stop".to_string()),
    );
    if let Some(t) = token {
        obj.insert("token".to_string(), serde_json::Value::String(t.clone()));
    }
    serde_json::Value::Object(obj).to_string()
}

/// Connect to the supervisor IPC channel and send `Stop` (all).
async fn stop_bridge_via_ipc(home: &Path) -> Result<()> {
    let token = read_ipc_token(home);
    let req = stop_request_json(&token);
    #[cfg(unix)]
    {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::UnixStream;
        let socket = home.join("musu.sock");
        if !socket.exists() {
            return Ok(());
        }
        let mut s = UnixStream::connect(&socket)
            .await
            .with_context(|| format!("connect {}", socket.display()))?;
        s.write_all(req.as_bytes()).await?;
        s.write_all(b"\n").await?;
        let mut buf = [0u8; 256];
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), s.read(&mut buf)).await;
        Ok(())
    }
    #[cfg(windows)]
    {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::windows::named_pipe::ClientOptions;
        let mut client = match ClientOptions::new().open(r"\\.\pipe\musu") {
            Ok(c) => c,
            Err(_) => return Ok(()), // pipe absent → musud not running
        };
        client.write_all(req.as_bytes()).await?;
        client.write_all(b"\n").await?;
        let mut buf = [0u8; 256];
        let _ =
            tokio::time::timeout(std::time::Duration::from_secs(3), client.read(&mut buf)).await;
        let _ = home; // silence unused on this branch
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn recent_file_detection_window_works() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("musu.db");
        std::fs::write(&path, b"x").unwrap();
        // Freshly-written file is "recent" by definition.
        assert!(is_recent_file(&path));

        // Nonexistent path is not recent.
        assert!(!is_recent_file(&tmp.path().join("missing.db")));
    }

    #[test]
    fn purge_confirm_string_is_load_bearing() {
        // S6 sanity check: the typed string must not be trivially short.
        assert!(PURGE_CONFIRM_STRING.len() >= 16);
        assert!(PURGE_CONFIRM_STRING.contains(' '));
        assert!(PURGE_CONFIRM_STRING.chars().any(|c| c.is_uppercase()));
    }

    /// R6 audit-fix (Auditor B QB5): with a freshly-written musu.db and
    /// without --i-have-a-backup, confirm_purge MUST bail before the
    /// TTY/typed-string interaction. Exercises the recent-DB gate.
    #[test]
    fn recent_db_without_backup_ack_refuses_purge() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        std::fs::create_dir_all(home.join("db")).unwrap();
        std::fs::write(home.join("db").join("musu.db"), b"fresh").unwrap();

        // accept_non_tty_flag=true and i_have_a_backup=false — even in a CI
        // path the recent-DB gate must fire first.
        let err = confirm_purge(&home, true, false).expect_err("must bail on recent DB");
        let msg = format!("{err}");
        assert!(
            msg.contains("--i-have-a-backup"),
            "bail must mention --i-have-a-backup: {msg}"
        );
        assert!(
            msg.contains("7 days") || msg.contains("recent"),
            "bail must explain the recency window: {msg}"
        );
    }

    /// R6 audit-fix (Auditor B QB5): with the same fresh DB but the
    /// backup ack flag set, the recent-DB gate yields to the non-TTY
    /// path which accepts because --i-understand-this-deletes-data is on.
    #[test]
    fn recent_db_with_backup_ack_proceeds_in_non_tty() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        std::fs::create_dir_all(home.join("db")).unwrap();
        std::fs::write(home.join("db").join("musu.db"), b"fresh").unwrap();

        // In a Rust unit test stdin is NOT a TTY, so the non-TTY branch
        // takes over after the QB5 gate clears.
        confirm_purge(&home, true, true).expect("backup-ack should allow purge in non-TTY");
    }
}
