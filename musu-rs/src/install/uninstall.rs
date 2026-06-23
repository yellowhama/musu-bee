//! `musu uninstall` — inverse of install.
//!
//! wiki/496 §3 + Q6 / S6:
//!   1. Stop bridge via supervisor IPC.
//!   2. Deregister platform service (delegate to platform::current()).
//!   3. (Optional) `--purge`: delete `~/.musu/` after a typed-string
//!      confirmation ("PURGE MY MUSU DATA"). Refuse `--yes`/`-y` quiet
//!      bypass. Refuse in non-TTY unless also `--i-understand-this-deletes-data`.
//!      Refuse if musu.db mtime is within 7 days unless a separate ack.
//!
//! U-B (local complete uninstall) adds:
//!   0. (Optional) `--deregister`: detach this machine from the account FIRST,
//!      while bridge + network + token still exist — `mesh leave` then
//!      `logout`. Both best-effort. Ordering is load-bearing: they need the
//!      account token that step 3 `--purge` deletes, so they MUST precede the
//!      stop + purge steps.
//!   - `--print-removal-command`: under packaged (MSIX) identity, print the
//!      external self-removal command payload (package family + cert
//!      thumbprint + temp dir) as JSON and exit. The CLI can't
//!      `Remove-AppxPackage` its own package; an elevated helper does it.
//!   - `--json`: emit a machine-readable step summary the cockpit can parse.

use anyhow::{Context, Result};
use std::io::{BufRead, Write};
use std::path::Path;
use std::time::SystemTime;

use super::platform;
use super::UninstallOpts;

const PURGE_CONFIRM_STRING: &str = "PURGE MY MUSU DATA";
const RECENT_DB_WINDOW_SECS: u64 = 7 * 24 * 60 * 60;

/// U-B: pinned signing-certificate thumbprint for the packaged build
/// (`blossompark.musu`). MUST stay in lockstep with the same constant in
/// `scripts/windows/Install-MUSU.ps1` / `Uninstall-MUSU.ps1`. If the signing
/// key is rotated, update all three in the same commit.
const MSIX_PACKAGE_FAMILY: &str = "blossompark.musu";
const MSIX_CERT_THUMBPRINT: &str = "65F5926444D563966C75F000C384C8530B1D8DD8";

/// One step in the uninstall sequence, for the summary output (`--json` /
/// human). `status` is one of `done` | `skipped` | `failed`. Best-effort
/// steps record `failed` with a detail and the uninstall continues.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct UninstallStep {
    pub step: String,
    pub status: String,
    pub detail: String,
}

impl UninstallStep {
    fn done(step: &str, detail: impl Into<String>) -> Self {
        Self { step: step.into(), status: "done".into(), detail: detail.into() }
    }
    fn skipped(step: &str, detail: impl Into<String>) -> Self {
        Self { step: step.into(), status: "skipped".into(), detail: detail.into() }
    }
    fn failed(step: &str, detail: impl Into<String>) -> Self {
        Self { step: step.into(), status: "failed".into(), detail: detail.into() }
    }
}

/// The ordered list of steps the uninstall performed, plus the distribution
/// mode it ran under. Printed human-readable always; as JSON when `--json`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct UninstallSummary {
    pub distribution: String,
    pub steps: Vec<UninstallStep>,
}

impl UninstallSummary {
    fn print_human(&self) {
        eprintln!("\nmusu uninstall summary ({}):", self.distribution);
        for s in &self.steps {
            let mark = match s.status.as_str() {
                "done" => "✓",
                "skipped" => "·",
                _ => "✗",
            };
            eprintln!("  {mark} [{}] {} — {}", s.status, s.step, s.detail);
        }
    }

    fn print_json(&self) -> Result<()> {
        let payload = serde_json::json!({
            "schema": "musu.uninstall_summary.v1",
            "distribution": self.distribution,
            "steps": self.steps,
        });
        println!("{}", serde_json::to_string_pretty(&payload)?);
        Ok(())
    }
}

pub async fn run(opts: UninstallOpts) -> Result<()> {
    // U-B: `--print-removal-command` is a pure query — it prints the MSIX
    // self-removal payload (for an external elevated helper) and exits without
    // touching anything. A running CLI cannot Remove-AppxPackage its own
    // package, so this is the only way to express "what must the helper run".
    if opts.print_removal_command {
        return print_removal_command();
    }

    let json = opts.json;
    let Some(summary) = run_collect(opts).await? else {
        // home didn't exist — nothing to summarize.
        return Ok(());
    };
    summary.print_human();
    if json {
        summary.print_json()?;
    }
    Ok(())
}

/// Execute the uninstall sequence and RETURN the step summary (rather than
/// printing it). Split out so tests can assert the observable step ORDER
/// directly — the load-bearing U-B contract is that `--deregister`'s mesh-leave
/// and logout precede `--purge`. Returns `None` when `~/.musu` doesn't exist.
async fn run_collect(opts: UninstallOpts) -> Result<Option<UninstallSummary>> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let distribution = super::distribution::DistributionMode::current();

    if !home.exists() {
        eprintln!(
            "musu uninstall: {} does not exist — nothing to do.",
            home.display()
        );
        return Ok(None);
    }

    let mut steps: Vec<UninstallStep> = Vec::new();

    // 0. U-B: detach from the account FIRST, while the bridge, network, and
    //    account token all still exist. mesh-leave + logout are best-effort:
    //    a failure is recorded and the uninstall proceeds. This MUST run before
    //    the stop (step 1) and purge (step 3) — purge deletes the very token
    //    `logout` and the mesh control path depend on.
    if opts.deregister {
        match super::private_mesh::run_leave(opts.musu_home.as_deref()) {
            Ok(outcome) => {
                steps.push(UninstallStep::done("mesh-leave", format!("{outcome:?}")));
            }
            Err(e) => {
                tracing::warn!(error = %e, "mesh leave failed (continuing)");
                steps.push(UninstallStep::failed("mesh-leave", e.to_string()));
            }
        }

        // U-C SEAM: cloud self-deregister (server remove-self endpoint) plugs in
        // HERE once it exists; until then warn the node may linger as a ghost.
        tracing::warn!(
            "U-C cloud self-deregister not yet implemented: this machine may \
             linger as a ghost node in the account registry until removed from \
             another machine (cockpit fleet → remove). Local removal proceeds."
        );
        steps.push(UninstallStep::skipped(
            "cloud-deregister",
            "U-C server endpoint not implemented; node may linger in registry — remove from another machine",
        ));

        // logout == delete the on-disk account token (`~/.musu/token`), the
        // same thing `musu logout` does. Reuse the canonical deleter in
        // cloud::token so we don't drift from it.
        let had_token = home.join("token").exists();
        match crate::cloud::token::delete_token(&home) {
            Ok(()) => {
                let detail = if had_token {
                    "deleted ~/.musu/token"
                } else {
                    "no account token present"
                };
                steps.push(UninstallStep::done("logout", detail));
            }
            Err(e) => {
                tracing::warn!(error = %e, "logout (token delete) failed (continuing)");
                steps.push(UninstallStep::failed("logout", e.to_string()));
            }
        }
    }

    // 1. Best-effort: stop the bridge via supervisor IPC. The supervisor
    //    may already be stopped; we don't fail on connection refused.
    match stop_bridge_via_ipc(&home).await {
        Ok(()) => steps.push(UninstallStep::done("stop-bridge", "supervisor stop requested")),
        Err(e) => {
            tracing::warn!(error = %e, "supervisor IPC stop failed (continuing)");
            steps.push(UninstallStep::failed("stop-bridge", e.to_string()));
        }
    }

    // 2. Deregister the platform service when this distribution mode owns it.
    if distribution.supports_platform_service_install() {
        let svc = platform::current();
        match svc.unregister() {
            Ok(()) => steps.push(UninstallStep::done("platform-service", "unregistered")),
            Err(e) => {
                tracing::warn!(error = %e, "platform service unregister failed (continuing)");
                steps.push(UninstallStep::failed("platform-service", e.to_string()));
            }
        }
    } else {
        tracing::info!(
            distribution = distribution.as_str(),
            "skipping platform service unregister for packaged Store/MSIX runtime"
        );
        steps.push(UninstallStep::skipped(
            "platform-service",
            "Windows owns Store/MSIX install/update/startup",
        ));
    }

    // 3. Purge if requested. The confirmation gate (S6 + QB5) is unchanged: a
    //    refusal here is a HARD error (this propagates and aborts), distinct
    //    from the best-effort steps above.
    if opts.purge {
        confirm_purge(
            &home,
            opts.i_understand_this_deletes_data,
            opts.i_have_a_backup,
        )?;
        std::fs::remove_dir_all(&home).with_context(|| format!("remove {}", home.display()))?;
        eprintln!("musu uninstall: removed {}", home.display());
        steps.push(UninstallStep::done("purge", format!("removed {}", home.display())));
    } else {
        if distribution.supports_platform_service_install() {
            eprintln!(
                "musu uninstall: platform service deregistered.\n\
                 Data preserved at {}.\n\
                 Pass --purge to delete it as well (requires interactive confirmation).",
                home.display()
            );
        } else {
            eprintln!(
                "musu uninstall: packaged Store/MSIX runtime state preserved at {}.\n\
                 Windows owns package install/update/startup for this distribution.\n\
                 Pass --purge to delete MUSU runtime data as well (requires interactive confirmation).",
                home.display()
            );
        }
        steps.push(UninstallStep::skipped(
            "purge",
            format!("data preserved at {}", home.display()),
        ));
    }

    Ok(Some(UninstallSummary {
        distribution: distribution.as_str().to_string(),
        steps,
    }))
}

/// U-B: print the MSIX self-removal command payload as JSON.
///
/// A running CLI cannot `Remove-AppxPackage` the package it is executing from,
/// so this emits the handful of facts an external elevated helper
/// (`Uninstall-MUSU.ps1`) needs: which package family to remove, which signing
/// cert thumbprint to untrust, and which temp dir to clean. Only meaningful
/// under packaged identity; on a direct-download build we say so and still emit
/// a payload (the helper no-ops the Remove-AppxPackage step harmlessly).
fn print_removal_command() -> Result<()> {
    let temp_dir = std::env::temp_dir().join("musu-install");
    let packaged = is_packaged_identity();
    let payload = serde_json::json!({
        "schema": "musu.uninstall_removal_command.v1",
        "packaged": packaged,
        "package_family": MSIX_PACKAGE_FAMILY,
        "cert_thumbprint": MSIX_CERT_THUMBPRINT,
        "temp_dir": temp_dir.to_string_lossy(),
    });
    println!("{}", serde_json::to_string_pretty(&payload)?);
    Ok(())
}

/// U-B: detect packaged (Store/MSIX) identity WITHOUT going through the
/// env-poisoned `DistributionMode` (MUSU_DISTRIBUTION can be forced for tests).
/// Uses the Win32 package-identity probe directly on Windows; always false off
/// Windows.
fn is_packaged_identity() -> bool {
    #[cfg(windows)]
    {
        super::distribution::has_package_identity()
    }
    #[cfg(not(windows))]
    {
        false
    }
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

    // ── U-B tests ───────────────────────────────────────────────────────────

    /// U-B: the new flags parse on `UninstallOpts` via clap. Guards against a
    /// rename/typo silently dropping a flag the cockpit/PS1 depend on.
    #[test]
    fn uninstall_opts_parses_new_flags() {
        use clap::Parser;

        #[derive(Parser)]
        struct Wrap {
            #[command(flatten)]
            opts: super::super::UninstallOpts,
        }

        let parsed = Wrap::parse_from([
            "musu-uninstall",
            "--deregister",
            "--purge",
            "--i-understand-this-deletes-data",
            "--i-have-a-backup",
            "--print-removal-command",
            "--json",
        ]);
        assert!(parsed.opts.deregister);
        assert!(parsed.opts.purge);
        assert!(parsed.opts.i_understand_this_deletes_data);
        assert!(parsed.opts.i_have_a_backup);
        assert!(parsed.opts.print_removal_command);
        assert!(parsed.opts.json);

        // Defaults are all-false (no surprise destructive default).
        let bare = Wrap::parse_from(["musu-uninstall"]);
        assert!(!bare.opts.deregister);
        assert!(!bare.opts.purge);
        assert!(!bare.opts.print_removal_command);
        assert!(!bare.opts.json);
    }

    /// U-B: the summary type round-trips through serde (the cockpit parses the
    /// `--json` form). Verifies the schema-bearing shape survives both ways.
    #[test]
    fn uninstall_summary_serde_roundtrips() {
        let summary = UninstallSummary {
            distribution: "direct-download".into(),
            steps: vec![
                UninstallStep::done("mesh-leave", "NotConnected"),
                UninstallStep::skipped("cloud-deregister", "U-C not implemented"),
                UninstallStep::done("logout", "no account token present"),
                UninstallStep::failed("stop-bridge", "pipe absent"),
            ],
        };
        let json = serde_json::to_string(&summary).expect("serialize");
        let back: UninstallSummary = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(summary, back);
        assert_eq!(back.steps[0].status, "done");
        assert_eq!(back.steps[1].status, "skipped");
        assert_eq!(back.steps[3].status, "failed");
    }

    /// U-B (load-bearing ordering): with `--deregister`, mesh-leave and logout
    /// MUST be scheduled BEFORE purge, because purge deletes the token they
    /// depend on. We run the real `run_collect()` against a tempdir with NO mesh
    /// config (so `run_leave` short-circuits to `NotConnected` and never shells
    /// out to tailscale) and NO supervisor socket/pipe, then assert the recorded
    /// step order in the returned summary — the observable ordering contract.
    #[tokio::test]
    async fn deregister_schedules_mesh_leave_and_logout_before_purge() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        std::fs::create_dir_all(&home).unwrap();
        // Seed an account token so logout reports "deleted", proving it ran.
        std::fs::write(home.join("token"), "acct-token").unwrap();
        // NO db/musu.db → the QB5 recent-DB gate does not fire, so --purge with
        // the non-TTY ack proceeds in this unit-test (non-TTY) context. NO
        // private-mesh config → run_leave returns NotConnected without invoking
        // tailscale.
        // Force direct-download so the platform-service branch is exercised
        // (deterministic across CI), independent of host package identity.
        std::env::set_var("MUSU_DISTRIBUTION", "direct-download");

        let opts = super::super::UninstallOpts {
            purge: true,
            i_understand_this_deletes_data: true,
            i_have_a_backup: false,
            deregister: true,
            print_removal_command: false,
            json: false,
            musu_home: Some(home.clone()),
        };

        let summary = run_collect(opts)
            .await
            .expect("uninstall run")
            .expect("home existed → summary present");
        std::env::remove_var("MUSU_DISTRIBUTION");

        // The directory must be removed (purge ran).
        assert!(!home.exists(), "purge must have removed the home dir");

        let step_names: Vec<&str> = summary.steps.iter().map(|s| s.step.as_str()).collect();
        let idx = |name: &str| {
            step_names
                .iter()
                .position(|s| *s == name)
                .unwrap_or_else(|| panic!("step {name} not found in {step_names:?}"))
        };
        // The load-bearing assertion: both account-detach steps precede purge.
        assert!(idx("mesh-leave") < idx("purge"), "mesh-leave must precede purge: {step_names:?}");
        assert!(idx("logout") < idx("purge"), "logout must precede purge: {step_names:?}");
        // logout actually ran against the seeded token.
        let logout = summary.steps.iter().find(|s| s.step == "logout").unwrap();
        assert_eq!(logout.status, "done");
        assert!(logout.detail.contains("deleted"), "logout should report deletion: {logout:?}");
        // U-C seam is recorded as a skipped step (the ghost-node warning).
        assert!(summary.steps.iter().any(|s| s.step == "cloud-deregister" && s.status == "skipped"));
    }

    /// U-B: `print_removal_command` carries the pinned package family + cert
    /// thumbprint that MUST match Install-MUSU.ps1 / Uninstall-MUSU.ps1.
    #[test]
    fn removal_command_constants_match_pinned_values() {
        assert_eq!(MSIX_PACKAGE_FAMILY, "blossompark.musu");
        assert_eq!(MSIX_CERT_THUMBPRINT, "65F5926444D563966C75F000C384C8530B1D8DD8");
        // Thumbprint is a 40-hex SHA-1.
        assert_eq!(MSIX_CERT_THUMBPRINT.len(), 40);
        assert!(MSIX_CERT_THUMBPRINT.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
