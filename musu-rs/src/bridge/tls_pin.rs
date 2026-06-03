//! Fingerprint-pinned TLS client helpers for peer-to-peer route attempts.

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, WebPkiSupportedAlgorithms};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{CertificateError, DigitallySignedStruct, Error, SignatureScheme};
use sha2::{Digest, Sha256};

#[derive(Debug)]
struct FingerprintServerCertVerifier {
    expected_fingerprint: String,
    supported: WebPkiSupportedAlgorithms,
}

impl ServerCertVerifier for FingerprintServerCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> std::result::Result<ServerCertVerified, Error> {
        let actual = format!(
            "sha256:{}",
            hex::encode(Sha256::digest(end_entity.as_ref()))
        );
        if actual.eq_ignore_ascii_case(self.expected_fingerprint.trim()) {
            Ok(ServerCertVerified::assertion())
        } else {
            Err(Error::InvalidCertificate(
                CertificateError::ApplicationVerificationFailure,
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, Error> {
        verify_tls12_signature(message, cert, dss, &self.supported)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, Error> {
        verify_tls13_signature(message, cert, dss, &self.supported)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.supported.supported_schemes()
    }
}

pub fn fingerprint_pinned_client(
    expected_fingerprint: &str,
) -> std::result::Result<reqwest::Client, String> {
    let provider = rustls::crypto::aws_lc_rs::default_provider();
    let supported = provider.signature_verification_algorithms;
    let tls_config = rustls::ClientConfig::builder_with_provider(std::sync::Arc::new(provider))
        .with_safe_default_protocol_versions()
        .map_err(|err| format!("tls protocol config: {err}"))?
        .dangerous()
        .with_custom_certificate_verifier(std::sync::Arc::new(FingerprintServerCertVerifier {
            expected_fingerprint: expected_fingerprint.to_string(),
            supported,
        }))
        .with_no_client_auth();
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .use_preconfigured_tls(tls_config)
        .build()
        .map_err(|err| format!("fingerprint-pinned reqwest client: {err}"))
}
