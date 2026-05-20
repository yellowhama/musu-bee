//! `musu install --dry-run` — validate planned writes without executing.
//!
//! wiki/496 D13. Real validation, not a stub. Writes unit files to a
//! tempdir, then:
//!   - Linux: shells out to `systemd-analyze verify <unit>` if available;
//!   - macOS: shells out to `plutil -lint <plist>` if available;
//!   - Windows: parses the Scheduled Task XML for well-formedness via the
//!     `roxmltree` crate is overkill for R6 — we do a string-level
//!     check that all required tags are present.
//!
//! Returns Ok on first parse failure with a contextual message rather
//! than silently passing.

use anyhow::{Context, Result};
use std::path::Path;
use std::process::Command;

/// A rendered unit file ready to validate / write to disk.
#[derive(Debug, Clone)]
pub struct TemplateSpec {
    pub filename: String,
    pub body: String,
    pub kind: TemplateKind,
}

/// Three valid template categories. The active variant depends on
/// `cfg(target_os = ...)`, so the inactive variants are technically
/// "unused" per cfg-conditional dead-code analysis.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum TemplateKind {
    SystemdUnit,
    Plist,
    ScheduledTaskXml,
}

/// Validate one rendered unit-file blob. Writes to `out_dir/<name>` then
/// invokes the platform validator.
pub fn validate_unit(out_dir: &Path, spec: &TemplateSpec) -> Result<()> {
    let path = out_dir.join(&spec.filename);
    std::fs::write(&path, &spec.body).with_context(|| format!("write {}", path.display()))?;

    match spec.kind {
        TemplateKind::SystemdUnit => validate_systemd(&path),
        TemplateKind::Plist => validate_plist(&path),
        TemplateKind::ScheduledTaskXml => validate_scheduled_task_xml(&path, &spec.body),
    }
}

fn validate_systemd(path: &Path) -> Result<()> {
    let res = Command::new("systemd-analyze")
        .arg("verify")
        .arg(path)
        .output();
    match res {
        Ok(output) if output.status.success() => {
            tracing::info!(path = %path.display(), "systemd-analyze verify: pass");
            Ok(())
        }
        Ok(output) => {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!(
                "systemd-analyze verify failed for {}: {err}",
                path.display()
            )
        }
        Err(e) => {
            // systemd-analyze not present (e.g., running dry-run on a non-Linux
            // host while developing). Soft-pass with a warning.
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "systemd-analyze unavailable; skipping syntax check"
            );
            Ok(())
        }
    }
}

fn validate_plist(path: &Path) -> Result<()> {
    let res = Command::new("plutil").arg("-lint").arg(path).output();
    match res {
        Ok(output) if output.status.success() => {
            tracing::info!(path = %path.display(), "plutil -lint: pass");
            Ok(())
        }
        Ok(output) => {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("plutil -lint failed for {}: {err}", path.display())
        }
        Err(_) => {
            tracing::warn!(
                path = %path.display(),
                "plutil unavailable; skipping plist lint"
            );
            Ok(())
        }
    }
}

/// String-level check that the Scheduled Task XML body has all required
/// tags. A full XML parse is overkill for R6 and would add a 60KB dep.
///
/// We match opening-tag prefixes (e.g., `<Actions`) so attribute-bearing
/// tags like `<Actions Context="Author">` still validate.
fn validate_scheduled_task_xml(path: &Path, body: &str) -> Result<()> {
    let required_tags = [
        "<Task",
        "<Triggers>",
        "<Principals>",
        "<Settings>",
        "<Actions",
        "<MultipleInstancesPolicy>StopExisting</MultipleInstancesPolicy>", // D3
        "<LogonType>InteractiveToken</LogonType>",                         // F5/F19
    ];
    for tag in &required_tags {
        if !body.contains(tag) {
            anyhow::bail!(
                "Scheduled Task XML at {} is missing required tag: {}",
                path.display(),
                tag
            );
        }
    }
    tracing::info!(path = %path.display(), "Scheduled Task XML: required tags present");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scheduled_task_xml_requires_stop_existing() {
        let path = std::path::PathBuf::from("noop.xml");
        // Missing the StopExisting tag (D3) — must fail. Body must
        // include enough of the surface that ONLY the StopExisting
        // requirement causes the failure (so we can assert on it).
        let bad = r#"<Task>
            <Triggers></Triggers>
            <Principals><Principal><LogonType>InteractiveToken</LogonType></Principal></Principals>
            <Settings></Settings>
            <Actions Context="Author"></Actions>
        </Task>"#;
        let err = validate_scheduled_task_xml(&path, bad).unwrap_err();
        assert!(err.to_string().contains("StopExisting"), "got: {err}");
    }

    #[test]
    fn scheduled_task_xml_accepts_well_formed() {
        let body = include_str!("../../../scripts/windows/musud_task.xml.tmpl");
        let path = std::path::PathBuf::from("musud_task.xml");
        // The shipped template must validate cleanly — sanity check that
        // we don't accidentally break it.
        validate_scheduled_task_xml(&path, body).unwrap();
    }
}
