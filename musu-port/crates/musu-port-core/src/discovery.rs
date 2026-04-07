mod linux;
mod windows;

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr};

use serde::Serialize;

use crate::platform::{RuntimeContext, RuntimeKind};
use crate::route::{
    is_agent_facing_service, SERVICE_CLASS_GENERIC_SERVICE, SERVICE_CLASS_MCP_SERVER,
};

#[derive(Debug, Clone)]
pub struct ListenerEndpoint {
    pub protocol: String,
    pub process_name: String,
    pub process_user: Option<String>,
    pub pid: Option<u32>,
    pub listen_addr: String,
    pub port: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiscoveryProviderKind {
    Auto,
    Linux,
    Windows,
    Both,
}

impl DiscoveryProviderKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Linux => "linux",
            Self::Windows => "windows",
            Self::Both => "both",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredEndpoint {
    pub signature: String,
    pub protocol: String,
    pub service_class: String,
    pub agent_facing: bool,
    pub classification_source: String,
    pub process_name: String,
    pub process_user: Option<String>,
    pub pid: Option<u32>,
    pub listen_addr: String,
    pub port: u16,
    pub exposure: String,
    pub owner: String,
    pub severity: String,
    pub false_positive_candidate: bool,
    pub ignored: bool,
    pub suggested_alias: String,
    pub suggested_action: String,
}

pub fn discover_unmanaged_endpoints(
    managed_ports: &HashSet<u16>,
    ignored_signatures: &HashSet<String>,
    runtime_context: &RuntimeContext,
) -> Result<Vec<DiscoveredEndpoint>, String> {
    let listeners = collect_listener_snapshot(runtime_context)?;
    let mut discovered = Vec::new();

    for item in listeners {
        if managed_ports.contains(&item.port) {
            continue;
        }

        let signature = endpoint_signature(
            &item.protocol,
            &item.process_name,
            &item.listen_addr,
            item.port,
        );
        let legacy_signature =
            endpoint_signature_legacy(&item.process_name, &item.listen_addr, item.port);
        let ignored = ignored_signatures.contains(&signature)
            || ignored_signatures.contains(&legacy_signature);
        let exposure = classify_exposure(&item.listen_addr).to_string();
        let owner = classify_owner(&item.process_name).to_string();
        let false_positive_candidate = is_false_positive_candidate(&item.process_name, item.port);
        let severity = if false_positive_candidate {
            "low".to_string()
        } else {
            classify_severity(&exposure, item.port).to_string()
        };
        let service_class = classify_service_class(&item.protocol, &item.process_name).to_string();
        let agent_facing = is_agent_facing_service(&service_class, false);

        discovered.push(DiscoveredEndpoint {
            signature,
            protocol: item.protocol.clone(),
            service_class: service_class.clone(),
            agent_facing,
            classification_source: "baseline".to_string(),
            process_name: item.process_name.clone(),
            process_user: item.process_user.clone(),
            pid: item.pid,
            listen_addr: item.listen_addr.clone(),
            port: item.port,
            exposure: exposure.clone(),
            owner,
            severity,
            false_positive_candidate,
            ignored,
            suggested_alias: format!("{}-{}", sanitize_alias(&item.process_name), item.port),
            suggested_action: if ignored {
                "Suppressed. Unsuppress to surface promote recommendation.".to_string()
            } else if false_positive_candidate {
                "Likely system/service endpoint. Suppress unless explicitly needed.".to_string()
            } else {
                "Promote to managed route or suppress this signature.".to_string()
            },
        });
    }

    discovered.sort_by(|a, b| a.signature.cmp(&b.signature));
    Ok(discovered)
}

pub fn selected_discovery_provider(runtime_context: &RuntimeContext) -> DiscoveryProviderKind {
    let requested = std::env::var("MUSU_PORT_DISCOVERY_PROVIDER")
        .ok()
        .map(|raw| normalize_discovery_provider(raw.as_str()))
        .unwrap_or(DiscoveryProviderKind::Auto);

    match requested {
        DiscoveryProviderKind::Auto => match runtime_context.runtime {
            RuntimeKind::Windows => DiscoveryProviderKind::Windows,
            RuntimeKind::Linux | RuntimeKind::Wsl => DiscoveryProviderKind::Linux,
        },
        other => other,
    }
}

fn normalize_discovery_provider(raw: &str) -> DiscoveryProviderKind {
    match raw.trim().to_ascii_lowercase().as_str() {
        "linux" | "wsl" => DiscoveryProviderKind::Linux,
        "windows" | "win" => DiscoveryProviderKind::Windows,
        "both" | "dual" => DiscoveryProviderKind::Both,
        _ => DiscoveryProviderKind::Auto,
    }
}

fn collect_listener_snapshot(
    runtime_context: &RuntimeContext,
) -> Result<Vec<ListenerEndpoint>, String> {
    match selected_discovery_provider(runtime_context) {
        DiscoveryProviderKind::Linux => linux::collect_listener_snapshot_linux(),
        DiscoveryProviderKind::Windows => {
            windows::collect_listener_snapshot_windows(runtime_context)
        }
        DiscoveryProviderKind::Both => {
            let mut combined = linux::collect_listener_snapshot_linux()?;
            combined.extend(windows::collect_listener_snapshot_windows(runtime_context)?);
            Ok(dedupe_listener_snapshot(combined))
        }
        DiscoveryProviderKind::Auto => Ok(Vec::new()),
    }
}

fn dedupe_listener_snapshot(listeners: Vec<ListenerEndpoint>) -> Vec<ListenerEndpoint> {
    let mut out = Vec::new();
    let mut seen = HashSet::<String>::new();
    for parsed in listeners {
        let key = format!(
            "{}|{}|{}|{}|{}",
            parsed.protocol,
            parsed.process_name,
            parsed.listen_addr,
            parsed.port,
            parsed.pid.unwrap_or(0)
        );
        if seen.insert(key) {
            out.push(parsed);
        }
    }
    out
}

pub(crate) fn parse_local_addr_port(raw: &str) -> Option<(String, u16)> {
    if raw.starts_with('[') {
        let marker = raw.rfind("]:")?;
        let host = normalize_listen_addr(raw.get(1..marker)?);
        let port = raw.get(marker + 2..)?.parse::<u16>().ok()?;
        return Some((host, port));
    }

    let (host, port_raw) = raw.rsplit_once(':')?;
    let port = port_raw.parse::<u16>().ok()?;
    Some((normalize_listen_addr(host), port))
}

pub(crate) fn normalize_listen_addr(raw: &str) -> String {
    raw.split('%').next().unwrap_or(raw).to_string()
}

pub(crate) fn endpoint_signature(
    protocol: &str,
    process_name: &str,
    listen_addr: &str,
    port: u16,
) -> String {
    format!("{protocol}|{process_name}|{listen_addr}|{port}")
}

fn endpoint_signature_legacy(process_name: &str, listen_addr: &str, port: u16) -> String {
    format!("{process_name}|{listen_addr}|{port}")
}

pub fn sanitize_alias(raw: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in raw.trim().chars() {
        let normalized = ch.to_ascii_lowercase();
        if normalized.is_ascii_alphanumeric() {
            out.push(normalized);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn classify_owner(process_name: &str) -> &'static str {
    let lower = process_name.to_ascii_lowercase();
    if lower.contains("musu")
        || lower.contains("hive_link")
        || lower.contains("forgejo")
        || lower.contains("openclaw")
    {
        "musu_runtime"
    } else {
        "external_process"
    }
}

fn classify_service_class(protocol: &str, process_name: &str) -> &'static str {
    let lower = process_name.to_ascii_lowercase();
    if lower.contains("mcp") || lower.contains("codex") || lower.contains("claude") {
        return SERVICE_CLASS_MCP_SERVER;
    }
    if lower.contains("agent") {
        return "agent_facing";
    }
    match protocol.trim().to_ascii_lowercase().as_str() {
        "udp" | "quic" => "generic_udp_service",
        "tcp" => SERVICE_CLASS_GENERIC_SERVICE,
        _ => SERVICE_CLASS_GENERIC_SERVICE,
    }
}

fn classify_severity(exposure: &str, port: u16) -> &'static str {
    if is_critical_sensitive_port(port) && matches!(exposure, "private" | "wildcard" | "public") {
        return "critical";
    }
    match exposure {
        "loopback" => "medium",
        "private" => "high",
        "wildcard" => "high",
        "public" => "high",
        _ => "medium",
    }
}

fn is_critical_sensitive_port(port: u16) -> bool {
    if let Ok(raw) = std::env::var("MUSU_PORT_MANAGER_CRITICAL_PORTS") {
        let override_ports = raw
            .split(',')
            .filter_map(|token| token.trim().parse::<u16>().ok())
            .collect::<HashSet<_>>();
        if !override_ports.is_empty() {
            return override_ports.contains(&port);
        }
    }

    matches!(
        port,
        22 | 2375 | 2376 | 3306 | 5432 | 6379 | 6443 | 9200 | 27017
    )
}

fn is_false_positive_candidate(process_name: &str, port: u16) -> bool {
    let lower = process_name.to_ascii_lowercase();
    let is_system = lower.contains("launchd")
        || lower.contains("mdnsresponder")
        || lower.contains("systemd")
        || lower.contains("sshd")
        || lower.contains("cupsd")
        || lower.contains("pid-")
        || lower.contains("system");
    is_system && port < 1024
}

fn classify_exposure(listen_addr: &str) -> &'static str {
    if listen_addr == "127.0.0.1" || listen_addr == "::1" || listen_addr == "localhost" {
        return "loopback";
    }
    if listen_addr == "0.0.0.0" || listen_addr == "::" || listen_addr == "*" {
        return "wildcard";
    }

    if let Ok(addr) = listen_addr.parse::<IpAddr>() {
        match addr {
            IpAddr::V4(v4) => {
                if is_private_or_cgnat(v4) {
                    "private"
                } else {
                    "public"
                }
            }
            IpAddr::V6(_) => "private",
        }
    } else {
        "unknown"
    }
}

fn is_private_or_cgnat(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    if octets[0] == 10 {
        return true;
    }
    if octets[0] == 172 && (16..=31).contains(&octets[1]) {
        return true;
    }
    if octets[0] == 192 && octets[1] == 168 {
        return true;
    }
    if octets[0] == 100 && (64..=127).contains(&octets[1]) {
        return true;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{BinaryKind, FilesystemContext, RuntimeContext};

    fn wsl_context() -> RuntimeContext {
        RuntimeContext {
            runtime: RuntimeKind::Wsl,
            filesystem: FilesystemContext::LinuxNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: BinaryKind::LinuxElf,
        }
    }

    #[test]
    fn provider_defaults_to_linux_for_wsl() {
        std::env::remove_var("MUSU_PORT_DISCOVERY_PROVIDER");
        assert_eq!(
            selected_discovery_provider(&wsl_context()),
            DiscoveryProviderKind::Linux
        );
    }

    #[test]
    fn provider_respects_env_override() {
        std::env::set_var("MUSU_PORT_DISCOVERY_PROVIDER", "both");
        assert_eq!(
            selected_discovery_provider(&wsl_context()),
            DiscoveryProviderKind::Both
        );
        std::env::remove_var("MUSU_PORT_DISCOVERY_PROVIDER");
    }

    #[test]
    fn parses_local_addr_for_ipv4_and_ipv6() {
        assert_eq!(
            parse_local_addr_port("127.0.0.1:24682"),
            Some(("127.0.0.1".to_string(), 24682))
        );
        assert_eq!(
            parse_local_addr_port("[::1]:24682"),
            Some(("::1".to_string(), 24682))
        );
    }
}
