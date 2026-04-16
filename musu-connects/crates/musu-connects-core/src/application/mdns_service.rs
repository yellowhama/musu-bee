use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use crate::domain::peers::{PeerRecord, DeviceIdentity, DiscoveryState, TrustLevel};

pub struct MdnsService {
    daemon: ServiceDaemon,
    service_type: String,
}

impl MdnsService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let daemon = ServiceDaemon::new()?;
        Ok(Self {
            daemon,
            service_type: "_musu._udp.local.".to_string(),
        })
    }

    pub fn register_self(
        &self,
        peer_id: &str,
        port: u16,
        fingerprint: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let hostname = format!("{}.local.", peer_id);
        let mut properties = HashMap::new();
        properties.insert("peer_id".to_string(), peer_id.to_string());
        properties.insert("fingerprint".to_string(), fingerprint.to_string());
        properties.insert("v".to_string(), "1".to_string());

        let service_info = ServiceInfo::new(
            &self.service_type,
            peer_id,
            &hostname,
            "", // IP will be auto-detected
            port,
            Some(properties),
        )?;

        self.daemon.register(service_info)?;
        Ok(())
    }

    pub fn browse(&self) -> Result<mdns_sd::Receiver<ServiceEvent>, Box<dyn std::error::Error>> {
        let receiver = self.daemon.browse(&self.service_type)?;
        Ok(receiver)
    }
}

pub fn parse_mdns_peer(event: ServiceEvent) -> Option<(PeerRecord, String)> {
    if let ServiceEvent::ServiceResolved(info) = event {
        let peer_id = info.get_property_val_str("peer_id")?;
        let fingerprint = info.get_property_val_str("fingerprint")?;
        
        let addresses = info.get_addresses();
        let primary_addr = addresses.iter().next()?;
        let observed_addr = format!("{}:{}", primary_addr, info.get_port());

        let record = PeerRecord {
            peer_id: peer_id.to_string(),
            device: DeviceIdentity {
                device_id: format!("mdns-{}", peer_id),
                device_label: format!("mDNS Node {}", peer_id),
                host_platform: "unknown".into(),
                runtime_profile: "unknown".into(),
            },
            trust_level: TrustLevel::Known,
            visibility_scope: "lan".into(),
            discovery_state: DiscoveryState::Discovered,
            observed_addr: Some(observed_addr),
            last_seen_at: chrono::Utc::now().to_rfc3339(),
            discovered_via: "mdns".into(),
        };
        
        Some((record, fingerprint.to_string()))
    } else {
        None
    }
}
