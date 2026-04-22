use rcgen::generate_simple_self_signed;
use rustls_pki_types::{CertificateDer, PrivateKeyDer};
use std::path::PathBuf;

pub fn gen_self_signed_cert() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), Box<dyn std::error::Error>> {
    let cert = generate_simple_self_signed(vec!["musu-peer".to_string()])?;
    let cert_der = CertificateDer::from(cert.cert.der().to_vec());
    let key_der = PrivateKeyDer::try_from(cert.key_pair.serialize_der())
        .map_err(|e| format!("key error: {e}"))?;
    Ok((cert_der, key_der))
}

/// Load cert/key from ~/.musu/, or generate a new self-signed cert and save it.
/// Stable across restarts — same fingerprint unless files are deleted.
pub fn load_or_gen_cert() -> Result<(CertificateDer<'static>, PrivateKeyDer<'static>), Box<dyn std::error::Error>> {
    let musu_dir: PathBuf = dirs::home_dir()
        .ok_or("cannot determine home directory")?
        .join(".musu");
    std::fs::create_dir_all(&musu_dir)?;
    let cert_path = musu_dir.join("quic_cert.der");
    let key_path  = musu_dir.join("quic_key.der");

    if cert_path.exists() && key_path.exists() {
        let cert_bytes = std::fs::read(&cert_path)?;
        let key_bytes  = std::fs::read(&key_path)?;
        let cert = CertificateDer::from(cert_bytes);
        let key  = PrivateKeyDer::try_from(key_bytes)
            .map_err(|e| format!("key load error: {e}"))?;
        return Ok((cert, key));
    }

    // Generate fresh cert and persist
    let (cert, key) = gen_self_signed_cert()?;
    std::fs::write(&cert_path, cert.as_ref())?;
    let key_bytes = match &key {
        PrivateKeyDer::Pkcs8(k) => k.secret_pkcs8_der().to_vec(),
        PrivateKeyDer::Sec1(k)  => k.secret_sec1_der().to_vec(),
        PrivateKeyDer::Pkcs1(k) => k.secret_pkcs1_der().to_vec(),
        _ => return Err("unsupported private key type".into()),
    };
    std::fs::write(&key_path, key_bytes)?;
    Ok((cert, key))
}

/// Compute SHA-256 fingerprint of a DER certificate (hex, colon-separated).
pub fn cert_fingerprint(cert: &CertificateDer<'_>) -> String {
    use ring::digest::{digest, SHA256};
    digest(&SHA256, cert.as_ref())
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::server::danger::{ClientCertVerified, ClientCertVerifier};
use rustls::pki_types::{ServerName, UnixTime};
use rustls::{DigitallySignedStruct, Error as TlsError, SignatureScheme};
use rustls::crypto::CryptoProvider;
use std::sync::Arc;

/// Fingerprint verifier for rustls (Client-side)
#[derive(Debug)]
pub struct FingerprintVerifier {
    pub expected: String,
    pub provider: Arc<CryptoProvider>,
}

impl FingerprintVerifier {
    pub fn new(expected: String) -> Arc<Self> {
        Arc::new(Self {
            expected,
            provider: Arc::new(rustls::crypto::ring::default_provider()),
        })
    }
}

impl ServerCertVerifier for FingerprintVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        let fp = cert_fingerprint(end_entity);
        if fp == self.expected {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(TlsError::General(format!(
                "fingerprint mismatch: expected {}, got {}",
                self.expected, fp
            )))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls12_signature(
            message, cert, dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls13_signature(
            message, cert, dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }
}

/// Fingerprint verifier for rustls (Server-side mTLS)
#[derive(Debug)]
pub struct FingerprintClientVerifier {
    pub allowed: Arc<dashmap::DashSet<String>>, // set of allowed fingerprints
    pub provider: Arc<CryptoProvider>,
}

impl FingerprintClientVerifier {
    pub fn new(allowed: Arc<dashmap::DashSet<String>>) -> Arc<Self> {
        Arc::new(Self {
            allowed,
            provider: Arc::new(rustls::crypto::ring::default_provider()),
        })
    }
}

impl ClientCertVerifier for FingerprintClientVerifier {
    fn verify_client_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _now: UnixTime,
    ) -> Result<ClientCertVerified, TlsError> {
        let fp = cert_fingerprint(end_entity);
        if self.allowed.contains(&fp) {
            Ok(ClientCertVerified::assertion())
        } else {
            Err(TlsError::General(format!("unknown client fingerprint: {fp}")))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls12_signature(
            message, cert, dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        rustls::crypto::verify_tls13_signature(
            message, cert, dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider.signature_verification_algorithms.supported_schemes()
    }

    fn root_hint_subjects(&self) -> &[rustls::pki_types::DistinguishedName] {
        &[] // No CA roots used
    }
}

/// No-verify verifier for rustls
#[derive(Debug)]
pub struct NoVerifier;

impl ServerCertVerifier for NoVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, TlsError> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, TlsError> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::ED25519,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
        ]
    }
}
