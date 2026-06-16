//! mDNS auto-discovery — V27-F2.
//!
//! Advertises this musu node on the local network and discovers
//! other musu nodes automatically.
//!
//! Service type: `_musu._tcp.local.`
//! TXT records: node_name, version, port, acct (account hash)
//!
//! Only nodes with the **same account hash** (derived from the bridge
//! token) are auto-registered. This prevents random LAN nodes from
//! being connected — "같은 계정이면 자동연결".

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;

use mdns_sd::{IfKind, ServiceDaemon, ServiceEvent, ServiceInfo};
use tokio_util::sync::CancellationToken;

use crate::peer::discovery::{validate_peer_addr, ManualPeerList};

const SERVICE_TYPE: &str = "_musu._tcp.local.";
const MUSU_VERSION: &str = env!("CARGO_PKG_VERSION");
const MDNS_IPV6_ENV: &str = "MUSU_MDNS_ENABLE_IPV6";
const MDNS_TAILSCALE_ENV: &str = "MUSU_MDNS_ENABLE_TAILSCALE";
const MDNS_VIRTUAL_ENV: &str = "MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MdnsRecvTimeoutKind {
    Timeout,
    Disconnected,
}

fn env_truthy(name: &str) -> bool {
    matches!(
        std::env::var(name).as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    )
}

fn classify_mdns_recv_timeout_error(err: &flume::RecvTimeoutError) -> MdnsRecvTimeoutKind {
    match err {
        flume::RecvTimeoutError::Timeout => MdnsRecvTimeoutKind::Timeout,
        flume::RecvTimeoutError::Disconnected => MdnsRecvTimeoutKind::Disconnected,
    }
}

fn mdns_ipv6_enabled() -> bool {
    env_truthy(MDNS_IPV6_ENV)
}

fn mdns_tailscale_enabled() -> bool {
    env_truthy(MDNS_TAILSCALE_ENV)
}

fn mdns_virtual_interfaces_enabled() -> bool {
    env_truthy(MDNS_VIRTUAL_ENV)
}

fn is_virtual_mdns_interface_name(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    normalized.contains("tailscale")
        || normalized.contains("nordlynx")
        || normalized.contains("wireguard")
        || normalized == "wg0"
        || normalized.starts_with("wg")
        || normalized.contains("zerotier")
        || normalized.contains("vethernet")
        || normalized.contains("hyper-v")
        || normalized.contains("wsl")
        || normalized.contains("docker")
        || normalized.contains("vmware")
        || normalized.contains("virtualbox")
        || normalized.contains("vpn")
        || normalized.starts_with("tun")
        || normalized.starts_with("tap")
        || normalized.starts_with("utun")
}

fn disable_virtual_mdns_interfaces(mdns: &ServiceDaemon) {
    let interfaces = match local_ip_address::list_afinet_netifas() {
        Ok(interfaces) => interfaces,
        Err(e) => {
            tracing::warn!(err = %e, "failed to enumerate interfaces for mDNS virtual-interface filter");
            return;
        }
    };

    let mut disabled = 0usize;
    for (name, addr) in interfaces {
        if !is_virtual_mdns_interface_name(&name) {
            continue;
        }

        if let Err(e) = mdns.disable_interface(name.as_str()) {
            tracing::warn!(
                err = %e,
                interface = %name,
                "failed to disable virtual mDNS interface by name"
            );
        }
        if let Err(e) = mdns.disable_interface(IfKind::Addr(addr)) {
            tracing::warn!(
                err = %e,
                interface = %name,
                ip = %addr,
                "failed to disable virtual mDNS interface by address"
            );
        } else {
            disabled += 1;
        }
    }

    if disabled > 0 {
        tracing::debug!(
            env = MDNS_VIRTUAL_ENV,
            disabled,
            "mDNS virtual/VPN interfaces disabled by default"
        );
    }
}

fn new_musu_mdns_daemon() -> anyhow::Result<ServiceDaemon> {
    let mdns = ServiceDaemon::new().map_err(|e| anyhow::anyhow!("mDNS daemon: {e}"))?;

    if !mdns_ipv6_enabled() {
        if let Err(e) = mdns.disable_interface(IfKind::IPv6) {
            tracing::warn!(err = %e, "failed to disable IPv6 mDNS interfaces");
        } else {
            tracing::debug!(
                env = MDNS_IPV6_ENV,
                "mDNS IPv6 interfaces disabled by default"
            );
        }
    }

    if !mdns_tailscale_enabled() {
        if let Err(e) = mdns.disable_interface(vec!["Tailscale", "tailscale0"]) {
            tracing::warn!(err = %e, "failed to disable Tailscale mDNS interfaces");
        } else {
            tracing::debug!(
                env = MDNS_TAILSCALE_ENV,
                "mDNS Tailscale interfaces disabled by default"
            );
        }
    }

    if !mdns_virtual_interfaces_enabled() {
        disable_virtual_mdns_interfaces(&mdns);
    }

    Ok(mdns)
}

/// Start advertising this node via mDNS.
///
/// Runs until the returned handle is dropped.
pub fn start_advertiser(node_name: &str, port: u16, token: &str) -> anyhow::Result<ServiceDaemon> {
    let mdns = new_musu_mdns_daemon()?;

    let host_name = format!("{}.local.", node_name.replace(' ', "-"));
    let acct_hash = token_hash(token);

    let properties = [
        ("node_name", node_name),
        ("version", MUSU_VERSION),
        ("acct", acct_hash.as_str()),
    ];

    let service_info = ServiceInfo::new(
        SERVICE_TYPE,
        node_name,
        &host_name,
        "", // let mdns-sd auto-detect IP
        port,
        &properties[..],
    )
    .map_err(|e| anyhow::anyhow!("ServiceInfo: {e}"))?;

    mdns.register(service_info)
        .map_err(|e| anyhow::anyhow!("mDNS register: {e}"))?;

    tracing::info!(
        node_name = %node_name,
        port = port,
        "mDNS advertiser started: {SERVICE_TYPE}"
    );

    Ok(mdns)
}

/// Discovered peer from mDNS.
#[derive(Debug, Clone)]
pub struct DiscoveredPeer {
    pub name: String,
    pub addr: String,
    pub version: String,
    /// Account hash — matches only peers with the same token.
    pub acct_hash: String,
}

/// Browse for musu peers on the local network.
///
/// Runs for `duration` and returns all discovered peers.
pub async fn discover_peers(duration: Duration) -> Vec<DiscoveredPeer> {
    discover_peers_with_cancellation(duration, None).await
}

/// Browse for musu peers on the local network until duration elapses or cancelled.
pub async fn discover_peers_with_cancellation(
    duration: Duration,
    cancellation_token: Option<CancellationToken>,
) -> Vec<DiscoveredPeer> {
    let mut peers = Vec::new();
    if cancellation_token
        .as_ref()
        .map_or(false, |token| token.is_cancelled())
    {
        return peers;
    }

    let mdns = match new_musu_mdns_daemon() {
        Ok(d) => d,
        Err(e) => {
            tracing::warn!("mDNS browse failed to start: {e}");
            return peers;
        }
    };

    let receiver = match mdns.browse(SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("mDNS browse failed: {e}");
            return peers;
        }
    };

    let deadline = tokio::time::Instant::now() + duration;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        let receive = tokio::time::timeout(
            remaining,
            tokio::task::spawn_blocking({
                let receiver = receiver.clone();
                move || receiver.recv_timeout(Duration::from_secs(1))
            }),
        );
        let receive_result = if let Some(cancellation_token) = cancellation_token.as_ref() {
            tokio::select! {
                _ = cancellation_token.cancelled() => {
                    tracing::debug!("mDNS browse cancelled; ending discovery window early");
                    break;
                }
                result = receive => result,
            }
        } else {
            receive.await
        };

        match receive_result {
            Ok(Ok(Ok(ServiceEvent::ServiceResolved(info)))) => {
                let name = info
                    .get_property_val_str("node_name")
                    .unwrap_or_else(|| info.get_fullname())
                    .to_string();
                let version = info
                    .get_property_val_str("version")
                    .unwrap_or("unknown")
                    .to_string();
                let acct = info.get_property_val_str("acct").unwrap_or("").to_string();
                let port = info.get_port();

                for addr in info.get_addresses() {
                    let peer_addr = format!("{addr}:{port}");
                    tracing::info!(
                        name = %name,
                        addr = %peer_addr,
                        version = %version,
                        "discovered musu peer via mDNS"
                    );
                    peers.push(DiscoveredPeer {
                        name: name.clone(),
                        addr: peer_addr,
                        version: version.clone(),
                        acct_hash: acct.clone(),
                    });
                }
            }
            Ok(Ok(Ok(_))) => {} // other events, ignore
            Ok(Ok(Err(err))) => match classify_mdns_recv_timeout_error(&err) {
                MdnsRecvTimeoutKind::Timeout => {}
                MdnsRecvTimeoutKind::Disconnected => {
                    tracing::debug!(
                        "mDNS browse receiver disconnected; ending discovery window early"
                    );
                    break;
                }
            },
            Ok(Err(err)) => {
                tracing::debug!(err = %err, "mDNS browse receiver task failed");
                break;
            }
            Err(_) => break, // tokio deadline elapsed
        }
    }

    // Deduplicate by addr
    peers.sort_by(|a, b| a.addr.cmp(&b.addr));
    peers.dedup_by(|a, b| a.addr == b.addr);

    peers
}

/// Auto-register discovered peers until duration elapses or cancelled.
pub async fn auto_register_peers_with_cancellation(
    musu_home: &std::path::Path,
    my_node_name: &str,
    my_token: &str,
    duration: Duration,
    cancellation_token: CancellationToken,
) -> usize {
    auto_register_peers_with_optional_cancellation(
        musu_home,
        my_node_name,
        my_token,
        duration,
        Some(cancellation_token),
    )
    .await
}

async fn auto_register_peers_with_optional_cancellation(
    musu_home: &std::path::Path,
    my_node_name: &str,
    my_token: &str,
    duration: Duration,
    cancellation_token: Option<CancellationToken>,
) -> usize {
    let my_hash = token_hash(my_token);
    let discovered = discover_peers_with_cancellation(duration, cancellation_token).await;
    let mut added = 0;

    let mut list = ManualPeerList::load(musu_home);

    for peer in &discovered {
        // Don't add self.
        if peer.name == my_node_name {
            continue;
        }
        // Only auto-connect peers with the same account.
        if !peer.acct_hash.is_empty() && peer.acct_hash != my_hash {
            tracing::debug!(
                name = %peer.name,
                "skipping peer — different account"
            );
            continue;
        }
        // Validate address
        if validate_peer_addr(&peer.addr).is_err() {
            continue;
        }
        // Add if not already known (ManualPeerList::add replaces on
        // duplicate addr, so check membership first to count accurately).
        let already_known = list.peers.iter().any(|p| p.addr == peer.addr);
        if !already_known {
            list.add(peer.addr.clone(), Some(peer.name.clone()));
            tracing::info!(
                name = %peer.name,
                addr = %peer.addr,
                "auto-registered peer via mDNS"
            );
            added += 1;
        }
    }

    if added > 0 {
        if let Err(e) = list.save(musu_home) {
            tracing::error!(err = %e, "failed to save auto-discovered peers");
        }
    }

    added
}

/// Helper to hash a token into a short public identifier.
fn token_hash(token: &str) -> String {
    let mut hasher = DefaultHasher::new();
    token.hash(&mut hasher);
    let hash = hasher.finish();
    format!("{:016x}", hash)
}

#[cfg(test)]
mod tests {
    use super::{
        classify_mdns_recv_timeout_error, is_virtual_mdns_interface_name, MdnsRecvTimeoutKind,
    };

    #[test]
    fn virtual_mdns_interface_filter_matches_vpn_and_vm_adapters() {
        for name in [
            "Tailscale",
            "tailscale0",
            "NordLynx",
            "WireGuard Tunnel",
            "wg0",
            "ZeroTier One",
            "vEthernet (WSL (Hyper-V firewall))",
            "DockerNAT",
            "VMware Network Adapter VMnet8",
            "VirtualBox Host-Only Network",
            "utun4",
        ] {
            assert!(is_virtual_mdns_interface_name(name), "{name}");
        }
    }

    #[test]
    fn virtual_mdns_interface_filter_allows_normal_lan_names() {
        for name in ["Ethernet", "Wi-Fi", "Local Area Connection", "이더넷 2"] {
            assert!(!is_virtual_mdns_interface_name(name), "{name}");
        }
    }

    #[test]
    fn mdns_receive_error_classification_breaks_on_disconnected_channel() {
        assert_eq!(
            classify_mdns_recv_timeout_error(&flume::RecvTimeoutError::Timeout),
            MdnsRecvTimeoutKind::Timeout
        );
        assert_eq!(
            classify_mdns_recv_timeout_error(&flume::RecvTimeoutError::Disconnected),
            MdnsRecvTimeoutKind::Disconnected
        );
    }
}
