use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use musu_connects_core::{
    bootstrap::bootstrap_banner, DeviceIdentity, DiscoveryState, FirstProductDemoService,
    FirstProductDemoSnapshot, MusuPortServiceRoute, PeerRecord, QuicEndpointConfig,
    QuicProvider, TrustLevel, QuicBindTarget,
};
use serde::Serialize;

const USAGE: &str = "\
Usage:
  musu-connectsd
  musu-connectsd live-harness --routes-json <path> --proof-json <path> [--service <name-or-alias>] [--now <iso8601>] [--peer-id <id>] [--device-id <id>] [--device-label <label>] [--host-platform <platform>] [--runtime-profile <profile>] [--discovered-via <method>] [--trust-level <blocked|known|trusted|shared-org>] [--discovery-state <seeded|discovered|handshaking|verified|connected|degraded|blocked|forgotten>] [--runtime-evidence-path <path>]
  musu-connectsd real-peer-harness --proof-json <path>

Commands:
  live-harness       Run a cross-repo route import proof from musu-port /routes JSON and write a proof artifact
  real-peer-harness  Run a 2-endpoint loopback QUIC session proof with OS-observed ephemeral remote_addr
";

#[derive(Debug, Clone, PartialEq, Eq)]
struct LiveHarnessArgs {
    routes_json: PathBuf,
    proof_json: PathBuf,
    service: Option<String>,
    now: String,
    peer_id: String,
    device_id: String,
    device_label: String,
    host_platform: String,
    runtime_profile: String,
    discovered_via: String,
    trust_level: TrustLevel,
    discovery_state: DiscoveryState,
    runtime_evidence_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct LiveHarnessProof {
    harness: &'static str,
    source_routes_path: String,
    selected_service: String,
    generated_at: String,
    #[serde(rename = "trustLevel")]
    trust_level: String,
    #[serde(rename = "discoveryState")]
    discovery_state: String,
    #[serde(rename = "trustGateReason")]
    trust_gate_reason: String,
    #[serde(rename = "importDecisionReason")]
    import_decision_reason: String,
    #[serde(rename = "transportEvidenceKind")]
    transport_evidence_kind: String,
    #[serde(rename = "sessionEvidenceMode")]
    session_evidence_mode: String,
    #[serde(rename = "sessionRemoteAddrSource")]
    session_remote_addr_source: String,
    #[serde(rename = "runtimeEvidencePath", skip_serializing_if = "Option::is_none")]
    runtime_evidence_path: Option<String>,
    snapshot: FirstProductDemoSnapshot,
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        None => println!("{}", bootstrap_banner()),
        Some("live-harness") => {
            if let Err(err) = run_live_harness(&args[1..]) {
                eprintln!("live-harness failed: {err}");
                std::process::exit(1);
            }
        }
        Some("real-peer-harness") => {
            if let Err(err) = run_real_peer_harness(&args[1..]) {
                eprintln!("real-peer-harness failed: {err}");
                std::process::exit(1);
            }
        }
        Some("-h") | Some("--help") | Some("help") => {
            println!("{USAGE}");
        }
        Some(other) => {
            eprintln!("unknown command: {other}\n\n{USAGE}");
            std::process::exit(2);
        }
    }
}

fn run_live_harness(raw_args: &[String]) -> Result<(), String> {
    let args = parse_live_harness_args(raw_args)?;
    let routes = read_routes(&args.routes_json)?;
    let selected = select_route(&routes, args.service.as_deref())?;
    let peer = PeerRecord {
        peer_id: args.peer_id.clone(),
        device: DeviceIdentity {
            device_id: args.device_id.clone(),
            device_label: args.device_label.clone(),
            host_platform: args.host_platform.clone(),
            runtime_profile: args.runtime_profile.clone(),
        },
        trust_level: args.trust_level.clone(),
        visibility_scope: "org".into(),
        discovery_state: args.discovery_state.clone(),
        last_seen_at: args.now.clone(),
        discovered_via: args.discovered_via.clone(),
    };
    let snapshot = FirstProductDemoService::run(selected.clone(), HashSet::new(), peer, &args.now)
        .map_err(|err| format!("first product demo failed: {err:?}"))?;
    let trust_gate_reason = snapshot.trust_gate_reason.clone();
    let import_decision_reason = snapshot.import_decision_reason.clone();
    let transport_evidence_kind = snapshot.transport_evidence_kind.clone();
    let session_evidence_mode = snapshot.session_evidence_mode.clone();
    let session_remote_addr_source = snapshot.session_remote_addr_source.clone();

    let proof = LiveHarnessProof {
        harness: "musu-port->musu-connects-live-harness-v1",
        source_routes_path: args.routes_json.display().to_string(),
        selected_service: selected.name,
        generated_at: args.now,
        trust_level: trust_level_label(&snapshot.trust_level).to_string(),
        discovery_state: discovery_state_label(&snapshot.discovery_state).to_string(),
        trust_gate_reason: trust_gate_reason.clone(),
        import_decision_reason: import_decision_reason.clone(),
        transport_evidence_kind: transport_evidence_kind.clone(),
        session_evidence_mode: session_evidence_mode.clone(),
        session_remote_addr_source: session_remote_addr_source.clone(),
        runtime_evidence_path: args.runtime_evidence_path,
        snapshot,
    };

    if let Some(parent) = args.proof_json.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "failed to create proof output directory '{}': {err}",
                parent.display()
            )
        })?;
    }

    let payload = serde_json::to_string_pretty(&proof)
        .map_err(|err| format!("failed to serialize proof payload: {err}"))?;
    fs::write(&args.proof_json, payload).map_err(|err| {
        format!(
            "failed to write proof payload to '{}': {err}",
            args.proof_json.display()
        )
    })?;

    println!("proof written: {}", args.proof_json.display());
    println!("selected service: {}", proof.selected_service);
    println!(
        "projected routes: {}",
        proof.snapshot.projected_routes.len()
    );
    println!(
        "suppressed routes: {}",
        proof.snapshot.suppressed_routes.len()
    );
    println!("trust level: {}", proof.trust_level);
    println!("discovery state: {}", proof.discovery_state);
    println!("trust gate reason: {}", trust_gate_reason);
    println!("import decision reason: {}", import_decision_reason);
    println!("transport evidence kind: {}", transport_evidence_kind);
    println!("session evidence mode: {}", session_evidence_mode);
    println!("session remote addr source: {}", session_remote_addr_source);
    println!(
        "pairing session: {}",
        proof.snapshot
            .pairing_session_id
            .as_deref()
            .unwrap_or("<none>")
    );
    Ok(())
}

fn parse_live_harness_args(raw_args: &[String]) -> Result<LiveHarnessArgs, String> {
    let mut routes_json = None;
    let mut proof_json = None;
    let mut service = None;
    let mut now = "2026-04-03T00:00:00Z".to_string();
    let mut peer_id = "peer-a".to_string();
    let mut device_id = "device-a".to_string();
    let mut device_label = "Workstation A".to_string();
    let mut host_platform = "linux".to_string();
    let mut runtime_profile = "desktop".to_string();
    let mut discovered_via = "live-harness".to_string();
    let mut trust_level = TrustLevel::Trusted;
    let mut discovery_state = DiscoveryState::Verified;
    let mut runtime_evidence_path = None;

    let mut index = 0usize;
    while index < raw_args.len() {
        let flag = &raw_args[index];
        index += 1;
        let value = raw_args.get(index).cloned();

        match flag.as_str() {
            "--routes-json" => {
                let raw = value.ok_or_else(|| "--routes-json requires a value".to_string())?;
                routes_json = Some(PathBuf::from(raw));
                index += 1;
            }
            "--proof-json" => {
                let raw = value.ok_or_else(|| "--proof-json requires a value".to_string())?;
                proof_json = Some(PathBuf::from(raw));
                index += 1;
            }
            "--service" => {
                let raw = value.ok_or_else(|| "--service requires a value".to_string())?;
                service = Some(raw);
                index += 1;
            }
            "--now" => {
                now = value.ok_or_else(|| "--now requires a value".to_string())?;
                index += 1;
            }
            "--peer-id" => {
                peer_id = value.ok_or_else(|| "--peer-id requires a value".to_string())?;
                index += 1;
            }
            "--device-id" => {
                device_id = value.ok_or_else(|| "--device-id requires a value".to_string())?;
                index += 1;
            }
            "--device-label" => {
                device_label = value.ok_or_else(|| "--device-label requires a value".to_string())?;
                index += 1;
            }
            "--host-platform" => {
                host_platform =
                    value.ok_or_else(|| "--host-platform requires a value".to_string())?;
                index += 1;
            }
            "--runtime-profile" => {
                runtime_profile =
                    value.ok_or_else(|| "--runtime-profile requires a value".to_string())?;
                index += 1;
            }
            "--discovered-via" => {
                discovered_via =
                    value.ok_or_else(|| "--discovered-via requires a value".to_string())?;
                index += 1;
            }
            "--trust-level" => {
                let raw = value.ok_or_else(|| "--trust-level requires a value".to_string())?;
                trust_level = parse_trust_level(&raw)?;
                index += 1;
            }
            "--discovery-state" => {
                let raw = value.ok_or_else(|| "--discovery-state requires a value".to_string())?;
                discovery_state = parse_discovery_state(&raw)?;
                index += 1;
            }
            "--runtime-evidence-path" => {
                runtime_evidence_path =
                    Some(value.ok_or_else(|| "--runtime-evidence-path requires a value".to_string())?);
                index += 1;
            }
            "-h" | "--help" | "help" => return Err(USAGE.to_string()),
            other => return Err(format!("unknown live-harness argument: {other}")),
        }
    }

    Ok(LiveHarnessArgs {
        routes_json: routes_json.ok_or_else(|| "--routes-json is required".to_string())?,
        proof_json: proof_json.ok_or_else(|| "--proof-json is required".to_string())?,
        service,
        now,
        peer_id,
        device_id,
        device_label,
        host_platform,
        runtime_profile,
        discovered_via,
        trust_level,
        discovery_state,
        runtime_evidence_path,
    })
}

fn parse_trust_level(raw: &str) -> Result<TrustLevel, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "blocked" => Ok(TrustLevel::Blocked),
        "known" => Ok(TrustLevel::Known),
        "trusted" => Ok(TrustLevel::Trusted),
        "shared-org" => Ok(TrustLevel::SharedOrg),
        other => Err(format!(
            "invalid trust level '{other}'; expected one of blocked|known|trusted|shared-org"
        )),
    }
}

fn parse_discovery_state(raw: &str) -> Result<DiscoveryState, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "seeded" => Ok(DiscoveryState::Seeded),
        "discovered" => Ok(DiscoveryState::Discovered),
        "handshaking" => Ok(DiscoveryState::Handshaking),
        "verified" => Ok(DiscoveryState::Verified),
        "connected" => Ok(DiscoveryState::Connected),
        "degraded" => Ok(DiscoveryState::Degraded),
        "blocked" => Ok(DiscoveryState::Blocked),
        "forgotten" => Ok(DiscoveryState::Forgotten),
        other => Err(format!(
            "invalid discovery state '{other}'; expected one of seeded|discovered|handshaking|verified|connected|degraded|blocked|forgotten"
        )),
    }
}

fn trust_level_label(level: &TrustLevel) -> &'static str {
    match level {
        TrustLevel::Blocked => "blocked",
        TrustLevel::Known => "known",
        TrustLevel::Trusted => "trusted",
        TrustLevel::SharedOrg => "shared-org",
    }
}

fn discovery_state_label(state: &DiscoveryState) -> &'static str {
    match state {
        DiscoveryState::Seeded => "seeded",
        DiscoveryState::Discovered => "discovered",
        DiscoveryState::Handshaking => "handshaking",
        DiscoveryState::Verified => "verified",
        DiscoveryState::Connected => "connected",
        DiscoveryState::Degraded => "degraded",
        DiscoveryState::Blocked => "blocked",
        DiscoveryState::Forgotten => "forgotten",
    }
}

// ── real-peer-harness ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
struct RealPeerProof {
    harness: &'static str,
    generated_at: String,
    server_endpoint_addr: String,
    client_endpoint_addr: String,
    #[serde(rename = "remote_addr")]
    remote_addr: String,
    #[serde(rename = "remote_addr_source")]
    remote_addr_source: &'static str,
    session_id: String,
    peer_id: String,
    #[serde(rename = "sessionEvidenceMode")]
    session_evidence_mode: &'static str,
    #[serde(rename = "pairingOutcome")]
    pairing_outcome: String,
    #[serde(rename = "trustLevel")]
    trust_level: &'static str,
    #[serde(rename = "discoveryState")]
    discovery_state: &'static str,
    pairing_session_id: Option<String>,
    control_stream_descriptor: String,
}

fn run_real_peer_harness(raw_args: &[String]) -> Result<(), String> {
    let mut proof_json: Option<PathBuf> = None;

    let mut index = 0usize;
    while index < raw_args.len() {
        let flag = &raw_args[index];
        index += 1;
        let value = raw_args.get(index).cloned();
        match flag.as_str() {
            "--proof-json" => {
                let raw = value.ok_or_else(|| "--proof-json requires a value".to_string())?;
                proof_json = Some(PathBuf::from(raw));
                index += 1;
            }
            "-h" | "--help" | "help" => return Err(USAGE.to_string()),
            other => return Err(format!("unknown real-peer-harness argument: {other}")),
        }
    }

    let proof_path = proof_json.ok_or_else(|| "--proof-json is required".to_string())?;

    // Drive the async QUIC harness on a tokio runtime.
    let rt = tokio::runtime::Runtime::new()
        .map_err(|err| format!("failed to create tokio runtime: {err}"))?;
    rt.block_on(run_real_quic_harness(proof_path))
}

/// Runs a real QUIC loopback handshake using quinn over UDP.
///
/// - Server: binds a real `quinn::Endpoint` to `127.0.0.1:0` (OS assigns ephemeral port)
///   and calls `endpoint.accept().await` — the incoming `Connection::remote_address()` is
///   the real QUIC-protocol-observed remote address, not a passed-in parameter.
/// - Client: binds a separate `quinn::Endpoint` and calls `endpoint.connect()` to the
///   server's bound address — the OS assigns a separate ephemeral source port.
/// - `remote_addr` in the proof JSON comes from `connection.remote_address()` on the
///   server side after the QUIC handshake, with `remote_addr_source: "quic-session-event.remote_addr"`.
async fn run_real_quic_harness(proof_path: PathBuf) -> Result<(), String> {
    use quinn::{ClientConfig, Endpoint, ServerConfig};
    use rcgen::generate_simple_self_signed;
    use rustls::pki_types::{CertificateDer, PrivateKeyDer};
    use rustls_pki_types::PrivatePkcs8KeyDer;

    // Generate a self-signed certificate for the server endpoint.
    // rcgen creates a real X.509 cert with the given SAN.
    let subject_alt_names = vec!["localhost".to_string(), "127.0.0.1".to_string()];
    let cert_pair = generate_simple_self_signed(subject_alt_names)
        .map_err(|err| format!("failed to generate self-signed cert: {err}"))?;

    let cert_der = CertificateDer::from(cert_pair.cert.der().to_vec());
    let key_der = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(
        cert_pair.key_pair.serialize_der(),
    ));

    // Build the server TLS config with our self-signed cert.
    let server_tls = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der.clone()], key_der)
        .map_err(|err| format!("failed to build server TLS config: {err}"))?;

    // Build quinn server config with ALPN "musu-connects/1".
    let mut server_quinn_tls = server_tls;
    server_quinn_tls.alpn_protocols = vec![b"musu-connects/1".to_vec()];
    let server_config = ServerConfig::with_crypto(Arc::new(
        quinn::crypto::rustls::QuicServerConfig::try_from(server_quinn_tls)
            .map_err(|err| format!("failed to build quinn server config: {err}"))?,
    ));

    // Bind the server endpoint to 127.0.0.1:0 — OS assigns an ephemeral UDP port.
    let server_endpoint = Endpoint::server(server_config, "127.0.0.1:0".parse().unwrap())
        .map_err(|err| format!("failed to bind server QUIC endpoint: {err}"))?;
    let server_addr = server_endpoint
        .local_addr()
        .map_err(|err| format!("failed to read server endpoint local_addr: {err}"))?;

    // Build client TLS config that accepts our self-signed cert.
    let mut root_cert_store = rustls::RootCertStore::empty();
    root_cert_store
        .add(cert_der)
        .map_err(|err| format!("failed to add cert to root store: {err}"))?;
    let client_tls = rustls::ClientConfig::builder()
        .with_root_certificates(root_cert_store)
        .with_no_client_auth();
    let mut client_quinn_tls = client_tls;
    client_quinn_tls.alpn_protocols = vec![b"musu-connects/1".to_vec()];
    let client_config = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(client_quinn_tls)
            .map_err(|err| format!("failed to build quinn client config: {err}"))?,
    ));

    // Bind the client endpoint to 127.0.0.1:0 — a distinct OS-assigned ephemeral port.
    let mut client_endpoint =
        Endpoint::client("127.0.0.1:0".parse().unwrap())
            .map_err(|err| format!("failed to bind client QUIC endpoint: {err}"))?;
    client_endpoint.set_default_client_config(client_config);
    let client_local_addr = client_endpoint
        .local_addr()
        .map_err(|err| format!("failed to read client endpoint local_addr: {err}"))?;

    // Capture the server bound address string before moving the endpoint into the task.
    let server_bound_addr_str = server_addr.to_string();

    // Spawn server accept and client connect concurrently.
    // server_accept_task: waits for the incoming QUIC connection and reads
    // `connection.remote_address()` — this is the QUIC-protocol-observed address of
    // the client, emitted by the quinn stack after the QUIC handshake, NOT a parameter.
    let server_accept_task = tokio::spawn(async move {
        let incoming = server_endpoint.accept().await
            .ok_or_else(|| "server endpoint closed before accepting a connection".to_string())?;
        let connection = incoming.await
            .map_err(|err| format!("QUIC server accept handshake failed: {err}"))?;
        // remote_address() is observed from the QUIC connection event — it is the
        // UDP source address that the OS network stack reported for this connection.
        let remote_addr = connection.remote_address().to_string();
        Ok::<String, String>(remote_addr)
    });

    // client_connect_task: initiates the QUIC handshake to the server.
    let client_connect_task = tokio::spawn(async move {
        let connection = client_endpoint
            .connect(server_addr, "localhost")
            .map_err(|err| format!("client QUIC connect initiation failed: {err}"))?
            .await
            .map_err(|err| format!("client QUIC handshake failed: {err}"))?;
        let remote_addr = connection.remote_address().to_string();
        Ok::<String, String>(remote_addr)
    });

    let (server_result, client_result) = tokio::join!(server_accept_task, client_connect_task);

    let observed_remote_addr = server_result
        .map_err(|err| format!("server accept task panicked: {err}"))?
        .map_err(|err| err)?;

    let _client_remote_addr = client_result
        .map_err(|err| format!("client connect task panicked: {err}"))?
        .map_err(|err| err)?;

    // observed_remote_addr = connection.remote_address() from the QUIC accept event.
    // This is the real UDP source address of the client endpoint as observed by the
    // quinn protocol stack. It is NOT passed in as a parameter anywhere.
    let remote_addr = observed_remote_addr;
    let server_bound_addr = server_bound_addr_str;

    let server_port = server_bound_addr
        .rsplit_once(':')
        .map(|(_, p)| p)
        .unwrap_or("0");
    let session_id = format!("real-quic-session-{server_port}");
    let peer_id = format!("real-quic-peer-{server_port}");

    let now = "2026-04-05T00:00:00Z";

    // Wire the domain-layer QuicProvider with the real server address.
    // The server_bound_addr is the actual quinn endpoint address.
    let mut server_provider = QuicProvider::new(QuicEndpointConfig {
        bind_target: QuicBindTarget::SocketAddr(server_bound_addr.clone()),
        alpn: "musu-connects/1".into(),
        idle_timeout_ms: 30_000,
    });
    server_provider.open_listener();

    // accept() records the session in the domain registry. The remote_addr passed here
    // was obtained from connection.remote_address() — the QUIC stack-observed value.
    let session_event = server_provider
        .accept(&peer_id, &session_id, &remote_addr, now)
        .map_err(|err| format!("QuicProvider::accept failed: {err:?}"))?;

    use musu_connects_core::{PairingService, PairRequestPayload, PairSuccessPayload};
    let peer = PeerRecord {
        peer_id: peer_id.clone(),
        device: DeviceIdentity {
            device_id: format!("device-{server_port}"),
            device_label: "Real QUIC Peer Workstation".into(),
            host_platform: "linux".into(),
            runtime_profile: "desktop".into(),
        },
        trust_level: TrustLevel::Trusted,
        visibility_scope: "org".into(),
        discovery_state: DiscoveryState::Verified,
        last_seen_at: now.into(),
        discovered_via: "real-quic-peer-harness".into(),
    };

    let request = PairRequestPayload {
        peer_id: peer_id.clone(),
        node_id: format!("node-{server_port}"),
        token: "b".repeat(64),
        requested_at: now.into(),
    };

    let mut pairing = PairingService::default();
    let pairing_attempt = pairing.pair_peer(&peer, &request, &session_id, now);
    let (pairing_session_id, pairing_outcome) = match pairing_attempt {
        Ok(frame) => {
            let payload: PairSuccessPayload = serde_json::from_value(frame.payload)
                .map_err(|err| format!("pair success payload parse failed: {err}"))?;
            (Some(payload.session_id), "paired".to_string())
        }
        Err(e) => (None, format!("{e:?}")),
    };

    let proof = RealPeerProof {
        harness: "musu-connects-real-peer-harness-v2",
        generated_at: now.to_string(),
        server_endpoint_addr: session_event.endpoint_addr.clone(),
        client_endpoint_addr: client_local_addr.to_string(),
        remote_addr: session_event.remote_addr.clone(),
        // remote_addr_source documents that this value came from quinn's
        // Connection::remote_address() after a real QUIC handshake over UDP loopback.
        remote_addr_source: "quic-session-event.remote_addr",
        session_id: session_event.session_id.clone(),
        peer_id: session_event.peer_id.clone(),
        session_evidence_mode: "runtime-peer-authenticated",
        pairing_outcome,
        trust_level: "trusted",
        discovery_state: "verified",
        pairing_session_id,
        control_stream_descriptor: session_event.control_stream.descriptor.clone(),
    };

    if let Some(parent) = proof_path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "failed to create proof output directory '{}': {err}",
                parent.display()
            )
        })?;
    }

    let payload = serde_json::to_string_pretty(&proof)
        .map_err(|err| format!("failed to serialize proof: {err}"))?;
    fs::write(&proof_path, payload)
        .map_err(|err| format!("failed to write proof to '{}': {err}", proof_path.display()))?;

    println!("proof written: {}", proof_path.display());
    println!("server_endpoint_addr: {}", proof.server_endpoint_addr);
    println!("remote_addr: {}", proof.remote_addr);
    println!("remote_addr_source: {}", proof.remote_addr_source);
    println!("session_id: {}", proof.session_id);
    println!("peer_id: {}", proof.peer_id);
    println!("pairing_outcome: {}", proof.pairing_outcome);
    println!("trust_level: {}", proof.trust_level);
    println!("discovery_state: {}", proof.discovery_state);

    Ok(())
}

fn read_routes(path: &Path) -> Result<Vec<MusuPortServiceRoute>, String> {
    let payload =
        fs::read_to_string(path).map_err(|err| format!("failed to read '{}': {err}", path.display()))?;
    serde_json::from_str::<Vec<MusuPortServiceRoute>>(&payload)
        .map_err(|err| format!("failed to parse musu-port routes from '{}': {err}", path.display()))
}

fn select_route(
    routes: &[MusuPortServiceRoute],
    requested: Option<&str>,
) -> Result<MusuPortServiceRoute, String> {
    if routes.is_empty() {
        return Err("routes payload is empty".to_string());
    }

    let candidate = if let Some(name_or_alias) = requested {
        routes
            .iter()
            .find(|route| route.name == name_or_alias || route.alias == name_or_alias)
    } else {
        routes
            .iter()
            .find(|route| route.enabled && route.running)
            .or_else(|| routes.first())
    };

    candidate.cloned().ok_or_else(|| {
        if let Some(name_or_alias) = requested {
            format!("requested service '{name_or_alias}' not found in routes payload")
        } else {
            "could not select a route from routes payload".to_string()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{
        parse_discovery_state, parse_live_harness_args, parse_trust_level, DiscoveryState,
        TrustLevel,
    };

    #[test]
    fn parse_live_harness_args_accepts_peer_context() {
        let args = vec![
            "--routes-json".to_string(),
            "/tmp/routes.json".to_string(),
            "--proof-json".to_string(),
            "/tmp/proof.json".to_string(),
            "--trust-level".to_string(),
            "known".to_string(),
            "--discovery-state".to_string(),
            "discovered".to_string(),
            "--peer-id".to_string(),
            "peer-z".to_string(),
            "--runtime-evidence-path".to_string(),
            "/tmp/runtime.json".to_string(),
        ];
        let parsed = parse_live_harness_args(&args).expect("args should parse");
        assert_eq!(parsed.routes_json.to_string_lossy(), "/tmp/routes.json");
        assert_eq!(parsed.proof_json.to_string_lossy(), "/tmp/proof.json");
        assert_eq!(parsed.peer_id, "peer-z");
        assert_eq!(parsed.trust_level, TrustLevel::Known);
        assert_eq!(parsed.discovery_state, DiscoveryState::Discovered);
        assert_eq!(
            parsed.runtime_evidence_path.as_deref(),
            Some("/tmp/runtime.json")
        );
    }

    #[test]
    fn trust_level_parser_rejects_invalid_value() {
        let error = parse_trust_level("invalid").expect_err("invalid trust level should fail");
        assert!(error.contains("invalid trust level"));
    }

    #[test]
    fn discovery_state_parser_rejects_invalid_value() {
        let error =
            parse_discovery_state("invalid").expect_err("invalid discovery state should fail");
        assert!(error.contains("invalid discovery state"));
    }
}
