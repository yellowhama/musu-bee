use std::net::{IpAddr, Ipv4Addr};
use std::path::PathBuf;

use crate::platform::{
    device_profile_validation_action, load_device_profile, normalize_input_path, resolve_device_id,
    resolve_device_profile_path, summarize_device_profile, DeviceProfile, RuntimeContext,
};

#[derive(Debug, Clone)]
pub struct MusuPortConfig {
    pub host: IpAddr,
    pub preferred_port: u16,
    pub allow_port_fallback: bool,
    pub seed_services_path: Option<PathBuf>,
    pub device_id: String,
    pub device_profile_path: PathBuf,
    pub device_profile: Option<DeviceProfile>,
    pub data_root: PathBuf,
    pub state_db_path: PathBuf,
    pub runtime_context: RuntimeContext,
    /// Peer musu-port base URLs loaded from `MUSU_PORT_PEERS` (comma-separated).
    pub peer_urls: Vec<String>,
}

impl MusuPortConfig {
    pub fn from_env() -> Result<Self, String> {
        let runtime_context = RuntimeContext::detect();
        let host = std::env::var("MUSU_PORT_MANAGER_HOST")
            .ok()
            .and_then(|raw| raw.trim().parse::<IpAddr>().ok())
            .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));

        let preferred_port = std::env::var("MUSU_PORT_MANAGER_PORT")
            .ok()
            .and_then(|raw| raw.trim().parse::<u16>().ok())
            .unwrap_or(1355);

        let allow_port_fallback = std::env::var("MUSU_PORT_MANAGER_ALLOW_FALLBACK")
            .ok()
            .map(|raw| {
                !matches!(
                    raw.trim(),
                    "0" | "false" | "False" | "FALSE" | "off" | "OFF"
                )
            })
            .unwrap_or(true);

        let seed_services_path = std::env::var("MUSU_PORT_SEED_SERVICES")
            .ok()
            .map(|raw| normalize_input_path(raw.trim(), &runtime_context));

        let state_db_override = std::env::var("MUSU_PORT_STATE_DB")
            .ok()
            .map(|raw| normalize_input_path(raw.trim(), &runtime_context));

        let data_root = std::env::var("MUSU_PORT_DATA_ROOT")
            .ok()
            .map(|raw| normalize_input_path(raw.trim(), &runtime_context))
            .or_else(|| {
                state_db_override
                    .as_ref()
                    .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
            })
            .unwrap_or_else(|| normalize_input_path("data", &runtime_context));

        let device_id = resolve_device_id();
        let device_profile_path =
            resolve_device_profile_path(&data_root, &runtime_context, &device_id);
        let device_profile =
            load_device_profile(&device_profile_path, &runtime_context, &device_id)?;
        if let Some(profile) = device_profile.as_ref() {
            let summary = summarize_device_profile(Some(profile), &device_id);
            let action = device_profile_validation_action(Some(profile));
            if summary.error_count > 0 && action == "fail" {
                return Err(format!(
                    "device profile '{}' is invalid: {} validation error(s), action=fail",
                    device_profile_path.display(),
                    summary.error_count
                ));
            }
        }
        let state_db_path = state_db_override.unwrap_or_else(|| data_root.join("musu-port.db"));

        let peer_urls = std::env::var("MUSU_PORT_PEERS")
            .ok()
            .map(|raw| {
                raw.split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();

        Ok(Self {
            host,
            preferred_port,
            allow_port_fallback,
            seed_services_path,
            device_id,
            device_profile_path,
            device_profile,
            data_root,
            state_db_path,
            runtime_context,
            peer_urls,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::RuntimeKind;

    #[test]
    fn config_detects_runtime_context() {
        let config = MusuPortConfig::from_env().expect("config from env");
        assert!(!config.runtime_context.label().is_empty());
        assert!(matches!(
            config.runtime_context.runtime,
            RuntimeKind::Linux | RuntimeKind::Wsl | RuntimeKind::Windows
        ));
        assert!(!config.device_id.is_empty());
        assert!(!config.device_profile_path.as_os_str().is_empty());
        assert!(!config.data_root.as_os_str().is_empty());
    }

    /// Serialize MUSU_PORT_PEERS env var tests — env vars are process-global state.
    static PEERS_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn peer_urls_empty_when_env_unset() {
        let _guard = PEERS_ENV_LOCK.lock().unwrap();
        std::env::remove_var("MUSU_PORT_PEERS");
        let config = MusuPortConfig::from_env().expect("config from env");
        assert!(config.peer_urls.is_empty());
    }

    #[test]
    fn peer_urls_parsed_from_env() {
        let _guard = PEERS_ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_PORT_PEERS", "http://a:1355, http://b:1355");
        let config = MusuPortConfig::from_env().expect("config from env");
        std::env::remove_var("MUSU_PORT_PEERS");
        assert_eq!(config.peer_urls, vec!["http://a:1355", "http://b:1355"]);
    }

    #[test]
    fn peer_urls_empty_string_is_empty_vec() {
        let _guard = PEERS_ENV_LOCK.lock().unwrap();
        std::env::set_var("MUSU_PORT_PEERS", "");
        let config = MusuPortConfig::from_env().expect("config from env");
        std::env::remove_var("MUSU_PORT_PEERS");
        assert!(config.peer_urls.is_empty());
    }
}
