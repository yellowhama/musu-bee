use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub device_label: String,
    pub host_platform: String,
    pub runtime_profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TrustLevel {
    Blocked,
    Known,
    Trusted,
    SharedOrg,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DiscoveryState {
    Seeded,
    Discovered,
    Handshaking,
    Verified,
    Connected,
    Degraded,
    Blocked,
    Forgotten,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PeerRecord {
    pub peer_id: String,
    pub device: DeviceIdentity,
    pub trust_level: TrustLevel,
    pub visibility_scope: String,
    pub discovery_state: DiscoveryState,
    pub observed_addr: Option<String>,
    pub last_seen_at: String,
    pub discovered_via: String,
}
