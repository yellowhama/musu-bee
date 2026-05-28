//! Linux systemd user unit registrar.
//!
//! wiki/496 §3 NEW `install/platform/linux.rs`. Writes
//! `~/.config/systemd/user/musud.service` from the shipped template, then
//! invokes `systemctl --user daemon-reload && enable --now musud`.

use anyhow::{Context, Result};
use std::path::PathBuf;
use std::process::Command;

use super::{PlatformService, RegisterContext, ServiceStatus};
use crate::install::dry_run::{TemplateKind, TemplateSpec};

pub struct SystemdUserService;

/// Embedded template body (D12 rewrites paths from %h/musu-functions/...
/// to %h/.musu/bin/...). We do not modify the template file on disk;
/// instead we substitute placeholders at install time.
const UNIT_TEMPLATE: &str = r#"[Unit]
Description=MUSU Process Supervisor (musud)
After=network.target

[Service]
Type=simple
WorkingDirectory={MUSU_HOME}
ExecStart={MUSU_HOME}/bin/musud
KillMode=mixed
TimeoutStopSec=20
SendSIGKILL=yes
Restart=on-failure
RestartSec=5
Environment=MUSU_HOME={MUSU_HOME}

# Resource guardrails (same as the legacy musu-bridge unit).
CPUQuota=50%
MemoryMax=2048M

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
"#;

const UNIT_FILENAME: &str = "musud.service";

fn unit_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot resolve $HOME"))?;
    Ok(home.join(".config").join("systemd").join("user"))
}

fn unit_path() -> Result<PathBuf> {
    Ok(unit_dir()?.join(UNIT_FILENAME))
}

fn render(ctx: &RegisterContext<'_>) -> String {
    UNIT_TEMPLATE.replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
}

impl PlatformService for SystemdUserService {
    fn register(&self, ctx: &RegisterContext) -> Result<()> {
        let dir = unit_dir()?;
        std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

        let body = render(ctx);
        let path = unit_path()?;
        std::fs::write(&path, &body).with_context(|| format!("write {}", path.display()))?;

        // Idempotent reload + enable + start. systemctl is robust against
        // re-running; we accumulate non-fatal errors and surface them.
        run_systemctl(&["daemon-reload"])?;
        run_systemctl(&["enable", "musud.service"])?;
        run_systemctl(&["start", "musud.service"])?;
        tracing::info!(path = %path.display(), "systemd user unit registered");
        Ok(())
    }

    fn unregister(&self) -> Result<()> {
        // Best-effort: disable + stop, then remove file. Errors are logged
        // but not fatal — uninstall should be idempotent (S6).
        if let Err(e) = run_systemctl(&["disable", "--now", "musud.service"]) {
            tracing::warn!(error = %e, "systemctl disable failed (continuing)");
        }
        let path = unit_path()?;
        if path.exists() {
            std::fs::remove_file(&path).with_context(|| format!("remove {}", path.display()))?;
        }
        let _ = run_systemctl(&["daemon-reload"]);
        Ok(())
    }

    fn status(&self) -> Result<ServiceStatus> {
        if !unit_path()?.exists() {
            return Ok(ServiceStatus::NotInstalled);
        }
        let output = Command::new("systemctl")
            .args(["--user", "is-active", "musud.service"])
            .output();
        match output {
            Ok(o) if o.status.success() => Ok(ServiceStatus::Running),
            Ok(_) => Ok(ServiceStatus::Registered),
            Err(_) => Ok(ServiceStatus::Registered),
        }
    }

    fn dry_run_templates(&self, ctx: &RegisterContext) -> Result<Vec<TemplateSpec>> {
        Ok(vec![TemplateSpec {
            filename: UNIT_FILENAME.to_string(),
            body: render(ctx),
            kind: TemplateKind::SystemdUnit,
        }])
    }

    fn register_peer(&self, ctx: &crate::peer::service::PeerServiceContext) -> Result<()> {
        let dir = if let Some(over) = ctx.unit_dir_override {
            over.join(".config").join("systemd").join("user")
        } else {
            let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot resolve $HOME"))?;
            home.join(".config").join("systemd").join("user")
        };
        std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

        let template = r#"[Unit]
Description=MUSU peer worker — {PEER_KIND} ({PEER_NAME})
After=network.target

[Service]
Type=simple
WorkingDirectory={MUSU_HOME}
ExecStart={START_CMD}
Restart=on-failure
RestartSec=5
Environment=MUSU_HOME={MUSU_HOME}
Environment=MUSU_PEER_NAME={PEER_NAME}
Environment=MUSU_PEER_KIND={PEER_KIND}

NoNewPrivileges=true

[Install]
WantedBy=default.target
"#;
        let body = template
            .replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
            .replace("{PEER_NAME}", ctx.peer_name)
            .replace("{PEER_KIND}", ctx.peer_kind)
            .replace("{START_CMD}", ctx.start_cmd);

        let filename = format!("musu-peer-{}.service", ctx.peer_name);
        let path = dir.join(&filename);
        std::fs::write(&path, &body).with_context(|| format!("write {}", path.display()))?;

        if ctx.unit_dir_override.is_none() {
            run_systemctl(&["daemon-reload"])?;
            run_systemctl(&["enable", &filename])?;
            run_systemctl(&["start", &filename])?;
        }
        tracing::info!(path = %path.display(), "systemd user peer unit registered");
        Ok(())
    }

    fn unregister_peer(&self, peer_name: &str) -> Result<()> {
        let filename = format!("musu-peer-{}.service", peer_name);
        if let Err(e) = run_systemctl(&["disable", "--now", &filename]) {
            tracing::warn!(error = %e, "systemctl disable for peer {} failed (continuing)", peer_name);
        }
        let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot resolve $HOME"))?;
        let path = home
            .join(".config")
            .join("systemd")
            .join("user")
            .join(&filename);
        if path.exists() {
            std::fs::remove_file(&path).with_context(|| format!("remove {}", path.display()))?;
        }
        let _ = run_systemctl(&["daemon-reload"]);
        Ok(())
    }
}

fn run_systemctl(args: &[&str]) -> Result<()> {
    let mut cmd = Command::new("systemctl");
    cmd.arg("--user");
    for a in args {
        cmd.arg(a);
    }
    let output = cmd
        .output()
        .with_context(|| format!("spawn `systemctl --user {}`", args.join(" ")))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("systemctl --user {} failed: {}", args.join(" "), err.trim());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_substitutes_musu_home() {
        let ctx = RegisterContext {
            musu_home: std::path::Path::new("/tmp/test-musu"),
            boot_start: false,
        };
        let body = render(&ctx);
        assert!(body.contains("WorkingDirectory=/tmp/test-musu"));
        assert!(body.contains("ExecStart=/tmp/test-musu/bin/musud"));
        // D12: no inheritance of legacy musu-functions paths.
        assert!(!body.contains("musu-functions"));
    }

    #[test]
    fn unit_has_required_sections() {
        let body = render(&RegisterContext {
            musu_home: std::path::Path::new("/x"),
            boot_start: false,
        });
        assert!(body.contains("[Unit]"));
        assert!(body.contains("[Service]"));
        assert!(body.contains("[Install]"));
    }
}
