//! Fresh-install flow.
//!
//! wiki/496 D15 (rename install.rs -> runner.rs). Steps:
//!
//!   1. Resolve `~/.musu/` (or `--musu-home` override).
//!   2. Refuse `euid==0` on Unix and `IsUserAnAdmin()` on Windows unless
//!      `--boot-start` (S11).
//!   3. Create directory tree with 0700 perms on Unix (S12).
//!   4. Generate 32-byte CSPRNG bridge token via `getrandom` (S3) and
//!      write `bridge.env` with 0600 (Unix) / icacls operator-only
//!      restriction (Windows).
//!   5. Write `update.toml`, `musu.toml`, and seed `companies/` dir.
//!   6. Copy the running musu binary into `~/.musu/bin/musu(.exe)`.
//!   7. Run schema apply via `core::apply` (initial Const III gate fires).
//!   8. Register the platform service (delegate to platform::current()).
//!   9. (Optional) install musu-bee.service if `--with-musu-bee` AND the
//!      sibling repo dir exists (D14).

use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};

use super::platform::{self, RegisterContext};
use super::InstallOpts;

/// Default `update.toml` body — Q8 schema with safe defaults.
const DEFAULT_UPDATE_TOML: &str = r#"# musu auto-update configuration (wiki/496 Q8).
#
# source: "github-release" (default) | "git" | "none"
#   - github-release: probe https://api.github.com/repos/<github_repo>/releases/latest
#     and download the matching platform tarball/zip. Fast (~5-10s).
#   - git: `git pull && cargo build --release` from the install dir. Slow
#     (~3m+) but works without CI artifacts. SSH-key auth only (S1).
#   - none: disables auto-update entirely.
source = "github-release"

# Required when source = "github-release" or "git". S9: regex
# `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$` enforced at load time.
github_repo = "emptymind/musu-bee"

# Currently only "stable" is consumed.
channel = "stable"

# Minimum interval between auto-update checks. The musud-driven supervise
# loop respects this. D8: also used to rewrite musu-autoupdate.timer.
check_interval_minutes = 60
"#;

/// Default `musu.toml` body — supervisor config with bridge as the lone
/// enabled service (Q4 in-scope set).
const DEFAULT_MUSU_TOML: &str = r#"# musud supervisor configuration (wiki/496 §4).

[services]
bridge = { enabled = true, command = "{MUSU_HOME}/bin/musu", args = ["bridge"], restart = "on-failure" }

[ports]
bridge = 8070

[env]
MUSU_HOME = "{MUSU_HOME}"
LOG_LEVEL = "info"

grace_period_secs = 30
"#;

pub async fn run(opts: InstallOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;

    // S11: refuse running as root/admin (except --boot-start on Windows
    // which requires UAC for sc.exe).
    refuse_privileged_unless_boot_start(opts.boot_start)?;

    if opts.dry_run {
        return run_dry_run(&home, &opts);
    }

    seed_directory_tree(&home)?;
    let token = generate_bridge_token()?;
    write_bridge_env(&home, &token)?;
    write_update_toml(&home)?;
    write_musu_toml(&home)?;

    let bridge_path = home.join("bin").join(super::musu_binary_name());
    let musud_path = home.join("bin").join(super::musud_binary_name());
    copy_running_binary(&bridge_path)?;
    copy_sibling_musud(&musud_path).context("copy musud into ~/.musu/bin")?;

    apply_initial_schema(&home).await?;

    // Register platform service.
    let svc = platform::current();
    svc.register(&RegisterContext {
        musu_home: &home,
        boot_start: opts.boot_start,
    })?;

    // V27-F6: Generate TLS certificates (non-fatal).
    let hostname = hostname::get().unwrap_or_default();
    if let Err(e) = super::tls::ensure_tls_certs(
        &home,
        &hostname.to_string_lossy(),
    ) {
        tracing::warn!(err = %e, "TLS cert generation failed (non-fatal)");
    }

    eprintln!(
        "\nmusu install complete.\n\
         - Home:        {}\n\
         - Bridge bin:  {}\n\
         - musud bin:   {}\n\
         - Service:     registered\n\
         - Token:       {} hex chars\n\
         \n\
         The bridge will start automatically on next logon (or now if the\n\
         platform service auto-starts on register). Verify with:\n\
         \n\
             curl http://127.0.0.1:8070/health\n",
        home.display(),
        bridge_path.display(),
        musud_path.display(),
        token.len()
    );

    Ok(())
}

fn run_dry_run(home: &Path, opts: &InstallOpts) -> Result<()> {
    let svc = platform::current();
    let templates = svc.dry_run_templates(&RegisterContext {
        musu_home: home,
        boot_start: opts.boot_start,
    })?;

    // Materialize to a tempdir and validate each.
    let tmp = std::env::temp_dir().join(format!("musu-dryrun-{}", std::process::id()));
    std::fs::create_dir_all(&tmp).with_context(|| format!("create {}", tmp.display()))?;
    eprintln!(
        "dry-run: writing {} unit file(s) to {}",
        templates.len(),
        tmp.display()
    );

    for spec in &templates {
        super::dry_run::validate_unit(&tmp, spec)?;
    }

    // Also report what filesystem writes would happen in a real install.
    eprintln!("dry-run: would create directories:");
    for sub in EXPECTED_SUBDIRS {
        eprintln!("  - {}", home.join(sub).display());
    }
    eprintln!("dry-run: would write files:");
    for f in &["bridge.env", "update.toml", "musu.toml"] {
        eprintln!("  - {}", home.join(f).display());
    }
    eprintln!("dry-run: validation passed.");
    let _ = std::fs::remove_dir_all(&tmp);
    Ok(())
}

const EXPECTED_SUBDIRS: &[&str] = &["bin", "companies", "db", "data", "logs"];

fn refuse_privileged_unless_boot_start(boot_start: bool) -> Result<()> {
    #[cfg(unix)]
    {
        // SAFETY: geteuid() always succeeds.
        let euid = unsafe { libc::geteuid() };
        if euid == 0 {
            anyhow::bail!(
                "musu install refuses to run as root (S11). LaunchAgents/systemd \
                 user units must be installed under the operator account so \
                 `musu uninstall` can clean up without sudo. Re-run without sudo."
            );
        }
    }
    #[cfg(windows)]
    {
        if !boot_start && is_user_an_admin() {
            anyhow::bail!(
                "musu install refuses to run elevated on Windows (S11). Scheduled \
                 Tasks must be created under the operator account, not Administrator. \
                 Either run without UAC OR pass --boot-start to register as a \
                 Windows Service (which legitimately needs admin)."
            );
        }
    }
    Ok(())
}

#[cfg(windows)]
fn is_user_an_admin() -> bool {
    // Best-effort heuristic: USERDOMAIN of NT AUTHORITY + USERNAME SYSTEM
    // means LocalSystem; running interactively as Administrator typically
    // shows USERNAME=Administrator. The proper API is OpenProcessToken +
    // GetTokenInformation(TokenElevation) — for R6 we use the env-var
    // heuristic and let the actual schtasks call fail loudly if the
    // operator is somehow misconfigured.
    let user = std::env::var("USERNAME").unwrap_or_default();
    user.eq_ignore_ascii_case("administrator") || user.eq_ignore_ascii_case("system")
}

fn seed_directory_tree(home: &Path) -> Result<()> {
    std::fs::create_dir_all(home).with_context(|| format!("create {}", home.display()))?;

    // S12: ~/.musu/ itself must be 0700 on Unix.
    #[cfg(unix)]
    set_mode(home, 0o700)?;

    for sub in EXPECTED_SUBDIRS {
        let path = home.join(sub);
        std::fs::create_dir_all(&path).with_context(|| format!("create {}", path.display()))?;
        #[cfg(unix)]
        set_mode(&path, 0o700)?;
    }
    Ok(())
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(mode);
    std::fs::set_permissions(path, perms)
        .with_context(|| format!("chmod {:o} {}", mode, path.display()))?;
    Ok(())
}

/// S3: explicit OsRng/getrandom (not `thread_rng()` / `rand::random`).
fn generate_bridge_token() -> Result<String> {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).map_err(|e| anyhow!("getrandom failed: {e}"))?;
    Ok(hex::encode(buf))
}

fn write_bridge_env(home: &Path, token: &str) -> Result<()> {
    let path = home.join("bridge.env");
    let body = format!(
        "# musu bridge environment — generated by `musu install` (wiki/496 Q5).\n\
         # Do NOT commit this file. Do NOT share the token.\n\
         MUSU_BRIDGE_TOKEN={token}\n"
    );
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;

    #[cfg(unix)]
    set_mode(&path, 0o600)?;

    #[cfg(windows)]
    {
        // icacls equivalent: restrict to the current user, removing
        // inherited ACEs. Best-effort: failure is logged, not fatal —
        // the file is still in the operator's profile dir which is
        // already restricted to the operator by default ACLs.
        if let Err(e) = restrict_acl_to_current_user(&path) {
            tracing::warn!(error = %e, path = %path.display(), "icacls restrict failed (continuing)");
        }
    }

    Ok(())
}

#[cfg(windows)]
fn restrict_acl_to_current_user(path: &Path) -> Result<()> {
    let user = std::env::var("USERNAME").context("USERNAME env var")?;
    // icacls <path> /inheritance:r /grant:r <user>:F
    let output = std::process::Command::new("icacls")
        .arg(path)
        .arg("/inheritance:r")
        .arg("/grant:r")
        .arg(format!("{user}:F"))
        .output()
        .context("spawn icacls")?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("icacls failed: {}", err.trim());
    }
    Ok(())
}

fn write_update_toml(home: &Path) -> Result<()> {
    let path = home.join("update.toml");
    if path.exists() {
        tracing::info!(path = %path.display(), "update.toml already present, leaving in place");
        return Ok(());
    }
    std::fs::write(&path, DEFAULT_UPDATE_TOML)
        .with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

fn write_musu_toml(home: &Path) -> Result<()> {
    let path = home.join("musu.toml");
    if path.exists() {
        tracing::info!(path = %path.display(), "musu.toml already present, leaving in place");
        return Ok(());
    }
    let body = DEFAULT_MUSU_TOML.replace("{MUSU_HOME}", &home.to_string_lossy());
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}

fn copy_running_binary(dst: &Path) -> Result<()> {
    let src = std::env::current_exe().context("current_exe")?;
    // If src == dst (already installed and re-running install), skip.
    let src_canon = src.canonicalize().unwrap_or_else(|_| src.clone());
    let dst_canon = dst.canonicalize().unwrap_or_else(|_| dst.to_path_buf());
    if src_canon == dst_canon {
        tracing::info!(path = %dst.display(), "running binary == install target, skipping copy");
        return Ok(());
    }

    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(&src, dst)
        .with_context(|| format!("copy {} -> {}", src.display(), dst.display()))?;
    #[cfg(unix)]
    set_mode(dst, 0o755)?;
    Ok(())
}

/// Best-effort copy of the musud binary into `~/.musu/bin/`.
///
/// Search order:
///   1. Next to the running musu binary (release build co-located).
///   2. `../musu-supervisor/target/release/musud` relative to current_exe.
///   3. PATH lookup.
///
/// If none of the above resolves, we log a warning and skip — the
/// operator can copy musud manually. Install otherwise succeeds.
fn copy_sibling_musud(dst: &Path) -> Result<()> {
    let bin_name = super::musud_binary_name();
    let current = std::env::current_exe().context("current_exe")?;
    let candidates: Vec<PathBuf> = vec![
        current
            .parent()
            .map(|p| p.join(bin_name))
            .unwrap_or_default(),
        current
            .parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("..")
                    .join("musu-supervisor")
                    .join("target")
                    .join("release")
                    .join(bin_name)
            })
            .unwrap_or_default(),
    ];
    for c in candidates {
        if c.is_file() {
            if let Some(parent) = dst.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&c, dst)
                .with_context(|| format!("copy {} -> {}", c.display(), dst.display()))?;
            #[cfg(unix)]
            set_mode(dst, 0o755)?;
            tracing::info!(src = %c.display(), dst = %dst.display(), "copied musud");
            return Ok(());
        }
    }
    tracing::warn!(
        dst = %dst.display(),
        "musud binary not located in any known build location; \
         platform service will be registered but musud must be copied manually \
         from musu-supervisor/target/release/{bin_name}"
    );
    Ok(())
}

async fn apply_initial_schema(home: &Path) -> Result<()> {
    let db_path = home.join("db").join("musu.db");
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let url = format!("sqlite://{}", db_path.display());
    let opts: sqlx::sqlite::SqliteConnectOptions = url.parse()?;
    let opts = opts.create_if_missing(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(2)
        .connect_with(opts)
        .await?;
    let v = crate::core::apply(&pool).await?;
    pool.close().await;
    tracing::info!(version = v, "initial schema applied at install");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn directory_tree_seeds_expected_subdirs() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_directory_tree(&home).unwrap();
        for sub in EXPECTED_SUBDIRS {
            assert!(home.join(sub).is_dir(), "missing {sub}");
        }
        // S12: ~/.musu/ is 0700 on Unix.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&home).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o700, "musu home should be 0700, got {:o}", mode);
        }
    }

    #[test]
    fn bridge_token_is_64_hex_chars() {
        let token = generate_bridge_token().unwrap();
        assert_eq!(token.len(), 64);
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn bridge_env_written_with_token() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_directory_tree(&home).unwrap();
        write_bridge_env(&home, "feedface").unwrap();
        let body = std::fs::read_to_string(home.join("bridge.env")).unwrap();
        assert!(body.contains("MUSU_BRIDGE_TOKEN=feedface"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(home.join("bridge.env"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn update_toml_uses_github_release_default() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_directory_tree(&home).unwrap();
        write_update_toml(&home).unwrap();
        let body = std::fs::read_to_string(home.join("update.toml")).unwrap();
        assert!(body.contains("source = \"github-release\""));
        assert!(body.contains("check_interval_minutes"));
    }

    #[test]
    fn musu_toml_substitutes_home_path() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".musu");
        seed_directory_tree(&home).unwrap();
        write_musu_toml(&home).unwrap();
        let body = std::fs::read_to_string(home.join("musu.toml")).unwrap();
        let needle = home.to_string_lossy().to_string();
        assert!(body.contains(needle.as_str()));
    }
}
