//! V27 Account Auth CLI — device-code login flow.
//!
//! Extracted from `cli_commands.rs` (thermo-nuclear maintainability review,
//! 2026-06-09): the login family is a cohesive ~270-line concern that has no
//! business living in the catch-all CLI dispatcher. It is a child module of
//! `cli_commands`, so `super::{open_url, musu_home, resolve_public_bridge_url}`
//! remain reachable without widening their visibility.
//!
//! Phase 1 desktop-unification (DESKTOP_BRIDGE_ONBOARDING_SPEC §2): `run_login`
//! used to inline initiate → print → poll → save → register. That monolith is
//! useless in a headless startup process (it only `println!`s the URL — nothing
//! opens a browser). It is split into [`initiate_device_flow`] +
//! [`poll_and_finalize`] so the Desktop `open` path (musu-startup) can drive the
//! same flow and call [`super::open_url`] for the browser deep-link.

use anyhow::Result;

use super::{musu_home, open_url, resolve_public_bridge_url};

/// `musu login` — start the device code login flow.
fn login_connection_checklist() -> [&'static str; 3] {
    [
        "Run `musu doctor` to verify local state.",
        "Start the bridge with `musu bridge` if it is not already running.",
        "Open MUSU Desktop or a MUSU.PRO workspace; localhost dashboards are optional developer surfaces only.",
    ]
}

/// A device-flow session that has been initiated against musu.pro but not yet
/// approved. Holds everything `poll_and_finalize` needs to complete the login
/// without re-deriving the node name or re-reading the cloud base URL.
pub struct DeviceFlow {
    /// Cloud device-code response (user_code, device_code, verification_uri, …).
    pub response: crate::cloud::DeviceCodeResponse,
    /// The node name this flow was initiated for (reused for registration).
    pub node_name: String,
    /// The cloud base URL the flow was initiated against (reused for polling
    /// and registration so a mid-flow env change cannot split the session).
    pub cloud_base_url: String,
}

impl DeviceFlow {
    /// Browser deep-link the user should open to approve this device.
    ///
    /// Reuses the server-issued `verification_uri`. Per the onboarding spec the
    /// approval page accepts the code as a `code=` query param; if the server
    /// already embedded the code in the URI we leave it untouched, otherwise we
    /// append it so the user lands on a pre-filled approval page.
    pub fn approval_url(&self) -> String {
        let uri = &self.response.verification_uri;
        if uri.contains(&self.response.user_code) || uri.contains("code=") {
            return uri.clone();
        }
        let sep = if uri.contains('?') { '&' } else { '?' };
        format!("{uri}{sep}code={}", self.response.user_code)
    }
}

/// Initiate a device-code login against musu.pro. Performs NO printing and opens
/// NO browser — callers decide how to surface the code (CLI prints, Desktop opens
/// a browser). Reuses [`crate::cloud::MusuCloud::initiate_device_login`].
pub async fn initiate_device_flow() -> Result<DeviceFlow> {
    let my_name = std::env::var("MUSU_NODE_NAME").unwrap_or_else(|_| {
        hostname::get()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    let cloud_base_url = crate::cloud::base_url_from_env();
    let cloud = crate::cloud::MusuCloud::new(&cloud_base_url, None);
    let response = cloud.initiate_device_login(&my_name).await?;
    Ok(DeviceFlow {
        response,
        node_name: my_name,
        cloud_base_url,
    })
}

/// Poll the device-flow to completion, then save the token and register this
/// node. The poll loop + `save_token` + `register_node` previously lived inline
/// in `run_login`; extracting it lets the Desktop startup path reuse the exact
/// same finalization.
///
/// `quiet`: when `true` (Desktop/headless callers), progress is emitted via
/// `tracing` only — no `println!` to a stdout nobody is watching. When `false`
/// (the `musu login` CLI), the operator-facing checklist is printed as before so
/// CLI behavior is unchanged.
pub async fn poll_and_finalize(flow: &DeviceFlow, quiet: bool) -> Result<()> {
    let home = musu_home();
    let cloud = crate::cloud::MusuCloud::new(&flow.cloud_base_url, None);

    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(flow.response.expires_in as u64);

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!("Login timed out.");
        }

        tokio::time::sleep(flow.response.poll_interval()).await;

        match cloud.poll_device_token(&flow.response.device_code).await {
            Ok(Some(token)) => {
                crate::cloud::token::save_token(&home, &token)?;
                if quiet {
                    tracing::info!("account login succeeded; registering node");
                } else {
                    println!("\nAccount login succeeded.");
                    println!("Registering node to your fleet...");
                }

                // V27: Automatically register this node in the mesh.
                let authed_cloud = crate::cloud::MusuCloud::new(&flow.cloud_base_url, Some(token));
                let public_url = resolve_public_bridge_url();
                let req = crate::cloud::RegisterNodeRequest {
                    node_name: flow.node_name.clone(),
                    public_url: public_url.clone(),
                    ..Default::default()
                };
                if let Err(e) = authed_cloud.register_node(req).await {
                    if quiet {
                        tracing::warn!(
                            error = %e,
                            public_url = %public_url,
                            "node registration failed; machine is logged in but not registered"
                        );
                    } else {
                        println!("Node registration failed.");
                        println!("  reason: {}", e);
                        println!("  computed public_url: {}", public_url);
                        println!(
                            "This machine is logged in, but is not yet fully registered in your fleet."
                        );
                    }
                } else if quiet {
                    tracing::info!("node registered; machine connected to MUSU account");
                } else {
                    println!("Node registered successfully.");
                    println!("This machine is connected to your MUSU account.");
                }

                // "Account login = automatic mesh join": best-effort. Fetch a
                // one-time mesh key for this account and join the fleet so the
                // user's devices reach each other without copying a device-add
                // pass. Soft-fail like register_node above — a mesh hiccup must
                // never fail the login itself; the cockpit retries later.
                if let Err(e) = auto_join_account_mesh(quiet).await {
                    if quiet {
                        tracing::warn!(
                            error = %e,
                            "automatic mesh join did not complete; will retry from the app"
                        );
                    } else {
                        println!("Automatic mesh connection is still pending.");
                        println!("  reason: {}", e);
                        println!("  MUSU will keep trying in the background.");
                    }
                } else if quiet {
                    tracing::info!("machine joined its account mesh");
                } else {
                    println!("This machine joined your private mesh.");
                }

                if !quiet {
                    println!();
                    println!("Connection checklist:");
                    for (index, step) in login_connection_checklist().iter().enumerate() {
                        println!("  {}. {}", index + 1, step);
                    }
                }
                return Ok(());
            }
            Ok(None) => {
                // still pending
            }
            Err(e) => {
                anyhow::bail!("Login failed: {}", e);
            }
        }
    }
}

/// Best-effort automatic mesh join after a successful login. Delegates to the
/// `mesh join-account` action, which fetches a one-time preauth key for this
/// account and runs the normal join. Kept separate so the caller can soft-fail
/// it without entangling login success with mesh availability.
async fn auto_join_account_mesh(quiet: bool) -> Result<()> {
    use crate::install::private_mesh::{
        run as run_private_mesh, PrivateMeshAction, PrivateMeshJoinAccountOpts,
    };
    run_private_mesh(PrivateMeshAction::JoinAccount(PrivateMeshJoinAccountOpts {
        node_name: None,
        dry_run: false,
        // Keep mesh output quiet during login when the caller is quiet; the
        // login flow already prints its own join status lines.
        json: false,
        musu_home: None,
    }))
    .await
    .map(|_| {
        let _ = quiet;
    })
}

pub async fn run_login() -> Result<()> {
    println!("\u{1f511} Initiating login to musu.pro...");

    let flow = initiate_device_flow().await?;
    let approval_url = flow.approval_url();

    // Small UX win (Phase 1): open the browser to the approval page in addition
    // to printing it. The print stays as the fallback for headless/SSH callers
    // where no browser can be launched.
    if let Err(err) = open_url(&approval_url) {
        tracing::debug!(error = %err, "could not auto-open approval URL; printing only");
    }

    println!("\n🔗 Open this URL in your browser to approve:");
    println!("   {}", approval_url);
    println!("   Code: {}", flow.response.user_code);
    println!(
        "\n⏳ Waiting for approval (timeout {}s, poll {}s)...",
        flow.response.expires_in,
        flow.response.poll_interval_secs()
    );

    poll_and_finalize(&flow, false).await
}

/// Desktop `open`-path login: initiate device-flow, surface the code (callback +
/// browser deep-link), and poll to completion — all without writing to a stdout
/// nobody is watching (GUI launch has no terminal).
///
/// `on_pending` is invoked once, immediately after initiation, with the approval
/// URL and the user code so the caller (musu-startup) can record them into
/// `startup-marker.json` for a status surface to read. The browser is opened via
/// the existing [`super::open_url`]; failure to open is non-fatal (the marker
/// still carries the URL/code).
///
/// CRITICAL (DESKTOP_BRIDGE_ONBOARDING_SPEC §4, MEDIUM-1): this is meant to run
/// as a spawned background task while `bridge::run()` holds the foreground. It
/// must NEVER be on the critical path of the bridge coming up. A timeout/error
/// here returns `Err` to the task, but the caller drops it without touching the
/// bridge.
pub async fn run_desktop_login<F>(on_pending: F) -> Result<()>
where
    F: FnOnce(&str, &str),
{
    tracing::info!("desktop launch: no account token, starting device-flow");
    let flow = initiate_device_flow().await?;
    let approval_url = flow.approval_url();

    on_pending(&approval_url, &flow.response.user_code);

    if let Err(err) = open_url(&approval_url) {
        tracing::warn!(error = %err, url = %approval_url, "could not auto-open approval URL");
    } else {
        tracing::info!(url = %approval_url, "opened approval URL in browser");
    }

    poll_and_finalize(&flow, true).await
}

/// `musu logout` — remove the account token.
pub async fn run_logout() -> Result<()> {
    let home = musu_home();
    crate::cloud::token::delete_token(&home)?;
    println!("✅ Logged out.");
    Ok(())
}

/// `musu whoami` — check if logged in.
pub async fn run_whoami() -> Result<()> {
    let home = musu_home();
    if let Some(_token) = crate::cloud::token::load_token(&home) {
        println!("✅ You are logged in.");
    } else {
        println!("❌ Not logged in. Run `musu login`.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device_flow_with(verification_uri: &str, user_code: &str) -> DeviceFlow {
        DeviceFlow {
            response: crate::cloud::DeviceCodeResponse {
                user_code: user_code.to_string(),
                device_code: "dev-code-secret".to_string(),
                verification_uri: verification_uri.to_string(),
                expires_in: 900,
                interval: Some(5),
            },
            node_name: "test-node".to_string(),
            cloud_base_url: "https://musu.pro".to_string(),
        }
    }

    #[test]
    fn approval_url_appends_code_when_missing() {
        let flow = device_flow_with("https://musu.pro/device", "ABC123");
        assert_eq!(flow.approval_url(), "https://musu.pro/device?code=ABC123");
    }

    #[test]
    fn approval_url_appends_with_ampersand_when_query_present() {
        let flow = device_flow_with("https://musu.pro/device?next=x", "ABC123");
        assert_eq!(
            flow.approval_url(),
            "https://musu.pro/device?next=x&code=ABC123"
        );
    }

    #[test]
    fn approval_url_left_untouched_when_code_already_embedded() {
        let flow = device_flow_with("https://musu.pro/device?code=ABC123", "ABC123");
        assert_eq!(flow.approval_url(), "https://musu.pro/device?code=ABC123");
        // Also untouched when the literal user_code appears in the path.
        let flow2 = device_flow_with("https://musu.pro/device/ABC123", "ABC123");
        assert_eq!(flow2.approval_url(), "https://musu.pro/device/ABC123");
    }

    #[test]
    fn login_connection_checklist_does_not_open_fixed_localhost_dashboard() {
        let checklist = login_connection_checklist().join("\n");

        assert!(checklist.contains("MUSU Desktop"));
        assert!(checklist.contains("MUSU.PRO"));
        assert!(!checklist.contains("127.0.0.1:3001"));
        assert!(!checklist.contains("localhost:3001"));
    }
}
