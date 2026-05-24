use std::net::IpAddr;

/// Returns the first detected Tailscale IP (100.64.0.0/10) on this machine.
/// Scans all local network interfaces and looks for an IPv4 address in the CGNAT range.
pub fn get_tailscale_ip() -> Option<String> {
    let interfaces = local_ip_address::list_afinet_netifas().ok()?;
    
    for (name, ip) in interfaces {
        if let IpAddr::V4(ipv4) = ip {
            let octets = ipv4.octets();
            // Tailscale uses CGNAT range: 100.64.0.0 to 100.127.255.255
            if octets[0] == 100 && octets[1] >= 64 && octets[1] <= 127 {
                tracing::debug!(interface = %name, ip = %ipv4, "Detected Tailscale interface");
                return Some(ipv4.to_string());
            }
        }
    }
    
    None
}
