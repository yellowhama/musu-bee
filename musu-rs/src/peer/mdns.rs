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

use crate::peer::discovery::{ManualPeerList, validate_peer_addr};

const SERVICE_TYPE: &str = "_musu._tcp.local.";
const MUSU_VERSION: &str = env!("CARGO_PKG_VERSION");
const MDNS_IPV6_ENV: &str = "MUSU_MDNS_ENABLE_IPV6";

fn mdns_ipv6_enabled() -> bool {
    matches!(
        std::env::var(MDNS_IPV6_ENV).as_deref(),
        Ok("1") | Ok("true") | Ok("yes")
    )
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
    let mut peers = Vec::new();

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

        match tokio::time::timeout(
            remaining,
            tokio::task::spawn_blocking({
                let receiver = receiver.clone();
                move || receiver.recv_timeout(Duration::from_secs(1))
            }),
        )
        .await
        {
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
            Ok(Ok(Ok(_))) => {}  // other events, ignore
            Ok(Ok(Err(_))) => {} // recv timeout, continue
            _ => break,          // tokio timeout or join error
        }
    }

    // Deduplicate by addr
    peers.sort_by(|a, b| a.addr.cmp(&b.addr));
    peers.dedup_by(|a, b| a.addr == b.addr);

    peers
}

/// Auto-register discovered peers into manual_peers.toml.
///
/// Called by the bridge on startup and periodically.
pub async fn auto_register_peers(
    musu_home: &std::path::Path,
    my_node_name: &str,
    my_token: &str,
    duration: Duration,
) -> usize {
    let my_hash = token_hash(my_token);
    let discovered = discover_peers(duration).await;
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
