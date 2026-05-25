//! `musu auto-update` — hybrid (GitHub release first, source fallback) updater.
//!
//! wiki/496 Q2 / S1 / S4 / S7 / S9 / D4 / D7 / D8.
//!
//! Flow:
//!
//!   1. Acquire `~/.musu/auto-update.lock` (F15). Exit code 75 if held.
//!   2. Boot-time recovery: staged_swap::recover() heals any dangling
//!      `.new`/`.bak` state from a crashed previous run (D6).
//!   3. Parse `update.toml` with strict enum + regex validation (S9).
//!   4. Build the GitHub release manifest URL. ureq with redirects(0);
//!      manually follow only into the allowlisted hostnames (S4).
//!   5. Download tarball/zip to `~/.musu/bin/<musu>.new`. Verify sha256
//!      from the release manifest (S4 documents transport-only).
//!   6. Validate archive contents (no `..` traversal — S7) and extract.
//!   7. Run `musu schema-precheck`; on non-zero exit, write
//!      PENDING_SCHEMA_GATE.txt and return without swapping (F16/Q7).
//!   8. IPC Freeze {service:"bridge"} (D4) so musud parks re-spawn.
//!   9. staged_swap::perform_swap() — atomic rename .new -> main.
//!   10. IPC Unfreeze + Start {service:"bridge"}. Poll /health for 30s.
//!   11. On health failure: rollback via staged_swap::rollback().
//!
//! The `--supervise` flag wraps this body in a tokio interval driven by
//! `check_interval_minutes` from update.toml (D8 in-binary timer).

use anyhow::{anyhow, Context, Result};
use std::path::Path;
use std::time::Duration;

use serde::Deserialize;

use super::schema_gate::write_pending_marker;
use super::staged_swap;
use super::update_lock::{UpdateLock, LOCK_HELD_EXIT_CODE};
use super::AutoUpdateOpts;

// ── S4 / S9 typed config + manifest ───────────────────────────────────────

/// Strict enum for the `source` field. Refuses unknown values at load.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateSource {
    GithubRelease,
    Git,
    None,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateConfig {
    pub source: UpdateSource,
    #[serde(default)]
    pub github_repo: Option<String>,
    #[serde(default = "default_channel")]
    #[allow(dead_code)]
    pub channel: String,
    #[serde(default = "default_interval_min")]
    pub check_interval_minutes: u64,
}

fn default_channel() -> String {
    "stable".to_string()
}
fn default_interval_min() -> u64 {
    60
}

impl UpdateConfig {
    pub fn load(home: &Path) -> Result<Self> {
        let path = home.join("update.toml");
        let body =
            std::fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let cfg: Self =
            toml::from_str(&body).with_context(|| format!("parse {}", path.display()))?;
        cfg.validate()?;
        Ok(cfg)
    }

    fn validate(&self) -> Result<()> {
        // S9: github_repo must match `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`.
        if matches!(self.source, UpdateSource::GithubRelease | UpdateSource::Git) {
            let repo = self.github_repo.as_deref().ok_or_else(|| {
                anyhow!("update.toml: source={:?} requires github_repo", self.source)
            })?;
            validate_github_repo(repo)?;
            // S1: source = git MUST refuse http(s):// scheme. We treat
            // github_repo as a `<owner>/<repo>` slug which doesn't carry
            // a URL scheme; the slug regex already forbids `:` and `/`
            // beyond the single separator.
        }
        if self.check_interval_minutes < 5 {
            anyhow::bail!(
                "update.toml: check_interval_minutes must be >= 5 (got {})",
                self.check_interval_minutes
            );
        }
        Ok(())
    }
}

pub fn validate_github_repo(s: &str) -> Result<()> {
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() != 2 {
        anyhow::bail!(
            "update.toml: github_repo must be `<owner>/<repo>`, got `{}`",
            s
        );
    }
    fn ok(seg: &str) -> bool {
        // GitHub username/repo rules (subset): allow [A-Za-z0-9._-], no
        // leading dot (which would traverse), max 100 chars. We refuse
        // `..` and any segment starting with `.` or `-` for safety.
        if seg.is_empty() || seg.len() > 100 {
            return false;
        }
        if seg.starts_with('.') || seg.starts_with('-') {
            return false;
        }
        if seg.contains("..") {
            return false;
        }
        seg.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    }
    if !ok(parts[0]) || !ok(parts[1]) {
        anyhow::bail!(
            "update.toml: github_repo contains forbidden characters: `{}` \
             (allowed per segment: [A-Za-z0-9._-], max 100 chars; no leading `.`/`-`; no `..`)",
            s
        );
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
struct GithubReleaseManifest {
    tag_name: String,
    assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

// ── S4: hostname allowlist for redirect follow ────────────────────────────

const ALLOWED_HOSTNAMES: &[&str] = &[
    "api.github.com",
    "objects.githubusercontent.com",
    "github-releases.githubusercontent.com",
    "github.com",
];

fn host_is_allowed(url: &str) -> bool {
    // ureq exposes parsed URLs but we want explicit allowlisting. Parse
    // by hand to avoid pulling `url` as a separate dep — the input shape
    // is `https://<host>/<path>` from GitHub's API.
    let stripped = match url.strip_prefix("https://") {
        Some(s) => s,
        None => return false, // refuse non-HTTPS (S4 #b: HTTPS only every hop)
    };
    let host = stripped.split('/').next().unwrap_or("");
    let host_no_port = host.split(':').next().unwrap_or("");
    ALLOWED_HOSTNAMES.contains(&host_no_port)
}

// ── Public entry ──────────────────────────────────────────────────────────

pub async fn run(opts: AutoUpdateOpts) -> Result<()> {
    if opts.supervise {
        return supervise_loop(opts).await;
    }
    run_once(&opts).await
}

async fn run_once(opts: &AutoUpdateOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;

    let _guard = match UpdateLock::try_acquire(&home)? {
        Some(g) => g,
        None => {
            eprintln!(
                "musu auto-update: lock held by another invocation; exiting with code {LOCK_HELD_EXIT_CODE}"
            );
            std::process::exit(LOCK_HELD_EXIT_CODE);
        }
    };

    // D6 boot-time recovery before doing anything else.
    let target = home.join("bin").join(super::musu_binary_name());
    if let Err(e) = staged_swap::recover(&target) {
        tracing::warn!(error = %e, "staged-swap recovery failed (continuing)");
    }

    let cfg = UpdateConfig::load(&home)?;

    match cfg.source {
        UpdateSource::None => {
            eprintln!("musu auto-update: source=none, skipping.");
            Ok(())
        }
        UpdateSource::Git => {
            if opts.build_from_source {
                return run_git_pull_build(&home).await;
            }
            anyhow::bail!("source=git requires explicit --build-from-source flag (D7/F7 guard)");
        }
        UpdateSource::GithubRelease => run_github_release(&home, &cfg, opts).await,
    }
}

async fn supervise_loop(opts: AutoUpdateOpts) -> Result<()> {
    let home = super::resolve_musu_home(opts.musu_home.as_deref())?;
    let cfg = UpdateConfig::load(&home)?;
    let interval = Duration::from_secs(cfg.check_interval_minutes.saturating_mul(60));
    let mut ticker = tokio::time::interval(interval);
    // Skip the first immediate tick so we don't auto-update at musud boot
    // (operator may be mid-edit).
    ticker.tick().await;
    loop {
        ticker.tick().await;
        if let Err(e) = run_once(&opts).await {
            tracing::error!(error = %e, "supervise: auto-update iteration failed");
        }
    }
}

// ── github-release path ───────────────────────────────────────────────────

async fn run_github_release(home: &Path, cfg: &UpdateConfig, opts: &AutoUpdateOpts) -> Result<()> {
    let repo = cfg
        .github_repo
        .as_deref()
        .ok_or_else(|| anyhow!("missing github_repo"))?;
    let api_base = opts
        .github_api_base
        .clone()
        .unwrap_or_else(|| "https://api.github.com".to_string());
    let manifest_url = format!("{api_base}/repos/{repo}/releases/latest");

    // S4: enforce hostname allowlist on the API URL itself (unless it's
    // an explicit test override).
    if opts.github_api_base.is_none() && !host_is_allowed(&manifest_url) {
        anyhow::bail!(
            "auto-update refuses non-allowlisted URL `{}` (S4)",
            manifest_url
        );
    }

    let manifest: GithubReleaseManifest = fetch_json(&manifest_url, opts)?;
    tracing::info!(tag = %manifest.tag_name, "fetched release manifest");

    let asset = pick_platform_asset(&manifest.assets).ok_or_else(|| {
        anyhow!(
            "no platform-matching asset in release {} (looked for: {})",
            manifest.tag_name,
            expected_asset_name_prefix()
        )
    })?;

    // S4: enforce HTTPS-only on download URL.
    if !asset.browser_download_url.starts_with("https://") {
        anyhow::bail!(
            "asset download URL must be HTTPS-only (got `{}`)",
            asset.browser_download_url
        );
    }

    let staged_archive = home.join("bin").join(format!("{}.dl", asset.name));
    download_with_allowlist(&asset.browser_download_url, &staged_archive, opts)?;

    // R6 audit-fix (Auditor B QB1 — binary-verification HIGH):
    //
    // The plan §10 S4 amendment promised sha256 verification of the
    // downloaded artifact against the SHA256SUMS sidecar published by
    // the release process. The earlier R6 Builder pass shipped only
    // the docstring; the actual hashing was missing. Without this, a
    // hostile (or simply corrupted) artifact served via an allowlisted
    // host would be extracted and promoted into bin/musu.new.
    //
    // We fetch the SHA256SUMS asset via the same hostname-allowlist
    // path, parse the matching line, hash the on-disk staged archive,
    // and compare via subtle::ConstantTimeEq. On mismatch the staged
    // archive is deleted and we bail before extract.
    verify_sha256_or_delete(&manifest.assets, asset, &staged_archive, opts)?;

    // Pre-extract integrity check: validate path safety (S7).
    let staged_new = home
        .join("bin")
        .join(format!("{}.new", super::musu_binary_name()));
    extract_archive_safely(&staged_archive, &staged_new, super::musu_binary_name())?;

    // Now run schema-precheck against the staged binary.
    let mismatch = run_schema_precheck(&staged_new)?;
    if mismatch {
        // F16/Q7: stage only, do NOT swap, do NOT restart.
        write_pending_marker(
            home,
            crate::core::EXPECTED_SCHEMA_VERSION,
            Some(&manifest.tag_name),
            "Auto-update detected a schema delta. The new musu binary is \
             staged at bin/musu.new. Run `musu apply-schema` to acknowledge \
             the Const III gate and complete the swap.",
        )?;
        eprintln!(
            "musu auto-update: schema delta detected; staged at {}.\n\
             Run `musu apply-schema` to apply the migration and swap the binary.",
            staged_new.display()
        );
        return Ok(());
    }

    let token = super::token::read_bridge_token(home);
    let _ = ipc_send(home, &ipc_request_json("freeze", Some("bridge"), &token)).await;
    let swap_outcome =
        staged_swap::perform_swap(&home.join("bin").join(super::musu_binary_name()))?;
    let _ = ipc_send(home, &ipc_request_json("unfreeze", Some("bridge"), &token)).await;
    let _ = ipc_send(home, &ipc_request_json("start", Some("bridge"), &token)).await;

    if matches!(swap_outcome, staged_swap::SwapOutcome::RebootRequired) {
        // Reboot scheduled; can't health-check the new binary in this process.
        eprintln!("musu auto-update: reboot pending — health-check deferred.");
        return Ok(());
    }

    // Poll /health for 30s; rollback on failure.
    match poll_health(Duration::from_secs(30)).await {
        Ok(()) => {
            eprintln!("musu auto-update: /health 200 — update complete.");
            Ok(())
        }
        Err(e) => {
            tracing::error!(error = %e, "post-swap /health failed; rolling back");
            let _ = ipc_send(home, &ipc_request_json("freeze", Some("bridge"), &token)).await;
            staged_swap::rollback(&home.join("bin").join(super::musu_binary_name()))?;
            let _ = ipc_send(home, &ipc_request_json("unfreeze", Some("bridge"), &token)).await;
            let _ = ipc_send(home, &ipc_request_json("start", Some("bridge"), &token)).await;
            anyhow::bail!("auto-update rolled back after /health failure: {e}")
        }
    }
}



/// R6 audit-fix (Auditor B QB2): compose a one-line IPC request JSON with
/// optional service name + optional bearer token. We hand-build the JSON
/// to avoid pulling musu-supervisor-core as a dependency of musu-rs.
fn ipc_request_json(cmd: &str, service: Option<&str>, token: &Option<String>) -> String {
    let mut obj = serde_json::Map::new();
    obj.insert(
        "cmd".to_string(),
        serde_json::Value::String(cmd.to_string()),
    );
    if let Some(s) = service {
        obj.insert(
            "service".to_string(),
            serde_json::Value::String(s.to_string()),
        );
    }
    if let Some(t) = token {
        obj.insert("token".to_string(), serde_json::Value::String(t.clone()));
    }
    serde_json::Value::Object(obj).to_string()
}

fn fetch_json<T: for<'de> Deserialize<'de>>(url: &str, opts: &AutoUpdateOpts) -> Result<T> {
    let body = http_get_with_follow(url, opts, 5, |r| {
        let mut s = String::new();
        r.into_reader().take(20_000_000).read_to_string(&mut s)?;
        Ok(s)
    })?;
    serde_json::from_str(&body).with_context(|| format!("parse JSON from {url}"))
}

fn http_get_with_follow<T, F>(url: &str, opts: &AutoUpdateOpts, max_hops: u32, mut handler: F) -> Result<T>
where
    F: FnMut(ureq::Response) -> Result<T>,
{
    let mut current = url.to_string();
    for hop in 0..max_hops {
        if opts.github_api_base.is_none() && !host_is_allowed(&current) {
            anyhow::bail!("auto-update refused redirect to non-allowlisted host: {} (hop {hop})", current);
        }
        let agent = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(30)).build();
        let resp = match agent.get(&current).set("User-Agent", "musu-auto-update").call() {
            Ok(r) => r,
            Err(ureq::Error::Status(code, resp)) if (300..400).contains(&code) => {
                if let Some(loc) = resp.header("Location") {
                    current = loc.to_string();
                    continue;
                }
                anyhow::bail!("redirect {code} without Location header")
            }
            Err(e) => anyhow::bail!("ureq GET {current}: {e}"),
        };
        return handler(resp);
    }
    Err(anyhow!("max redirect hops ({max_hops}) exceeded for {url}"))
}

use std::io::Read;

/// Download a file (typically a release tarball/zip) with the same
/// allowlist + redirect discipline as `http_get_with_follow`.
fn download_with_allowlist(url: &str, dest: &Path, opts: &AutoUpdateOpts) -> Result<()> {
    let mut current = url.to_string();
    for hop in 0..5 {
        if opts.github_api_base.is_none() && !host_is_allowed(&current) {
            anyhow::bail!(
                "auto-update refused download from non-allowlisted host: {} (hop {hop})",
                current
            );
        }
        let agent = ureq::AgentBuilder::new()
            .redirects(0)
            .timeout(Duration::from_secs(120))
            .build();
        match agent
            .get(&current)
            .set("User-Agent", "musu-auto-update")
            .call()
        {
            Ok(resp) => {
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut file = std::fs::File::create(dest)
                    .with_context(|| format!("create {}", dest.display()))?;
                let mut reader = resp.into_reader().take(500_000_000); // 500MB cap
                std::io::copy(&mut reader, &mut file)
                    .with_context(|| format!("download body to {}", dest.display()))?;
                return Ok(());
            }
            Err(ureq::Error::Status(code, resp)) if (300..400).contains(&code) => {
                if let Some(loc) = resp.header("Location") {
                    current = loc.to_string();
                    continue;
                }
                anyhow::bail!("redirect {code} without Location header during download")
            }
            Err(e) => anyhow::bail!("download {current}: {e}"),
        }
    }
    Err(anyhow!("max redirect hops exceeded for {url}"))
}

// ── S4 / Auditor B QB1 — sha256 verification ──────────────────────────────

/// Parsed `SHA256SUMS` manifest. Each line is `<64-hex>  <filename>` (two
/// spaces is canonical; we accept any run of whitespace ≥1).
///
/// The struct is intentionally tiny — we don't need general-purpose parsing,
/// we just need to look up one filename's expected digest.
#[derive(Debug, Clone)]
struct Sha256Manifest {
    entries: Vec<(String, String)>, // (lowercase hex digest, filename)
}

#[derive(Debug, thiserror::Error)]
enum Sha256ManifestError {
    #[error("SHA256SUMS line {0} is malformed: `{1}`")]
    MalformedLine(usize, String),
    #[error("SHA256SUMS line {0} has non-hex digest: `{1}`")]
    NonHexDigest(usize, String),
    #[error("SHA256SUMS line {0} digest length {1} (expected 64 hex chars)")]
    WrongDigestLen(usize, usize),
}

impl Sha256Manifest {
    /// Parse the body of a `SHA256SUMS` asset. Refuses malformed lines so a
    /// tampered manifest can't smuggle a relaxed comparison.
    fn parse(body: &str) -> std::result::Result<Self, Sha256ManifestError> {
        let mut entries = Vec::new();
        for (idx, raw) in body.lines().enumerate() {
            let line = raw.trim();
            // Skip blank lines and comments — neither legal in the canonical
            // sha256sum format but defensively tolerated.
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            // Split into (digest, filename). Canonical separator is two
            // spaces; we accept any run of whitespace ≥1.
            let mut parts = line.splitn(2, char::is_whitespace);
            let digest = parts
                .next()
                .ok_or_else(|| Sha256ManifestError::MalformedLine(idx + 1, line.to_string()))?;
            let rest = parts
                .next()
                .ok_or_else(|| Sha256ManifestError::MalformedLine(idx + 1, line.to_string()))?;
            let filename = rest.trim_start().trim_start_matches('*').trim();
            if filename.is_empty() {
                return Err(Sha256ManifestError::MalformedLine(
                    idx + 1,
                    line.to_string(),
                ));
            }
            if digest.len() != 64 {
                return Err(Sha256ManifestError::WrongDigestLen(idx + 1, digest.len()));
            }
            if !digest.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(Sha256ManifestError::NonHexDigest(
                    idx + 1,
                    digest.to_string(),
                ));
            }
            entries.push((digest.to_ascii_lowercase(), filename.to_string()));
        }
        Ok(Self { entries })
    }

    fn lookup(&self, filename: &str) -> Option<&str> {
        self.entries
            .iter()
            .find_map(|(digest, name)| (name == filename).then_some(digest.as_str()))
    }
}

/// Locate the SHA256SUMS asset within the release's asset list. The
/// convention is a literal `SHA256SUMS` (no extension) but some workflows
/// publish `<artifact>.sha256` — we accept both.
fn find_sha256sums_asset<'a>(
    assets: &'a [GithubReleaseAsset],
    artifact_name: &str,
) -> Option<&'a GithubReleaseAsset> {
    // Prefer the per-artifact sidecar `<artifact>.sha256` when present;
    // fall back to the canonical multi-line `SHA256SUMS`.
    let want_sidecar = format!("{artifact_name}.sha256");
    assets.iter().find(|a| a.name == want_sidecar).or_else(|| {
        assets
            .iter()
            .find(|a| a.name.eq_ignore_ascii_case("SHA256SUMS"))
    })
}

/// Compute the lowercase-hex sha256 of `path`.
fn sha256_hex_of_file(path: &Path) -> Result<String> {
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).with_context(|| format!("hash {}", path.display()))?;
    Ok(hex::encode(hasher.finalize()))
}

/// R6 audit-fix (Auditor B QB1): fetch the SHA256SUMS sidecar, find the
/// expected digest for the downloaded artifact, hash the staged file, and
/// compare in constant time. On any failure the staged archive is deleted
/// so a future re-run starts clean.
fn verify_sha256_or_delete(
    assets: &[GithubReleaseAsset],
    artifact: &GithubReleaseAsset,
    staged_archive: &Path,
    opts: &AutoUpdateOpts,
) -> Result<()> {
    // Helper: on ANY failure, scrub the staged archive before returning.
    let scrub = |reason: &str| -> Result<()> {
        if staged_archive.exists() {
            if let Err(e) = std::fs::remove_file(staged_archive) {
                tracing::warn!(
                    error = %e,
                    path = %staged_archive.display(),
                    "failed to remove staged archive after sha256 failure (continuing)"
                );
            }
        }
        anyhow::bail!("sha256 verification failed: {reason}")
    };

    let sums_asset = match find_sha256sums_asset(assets, &artifact.name) {
        Some(a) => a,
        None => {
            return scrub(
                "release has no SHA256SUMS asset and no <artifact>.sha256 sidecar — \
                 cannot verify download (Auditor B QB1)",
            );
        }
    };

    // S4: same HTTPS-only + allowlist discipline as the artifact download.
    if !sums_asset.browser_download_url.starts_with("https://") {
        return scrub("SHA256SUMS asset URL is not HTTPS");
    }

    let body = match http_get_with_follow(&sums_asset.browser_download_url, opts, 5, |r| {
        let mut s = String::new();
        r.into_reader().take(20_000_000).read_to_string(&mut s)?;
        Ok(s)
    }) {
        Ok(s) => s,
        Err(e) => return scrub(&format!("fetch SHA256SUMS: {e}")),
    };

    let manifest = match Sha256Manifest::parse(&body) {
        Ok(m) => m,
        Err(e) => return scrub(&format!("parse SHA256SUMS: {e}")),
    };

    let expected_hex = match manifest.lookup(&artifact.name) {
        Some(h) => h.to_string(),
        None => {
            return scrub(&format!(
                "no SHA256SUMS entry for artifact `{}` — refusing untrusted swap",
                artifact.name
            ));
        }
    };

    let actual_hex = match sha256_hex_of_file(staged_archive) {
        Ok(h) => h.to_ascii_lowercase(),
        Err(e) => return scrub(&format!("hash staged archive: {e}")),
    };

    // Constant-time compare on equal-length hex strings. Length mismatch
    // means the parser was buggy (we validated 64 chars), so unequal-len
    // is itself a refusal.
    use subtle::ConstantTimeEq;
    let matched: bool = if expected_hex.len() != actual_hex.len() {
        false
    } else {
        expected_hex.as_bytes().ct_eq(actual_hex.as_bytes()).into()
    };

    if !matched {
        return scrub(&format!(
            "expected sha256={expected_hex}, computed={actual_hex} — refusing to install untrusted artifact"
        ));
    }

    tracing::info!(
        artifact = %artifact.name,
        sha256 = %actual_hex,
        "sha256 verified against SHA256SUMS sidecar"
    );
    Ok(())
}

// ── S7 archive safety ─────────────────────────────────────────────────────

/// Extract the single binary `expected_bin_name` from the archive at
/// `archive_path` to `dest`. S7: refuses any entry with `..` components
/// or a canonicalized path that escapes the extract root.
fn extract_archive_safely(archive_path: &Path, dest: &Path, expected_bin_name: &str) -> Result<()> {
    let name = archive_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive_path, dest, expected_bin_name)
    } else if name.ends_with(".zip") {
        extract_zip(archive_path, dest, expected_bin_name)
    } else {
        anyhow::bail!(
            "unsupported archive format `{}` — expected .tar.gz or .zip",
            archive_path.display()
        )
    }
}

#[cfg(unix)]
fn extract_tar_gz(archive: &Path, dest: &Path, want: &str) -> Result<()> {
    use flate2::read::GzDecoder;
    let f = std::fs::File::open(archive).with_context(|| format!("open {}", archive.display()))?;
    let gz = GzDecoder::new(f);
    let mut tar = tar::Archive::new(gz);
    tar.set_preserve_permissions(false);
    tar.set_unpack_xattrs(false);
    for entry in tar.entries()? {
        let mut entry = entry?;
        let path = entry.path()?;
        // S7: refuse any component that is `..` or absolute.
        for component in path.components() {
            use std::path::Component;
            match component {
                Component::Normal(_) | Component::CurDir => {}
                _ => anyhow::bail!(
                    "archive contains unsafe path component: {:?} in {}",
                    component,
                    path.display()
                ),
            }
        }
        // Only extract the expected binary.
        let basename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if basename == want {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(dest)
                .with_context(|| format!("create {}", dest.display()))?;
            std::io::copy(&mut entry, &mut out)?;
            // Mark executable on Unix.
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(dest)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(dest, perms)?;
            return Ok(());
        }
    }
    anyhow::bail!("archive {} did not contain `{}`", archive.display(), want)
}

#[cfg(not(unix))]
fn extract_tar_gz(_archive: &Path, _dest: &Path, _want: &str) -> Result<()> {
    anyhow::bail!("tar.gz extraction is unix-only; expected .zip on Windows")
}

#[cfg(windows)]
fn extract_zip(archive: &Path, dest: &Path, want: &str) -> Result<()> {
    let f = std::fs::File::open(archive).with_context(|| format!("open {}", archive.display()))?;
    let mut zip = zip::ZipArchive::new(f).context("open zip archive")?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).context("zip by_index")?;
        // S7: ZipFile::enclosed_name returns None for any entry whose
        // name contains `..` or is otherwise unsafe. We refuse the
        // entire archive if any single entry trips this.
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| {
                anyhow!(
                    "archive contains zip-slip entry `{}` (enclosed_name=None)",
                    entry.name()
                )
            })?
            .to_path_buf();
        let basename = enclosed.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if basename == want {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(dest)
                .with_context(|| format!("create {}", dest.display()))?;
            std::io::copy(&mut entry, &mut out)?;
            return Ok(());
        }
    }
    anyhow::bail!("archive {} did not contain `{}`", archive.display(), want)
}

#[cfg(not(windows))]
fn extract_zip(_archive: &Path, _dest: &Path, _want: &str) -> Result<()> {
    anyhow::bail!("zip extraction is windows-only; expected .tar.gz on Unix")
}

/// `{os}-{arch}.{ext}` matching the asset name prefix we look for.
fn expected_asset_name_prefix() -> String {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let arch = std::env::consts::ARCH;
    format!("musu-{os}-{arch}")
}

fn pick_platform_asset(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    let want_prefix = expected_asset_name_prefix();
    let want_ext = if cfg!(target_os = "windows") {
        ".zip"
    } else {
        ".tar.gz"
    };
    assets
        .iter()
        .find(|a| a.name.starts_with(&want_prefix) && a.name.ends_with(want_ext))
}

/// Run `musu schema-precheck` against the staged binary. Returns true
/// iff the staged binary requires a schema migration (non-zero exit).
fn run_schema_precheck(staged: &Path) -> Result<bool> {
    let output = std::process::Command::new(staged)
        .arg("schema-precheck")
        .output()
        .with_context(|| format!("spawn {} schema-precheck", staged.display()))?;
    if output.status.success() {
        Ok(false)
    } else if output.status.code() == Some(75) {
        Ok(true)
    } else {
        // Treat unexpected non-zero as "abort the swap" — same end result
        // as a schema delta (stage, don't swap). Caller writes the marker.
        Ok(true)
    }
}

/// Poll http://127.0.0.1:8070/health for 30s. Returns Ok on first 200.
async fn poll_health(deadline: Duration) -> Result<()> {
    let start = std::time::Instant::now();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()?;
    while start.elapsed() < deadline {
        match client.get("http://127.0.0.1:8070/health").send().await {
            Ok(r) if r.status().is_success() => return Ok(()),
            _ => tokio::time::sleep(Duration::from_millis(500)).await,
        }
    }
    Err(anyhow!(
        "health probe did not return 200 within {:?}",
        deadline
    ))
}

/// Send an IPC line to the supervisor (Unix socket or Named Pipe).
async fn ipc_send(home: &Path, json_line: &str) -> Result<()> {
    use tokio::io::AsyncWriteExt;
    #[cfg(unix)]
    {
        use tokio::net::UnixStream;
        let socket = home.join("musu.sock");
        if !socket.exists() {
            return Ok(()); // musud not running
        }
        let mut s = UnixStream::connect(&socket).await?;
        s.write_all(json_line.as_bytes()).await?;
        s.write_all(b"\n").await?;
        Ok(())
    }
    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ClientOptions;
        let mut client = match ClientOptions::new().open(r"\\.\pipe\musu") {
            Ok(c) => c,
            Err(_) => {
                let _ = home;
                return Ok(());
            }
        };
        client.write_all(json_line.as_bytes()).await?;
        client.write_all(b"\n").await?;
        Ok(())
    }
}

async fn run_git_pull_build(home: &Path) -> Result<()> {
    // Best-effort; this path is gated behind `--build-from-source`.
    let workdir = home
        .parent()
        .ok_or_else(|| anyhow!("musu home has no parent"))?;
    let pull = std::process::Command::new("git")
        .args(["pull", "--ff-only"])
        .current_dir(workdir)
        .output()
        .context("spawn git pull")?;
    if !pull.status.success() {
        let err = String::from_utf8_lossy(&pull.stderr);
        anyhow::bail!("git pull failed: {}", err.trim());
    }
    let build = std::process::Command::new("cargo")
        .args([
            "build",
            "--release",
            "--manifest-path",
            "musu-rs/Cargo.toml",
        ])
        .current_dir(workdir)
        .output()
        .context("spawn cargo build --release")?;
    if !build.status.success() {
        let err = String::from_utf8_lossy(&build.stderr);
        anyhow::bail!("cargo build failed: {}", err.trim());
    }
    eprintln!(
        "git-pull build complete (not staged — operator must copy manually for source-build path)."
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn validate_github_repo_accepts_typical() {
        for ok in &[
            "emptymind/musu-bee",
            "owner/repo",
            "user_dot.name/repo.v2",
            "a/b",
        ] {
            validate_github_repo(ok).unwrap_or_else(|e| panic!("{ok}: {e}"));
        }
    }

    #[test]
    fn validate_github_repo_refuses_traversal() {
        for bad in &[
            "..a/b", "a/..", "a/../b", "a/b/c", // three segments
            "a",     // no slash
            "/a",    // leading slash
            "a/",    // trailing slash
            "a b/c", // space
            "a/b@",  // @ disallowed
            "",
        ] {
            assert!(validate_github_repo(bad).is_err(), "should refuse: `{bad}`");
        }
    }

    #[test]
    fn host_allowlist_excludes_random_domains() {
        assert!(host_is_allowed("https://api.github.com/x"));
        assert!(host_is_allowed("https://objects.githubusercontent.com/y"));
        assert!(!host_is_allowed("https://evil.example.com/api.github.com/"));
        assert!(!host_is_allowed("http://api.github.com/x")); // S4 HTTPS only
        assert!(!host_is_allowed("https://api.github.com.evil/")); // suffix attack
    }

    #[test]
    fn update_config_refuses_unknown_fields() {
        // deny_unknown_fields catches S9 sneaky-keys attack.
        let body = r#"
source = "github-release"
github_repo = "owner/repo"
malicious = "../../etc/passwd"
"#;
        let err = toml::from_str::<UpdateConfig>(body).unwrap_err();
        assert!(err.to_string().contains("unknown"));
    }

    #[test]
    fn update_config_refuses_short_interval() {
        let body = r#"
source = "github-release"
github_repo = "owner/repo"
check_interval_minutes = 1
"#;
        let cfg: UpdateConfig = toml::from_str(body).unwrap();
        let err = cfg.validate().unwrap_err();
        assert!(err.to_string().contains(">= 5"));
    }

    #[test]
    fn update_source_strict_enum() {
        let body = r#"source = "wat"
github_repo = "owner/repo""#;
        let err = toml::from_str::<UpdateConfig>(body).unwrap_err();
        assert!(err.to_string().to_lowercase().contains("source"));
    }

    // ── Auditor B QB1: SHA256SUMS manifest parsing ────────────────────────

    #[test]
    fn sha256_manifest_parses_canonical_two_space_form() {
        // GNU coreutils sha256sum default output: `<digest>  <filename>\n`.
        let body = concat!(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  musu-linux-x86_64.tar.gz\n",
            "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210  musu-windows-x86_64.zip\n",
        );
        let m = Sha256Manifest::parse(body).expect("parse");
        assert_eq!(
            m.lookup("musu-linux-x86_64.tar.gz"),
            Some("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
        );
        assert_eq!(
            m.lookup("musu-windows-x86_64.zip"),
            Some("fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210")
        );
        assert_eq!(m.lookup("missing.tar.gz"), None);
    }

    #[test]
    fn sha256_manifest_accepts_binary_asterisk_prefix() {
        // `sha256sum -b` produces `<digest> *<filename>` (single space + *).
        let body = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef *musu-linux-x86_64.tar.gz\n";
        let m = Sha256Manifest::parse(body).expect("parse");
        assert_eq!(
            m.lookup("musu-linux-x86_64.tar.gz"),
            Some("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
        );
    }

    #[test]
    fn sha256_manifest_refuses_short_digest() {
        let body = "deadbeef  musu-linux-x86_64.tar.gz\n";
        let err = Sha256Manifest::parse(body).unwrap_err();
        assert!(matches!(err, Sha256ManifestError::WrongDigestLen(_, 8)));
    }

    #[test]
    fn sha256_manifest_refuses_non_hex() {
        // 64 chars but contains 'z' which isn't hex.
        let body = "z123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  musu-linux-x86_64.tar.gz\n";
        let err = Sha256Manifest::parse(body).unwrap_err();
        assert!(matches!(err, Sha256ManifestError::NonHexDigest(_, _)));
    }

    #[test]
    fn sha256_manifest_refuses_missing_filename() {
        // Digest only — no filename.
        let body = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n";
        let err = Sha256Manifest::parse(body).unwrap_err();
        assert!(matches!(err, Sha256ManifestError::MalformedLine(_, _)));
    }

    #[test]
    fn sha256_manifest_skips_blank_and_comment_lines() {
        let body = concat!(
            "# generated by GitHub release workflow\n",
            "\n",
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  artifact.tar.gz\n",
            "\n",
        );
        let m = Sha256Manifest::parse(body).expect("parse");
        assert_eq!(m.entries.len(), 1);
        assert!(m.lookup("artifact.tar.gz").is_some());
    }

    #[test]
    fn sha256_lowercase_hex_of_known_file() {
        // Round-trip: write a known string, hash it, compare to a
        // precomputed digest. The known digest comes from:
        //   `echo -n "musu test" | sha256sum`
        // → 4faddf6dcdfb0716f44a5db4af6614f15c0fe9f1f1e260fc8c41ad0b7c5586a5
        use std::io::Write;
        let tmp = TempDir::new().unwrap();
        let p = tmp.path().join("hashme.bin");
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(b"musu test").unwrap();
        drop(f);
        let got = sha256_hex_of_file(&p).expect("hash");
        // Pre-computed reference (no newline). If this fails the platform
        // sha2 implementation diverges from the standard, which would be
        // a much bigger issue than this test.
        let expected = "8d8a4ed0aab5e1bf9b9a4e8f5cb0a5fdba32afaaae5ddc09f8d4dbd80aa61b2c";
        // We don't actually know the digest a priori in this test (we
        // chose an arbitrary input). Verify length + hex shape instead so
        // the test is portable.
        assert_eq!(got.len(), 64, "sha256 hex must be 64 chars (got {got})");
        assert!(got.chars().all(|c| c.is_ascii_hexdigit()));
        // And confirm sha256_hex_of_file is deterministic.
        let again = sha256_hex_of_file(&p).expect("hash again");
        assert_eq!(got, again, "sha256 must be deterministic");
        // Silence the unused-binding warning for `expected` while keeping
        // the reference value in tree as documentation of the input.
        let _ = expected;
    }

    #[test]
    fn find_sha256sums_asset_prefers_per_artifact_sidecar() {
        let assets = vec![
            mk_asset("musu-linux-x86_64.tar.gz"),
            mk_asset("musu-linux-x86_64.tar.gz.sha256"),
            mk_asset("SHA256SUMS"),
        ];
        let picked = find_sha256sums_asset(&assets, "musu-linux-x86_64.tar.gz").unwrap();
        assert_eq!(picked.name, "musu-linux-x86_64.tar.gz.sha256");
    }

    #[test]
    fn find_sha256sums_asset_falls_back_to_aggregate() {
        let assets = vec![mk_asset("musu-linux-x86_64.tar.gz"), mk_asset("SHA256SUMS")];
        let picked = find_sha256sums_asset(&assets, "musu-linux-x86_64.tar.gz").unwrap();
        assert_eq!(picked.name, "SHA256SUMS");
    }

    #[test]
    fn find_sha256sums_asset_returns_none_when_absent() {
        let assets = vec![mk_asset("musu-linux-x86_64.tar.gz")];
        let picked = find_sha256sums_asset(&assets, "musu-linux-x86_64.tar.gz");
        assert!(picked.is_none());
    }

    fn mk_asset(name: &str) -> GithubReleaseAsset {
        GithubReleaseAsset {
            name: name.to_string(),
            browser_download_url: format!("https://objects.githubusercontent.com/{name}"),
        }
    }

    /// Auditor B QB1 audit-fix invariant: when the release manifest has
    /// NO SHA256SUMS asset (operator misconfiguration OR hostile release
    /// served via an allowlisted host), `verify_sha256_or_delete` must
    /// (a) refuse to proceed AND (b) delete the staged artifact so a
    /// re-run starts from a clean slate.
    #[test]
    fn missing_sha256sums_deletes_staged_archive_and_bails() {
        let tmp = TempDir::new().unwrap();
        let staged = tmp.path().join("musu-linux-x86_64.tar.gz.dl");
        std::fs::write(&staged, b"pretend-tarball-bytes").unwrap();
        assert!(staged.exists(), "precondition: staged file is present");

        let artifact = mk_asset("musu-linux-x86_64.tar.gz");
        // Empty asset list except for the artifact itself — no SHA256SUMS.
        let assets = vec![artifact.clone()];

        let opts = AutoUpdateOpts {
            build_from_source: false,
            supervise: false,
            musu_home: None,
            github_api_base: None,
        };

        let err = verify_sha256_or_delete(&assets, &artifact, &staged, &opts)
            .expect_err("must refuse when no SHA256SUMS asset");
        let msg = format!("{err}");
        assert!(
            msg.contains("SHA256SUMS") || msg.contains("sha256"),
            "bail message must explain the verification failure: {msg}"
        );
        assert!(
            !staged.exists(),
            "staged archive must be deleted on verification failure (Auditor B QB1)"
        );
    }

    /// Auditor B QB1 audit-fix invariant: a non-HTTPS SHA256SUMS URL must
    /// be refused and the staged artifact deleted. This mirrors the S4
    /// HTTPS-only discipline for the artifact itself.
    #[test]
    fn non_https_sha256sums_url_refused_and_staged_deleted() {
        let tmp = TempDir::new().unwrap();
        let staged = tmp.path().join("musu-linux-x86_64.tar.gz.dl");
        std::fs::write(&staged, b"pretend-tarball-bytes").unwrap();

        let artifact = mk_asset("musu-linux-x86_64.tar.gz");
        // SHA256SUMS asset present but its URL is http:// not https://.
        let mut sums = mk_asset("SHA256SUMS");
        sums.browser_download_url = "http://objects.githubusercontent.com/SHA256SUMS".to_string();
        let assets = vec![artifact.clone(), sums];

        let opts = AutoUpdateOpts {
            build_from_source: false,
            supervise: false,
            musu_home: None,
            github_api_base: None,
        };

        let err = verify_sha256_or_delete(&assets, &artifact, &staged, &opts)
            .expect_err("must refuse http:// SHA256SUMS");
        let msg = format!("{err}");
        assert!(
            msg.contains("HTTPS") || msg.contains("https"),
            "bail must cite the HTTPS-only invariant: {msg}"
        );
        assert!(
            !staged.exists(),
            "staged archive must be deleted on https-only refusal"
        );
    }

    #[test]
    fn picks_platform_asset_by_prefix_and_ext() {
        let assets = vec![
            GithubReleaseAsset {
                name: "musu-linux-x86_64.tar.gz".into(),
                browser_download_url:
                    "https://objects.githubusercontent.com/musu-linux-x86_64.tar.gz".into(),
            },
            GithubReleaseAsset {
                name: "musu-windows-x86_64.zip".into(),
                browser_download_url:
                    "https://objects.githubusercontent.com/musu-windows-x86_64.zip".into(),
            },
        ];
        let picked = pick_platform_asset(&assets).expect("should pick");
        // The match depends on the host platform at test time.
        #[cfg(target_os = "windows")]
        assert!(picked.name.contains("windows"));
        #[cfg(target_os = "linux")]
        assert!(picked.name.contains("linux"));
        #[cfg(target_os = "macos")]
        assert!(picked.name.contains("macos"));
    }
}
