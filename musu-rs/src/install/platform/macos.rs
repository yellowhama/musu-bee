//! macOS launchd LaunchAgent registrar.
//!
//! wiki/496 §3 NEW `install/platform/macos.rs`. Writes
//! `~/Library/LaunchAgents/com.musu.musud.plist` from the shipped template
//! (D11 dict-form KeepAlive), then `launchctl bootstrap gui/$(id -u)`.
//!
//! S11: refuses if `euid == 0` so a sudo-install doesn't write the
//! LaunchAgent under root (which would break subsequent non-sudo
//! uninstall).

use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

use super::{PlatformService, RegisterContext, ServiceStatus};
use crate::install::dry_run::{TemplateKind, TemplateSpec};

pub struct LaunchAgentService;

const PLIST_TEMPLATE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.musu.musud</string>

  <key>ProgramArguments</key>
  <array>
    <string>{MUSU_HOME}/bin/musud</string>
  </array>

  <key>WorkingDirectory</key>
  <string>{MUSU_HOME}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>MUSU_HOME</key>
    <string>{MUSU_HOME}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>StandardOutPath</key>
  <string>{MUSU_HOME}/logs/musud.log</string>
  <key>StandardErrorPath</key>
  <string>{MUSU_HOME}/logs/musud.err</string>

  <key>RunAtLoad</key>
  <true/>

  <!-- D11: KeepAlive as DICT (Crashed:true, SuccessfulExit:false) so launchd
       restarts musud on crash but does NOT fight musud's own clean-exit path. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
"#;

const PLIST_FILENAME: &str = "com.musu.musud.plist";
const SERVICE_LABEL: &str = "com.musu.musud";

fn plist_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot resolve $HOME"))?;
    Ok(home.join("Library").join("LaunchAgents"))
}

fn plist_path() -> Result<PathBuf> {
    Ok(plist_dir()?.join(PLIST_FILENAME))
}

fn render(ctx: &RegisterContext<'_>) -> String {
    PLIST_TEMPLATE.replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
}

/// Refuse if running as root (S11).
fn refuse_if_root() -> Result<()> {
    #[cfg(unix)]
    {
        // SAFETY: geteuid is documented async-signal-safe and always defined.
        let euid = unsafe { libc::geteuid() };
        if euid == 0 {
            anyhow::bail!(
                "musu install refuses to run as root on macOS (S11). \
                 LaunchAgents must be installed under the operator account so \
                 subsequent `musu uninstall` can clean up without sudo. \
                 Re-run as the operator user."
            );
        }
    }
    Ok(())
}

fn current_uid() -> u32 {
    #[cfg(unix)]
    {
        // SAFETY: getuid always succeeds.
        unsafe { libc::getuid() }
    }
    #[cfg(not(unix))]
    {
        0
    }
}

impl PlatformService for LaunchAgentService {
    fn register(&self, ctx: &RegisterContext) -> Result<()> {
        refuse_if_root()?;
        let dir = plist_dir()?;
        std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

        let body = render(ctx);
        let path = plist_path()?;
        std::fs::write(&path, &body).with_context(|| format!("write {}", path.display()))?;

        // Bootstrap into the gui/<uid> domain so the agent is loaded.
        let uid = current_uid();
        let domain = format!("gui/{uid}");
        run_launchctl(&["bootstrap", &domain, path.to_string_lossy().as_ref()])?;
        run_launchctl(&["kickstart", "-k", &format!("{domain}/{SERVICE_LABEL}")])?;
        tracing::info!(path = %path.display(), "launchd LaunchAgent registered");
        Ok(())
    }

    fn unregister(&self) -> Result<()> {
        let uid = current_uid();
        let domain = format!("gui/{uid}");
        if let Err(e) = run_launchctl(&["bootout", &format!("{domain}/{SERVICE_LABEL}")]) {
            tracing::warn!(error = %e, "launchctl bootout failed (continuing)");
        }
        let path = plist_path()?;
        if path.exists() {
            std::fs::remove_file(&path).with_context(|| format!("remove {}", path.display()))?;
        }
        Ok(())
    }

    fn status(&self) -> Result<ServiceStatus> {
        if !plist_path()?.exists() {
            return Ok(ServiceStatus::NotInstalled);
        }
        let output = Command::new("launchctl")
            .args(["list", SERVICE_LABEL])
            .output();
        match output {
            Ok(o) if o.status.success() => Ok(ServiceStatus::Running),
            _ => Ok(ServiceStatus::Registered),
        }
    }

    fn dry_run_templates(&self, ctx: &RegisterContext) -> Result<Vec<TemplateSpec>> {
        Ok(vec![TemplateSpec {
            filename: PLIST_FILENAME.to_string(),
            body: render(ctx),
            kind: TemplateKind::Plist,
        }])
    }
}

fn run_launchctl(args: &[&str]) -> Result<()> {
    let output = Command::new("launchctl")
        .args(args)
        .output()
        .with_context(|| format!("spawn `launchctl {}`", args.join(" ")))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("launchctl {} failed: {}", args.join(" "), err.trim());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plist_has_keepalive_dict_form() {
        let body = render(&RegisterContext {
            musu_home: std::path::Path::new("/tmp/x"),
            boot_start: false,
        });
        // D11: dict-form KeepAlive with both keys.
        assert!(body.contains("<key>KeepAlive</key>"));
        assert!(body.contains("<key>SuccessfulExit</key>"));
        assert!(body.contains("<key>Crashed</key>"));
        assert!(body.contains("<key>ThrottleInterval</key>"));
    }

    #[test]
    fn plist_substitutes_musu_home() {
        let body = render(&RegisterContext {
            musu_home: std::path::Path::new("/Users/op/.musu"),
            boot_start: false,
        });
        assert!(body.contains("/Users/op/.musu/bin/musud"));
        assert!(body.contains("/Users/op/.musu/logs/musud.log"));
    }
}
