use std::net::{IpAddr, Ipv4Addr};
use std::process::Command;

/// Returns the first detected Tailscale IP (100.64.0.0/10) on this machine.
///
/// Prefer the official `tailscale ip -4` CLI because a raw interface scan can
/// mistake unrelated CGNAT interfaces for Tailscale. Fall back to interface
/// scanning so local/dev installs still get a best-effort candidate when the
/// CLI is unavailable.
pub fn get_tailscale_ip() -> Option<String> {
    tailscale_ip_from_cli().or_else(tailscale_ip_from_interfaces)
}

fn tailscale_ip_from_cli() -> Option<String> {
    let output = Command::new("tailscale").args(["ip", "-4"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    parse_tailscale_ipv4(&stdout)
}

fn tailscale_ip_from_interfaces() -> Option<String> {
    let interfaces = local_ip_address::list_afinet_netifas().ok()?;

    for (name, ip) in interfaces {
        if let IpAddr::V4(ipv4) = ip {
            if is_tailscale_ipv4(ipv4) {
                tracing::debug!(interface = %name, ip = %ipv4, "Detected Tailscale interface");
                return Some(ipv4.to_string());
            }
        }
    }

    None
}

fn parse_tailscale_ipv4(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| line.parse::<Ipv4Addr>().ok())
        .find(|ip| is_tailscale_ipv4(*ip))
        .map(|ip| ip.to_string())
}

fn is_tailscale_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tailscale_ipv4_uses_cgnat_tailnet_range() {
        assert_eq!(
            parse_tailscale_ipv4("fd7a:115c:a1e0::1\n100.121.112.23\n"),
            Some("100.121.112.23".to_string())
        );
    }

    #[test]
    fn parse_tailscale_ipv4_rejects_non_tailnet_cgnat_edges() {
        assert_eq!(parse_tailscale_ipv4("100.63.255.255\n"), None);
        assert_eq!(parse_tailscale_ipv4("100.128.0.1\n"), None);
    }
}
