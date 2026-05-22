//! Windows service registrar.
//!
//! wiki/496 §3 NEW `install/platform/windows.rs`. Two paths:
//!
//!   1. **Default** (`musu install`): Scheduled Task `Musu\musud` with
//!      LogonType=InteractiveToken. Triggered by user logon. Requires NO
//!      admin elevation. D3: `MultipleInstancesPolicy=StopExisting`.
//!
//!   2. **Opt-in** (`musu install --boot-start`): Windows Service via the
//!      `windows-service` crate. Boots at machine start; requires UAC and
//!      an EXPLICIT non-system operator account. S2: account passes through
//!      `NonLocalSystemAccount` newtype which refuses construction with
//!      LocalSystem/LocalService/NetworkService strings.

use anyhow::{Context, Result};
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;

use super::{PlatformService, RegisterContext, ServiceStatus};
use crate::install::dry_run::{TemplateKind, TemplateSpec};

pub struct WindowsService;

const TASK_NAME: &str = r"Musu\musud";
const SERVICE_NAME: &str = "musud";

/// Scheduled Task XML body (D3: StopExisting; F5/F19: InteractiveToken,
/// no elevation; Count=5 Interval=PT5M from D3 recalibration).
const TASK_XML: &str = r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>MUSU process supervisor (musud) — logon-triggered.</Description>
    <URI>\Musu\musud</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{USER_ID}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{USER_ID}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>5</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{MUSUD_PATH}</Command>
      <WorkingDirectory>{MUSU_HOME}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"#;

const TASK_FILENAME: &str = "musud_task.xml";

fn render_task_xml(ctx: &RegisterContext<'_>) -> String {
    let user_id = current_user_id();
    let musud_path = ctx
        .musu_home
        .join("bin")
        .join("musud.exe")
        .to_string_lossy()
        .to_string();
    TASK_XML
        .replace("{USER_ID}", &user_id)
        .replace("{MUSUD_PATH}", &musud_path)
        .replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy())
}

fn current_user_id() -> String {
    let user = std::env::var("USERNAME").unwrap_or_default();
    let domain = std::env::var("USERDOMAIN").unwrap_or_else(|_| ".".to_string());
    if user.is_empty() {
        ".\\Operator".to_string()
    } else {
        format!("{domain}\\{user}")
    }
}

// ── S2: NonLocalSystemAccount newtype ─────────────────────────────────────
//
// The `windows-service` crate's `ServiceInfo::account_name: Option<OsString>`
// silently defaults to LocalSystem when `None`. F5 forbids that. S2
// upgrades the ban from "intent" to "type system" — every call site
// MUST construct a NonLocalSystemAccount which refuses LocalSystem /
// LocalService / NetworkService.

/// A Windows account name that is GUARANTEED not to be one of the three
/// well-known system principals. Constructed via `try_new` (refuses
/// LocalSystem etc.) — every call to `windows-service`'s service-create
/// path goes through this so a typo or refactor can never reach
/// `account_name: None` (S2 type-system enforcement).
///
/// R6 audit-fix (Auditor B QB3): the `--boot-start` install path was
/// deferred to V25 because the previous Builder used a literal
/// `password= ********` placeholder in the sc.exe invocation. The
/// NonLocalSystemAccount newtype + tests remain in place so the V25
/// implementation has the type-safety scaffolding ready.
#[allow(dead_code)] // Used by V25 boot-start path + retained for tests.
#[derive(Debug, Clone)]
pub struct NonLocalSystemAccount(OsString);

#[allow(dead_code)] // Used by V25 boot-start path + retained for tests.
#[derive(Debug, thiserror::Error)]
pub enum NonLocalSystemAccountError {
    #[error(
        "refusing to register musud as the well-known system principal '{0}' (S2). \
         --boot-start requires an explicit non-system operator account."
    )]
    BannedPrincipal(String),
    #[error("account name is empty or whitespace-only")]
    Empty,
}

#[allow(dead_code)] // Used by V25 boot-start path + retained for tests.
impl NonLocalSystemAccount {
    /// Construct from a raw account name. Refuses the three banned
    /// well-known principals (case-insensitive, with and without the
    /// `NT AUTHORITY\` prefix) plus the empty/whitespace cases.
    pub fn try_new(raw: impl Into<OsString>) -> Result<Self, NonLocalSystemAccountError> {
        let name: OsString = raw.into();
        let lossy = name.to_string_lossy().trim().to_string();
        if lossy.is_empty() {
            return Err(NonLocalSystemAccountError::Empty);
        }
        let upper = lossy.to_uppercase();
        let banned = [
            "LOCALSYSTEM",
            "LOCAL SYSTEM",
            "NT AUTHORITY\\SYSTEM",
            "NT AUTHORITY\\LOCAL SYSTEM",
            ".\\SYSTEM",
            "LOCALSERVICE",
            "NT AUTHORITY\\LOCALSERVICE",
            "NT AUTHORITY\\LOCAL SERVICE",
            "NETWORKSERVICE",
            "NT AUTHORITY\\NETWORKSERVICE",
            "NT AUTHORITY\\NETWORK SERVICE",
        ];
        if banned.iter().any(|b| upper == *b) {
            return Err(NonLocalSystemAccountError::BannedPrincipal(lossy));
        }
        Ok(Self(name))
    }

    pub fn as_os_str(&self) -> &OsString {
        &self.0
    }
}

impl PlatformService for WindowsService {
    fn register(&self, ctx: &RegisterContext) -> Result<()> {
        if ctx.boot_start {
            register_boot_start(ctx)
        } else {
            register_scheduled_task(ctx)
        }
    }

    fn unregister(&self) -> Result<()> {
        // Try both paths; whichever was used will succeed.
        let task_err = run_schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]).err();
        let svc_err = uninstall_boot_start().err();
        if task_err.is_some() && svc_err.is_some() {
            tracing::warn!(
                task = ?task_err,
                service = ?svc_err,
                "neither Scheduled Task nor Windows Service uninstall succeeded — service may not have been registered"
            );
        }
        Ok(())
    }

    fn status(&self) -> Result<ServiceStatus> {
        // Scheduled Task path first.
        let task_query = Command::new("schtasks")
            .args(["/Query", "/TN", TASK_NAME])
            .output();
        if let Ok(o) = task_query {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                if stdout.contains("Running") {
                    return Ok(ServiceStatus::Running);
                }
                return Ok(ServiceStatus::Registered);
            }
        }
        // Windows Service path.
        let svc_query = Command::new("sc").args(["query", SERVICE_NAME]).output();
        if let Ok(o) = svc_query {
            if o.status.success() {
                let stdout = String::from_utf8_lossy(&o.stdout);
                if stdout.contains("RUNNING") {
                    return Ok(ServiceStatus::Running);
                }
                return Ok(ServiceStatus::Registered);
            }
        }
        Ok(ServiceStatus::NotInstalled)
    }

    fn dry_run_templates(&self, ctx: &RegisterContext) -> Result<Vec<TemplateSpec>> {
        Ok(vec![TemplateSpec {
            filename: TASK_FILENAME.to_string(),
            body: render_task_xml(ctx),
            kind: TemplateKind::ScheduledTaskXml,
        }])
    }

    fn register_peer(&self, ctx: &crate::peer::service::PeerServiceContext) -> Result<()> {
        let dir = if let Some(over) = ctx.unit_dir_override {
            over.join(".musu").join("scheduled_tasks")
        } else {
            scheduled_task_xml_dir()?
        };
        std::fs::create_dir_all(&dir).with_context(|| "create scheduled-task xml dir")?;

        let user_id = current_user_id();
        let escaped_start = xml_escape(ctx.start_cmd);
        let template = r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>MUSU peer worker — {PEER_KIND} ({PEER_NAME})</Description>
    <URI>\Musu\peer-{PEER_NAME}</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{USER_ID}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{USER_ID}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>5</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c {START_CMD}</Arguments>
      <WorkingDirectory>{MUSU_HOME}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"#;
        let body = template
            .replace("{USER_ID}", &user_id)
            .replace("{PEER_NAME}", ctx.peer_name)
            .replace("{PEER_KIND}", ctx.peer_kind)
            .replace("{START_CMD}", &escaped_start)
            .replace("{MUSU_HOME}", &ctx.musu_home.to_string_lossy());

        let filename = format!("peer-{}_task.xml", ctx.peer_name);
        let xml_path = dir.join(&filename);
        std::fs::write(&xml_path, &body).with_context(|| format!("write {}", xml_path.display()))?;

        if ctx.unit_dir_override.is_none() {
            let full_task_name = format!(r"Musu\peer-{}", ctx.peer_name);
            run_schtasks(&[
                "/Create",
                "/TN",
                &full_task_name,
                "/XML",
                xml_path.to_string_lossy().as_ref(),
                "/F",
            ])?;
        }
        tracing::info!(peer_name = %ctx.peer_name, "Scheduled Task registered");
        Ok(())
    }

    fn unregister_peer(&self, peer_name: &str) -> Result<()> {
        let full_task_name = format!(r"Musu\peer-{}", peer_name);
        let _ = run_schtasks(&["/Delete", "/TN", &full_task_name, "/F"]);
        Ok(())
    }
}

fn xml_escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

fn register_scheduled_task(ctx: &RegisterContext) -> Result<()> {
    let xml_path = scheduled_task_xml_dir()?.join(TASK_FILENAME);
    std::fs::create_dir_all(scheduled_task_xml_dir()?)
        .with_context(|| "create scheduled-task xml dir")?;
    std::fs::write(&xml_path, render_task_xml(ctx))
        .with_context(|| format!("write {}", xml_path.display()))?;

    // schtasks /Create /F = overwrite if already present (idempotent).
    run_schtasks(&[
        "/Create",
        "/TN",
        TASK_NAME,
        "/XML",
        xml_path.to_string_lossy().as_ref(),
        "/F",
    ])?;
    tracing::info!(task = %TASK_NAME, "Scheduled Task registered");
    Ok(())
}

fn register_boot_start(ctx: &RegisterContext) -> Result<()> {
    // R6 audit-fix (Auditor B QB3 — privilege-escalation HIGH):
    //
    // The earlier R6 Builder pass attempted to register the Windows Service
    // via `sc.exe create ... password= ********` where the literal asterisks
    // were intended as a placeholder for a password supplied via env var.
    // sc.exe DOES NOT substitute the asterisks — they would be passed
    // verbatim, registering the service with the literal string `********`
    // as its password and producing either a service that fails silently or
    // (worse) one registered with a trivially-guessable credential.
    //
    // For R6 we explicitly refuse the boot-start path until the secure
    // credential plumbing lands (V25). The S2 NonLocalSystemAccount newtype
    // and tests stay in place so the future implementation can pick up
    // where this stub left off.
    let _ = ctx; // unused in R6 — kept for V25 callsite compatibility

    // If the operator has set the env vars in anticipation, refuse with a
    // clear message so they don't think the install silently succeeded.
    if std::env::var("MUSU_BOOT_START_ACCOUNT").is_ok()
        || std::env::var("MUSU_BOOT_START_PASSWORD").is_ok()
    {
        anyhow::bail!(
            "--boot-start is not yet shipped in R6; tracked as V25 backlog. \
             The earlier R6 Builder pass had a privilege-escalation bug where \
             sc.exe was invoked with a literal `password= ********` (the \
             asterisks were not a placeholder). The NonLocalSystemAccount \
             type-safety remains in place for the V25 implementation. \
             Re-run `musu install` without --boot-start to use the default \
             Scheduled Task (logon-start) path."
        );
    }

    anyhow::bail!(
        "--boot-start is not yet shipped in R6; tracked as V25 backlog. \
         Use the default Scheduled Task (logon-start) install path."
    )
}

fn uninstall_boot_start() -> Result<()> {
    let _ = run_sc(&["stop", SERVICE_NAME]);
    run_sc(&["delete", SERVICE_NAME])?;
    Ok(())
}

fn scheduled_task_xml_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot resolve %USERPROFILE%"))?;
    Ok(home.join(".musu").join("install"))
}

fn run_schtasks(args: &[&str]) -> Result<()> {
    let output = Command::new("schtasks")
        .args(args)
        .output()
        .with_context(|| format!("spawn `schtasks {}`", args.join(" ")))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        anyhow::bail!(
            "schtasks {} failed:\n  stderr: {}\n  stdout: {}",
            args.join(" "),
            err.trim(),
            out.trim()
        );
    }
    Ok(())
}

fn run_sc(args: &[&str]) -> Result<()> {
    let output = Command::new("sc")
        .args(args)
        .output()
        .with_context(|| format!("spawn `sc {}`", args.join(" ")))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        anyhow::bail!(
            "sc {} failed:\n  stderr: {}\n  stdout: {}",
            args.join(" "),
            err.trim(),
            out.trim()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_local_system_account() {
        for banned in &[
            "LocalSystem",
            "LOCALSYSTEM",
            "NT AUTHORITY\\System",
            ".\\System",
            "LocalService",
            "NetworkService",
        ] {
            let err = NonLocalSystemAccount::try_new(*banned).unwrap_err();
            assert!(
                matches!(err, NonLocalSystemAccountError::BannedPrincipal(_)),
                "{banned} should be banned, got {err:?}"
            );
        }
    }

    #[test]
    fn accepts_normal_operator_accounts() {
        for ok in &[
            "DESKTOP-AB1\\operator",
            "CORPDOMAIN\\jane.doe",
            ".\\Administrator", // local Administrator is non-system
        ] {
            let acc = NonLocalSystemAccount::try_new(*ok)
                .unwrap_or_else(|e| panic!("{ok} should be accepted, got {e:?}"));
            assert_eq!(acc.as_os_str().to_string_lossy().as_ref(), *ok);
        }
    }

    #[test]
    fn refuses_empty_account() {
        let err = NonLocalSystemAccount::try_new("").unwrap_err();
        assert!(matches!(err, NonLocalSystemAccountError::Empty));
        let err = NonLocalSystemAccount::try_new("   ").unwrap_err();
        assert!(matches!(err, NonLocalSystemAccountError::Empty));
    }

    /// Auditor B QB3 audit-fix: --boot-start must refuse with a clear
    /// message rather than silently invoking `sc.exe ... password= ********`
    /// with literal asterisks. The bail message must explicitly cite V25
    /// so operators know to re-run without --boot-start.
    #[test]
    fn boot_start_refuses_with_clear_message() {
        let ctx = RegisterContext {
            musu_home: std::path::Path::new("C:\\Users\\op\\.musu"),
            boot_start: true,
        };
        // Clear env vars first to exercise the unconditional bail.
        std::env::remove_var("MUSU_BOOT_START_ACCOUNT");
        std::env::remove_var("MUSU_BOOT_START_PASSWORD");
        let err = register_boot_start(&ctx).expect_err("--boot-start must bail in R6");
        let msg = format!("{err}");
        assert!(
            msg.contains("V25"),
            "bail message should cite V25 backlog: {msg}"
        );
        assert!(
            msg.contains("not yet shipped"),
            "bail message should say not yet shipped: {msg}"
        );
    }

    /// Auditor B QB3 audit-fix: even with env vars set, refuse rather than
    /// invoke sc.exe with a broken password literal.
    #[test]
    fn boot_start_refuses_even_when_env_vars_set() {
        let ctx = RegisterContext {
            musu_home: std::path::Path::new("C:\\Users\\op\\.musu"),
            boot_start: true,
        };
        std::env::set_var("MUSU_BOOT_START_ACCOUNT", "DOMAIN\\op");
        std::env::set_var("MUSU_BOOT_START_PASSWORD", "irrelevant");
        let err = register_boot_start(&ctx).expect_err("env vars set must still bail");
        // Cleanup so we don't leak into sibling tests.
        std::env::remove_var("MUSU_BOOT_START_ACCOUNT");
        std::env::remove_var("MUSU_BOOT_START_PASSWORD");
        let msg = format!("{err}");
        assert!(msg.contains("V25"), "bail must cite V25 backlog: {msg}");
        assert!(
            msg.contains("privilege-escalation") || msg.contains("password"),
            "bail must explain the credential plumbing issue: {msg}"
        );
    }

    #[test]
    fn task_xml_has_required_d3_tags() {
        let body = render_task_xml(&RegisterContext {
            musu_home: std::path::Path::new("C:\\Users\\op\\.musu"),
            boot_start: false,
        });
        assert!(body.contains("<MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>"));
        assert!(body.contains("<LogonType>InteractiveToken</LogonType>"));
        assert!(body.contains("<RunLevel>LeastPrivilege</RunLevel>"));
        assert!(body.contains("<Interval>PT5M</Interval>"));
        assert!(body.contains("<Count>5</Count>"));
    }
}
