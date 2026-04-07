use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{normalize_input_path, RuntimeContext};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceLaunchProfile {
    #[serde(default)]
    pub windows_command: Option<String>,
    #[serde(default)]
    pub linux_command: Option<String>,
    #[serde(default)]
    pub wsl_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceHealthProfile {
    #[serde(default)]
    pub health_path: Option<String>,
    #[serde(default)]
    pub mcp_health_path: Option<String>,
    #[serde(default)]
    pub probe_timeout_ms: Option<u64>,
    #[serde(default)]
    pub mcp_probe_mode: Option<String>,
    #[serde(default)]
    pub mcp_rpc_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceTransportProfile {
    #[serde(default)]
    pub preferred_ingress: Option<String>,
    #[serde(default)]
    pub supports_connect: Option<bool>,
    #[serde(default)]
    pub supports_quic: Option<bool>,
    #[serde(default)]
    pub auto_promote_mcp: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DevicePathHints {
    #[serde(default)]
    pub windows_root: Option<String>,
    #[serde(default)]
    pub linux_root: Option<String>,
    #[serde(default)]
    pub wsl_unc_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceReportRoots {
    #[serde(default)]
    pub metadata: Option<String>,
    #[serde(default)]
    pub connect: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceGuidanceProfile {
    #[serde(default)]
    pub translator_hints: Vec<String>,
    #[serde(default)]
    pub operator_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceValidationProfile {
    #[serde(default)]
    pub on_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceServiceTemplate {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub service_class: String,
    #[serde(default)]
    pub alias: Option<String>,
    #[serde(default)]
    pub health_path: Option<String>,
    #[serde(default)]
    pub rpc_path: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub agent_facing: bool,
    #[serde(default)]
    pub match_process_names: Vec<String>,
    #[serde(default)]
    pub match_protocols: Vec<String>,
    #[serde(default)]
    pub match_ports: Vec<u16>,
    #[serde(default)]
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    #[serde(default = "default_device_profile_version")]
    pub version: String,
    pub device_id: String,
    #[serde(default)]
    pub runtime_kind: Option<String>,
    #[serde(default)]
    pub filesystem_context: Option<String>,
    #[serde(default)]
    pub launch: DeviceLaunchProfile,
    #[serde(default)]
    pub health: DeviceHealthProfile,
    #[serde(default)]
    pub transport: DeviceTransportProfile,
    #[serde(default)]
    pub path_hints: DevicePathHints,
    #[serde(default)]
    pub report_roots: DeviceReportRoots,
    #[serde(default)]
    pub guidance: DeviceGuidanceProfile,
    #[serde(default)]
    pub validation: DeviceValidationProfile,
    #[serde(default)]
    pub service_templates: Vec<DeviceServiceTemplate>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceProfileSummary {
    pub loaded: bool,
    pub version: Option<String>,
    pub matches_device_id: bool,
    pub service_template_count: usize,
    pub mcp_template_count: usize,
    pub guidance_hint_count: usize,
    pub validation_action: String,
    pub warning_count: usize,
    pub error_count: usize,
    pub valid: bool,
}

fn default_device_profile_version() -> String {
    "musu.device-profile.v1".to_string()
}

pub fn sanitize_device_id(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut last_was_separator = false;

    for ch in raw.trim().chars() {
        let normalized = match ch {
            'a'..='z' | '0'..='9' => Some(ch),
            'A'..='Z' => Some(ch.to_ascii_lowercase()),
            '-' | '_' | '.' => Some(ch),
            _ if ch.is_ascii_whitespace() || matches!(ch, '/' | '\\' | ':') => Some('-'),
            _ => None,
        };

        let Some(normalized) = normalized else {
            continue;
        };

        if normalized == '-' {
            if out.is_empty() || last_was_separator {
                continue;
            }
            last_was_separator = true;
        } else {
            last_was_separator = false;
        }
        out.push(normalized);
    }

    let trimmed = out.trim_matches(['-', '.', '_']).to_string();
    if trimmed.is_empty() {
        "unknown-device".to_string()
    } else {
        trimmed
    }
}

pub fn resolve_device_id() -> String {
    [
        std::env::var("MUSU_DEVICE_ID").ok(),
        std::env::var("COMPUTERNAME").ok(),
        std::env::var("HOSTNAME").ok(),
    ]
    .into_iter()
    .flatten()
    .map(|raw| sanitize_device_id(&raw))
    .find(|raw| !raw.is_empty() && raw != "unknown-device")
    .unwrap_or_else(|| "unknown-device".to_string())
}

pub fn resolve_device_profile_path(
    data_root: &Path,
    context: &RuntimeContext,
    device_id: &str,
) -> PathBuf {
    std::env::var("MUSU_DEVICE_PROFILE_PATH")
        .ok()
        .map(|raw| normalize_input_path(raw.trim(), context))
        .unwrap_or_else(|| {
            data_root
                .join("device-profiles")
                .join(format!("{}.json", sanitize_device_id(device_id)))
        })
}

pub fn load_device_profile(
    path: &Path,
    context: &RuntimeContext,
    expected_device_id: &str,
) -> Result<Option<DeviceProfile>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(path)
        .map_err(|err| format!("failed to read device profile '{}': {err}", path.display()))?;
    let mut profile = serde_json::from_str::<DeviceProfile>(&raw)
        .map_err(|err| format!("failed to parse device profile '{}': {err}", path.display()))?;

    profile.device_id = sanitize_device_id(&profile.device_id);
    if profile.device_id.is_empty() || profile.device_id == "unknown-device" {
        profile.device_id = sanitize_device_id(expected_device_id);
    }
    profile.runtime_kind = profile
        .runtime_kind
        .take()
        .or_else(|| Some(context.label().to_string()));
    profile.filesystem_context = profile
        .filesystem_context
        .take()
        .or_else(|| Some(context.filesystem_label().to_string()));

    Ok(Some(profile))
}

pub fn summarize_device_profile(
    profile: Option<&DeviceProfile>,
    expected_device_id: &str,
) -> DeviceProfileSummary {
    let Some(profile) = profile else {
        return DeviceProfileSummary {
            loaded: false,
            version: None,
            matches_device_id: false,
            service_template_count: 0,
            mcp_template_count: 0,
            guidance_hint_count: 0,
            validation_action: "warn".to_string(),
            warning_count: 0,
            error_count: 0,
            valid: false,
        };
    };

    let validation = validate_device_profile(profile, expected_device_id);

    DeviceProfileSummary {
        loaded: true,
        version: Some(profile.version.clone()),
        matches_device_id: profile.device_id == sanitize_device_id(expected_device_id),
        service_template_count: profile.service_templates.len(),
        mcp_template_count: profile
            .service_templates
            .iter()
            .filter(|template| template.service_class.trim() == "mcp_server")
            .count(),
        guidance_hint_count: profile.guidance.translator_hints.len(),
        validation_action: device_profile_validation_action(Some(profile)),
        warning_count: validation.warning_count,
        error_count: validation.error_count,
        valid: validation.error_count == 0,
    }
}

pub fn device_profile_validation_action(profile: Option<&DeviceProfile>) -> String {
    profile
        .and_then(|profile| profile.validation.on_error.as_deref())
        .map(normalize_validation_action)
        .unwrap_or_else(|| "warn".to_string())
}

pub fn normalize_validation_action(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "fail" | "strict" | "error" => "fail".to_string(),
        _ => "warn".to_string(),
    }
}

#[derive(Debug, Clone, Default)]
struct DeviceProfileValidation {
    warning_count: usize,
    error_count: usize,
}

fn validate_device_profile(
    profile: &DeviceProfile,
    expected_device_id: &str,
) -> DeviceProfileValidation {
    let mut validation = DeviceProfileValidation::default();
    if profile.version.trim() != default_device_profile_version() {
        validation.error_count += 1;
    }
    if sanitize_device_id(&profile.device_id) != sanitize_device_id(expected_device_id) {
        validation.warning_count += 1;
    }

    let mut seen_aliases = std::collections::HashSet::new();
    let mut mcp_templates = 0usize;
    for template in &profile.service_templates {
        if template.service_class.trim() == "mcp_server" {
            mcp_templates += 1;
        }
        if template.service_class.trim().is_empty() {
            validation.warning_count += 1;
        }
        if let Some(alias) = template
            .alias
            .as_ref()
            .map(|alias| alias.trim())
            .filter(|alias| !alias.is_empty())
        {
            if !seen_aliases.insert(alias.to_string()) {
                validation.error_count += 1;
            }
        }
    }

    if profile.transport.auto_promote_mcp == Some(true) && mcp_templates == 0 {
        validation.warning_count += 1;
    }

    validation
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::context::{FilesystemContext, RuntimeKind};
    use crate::platform::runtime_resolver::BinaryKind;

    fn sample_context() -> RuntimeContext {
        RuntimeContext {
            runtime: RuntimeKind::Wsl,
            filesystem: FilesystemContext::LinuxNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: BinaryKind::LinuxElf,
        }
    }

    #[test]
    fn sanitizes_device_ids_for_shared_contracts() {
        assert_eq!(sanitize_device_id("DESKTOP-01"), "desktop-01");
        assert_eq!(sanitize_device_id("WSL Main / Dev"), "wsl-main-dev");
        assert_eq!(sanitize_device_id(""), "unknown-device");
    }

    #[test]
    fn defaults_device_profile_path_under_data_root() {
        let path = resolve_device_profile_path(
            Path::new("/srv/musu-port/data"),
            &sample_context(),
            "desktop-01",
        );
        assert_eq!(
            path,
            PathBuf::from("/srv/musu-port/data/device-profiles/desktop-01.json")
        );
    }

    #[test]
    fn summarizes_absent_device_profile() {
        let summary = summarize_device_profile(None, "desktop-01");
        assert!(!summary.loaded);
        assert_eq!(summary.service_template_count, 0);
        assert_eq!(summary.guidance_hint_count, 0);
        assert!(!summary.valid);
    }

    #[test]
    fn loads_device_profile_with_guidance_and_defaults() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!("musu-device-profile-{stamp}.json"));
        std::fs::write(
            &path,
            serde_json::to_vec_pretty(&serde_json::json!({
                "device_id": "WSL Main / Dev",
                "health": { "mcp_health_path": "/custom-mcp/health" },
                "validation": { "on_error": "fail" },
                "guidance": {
                    "translator_hints": ["prefer WSL path bridge", "surface connect url"],
                    "operator_notes": ["manual smoke required on Windows shell"]
                },
                "service_templates": [
                    {
                        "name": "musu desktop",
                        "service_class": "mcp_server",
                        "alias": "musu-desktop-main",
                        "rpc_path": "/mcp",
                        "agent_facing": true
                    }
                ]
            }))
            .expect("serialize device profile"),
        )
        .expect("write device profile");

        let loaded = load_device_profile(&path, &sample_context(), "desktop-main")
            .expect("load device profile")
            .expect("device profile present");
        assert_eq!(loaded.device_id, "wsl-main-dev");
        assert_eq!(loaded.runtime_kind.as_deref(), Some("wsl"));
        assert_eq!(
            loaded.health.mcp_health_path.as_deref(),
            Some("/custom-mcp/health")
        );
        assert_eq!(loaded.guidance.translator_hints.len(), 2);

        let summary = summarize_device_profile(Some(&loaded), "wsl-main-dev");
        assert!(summary.loaded);
        assert!(summary.matches_device_id);
        assert_eq!(summary.mcp_template_count, 1);
        assert_eq!(summary.guidance_hint_count, 2);
        assert_eq!(summary.validation_action, "fail");
        assert_eq!(summary.warning_count, 0);
        assert_eq!(summary.error_count, 0);
        assert!(summary.valid);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn summary_marks_duplicate_aliases_invalid() {
        let profile = DeviceProfile {
            version: "musu.device-profile.v1".to_string(),
            device_id: "desktop-01".to_string(),
            runtime_kind: Some("wsl".to_string()),
            filesystem_context: Some("linux_native".to_string()),
            launch: DeviceLaunchProfile::default(),
            health: DeviceHealthProfile::default(),
            transport: DeviceTransportProfile {
                auto_promote_mcp: Some(true),
                ..DeviceTransportProfile::default()
            },
            path_hints: DevicePathHints::default(),
            report_roots: DeviceReportRoots::default(),
            guidance: DeviceGuidanceProfile::default(),
            validation: DeviceValidationProfile::default(),
            service_templates: vec![
                DeviceServiceTemplate {
                    name: "one".to_string(),
                    service_class: "mcp_server".to_string(),
                    alias: Some("dup".to_string()),
                    health_path: None,
                    rpc_path: None,
                    tags: vec![],
                    agent_facing: true,
                    match_process_names: vec![],
                    match_protocols: vec![],
                    match_ports: vec![],
                    priority: 0,
                },
                DeviceServiceTemplate {
                    name: "two".to_string(),
                    service_class: "mcp_server".to_string(),
                    alias: Some("dup".to_string()),
                    health_path: None,
                    rpc_path: None,
                    tags: vec![],
                    agent_facing: true,
                    match_process_names: vec![],
                    match_protocols: vec![],
                    match_ports: vec![],
                    priority: 0,
                },
            ],
        };

        let summary = summarize_device_profile(Some(&profile), "desktop-01");
        assert_eq!(summary.error_count, 1);
        assert!(!summary.valid);
    }

    #[test]
    fn normalizes_validation_action_labels() {
        assert_eq!(normalize_validation_action("fail"), "fail");
        assert_eq!(normalize_validation_action("strict"), "fail");
        assert_eq!(normalize_validation_action("warn"), "warn");
        assert_eq!(normalize_validation_action("unknown"), "warn");
    }
}
