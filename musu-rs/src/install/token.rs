//! Shared `MUSU_BRIDGE_TOKEN` resolver.
//!
//! Per V24-R3 wiki/493 Critic C4 (HIGH): the bridge bearer-token lookup was
//! duplicated in `auto_update.rs::read_ipc_token` and
//! `uninstall.rs::read_ipc_token`. R3's `control::bridge_client` would be the
//! third copy. This module extracts the single canonical resolver:
//!
//!   1. `MUSU_BRIDGE_TOKEN` env var (non-empty), THEN
//!   2. `<musu_home>/bridge.env` parsed line-by-line for `MUSU_BRIDGE_TOKEN=…`
//!
//! Both call sites preserve their previous behavior: skip blanks and `#`
//! comments, allow `export ` prefix, trim ASCII `"` / `'` from the value.
//! `auto_update.rs` and `uninstall.rs` now delegate to `read_bridge_token`;
//! `control::bridge_client` calls it directly.

use anyhow::{anyhow, Context, Result};
use std::path::Path;

/// Line key for the Windows DPAPI-encrypted mesh bearer. Its base64 value is a
/// `CryptProtectData` (CurrentUser scope) blob of the raw bearer. NOTE: this key
/// STARTS WITH `MUSU_MESH_BEARER`, so the reader MUST check this (more-specific)
/// prefix BEFORE the legacy `MUSU_MESH_BEARER=` prefix — both via exact
/// `strip_prefix` where the trailing `=` disambiguates (Critic H-2).
#[cfg(windows)]
const MESH_BEARER_DPAPI_KEY: &str = "MUSU_MESH_BEARER_DPAPI=";

/// Windows DPAPI wrap of `plaintext` under the CurrentUser key (entropy=null).
/// Returns the protected blob bytes (copied into a Rust `Vec`); the OS-allocated
/// output buffer is `LocalFree`d before return (Critic M-2). CurrentUser (not
/// LocalMachine) is intentional: only this Windows account can decrypt, which is
/// exactly the cross-account-file-access defense we want.
#[cfg(windows)]
fn dpapi_protect(plaintext: &[u8]) -> Result<Vec<u8>> {
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};
    use windows_sys::Win32::Foundation::LocalFree;

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: plaintext.len() as u32,
        pbData: plaintext.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // SAFETY: in_blob borrows `plaintext` for the duration of the call; out_blob
    // is OS-allocated and we LocalFree it below after copying.
    let ok = unsafe {
        CryptProtectData(
            &mut in_blob,
            std::ptr::null(),       // szDataDescr
            std::ptr::null_mut(),   // pOptionalEntropy (none — YAGNI per Critic INFO)
            std::ptr::null_mut(),   // pvReserved
            std::ptr::null_mut(),   // pPromptStruct
            0,                      // dwFlags (0 = CurrentUser)
            &mut out_blob,
        )
    };
    if ok == 0 {
        // GetLastError immediately after — do not insert Win32 calls here (F-3).
        let code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
        anyhow::bail!("CryptProtectData failed (os error {code})");
    }
    // Auditor F-1: a null/empty out blob with ok!=0 is a degenerate API outcome;
    // from_raw_parts(null, _) is UB even for len 0. Turn it into a clean Err.
    if out_blob.pbData.is_null() || out_blob.cbData == 0 {
        anyhow::bail!("CryptProtectData returned success but an empty blob");
    }
    // Copy out, then free the OS buffer.
    let blob = unsafe {
        std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec()
    };
    unsafe {
        LocalFree(out_blob.pbData as *mut core::ffi::c_void);
    }
    Ok(blob)
}

/// Windows DPAPI unwrap. Returns the recovered plaintext bytes (copied into a
/// Rust `Vec`); the OS-allocated plaintext buffer is zeroized then `LocalFree`d
/// before return (Critic M-2). Errors propagate so callers can distinguish
/// "present but undecryptable" from "absent" (Critic H-1).
#[cfg(windows)]
fn dpapi_unprotect(blob: &[u8]) -> Result<Vec<u8>> {
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};
    use windows_sys::Win32::Foundation::LocalFree;

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: blob.len() as u32,
        pbData: blob.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut in_blob,
            std::ptr::null_mut(),   // ppszDataDescr
            std::ptr::null_mut(),   // pOptionalEntropy
            std::ptr::null_mut(),   // pvReserved
            std::ptr::null_mut(),   // pPromptStruct
            0,                      // dwFlags
            &mut out_blob,
        )
    };
    if ok == 0 {
        // GetLastError immediately after — do not insert Win32 calls here (F-3).
        let code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
        anyhow::bail!("CryptUnprotectData failed (os error {code})");
    }
    // Auditor F-1: guard null/empty before from_raw_parts (UB on null even len 0).
    if out_blob.pbData.is_null() || out_blob.cbData == 0 {
        anyhow::bail!("CryptUnprotectData returned success but an empty blob");
    }
    let len = out_blob.cbData as usize;
    let plaintext = unsafe { std::slice::from_raw_parts(out_blob.pbData, len).to_vec() };
    // Zeroize the OS plaintext buffer before freeing (best-effort).
    unsafe {
        std::ptr::write_bytes(out_blob.pbData, 0, len);
        LocalFree(out_blob.pbData as *mut core::ffi::c_void);
    }
    Ok(plaintext)
}

/// Resolve the bridge bearer token. Returns `None` if neither source yields a
/// non-empty value. Callers decide whether absence is an error (control needs
/// it; uninstall/auto-update tolerate `None` and let musud reject).
pub fn read_bridge_token(home: &Path) -> Option<String> {
    if let Ok(t) = std::env::var("MUSU_BRIDGE_TOKEN") {
        if !t.is_empty() {
            return Some(t);
        }
    }
    let env_path = home.join("bridge.env");
    let body = std::fs::read_to_string(&env_path).ok()?;
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        if let Some(rest) = line.strip_prefix("MUSU_BRIDGE_TOKEN=") {
            let val = rest.trim_matches(|c| c == '"' || c == '\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Read the account-wide mesh bearer (the shared cross-machine bridge bearer
/// issued by the cloud at mesh-join time, identical on every machine of one
/// account). Precedence: `MUSU_MESH_BEARER` env, then `<home>/mesh.env`. Returns
/// `None` when neither is set — the bridge then falls back to its per-machine
/// token (legacy behavior; cross-machine auth won't work until a join issues
/// the shared bearer). Mirrors read_bridge_token's parsing exactly.
pub fn read_mesh_bearer(home: &Path) -> Option<String> {
    if let Ok(t) = std::env::var("MUSU_MESH_BEARER") {
        let t = t.trim().to_string();
        if !t.is_empty() {
            return Some(t);
        }
    }
    let env_path = home.join("mesh.env");
    let body = std::fs::read_to_string(&env_path).ok()?;
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);

        // Critic H-2: check the MORE-SPECIFIC `MUSU_MESH_BEARER_DPAPI=` prefix
        // FIRST. The trailing `=` in each `strip_prefix` is what keeps the two
        // keys from colliding — never weaken either to a non-`=` match.
        #[cfg(windows)]
        if let Some(rest) = line.strip_prefix(MESH_BEARER_DPAPI_KEY) {
            let b64 = rest.trim_matches(|c| c == '"' || c == '\'');
            if b64.is_empty() {
                continue;
            }
            use base64::Engine as _;
            let blob = match base64::engine::general_purpose::STANDARD.decode(b64) {
                Ok(b) => b,
                Err(e) => {
                    // Critic H-1: a present DPAPI line we can't even decode is a
                    // corrupted-bearer condition — log loudly, do NOT masquerade
                    // as "absent". Recovery: re-run `musu mesh join-account`.
                    tracing::error!(
                        path = %env_path.display(),
                        error = %e,
                        "mesh.env MUSU_MESH_BEARER_DPAPI base64 decode failed; \
                         cross-machine auth will fall back to the per-machine \
                         token. Recover with `musu mesh join-account`."
                    );
                    return None;
                }
            };
            match dpapi_unprotect(&blob) {
                Ok(plain) => match String::from_utf8(plain) {
                    Ok(s) => {
                        let val = s.trim().to_string();
                        if !val.is_empty() {
                            return Some(val);
                        }
                        continue;
                    }
                    Err(_) => {
                        tracing::error!(
                            path = %env_path.display(),
                            "mesh.env DPAPI plaintext was not valid UTF-8"
                        );
                        return None;
                    }
                },
                Err(e) => {
                    // Critic H-1: present-but-undecryptable (SID/profile change,
                    // blob corruption). Loud error + per-machine fallback.
                    tracing::error!(
                        path = %env_path.display(),
                        error = %e,
                        "mesh.env DPAPI decrypt failed (profile/SID change or \
                         corruption); cross-machine auth falls back to the \
                         per-machine token. Recover with `musu mesh join-account`."
                    );
                    return None;
                }
            }
        }

        // Critic M-1: a Unix box reading a Windows-written DPAPI line can't
        // decrypt it. Warn loudly instead of silently degrading.
        #[cfg(not(windows))]
        if line.strip_prefix("MUSU_MESH_BEARER_DPAPI=").is_some() {
            tracing::warn!(
                path = %env_path.display(),
                "mesh.env was written on Windows (DPAPI-encrypted); cannot \
                 decrypt on this OS. Re-run `musu mesh join-account` on this \
                 machine to issue a native bearer."
            );
            continue;
        }

        if let Some(rest) = line.strip_prefix("MUSU_MESH_BEARER=") {
            let val = rest.trim_matches(|c| c == '"' || c == '\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Persist the account-wide mesh bearer to `<home>/mesh.env` (0600 on unix).
/// Called by `musu mesh join-account` after the cloud returns it. Overwrites so
/// a re-join with a rotated secret replaces the old value. The bearer is a
/// shared account secret — same file discipline as bridge.env.
pub fn write_mesh_bearer(home: &Path, bearer: &str) -> Result<()> {
    let path = home.join("mesh.env");
    let tmp = home.join("mesh.env.tmp");
    const MESH_ENV_HEADER: &str =
        "# musu mesh environment — generated by `musu mesh join-account`.\n\
         # Account-wide shared bridge bearer. Same on every machine of this\n\
         # account; that is intentional — it is how cross-machine tasks auth.\n";

    // Body differs per-OS (Critic M-2): Windows stores the bearer DPAPI-encrypted
    // (CurrentUser) so a stolen/cloud-synced mesh.env is useless off this account;
    // Unix keeps plaintext+0600 (DPAPI is Windows-only — keyring is YAGNI here).
    #[cfg(windows)]
    let body = {
        use base64::Engine as _;
        let blob = dpapi_protect(bearer.as_bytes())?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&blob);
        format!("{MESH_ENV_HEADER}{MESH_BEARER_DPAPI_KEY}{b64}\n")
    };
    #[cfg(not(windows))]
    let body = format!("{MESH_ENV_HEADER}MUSU_MESH_BEARER={bearer}\n");

    // Critic A2/A6 + Windows-ACL-first ordering:
    //
    // 1. Write to a SIBLING temp file, then atomically rename onto mesh.env.
    //    The rename closes the partial-read window — the runtime watcher (which
    //    re-reads mesh.env on change) never observes a half-written file.
    // 2. The ~/.musu directory itself is NOT ACL-hardened on Windows (only the
    //    files are). So on Windows we must restrict the temp file's ACL BEFORE
    //    the secret bytes land in it, otherwise the bearer is briefly
    //    world-readable on disk. We create the empty temp, lock its ACL, THEN
    //    write the secret, THEN rename.
    std::fs::create_dir_all(home).with_context(|| format!("create {}", home.display()))?;

    #[cfg(unix)]
    {
        use std::io::Write as _;
        use std::os::unix::fs::OpenOptionsExt as _;
        // Create the temp with 0600 from the start (mode applied at open so the
        // secret never lands in a world-readable file).
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .with_context(|| format!("create temp {}", tmp.display()))?;
        f.write_all(body.as_bytes())
            .with_context(|| format!("write temp {}", tmp.display()))?;
        f.sync_all().ok();
    }

    #[cfg(windows)]
    {
        // Create the empty temp first, lock its ACL, THEN write the secret.
        std::fs::write(&tmp, b"")
            .with_context(|| format!("create temp {}", tmp.display()))?;
        let user = windows_acl_principal()?;
        let output = std::process::Command::new("icacls")
            .arg(&tmp)
            .arg("/inheritance:r")
            .arg("/grant:r")
            .arg(format!("{user}:F"))
            .output()
            .context("spawn icacls")?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            let _ = std::fs::remove_file(&tmp);
            anyhow::bail!("icacls failed for mesh.env.tmp: {}", err.trim());
        }
        // ACL is now restricted; safe to write the secret bytes.
        std::fs::write(&tmp, body.as_bytes())
            .with_context(|| format!("write temp {}", tmp.display()))?;
    }

    // Atomic publish. On Windows std::fs::rename replaces the destination when
    // it exists on the same volume; on unix rename(2) is atomic.
    std::fs::rename(&tmp, &path).with_context(|| {
        // Best-effort cleanup of the temp on failure so we don't leave a
        // secret-bearing tmp around.
        let _ = std::fs::remove_file(&tmp);
        format!("atomic rename {} -> {}", tmp.display(), path.display())
    })?;
    Ok(())
}

/// Resolve the cloud **control-plane** token (distinct from the bridge bearer
/// token above). Per audit H3: this precedence was duplicated inline in
/// `room_work_orders.rs`, diverging from the bridge chain and making auth
/// failures path-dependent and hard to debug. Single canonical chain:
///
///   1. `MUSU_P2P_CONTROL_TOKEN` (non-empty), THEN
///   2. `MUSU_ROUTE_EVIDENCE_TOKEN`, THEN
///   3. `MUSU_TOKEN`, THEN
///   4. `crate::cloud::token::load_token(home)` (account token on disk)
///
/// Returns `None` when no source yields a non-empty value. This is the control
/// token used for owner-scoped room work-order claim/delivery; it is NOT the
/// bridge bearer token — keep the two resolvers separate on purpose.
pub fn read_control_token(home: &Path) -> Option<String> {
    for name in [
        "MUSU_P2P_CONTROL_TOKEN",
        "MUSU_ROUTE_EVIDENCE_TOKEN",
        "MUSU_TOKEN",
    ] {
        if let Ok(token) = std::env::var(name) {
            let token = token.trim().to_string();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }
    crate::cloud::token::load_token(home)
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

/// Ensure a valid `bridge.env` exists under `home` and return the token.
///
/// Used by packaged startup paths where no prior `musu install` bootstrap may
/// have run yet, but the bridge still needs a production token to boot.
pub fn ensure_bridge_token(home: &Path) -> Result<String> {
    if let Some(token) = read_bridge_token(home) {
        return Ok(token);
    }

    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).map_err(|e| anyhow!("getrandom failed: {e}"))?;
    let token = hex::encode(buf);

    let path = home.join("bridge.env");
    let body = format!(
        "# musu bridge environment — generated automatically.\n\
         # Do NOT commit this file. Do NOT share the token.\n\
         MUSU_BRIDGE_TOKEN={token}\n"
    );
    std::fs::create_dir_all(home).with_context(|| format!("create {}", home.display()))?;
    std::fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path)?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&path, perms)
            .with_context(|| format!("chmod 600 {}", path.display()))?;
    }

    #[cfg(windows)]
    {
        let user = windows_acl_principal()?;
        let output = std::process::Command::new("icacls")
            .arg(&path)
            .arg("/inheritance:r")
            .arg("/grant:r")
            .arg(format!("{user}:F"))
            .output()
            .context("spawn icacls")?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("icacls failed: {}", err.trim());
        }
    }

    Ok(token)
}

#[cfg(windows)]
fn windows_acl_principal() -> Result<String> {
    let user = std::env::var("USERNAME").context("USERNAME env var")?;
    let domain = std::env::var("USERDOMAIN").unwrap_or_default();
    if domain.is_empty() || user.contains('\\') || domain.eq_ignore_ascii_case(&user) {
        Ok(user)
    } else {
        Ok(format!("{domain}\\{user}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Process-global lock — `cargo test` runs `#[test]` fns concurrently by
    /// default and `std::env::set_var` / `remove_var` race across tests in
    /// the same binary. Serializing the three env-touching tests here keeps
    /// us safe without pulling in `serial_test` as a new dev-dep.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// `MUSU_BRIDGE_TOKEN` env wins over the file.
    #[test]
    fn env_var_takes_precedence() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::set_var("MUSU_BRIDGE_TOKEN", "env-wins");
        let home = std::env::temp_dir().join("musu-rs-token-test-env");
        std::fs::create_dir_all(&home).ok();
        std::fs::write(home.join("bridge.env"), "MUSU_BRIDGE_TOKEN=file-loses\n").ok();
        let result = read_bridge_token(&home);
        // Reset BEFORE the assertion so even a panic doesn't leak state to
        // the next test (Mutex drop happens regardless via Drop).
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        assert_eq!(result, Some("env-wins".into()));
    }

    #[test]
    fn empty_env_falls_back_to_file() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        let home = std::env::temp_dir().join("musu-rs-token-test-file");
        std::fs::create_dir_all(&home).ok();
        std::fs::write(
            home.join("bridge.env"),
            "# comment\nexport MUSU_BRIDGE_TOKEN=\"quoted-val\"\n",
        )
        .ok();
        assert_eq!(read_bridge_token(&home), Some("quoted-val".into()));
    }

    #[test]
    fn missing_everything_returns_none() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        let home = std::env::temp_dir().join("musu-rs-token-test-missing");
        std::fs::create_dir_all(&home).ok();
        let _ = std::fs::remove_file(home.join("bridge.env"));
        assert_eq!(read_bridge_token(&home), None);
    }

    #[test]
    fn ensure_bridge_token_creates_bridge_env() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_BRIDGE_TOKEN");
        let home = std::env::temp_dir().join("musu-rs-token-test-ensure");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();
        let _ = std::fs::remove_file(home.join("bridge.env"));

        let token = ensure_bridge_token(&home).expect("ensure token");
        assert_eq!(token.len(), 64);
        assert_eq!(read_bridge_token(&home), Some(token));
    }

    #[test]
    fn write_then_read_mesh_bearer_roundtrips() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-rt");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();

        assert_eq!(read_mesh_bearer(&home), None, "absent before write");
        write_mesh_bearer(&home, "deadbeef0123").expect("write mesh bearer");
        assert_eq!(read_mesh_bearer(&home), Some("deadbeef0123".to_string()));

        // Re-join with a rotated bearer overwrites.
        write_mesh_bearer(&home, "cafef00d4567").expect("rewrite");
        assert_eq!(read_mesh_bearer(&home), Some("cafef00d4567".to_string()));
        let _ = std::fs::remove_dir_all(&home);
    }

    /// After the atomic ACL-first rewrite, a deleted/emptied mesh.env yields
    /// `None` from `read_mesh_bearer`, and feeding that `None` into the auth
    /// cell's `swap_peer_token` must PRESERVE the prior bearer (the empty-swap
    /// guard, Critic A3). This is the file-level half of that guarantee; the
    /// cell-level half lives in `bridge::auth` tests.
    #[test]
    fn deleted_mesh_env_reads_none_after_atomic_write() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-del");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();

        write_mesh_bearer(&home, "deadbeef0123").expect("write");
        assert_eq!(read_mesh_bearer(&home), Some("deadbeef0123".to_string()));
        // No leftover temp after the atomic publish.
        assert!(
            !home.join("mesh.env.tmp").exists(),
            "mesh.env.tmp must be consumed by the atomic rename"
        );

        // Delete the file → read yields None (caller's swap must then no-op).
        std::fs::remove_file(home.join("mesh.env")).expect("delete");
        assert_eq!(
            read_mesh_bearer(&home),
            None,
            "deleted mesh.env must read None"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn mesh_bearer_env_overrides_file() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-env");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();
        write_mesh_bearer(&home, "from-file").expect("write");

        std::env::set_var("MUSU_MESH_BEARER", "from-env");
        assert_eq!(read_mesh_bearer(&home), Some("from-env".to_string()));
        std::env::remove_var("MUSU_MESH_BEARER");
        assert_eq!(read_mesh_bearer(&home), Some("from-file".to_string()));
        let _ = std::fs::remove_dir_all(&home);
    }

    /// Legacy plaintext `MUSU_MESH_BEARER=` lines must keep reading on BOTH OSes
    /// (hot-reload backward-compat — Critic H-1 / WS-2). A pre-DPAPI install's
    /// mesh.env must never brick after the encryption change.
    #[test]
    fn legacy_plaintext_mesh_env_still_reads() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-legacy");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();
        // Hand-write a legacy plaintext line (NOT via write_mesh_bearer, which
        // would DPAPI-encrypt on Windows).
        std::fs::write(
            home.join("mesh.env"),
            "# legacy\nMUSU_MESH_BEARER=legacyplain123\n",
        )
        .ok();
        assert_eq!(
            read_mesh_bearer(&home),
            Some("legacyplain123".to_string()),
            "legacy plaintext mesh.env must still read"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    /// Critic H-2: a DPAPI line must NEVER be returned verbatim as a plaintext
    /// bearer. The `MUSU_MESH_BEARER_DPAPI=` prefix starts with the legacy
    /// `MUSU_MESH_BEARER` key; the trailing `=` is what disambiguates. This test
    /// guards against a future weakening of the legacy `strip_prefix`.
    #[test]
    fn dpapi_line_never_returned_as_plaintext_bearer() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-dpapi-noverbatim");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();
        let fake_b64 = "QUJDREVGRw=="; // base64("ABCDEFG"), NOT a real DPAPI blob
        std::fs::write(
            home.join("mesh.env"),
            format!("MUSU_MESH_BEARER_DPAPI={fake_b64}\n"),
        )
        .ok();
        // On Windows: base64 decodes but dpapi_unprotect fails on the bogus blob
        // → None (loud log). On Unix: the DPAPI line is warned+skipped → None.
        // EITHER WAY, the base64 string must never come back as the bearer.
        let result = read_mesh_bearer(&home);
        assert_ne!(
            result,
            Some(fake_b64.to_string()),
            "DPAPI base64 blob must never be returned verbatim as a bearer"
        );
        assert_eq!(result, None, "undecryptable/foreign DPAPI line yields None");
        let _ = std::fs::remove_dir_all(&home);
    }

    /// Windows-only: write→read DPAPI round-trip, and the raw bearer must NOT
    /// appear in the on-disk file (it's encrypted).
    #[cfg(windows)]
    #[test]
    fn mesh_bearer_dpapi_roundtrips_and_encrypts_at_rest() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-dpapi-rt");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();

        let secret = "supersecretbearer9876";
        write_mesh_bearer(&home, secret).expect("write dpapi mesh bearer");
        // Round-trips through DPAPI decrypt.
        assert_eq!(read_mesh_bearer(&home), Some(secret.to_string()));
        // The plaintext secret must NOT be on disk; the DPAPI key must be.
        let body = std::fs::read_to_string(home.join("mesh.env")).expect("read file");
        assert!(
            !body.contains(secret),
            "raw bearer must not appear in mesh.env at rest"
        );
        assert!(
            body.contains("MUSU_MESH_BEARER_DPAPI="),
            "DPAPI line key must be present"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    /// Windows-only: a legacy plaintext file is migrated to DPAPI format on the
    /// next write_mesh_bearer (re-join/rotate), and still reads correctly.
    #[cfg(windows)]
    #[test]
    fn legacy_plaintext_migrates_to_dpapi_on_rewrite() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-migrate");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();

        std::fs::write(home.join("mesh.env"), "MUSU_MESH_BEARER=oldplain\n").ok();
        assert_eq!(read_mesh_bearer(&home), Some("oldplain".to_string()));
        // Re-join with a rotated bearer → now DPAPI-encrypted.
        write_mesh_bearer(&home, "rotated456").expect("rewrite");
        let body = std::fs::read_to_string(home.join("mesh.env")).expect("read");
        assert!(body.contains("MUSU_MESH_BEARER_DPAPI="), "migrated to DPAPI");
        assert!(!body.contains("rotated456"), "new bearer encrypted at rest");
        assert_eq!(read_mesh_bearer(&home), Some("rotated456".to_string()));
        let _ = std::fs::remove_dir_all(&home);
    }

    /// Auditor F-2: a DPAPI line whose value is not valid base64 must hit the
    /// decode-failure branch (loud log + None), never fall through to the legacy
    /// plaintext branch and return garbage. Covers the H-1 base64-fail sub-path.
    #[test]
    fn dpapi_line_invalid_base64_returns_none() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        std::env::remove_var("MUSU_MESH_BEARER");
        let home = std::env::temp_dir().join("musu-rs-token-test-mesh-badb64");
        let _ = std::fs::remove_dir_all(&home);
        std::fs::create_dir_all(&home).ok();
        std::fs::write(
            home.join("mesh.env"),
            "MUSU_MESH_BEARER_DPAPI=!!!not-valid-base64!!!\n",
        )
        .ok();
        // Windows: base64 decode fails → None. Unix: DPAPI line warned+skipped → None.
        assert_eq!(read_mesh_bearer(&home), None);
        let _ = std::fs::remove_dir_all(&home);
    }

    /// Control-token chain (audit H3). Serialized under the same ENV_LOCK
    /// because it touches the shared control-token env vars.
    fn clear_control_env() {
        std::env::remove_var("MUSU_P2P_CONTROL_TOKEN");
        std::env::remove_var("MUSU_ROUTE_EVIDENCE_TOKEN");
        std::env::remove_var("MUSU_TOKEN");
    }

    /// `MUSU_P2P_CONTROL_TOKEN` wins over the other control sources.
    #[test]
    fn control_token_prefers_p2p_control() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        clear_control_env();
        std::env::set_var("MUSU_P2P_CONTROL_TOKEN", "p2p-wins");
        std::env::set_var("MUSU_ROUTE_EVIDENCE_TOKEN", "route-loses");
        std::env::set_var("MUSU_TOKEN", "generic-loses");
        let home = std::env::temp_dir().join("musu-rs-control-test-p2p");
        std::fs::create_dir_all(&home).ok();
        let result = read_control_token(&home);
        clear_control_env();
        assert_eq!(result, Some("p2p-wins".into()));
    }

    /// Falls through P2P -> ROUTE_EVIDENCE -> MUSU_TOKEN in order.
    #[test]
    fn control_token_falls_through_to_route_then_generic() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        clear_control_env();
        std::env::set_var("MUSU_ROUTE_EVIDENCE_TOKEN", "route-wins");
        std::env::set_var("MUSU_TOKEN", "generic-loses");
        let home = std::env::temp_dir().join("musu-rs-control-test-route");
        std::fs::create_dir_all(&home).ok();
        let route = read_control_token(&home);
        std::env::remove_var("MUSU_ROUTE_EVIDENCE_TOKEN");
        let generic = read_control_token(&home);
        clear_control_env();
        assert_eq!(route, Some("route-wins".into()));
        assert_eq!(generic, Some("generic-loses".into()));
    }

    /// Blank env values are skipped, not returned as empty tokens.
    #[test]
    fn control_token_skips_blank_env() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        clear_control_env();
        std::env::set_var("MUSU_P2P_CONTROL_TOKEN", "   ");
        std::env::set_var("MUSU_ROUTE_EVIDENCE_TOKEN", "real");
        let home = std::env::temp_dir().join("musu-rs-control-test-blank");
        std::fs::create_dir_all(&home).ok();
        let result = read_control_token(&home);
        clear_control_env();
        assert_eq!(result, Some("real".into()));
    }
}
