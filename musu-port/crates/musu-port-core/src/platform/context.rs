use std::path::Path;

use super::runtime_resolver::{current_binary_kind, BinaryKind};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeKind {
    Windows,
    Linux,
    Wsl,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FilesystemContext {
    WindowsNative,
    LinuxNative,
    WslWindowsMount,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeContext {
    pub runtime: RuntimeKind,
    pub filesystem: FilesystemContext,
    pub wsl_distro: Option<String>,
    pub binary_kind: BinaryKind,
}

impl RuntimeContext {
    pub fn detect() -> Self {
        let proc_version = std::fs::read_to_string("/proc/version").ok();
        let wsl_distro = std::env::var("WSL_DISTRO_NAME")
            .ok()
            .or_else(|| std::env::var("MUSU_WSL_DISTRO_NAME").ok())
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty());
        let runtime = detect_runtime_kind(
            std::env::consts::OS,
            wsl_distro.as_deref(),
            proc_version.as_deref(),
        );
        let filesystem =
            detect_filesystem_context(std::env::current_dir().ok().as_deref(), &runtime);

        Self {
            runtime,
            filesystem,
            wsl_distro,
            binary_kind: current_binary_kind(),
        }
    }

    pub fn label(&self) -> &'static str {
        match self.runtime {
            RuntimeKind::Windows => "windows",
            RuntimeKind::Linux => "linux",
            RuntimeKind::Wsl => "wsl",
        }
    }

    pub fn filesystem_label(&self) -> &'static str {
        match self.filesystem {
            FilesystemContext::WindowsNative => "windows_native",
            FilesystemContext::LinuxNative => "linux_native",
            FilesystemContext::WslWindowsMount => "wsl_windows_mount",
        }
    }

    pub fn prefers_windows_binary(&self) -> bool {
        matches!(self.runtime, RuntimeKind::Windows)
    }
}

pub fn detect_runtime_kind(
    host_os: &str,
    wsl_distro: Option<&str>,
    proc_version: Option<&str>,
) -> RuntimeKind {
    if host_os.eq_ignore_ascii_case("windows") {
        return RuntimeKind::Windows;
    }

    if wsl_distro.is_some() {
        return RuntimeKind::Wsl;
    }

    if proc_version
        .map(|raw| raw.to_ascii_lowercase())
        .is_some_and(|raw| raw.contains("microsoft") || raw.contains("wsl"))
    {
        return RuntimeKind::Wsl;
    }

    RuntimeKind::Linux
}

pub fn detect_filesystem_context(
    current_dir: Option<&Path>,
    runtime: &RuntimeKind,
) -> FilesystemContext {
    let Some(current_dir) = current_dir else {
        return default_filesystem_context(runtime);
    };

    let raw = current_dir.to_string_lossy();
    if raw.starts_with("/mnt/") {
        return FilesystemContext::WslWindowsMount;
    }
    if is_windows_style_path(&raw) || raw.starts_with("\\\\") || raw.starts_with("//") {
        return FilesystemContext::WindowsNative;
    }
    if raw.starts_with('/') {
        return FilesystemContext::LinuxNative;
    }

    default_filesystem_context(runtime)
}

fn default_filesystem_context(runtime: &RuntimeKind) -> FilesystemContext {
    match runtime {
        RuntimeKind::Windows => FilesystemContext::WindowsNative,
        RuntimeKind::Linux | RuntimeKind::Wsl => FilesystemContext::LinuxNative,
    }
}

fn is_windows_style_path(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_wsl_from_env_or_proc_version() {
        assert_eq!(
            detect_runtime_kind("linux", Some("Ubuntu-22.04"), None),
            RuntimeKind::Wsl
        );
        assert_eq!(
            detect_runtime_kind("linux", None, Some("Linux version 5.15.0-100 Microsoft")),
            RuntimeKind::Wsl
        );
        assert_eq!(
            detect_runtime_kind("linux", None, Some("Linux version 6.10 generic")),
            RuntimeKind::Linux
        );
        assert_eq!(
            detect_runtime_kind("windows", None, None),
            RuntimeKind::Windows
        );
    }

    #[test]
    fn detects_filesystem_context_from_working_dir() {
        assert_eq!(
            detect_filesystem_context(
                Some(Path::new("/mnt/c/Users/empty/project")),
                &RuntimeKind::Wsl
            ),
            FilesystemContext::WslWindowsMount
        );
        assert_eq!(
            detect_filesystem_context(
                Some(Path::new("/home/example/musu-functions")),
                &RuntimeKind::Wsl
            ),
            FilesystemContext::LinuxNative
        );
        assert_eq!(
            detect_filesystem_context(Some(Path::new("C:\\Users\\empty")), &RuntimeKind::Windows),
            FilesystemContext::WindowsNative
        );
    }
}
