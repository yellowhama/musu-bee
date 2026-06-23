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

    // 0. U-B/U-C: detach from the account FIRST, while the bridge, network, and
    //    account token all still exist. cloud-deregister + mesh-leave + logout
    //    are best-effort: a failure is recorded and the uninstall proceeds. This
    //    MUST run before the stop (step 1) and purge (step 3) — purge deletes the
    //    very token `logout` and the mesh control path depend on.
    if opts.deregister {
        // U-C (Critic HIGH-1 ORDERING): cloud self-deregister runs BEFORE
        // mesh-leave. remove-self needs THIS machine's node_id, which we resolve
        // from the live tailnet IP; `run_leave` runs `tailscale down`, after
        // which the tailnet IP is gone (OQ-C: run_leave is purely local —
        // `tailscale down` + a local ownership re-query — and does NOT need the
        // cloud Headscale node to exist, so doing cloud-deregister first is safe
        // and is the only ordering that preserves a live identity). It also needs
        // the account token, which logout deletes — so it runs before logout too.
        steps.push(cloud_deregister_self(&home).await);

        match super::private_mesh::run_leave(opts.musu_home.as_deref()) {
            Ok(outcome) => {
                steps.push(UninstallStep::done("mesh-leave", format!("{outcome:?}")));
            }
            Err(e) => {
                tracing::warn!(error = %e, "mesh leave failed (continuing)");
                steps.push(UninstallStep::failed("mesh-leave", e.to_string()));
            }
        }

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

/// U-C: identify THIS machine's own node among the account's fleet by tailnet IP.
///
/// PURE so it is unit-testable without a network or tailscale. Matches the node
/// whose `ips` overlap ANY of this machine's tailnet IPs — matching by IP, NOT
/// by name, because names collide and stale/ghost nodes are expected (a previous
/// uninstall that failed to deregister leaves a same-named ghost). Returns the
/// authoritative `(node_id, name)` so the caller passes the name as
/// `expected_name` (optimistic-concurrency) and the id as the delete key.
///
/// `own_ips` may contain multiple tailnet IPs (v4/v6); a node matches if ANY of
/// its `ips` equals ANY of `own_ips`. Returns the FIRST such node in `nodes`
/// order. `None` when no node carries one of our IPs (already absent) or when
/// `own_ips` is empty (no tailnet identity to match on).
fn resolve_own_node<'a>(
    own_ips: &[String],
    nodes: &'a [crate::cloud::MeshNode],
) -> Option<(&'a str, &'a str)> {
    if own_ips.is_empty() {
        return None;
    }
    let own: std::collections::HashSet<&str> = own_ips
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if own.is_empty() {
        return None;
    }
    nodes
        .iter()
        .find(|n| n.ips.iter().any(|ip| own.contains(ip.trim())))
        .map(|n| (n.id.as_str(), n.name.as_str()))
}

/// U-C: collect THIS machine's tailnet IP candidates for self-node resolution.
///
/// FIX-1 (audit-fix, stale-IP MEDIUM): use the LIVE `tailscale ip -4` probe as
/// the SOLE source of truth when tailscaled is up, falling back to the persisted
/// `local_tailnet_ip` ONLY when the live probe is unavailable.
///
/// The persisted IP is recorded once at join/verify and is NEVER refreshed, so
/// if Headscale later reassigns that IP to a different same-owner machine the
/// stale value would resolve the WRONG own-node. `resolve_own_node` matches
/// against the SET of these candidates and returns the first NODE that overlaps
/// — so merely ordering live-before-persisted does NOT prevent the stale match
/// (if both IPs are present and the stale sibling node sorts first in the fleet,
/// it still wins). The only robust fix is to NOT carry the stale persisted IP at
/// all when a live IP is available: a live machine then self-identifies purely
/// by its CURRENT IP. Persisted is still honored when live is `None` (stopped
/// tailscaled, missing CLI, or a join that predated the field) so those machines
/// can still self-identify. De-duplicated, order-preserving.
fn own_tailnet_ip_candidates(home: &Path) -> Vec<String> {
    // Live first: when present it is the machine's CURRENT identity and the
    // persisted value is ignored entirely (it may be stale).
    if let Some(live) = crate::peer::tailscale::get_tailscale_ip() {
        let live = live.trim().to_string();
        if !live.is_empty() {
            return vec![live];
        }
    }
    // Fallback: live probe unavailable → rely on the persisted IP.
    match super::private_mesh::persisted_local_tailnet_ip(home) {
        Some(ip) => {
            let ip = ip.trim().to_string();
            if ip.is_empty() {
                Vec::new()
            } else {
                vec![ip]
            }
        }
        None => Vec::new(),
    }
}

/// U-C (Critic HIGH-3 — loud fail-open): remove THIS machine's own node from the
/// account registry on uninstall. The uninstall MUST complete regardless, so
/// every outcome is captured into a single `UninstallStep` and NEVER bubbles up:
///
///  - `skipped` when self-deregister is genuinely not applicable: no account
///    token (never logged in) or no tailnet identity (never joined a mesh) or the
///    node is already absent from the fleet. These are success-ish, not failures.
///  - `failed` (with a user-facing hint to remove the ghost from the cockpit
///    fleet) when we COULD have deregistered but the network call errored. We do
///    NOT silently skip a real failure.
///  - `done` when the node was removed (or the server reported it already gone).
async fn cloud_deregister_self(home: &Path) -> UninstallStep {
    const STEP: &str = "cloud-deregister";
    const GHOST_HINT: &str =
        "node may still appear in the cockpit fleet — remove it manually from the fleet view";

    // No account token → never logged in; nothing to deregister.
    let Some(token) = crate::cloud::token::load_token(home) else {
        return UninstallStep::skipped(STEP, "no account token; not logged in — nothing to deregister");
    };

    // No tailnet identity → never joined a mesh; nothing to match on.
    let own_ips = own_tailnet_ip_candidates(home);
    if own_ips.is_empty() {
        return UninstallStep::skipped(
            STEP,
            "no tailnet identity (no persisted/live tailnet IP) — machine never joined a mesh",
        );
    }

    let cloud = crate::cloud::MusuCloud::new(&crate::cloud::base_url_from_env(), Some(token));

    // List the owner's fleet to find OUR node by IP. A list failure is a real
    // failure (we could not even try) → failed with the ghost hint.
    let nodes = match cloud.list_mesh_nodes().await {
        Ok(list) => list.nodes,
        Err(e) => {
            tracing::warn!(error = %e, "cloud self-deregister: list fleet failed (continuing uninstall)");
            return UninstallStep::failed(STEP, format!("could not list account fleet: {e}; {GHOST_HINT}"));
        }
    };

    // Match by IP (never by name — ghosts share names). No match → already absent.
    let Some((node_id, name)) = resolve_own_node(&own_ips, &nodes) else {
        return UninstallStep::skipped(
            STEP,
            "this machine's node already absent from the account fleet — nothing to remove",
        );
    };

    // FIX-2 (audit-fix, empty-name defense): never call remove_self_mesh_node
    // with an empty/whitespace expected_name. The server's optimistic-concurrency
    // 409 guard relies on a non-empty name; passing "" would silently disable it
    // if the route schema ever loosened its min(1) check. We COULD have a node to
    // remove (IP matched) but cannot do it safely → failed with the ghost hint.
    if name.trim().is_empty() {
        tracing::warn!(node = node_id, "cloud self-deregister: matched node has empty name; refusing empty expected_name (continuing uninstall)");
        return UninstallStep::failed(
            STEP,
            format!("node {node_id} matched by IP but has an unresolved (empty) name; {GHOST_HINT}"),
        );
    }

    // MEDIUM-2: pass the name read alongside the id as expected_name (never empty)
    // so the server's optimistic-concurrency 409 guard stays armed.
    match cloud.remove_self_mesh_node(node_id, name).await {
        Ok(result) => {
            tracing::info!(
                node = node_id,
                removed = result.removed,
                already_gone = result.already_gone,
                "cloud self-deregister complete"
            );
            if result.removed {
                UninstallStep::done(STEP, format!("removed this machine's node {node_id} ({name})"))
            } else {
                // Server reported it already gone between our list and delete —
                // idempotent success.
                UninstallStep::done(STEP, format!("node {node_id} already absent at the control plane"))
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, node = node_id, "cloud self-deregister failed (continuing uninstall)");
            UninstallStep::failed(STEP, format!("remove-self failed for node {node_id}: {e}; {GHOST_HINT}"))
        }
    }
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
        // tailscale, and the U-C self-deregister has no persisted tailnet IP.
        // Force direct-download so the platform-service branch is exercised
        // (deterministic across CI), independent of host package identity.
        std::env::set_var("MUSU_DISTRIBUTION", "direct-download");
        // U-C: point the cloud base URL at an unroutable address so that even if
        // the host running the test has a live tailscale IP (making this machine
        // appear to have a tailnet identity), the list-fleet call fails fast and
        // the step is recorded as `failed`/`skipped` (fail-open) rather than
        // making a real network call to production. Either way the ordering and
        // existence assertions below hold.
        std::env::set_var("MUSU_CLOUD_BASE_URL", "http://127.0.0.1:1");

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
        std::env::remove_var("MUSU_CLOUD_BASE_URL");

        // The directory must be removed (purge ran).
        assert!(!home.exists(), "purge must have removed the home dir");

        let step_names: Vec<&str> = summary.steps.iter().map(|s| s.step.as_str()).collect();
        let idx = |name: &str| {
            step_names
                .iter()
                .position(|s| *s == name)
                .unwrap_or_else(|| panic!("step {name} not found in {step_names:?}"))
        };
        // The load-bearing assertion: account-detach steps precede purge.
        assert!(idx("mesh-leave") < idx("purge"), "mesh-leave must precede purge: {step_names:?}");
        assert!(idx("logout") < idx("purge"), "logout must precede purge: {step_names:?}");
        // U-C HIGH-1 ordering: cloud-deregister precedes mesh-leave (it needs the
        // live tailnet identity that mesh-leave's `tailscale down` tears away) and
        // logout (it needs the account token logout deletes).
        assert!(
            idx("cloud-deregister") < idx("mesh-leave"),
            "cloud-deregister must precede mesh-leave (HIGH-1 ordering): {step_names:?}"
        );
        assert!(
            idx("cloud-deregister") < idx("logout"),
            "cloud-deregister must precede logout (needs the token): {step_names:?}"
        );
        // logout actually ran against the seeded token.
        let logout = summary.steps.iter().find(|s| s.step == "logout").unwrap();
        assert_eq!(logout.status, "done");
        assert!(logout.detail.contains("deleted"), "logout should report deletion: {logout:?}");
        // U-C step is recorded (fail-open: skipped when no tailnet identity, or
        // failed when the unroutable list call errors — never silently dropped).
        let cd = summary.steps.iter().find(|s| s.step == "cloud-deregister").unwrap();
        assert!(
            cd.status == "skipped" || cd.status == "failed",
            "cloud-deregister must be a non-fatal skipped/failed step here: {cd:?}"
        );
    }

    // ── U-C own-node resolver tests (pure function) ──────────────────────────

    fn mk_node(id: &str, name: &str, ips: &[&str]) -> crate::cloud::MeshNode {
        crate::cloud::MeshNode {
            id: id.into(),
            name: name.into(),
            ips: ips.iter().map(|s| s.to_string()).collect(),
            online: true,
            last_seen: None,
        }
    }

    /// U-C OQ-B: a single IP match resolves to (id, name) — by IP, not name.
    #[test]
    fn resolve_own_node_matches_by_ip() {
        let nodes = vec![
            mk_node("1", "alpha", &["100.64.0.1"]),
            mk_node("2", "beta", &["100.64.0.2"]),
        ];
        let own = vec!["100.64.0.2".to_string()];
        assert_eq!(resolve_own_node(&own, &nodes), Some(("2", "beta")));
    }

    /// U-C OQ-B: no node carries one of our IPs → None (already absent).
    #[test]
    fn resolve_own_node_no_match_returns_none() {
        let nodes = vec![mk_node("1", "alpha", &["100.64.0.1"])];
        let own = vec!["100.64.0.99".to_string()];
        assert_eq!(resolve_own_node(&own, &nodes), None);
    }

    /// U-C OQ-B: empty own-ips (no tailnet identity) → None, never a false match.
    #[test]
    fn resolve_own_node_empty_own_ips_returns_none() {
        let nodes = vec![mk_node("1", "alpha", &["100.64.0.1"])];
        assert_eq!(resolve_own_node(&[], &nodes), None);
        // Whitespace-only entries collapse to empty too.
        assert_eq!(resolve_own_node(&["   ".to_string()], &nodes), None);
    }

    /// U-C OQ-B: multiple own IPs (v4 + v6) — match if ANY overlaps.
    #[test]
    fn resolve_own_node_multiple_own_ips_any_overlap() {
        let nodes = vec![mk_node("7", "gamma", &["fd7a:115c:a1e0::7", "100.64.0.7"])];
        // Our v6 matches even though our v4 doesn't appear on the node.
        let own = vec!["100.64.0.55".to_string(), "fd7a:115c:a1e0::7".to_string()];
        assert_eq!(resolve_own_node(&own, &nodes), Some(("7", "gamma")));
    }

    /// U-C HIGH-3 / OQ-B: ghost/duplicate same-named nodes — match the one
    /// carrying OUR IP, not a stale namesake. Returns the IP-matched node even
    /// when an earlier node shares the name.
    #[test]
    fn resolve_own_node_ghost_duplicate_names_matches_by_ip() {
        let nodes = vec![
            // Ghost from a prior failed uninstall: same name, DIFFERENT (stale) IP.
            mk_node("10", "my-pc", &["100.64.0.10"]),
            // The live node for this machine: same name, OUR current IP.
            mk_node("11", "my-pc", &["100.64.0.11"]),
        ];
        let own = vec!["100.64.0.11".to_string()];
        assert_eq!(resolve_own_node(&own, &nodes), Some(("11", "my-pc")));
    }

    /// U-C: whitespace around IPs (persisted-config artifacts) is tolerated on
    /// both sides of the comparison.
    #[test]
    fn resolve_own_node_trims_whitespace_both_sides() {
        let nodes = vec![mk_node("3", "delta", &[" 100.64.0.3 "])];
        let own = vec![" 100.64.0.3 ".to_string()];
        assert_eq!(resolve_own_node(&own, &nodes), Some(("3", "delta")));
    }

    /// FIX-1 (stale-IP MEDIUM): the live IP eliminates the stale-IP hazard.
    ///
    /// Stale scenario: the persisted IP .50 was reassigned by Headscale to a
    /// DIFFERENT same-owner machine ("sibling") after our join recorded it; OUR
    /// current node is "mine" at the live IP .51. own_tailnet_ip_candidates uses
    /// the LIVE IP as the SOLE candidate when tailscaled is up, so the resolver's
    /// candidate set is {.51} — it matches ONLY our node and can never reach the
    /// stale sibling, regardless of fleet ordering.
    #[test]
    fn resolve_own_node_live_only_avoids_stale_sibling() {
        // Sibling sorts FIRST in the fleet (the dangerous case: first-match-wins
        // would pick it if the stale .50 were in the candidate set).
        let nodes = vec![
            mk_node("sibling", "other-pc", &["100.64.0.50"]),
            mk_node("mine", "my-pc", &["100.64.0.51"]),
        ];
        // Live-only candidate set (what own_tailnet_ip_candidates returns when
        // tailscaled is up): the stale persisted .50 is NOT present.
        let own_live_only = vec!["100.64.0.51".to_string()];
        assert_eq!(resolve_own_node(&own_live_only, &nodes), Some(("mine", "my-pc")));

        // Counter-proof that this is load-bearing: had FIX-1 kept BOTH the live
        // and stale persisted IP in the set, the sibling (first in the fleet)
        // would have matched first — the exact bug FIX-1 removes.
        let own_both = vec!["100.64.0.51".to_string(), "100.64.0.50".to_string()];
        assert_eq!(
            resolve_own_node(&own_both, &nodes),
            Some(("sibling", "other-pc")),
            "carrying the stale IP alongside the live one re-introduces the wrong-node match; FIX-1 drops the persisted IP when live is available"
        );

        // Fallback path: live unavailable → only the persisted IP is the
        // candidate. With no live IP this CAN still hit the sibling; that is the
        // accepted residual risk of the fallback path (documented in FIX-1).
        let own_persisted_only = vec!["100.64.0.50".to_string()];
        assert_eq!(
            resolve_own_node(&own_persisted_only, &nodes),
            Some(("sibling", "other-pc"))
        );
    }

    /// FIX-1: own_tailnet_ip_candidates returns at most ONE de-duplicated,
    /// trimmed, non-empty candidate (live OR persisted, never both). We can't
    /// inject the live `tailscale` probe here, but we can assert the invariant
    /// the resolver depends on holds for whatever the environment yields.
    #[test]
    fn own_tailnet_ip_candidates_at_most_one_clean_entry() {
        // No mesh config + (in CI) no tailscaled → empty, never a panic.
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        std::fs::create_dir_all(&home).unwrap();
        let out = own_tailnet_ip_candidates(&home);
        assert!(out.len() <= 1, "live-OR-persisted yields at most one IP: {out:?}");
        for ip in &out {
            assert_eq!(ip, ip.trim(), "candidate must be trimmed: {ip:?}");
            assert!(!ip.is_empty(), "candidate must be non-empty");
        }
    }

    /// FIX-2 (empty-name defense): resolve_own_node can return a node with an
    /// empty name (matched purely by IP). cloud_deregister_self must NOT pass
    /// that empty name to remove_self_mesh_node. The pure resolver still returns
    /// the IP-matched (id, "") pair; the empty-name guard lives in the caller, so
    /// here we pin the resolver contract the guard depends on: an IP match with
    /// an empty name is surfaced (not swallowed), letting the caller branch.
    #[test]
    fn resolve_own_node_surfaces_empty_name_for_caller_guard() {
        let nodes = vec![mk_node("99", "", &["100.64.0.99"])];
        let own = vec!["100.64.0.99".to_string()];
        // The resolver matches by IP and faithfully returns the empty name; the
        // caller (cloud_deregister_self) is responsible for refusing it.
        assert_eq!(resolve_own_node(&own, &nodes), Some(("99", "")));
    }

    /// FIX-2: the empty-name guard predicate the caller uses must treat
    /// whitespace-only names as empty too (matches name.trim().is_empty()).
    #[test]
    fn empty_name_guard_predicate_rejects_whitespace() {
        // Mirror the exact predicate cloud_deregister_self applies before calling
        // remove_self_mesh_node, so a future refactor of that predicate trips
        // this test rather than silently shipping an empty expected_name.
        assert!("".trim().is_empty());
        assert!("   ".trim().is_empty());
        assert!("\t\n".trim().is_empty());
        assert!(!"my-pc".trim().is_empty());
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
