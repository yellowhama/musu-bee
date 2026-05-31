//! TLS certificate management — V27-F6.
//!
//! Auto-generates self-signed certificates for inter-node encryption.
//! Certificates are stored in `~/.musu/tls/`.

use std::io::BufReader;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use sha2::{Digest, Sha256};

/// Paths for TLS certificate and key.
pub struct TlsPaths {
    pub cert_path: PathBuf,
    pub key_path: PathBuf,
}

impl TlsPaths {
    pub fn new(musu_home: &Path) -> Self {
        let tls_dir = musu_home.join("tls");
        Self {
            cert_path: tls_dir.join("cert.pem"),
            key_path: tls_dir.join("key.pem"),
        }
    }

    pub fn exists(&self) -> bool {
        self.cert_path.exists() && self.key_path.exists()
    }
}

/// Generate a self-signed TLS certificate for musu inter-node encryption.
///
/// Creates `~/.musu/tls/{cert.pem, key.pem}` if they don't exist.
pub fn ensure_tls_certs(musu_home: &Path, node_name: &str) -> Result<TlsPaths> {
    let paths = TlsPaths::new(musu_home);

    if paths.exists() {
        tracing::info!("TLS certs already exist, reusing");
        return Ok(paths);
    }

    tracing::info!("generating self-signed TLS certificate for '{}'", node_name);

    // Create tls directory.
    let tls_dir = musu_home.join("tls");
    std::fs::create_dir_all(&tls_dir)?;

    // Generate certificate — DNS SANs only in CertificateParams::new.
    let mut params =
        rcgen::CertificateParams::new(vec![node_name.to_string(), "localhost".to_string()])?;
    params.distinguished_name.push(
        rcgen::DnType::CommonName,
        rcgen::DnValue::Utf8String(format!("musu-{node_name}")),
    );
    params.distinguished_name.push(
        rcgen::DnType::OrganizationName,
        rcgen::DnValue::Utf8String("MUSU".to_string()),
    );
    // Valid for 10 years.
    params.not_after = rcgen::date_time_ymd(2035, 12, 31);

    // Add IP SANs for common local addresses.
    params
        .subject_alt_names
        .push(rcgen::SanType::IpAddress(std::net::IpAddr::V4(
            std::net::Ipv4Addr::new(127, 0, 0, 1),
        )));

    let key_pair = rcgen::KeyPair::generate()?;
    let cert = params.self_signed(&key_pair)?;

    // Write PEM files.
    std::fs::write(&paths.cert_path, cert.pem())?;
    std::fs::write(&paths.key_path, key_pair.serialize_pem())?;

    // Restrict key permissions (Unix only).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&paths.key_path, std::fs::Permissions::from_mode(0o600))?;
    }

    tracing::info!(
        cert = %paths.cert_path.display(),
        key = %paths.key_path.display(),
        "TLS certificate generated"
    );

    Ok(paths)
}

/// Return the SHA-256 fingerprint of the first X.509 certificate in PEM form.
///
/// The fingerprint is computed over the certificate DER bytes and formatted as
/// `sha256:<hex>`. It is identity material only; release-grade verification
/// still requires the route transport to prove it connected to this key.
pub fn cert_sha256_fingerprint(cert_path: &Path) -> Result<String> {
    let file = std::fs::File::open(cert_path)?;
    let mut reader = BufReader::new(file);
    let cert = rustls_pemfile::certs(&mut reader)
        .next()
        .ok_or_else(|| anyhow!("no certificate found in {}", cert_path.display()))??;
    let digest = Sha256::digest(cert.as_ref());
    Ok(format!("sha256:{}", hex::encode(digest)))
}

pub fn default_cert_fingerprint(musu_home: &Path) -> Result<Option<String>> {
    let paths = TlsPaths::new(musu_home);
    if !paths.cert_path.exists() {
        return Ok(None);
    }
    cert_sha256_fingerprint(&paths.cert_path).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_cert_has_stable_sha256_fingerprint_shape() {
        let dir = std::env::temp_dir().join(format!("musu-tls-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let paths = ensure_tls_certs(&dir, "test-node").unwrap();
        let fp1 = cert_sha256_fingerprint(&paths.cert_path).unwrap();
        let fp2 = default_cert_fingerprint(&dir).unwrap().unwrap();

        assert_eq!(fp1, fp2);
        assert!(fp1.starts_with("sha256:"));
        assert_eq!(fp1.len(), "sha256:".len() + 64);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
