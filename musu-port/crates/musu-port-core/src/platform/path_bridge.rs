use std::path::{Path, PathBuf};

use super::context::RuntimeContext;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathDisplayViews {
    pub runtime: String,
    pub linux: String,
    pub windows: Option<String>,
}

pub fn normalize_input_path(raw: &str, context: &RuntimeContext) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return PathBuf::new();
    }

    if context.prefers_windows_binary() {
        wsl_to_windows_path(trimmed, context.wsl_distro.as_deref())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(trimmed))
    } else {
        windows_to_wsl_path(trimmed).unwrap_or_else(|| PathBuf::from(trimmed))
    }
}

pub fn display_path_for_runtime(path: &Path, context: &RuntimeContext) -> String {
    let raw = path.to_string_lossy();
    if context.prefers_windows_binary() {
        wsl_to_windows_path(raw.as_ref(), context.wsl_distro.as_deref())
            .unwrap_or_else(|| raw.replace('/', "\\"))
    } else {
        windows_to_wsl_path(raw.as_ref())
            .unwrap_or_else(|| path.to_path_buf())
            .display()
            .to_string()
    }
}

pub fn display_path_for_linux(path: &Path) -> String {
    let raw = path.to_string_lossy();
    windows_to_wsl_path(raw.as_ref())
        .unwrap_or_else(|| path.to_path_buf())
        .display()
        .to_string()
}

pub fn display_path_for_windows(path: &Path, context: &RuntimeContext) -> Option<String> {
    let raw = path.to_string_lossy();
    wsl_to_windows_path(raw.as_ref(), context.wsl_distro.as_deref()).or_else(|| {
        if context.prefers_windows_binary() {
            Some(raw.replace('/', "\\"))
        } else {
            None
        }
    })
}

pub fn path_display_views(path: &Path, context: &RuntimeContext) -> PathDisplayViews {
    PathDisplayViews {
        runtime: display_path_for_runtime(path, context),
        linux: display_path_for_linux(path),
        windows: display_path_for_windows(path, context),
    }
}

pub fn windows_to_wsl_path(raw: &str) -> Option<PathBuf> {
    let normalized = raw.trim().replace('\\', "/");
    if normalized.is_empty() {
        return None;
    }

    if let Some(rest) = normalized
        .strip_prefix("//wsl.localhost/")
        .or_else(|| normalized.strip_prefix("//wsl$/"))
    {
        let mut parts = rest.split('/').filter(|part| !part.is_empty());
        let _distro = parts.next()?;
        let tail = parts.collect::<Vec<_>>();
        if tail.is_empty() {
            return Some(PathBuf::from("/"));
        }
        return Some(PathBuf::from(format!("/{}", tail.join("/"))));
    }

    let bytes = normalized.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        let drive = (bytes[0] as char).to_ascii_lowercase();
        let suffix = normalized
            .get(2..)
            .unwrap_or_default()
            .trim_start_matches('/');
        if suffix.is_empty() {
            return Some(PathBuf::from(format!("/mnt/{drive}")));
        }
        return Some(PathBuf::from(format!("/mnt/{drive}/{suffix}")));
    }

    None
}

pub fn wsl_to_windows_path(raw: &str, distro: Option<&str>) -> Option<String> {
    let normalized = raw.trim().replace('\\', "/");
    if normalized.is_empty() {
        return None;
    }

    if let Some(rest) = normalized.strip_prefix("/mnt/") {
        let mut parts = rest.split('/').filter(|part| !part.is_empty());
        let drive = parts.next()?;
        if drive.len() == 1 && drive.chars().all(|ch| ch.is_ascii_alphabetic()) {
            let suffix = parts.collect::<Vec<_>>();
            if suffix.is_empty() {
                return Some(format!("{}:\\", drive.to_ascii_uppercase()));
            }
            return Some(format!(
                "{}:\\{}",
                drive.to_ascii_uppercase(),
                suffix.join("\\")
            ));
        }
    }

    if normalized.starts_with('/') {
        let distro = distro?.trim();
        if distro.is_empty() {
            return None;
        }
        let suffix = normalized.trim_start_matches('/');
        if suffix.is_empty() {
            return Some(format!("\\\\wsl.localhost\\{distro}"));
        }
        return Some(format!(
            "\\\\wsl.localhost\\{distro}\\{}",
            suffix.replace('/', "\\")
        ));
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::context::{FilesystemContext, RuntimeKind};
    use crate::platform::runtime_resolver::BinaryKind;

    fn wsl_context() -> RuntimeContext {
        RuntimeContext {
            runtime: RuntimeKind::Wsl,
            filesystem: FilesystemContext::LinuxNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: BinaryKind::LinuxElf,
        }
    }

    fn windows_context() -> RuntimeContext {
        RuntimeContext {
            runtime: RuntimeKind::Windows,
            filesystem: FilesystemContext::WindowsNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: BinaryKind::WindowsExe,
        }
    }

    #[test]
    fn translates_windows_drive_to_wsl_mount() {
        assert_eq!(
            windows_to_wsl_path("C:\\Users\\empty\\musu-functions"),
            Some(PathBuf::from("/mnt/c/Users/empty/musu-functions"))
        );
        assert_eq!(
            windows_to_wsl_path("D:/tools/musu"),
            Some(PathBuf::from("/mnt/d/tools/musu"))
        );
    }

    #[test]
    fn translates_wsl_unc_to_linux_path() {
        assert_eq!(
            windows_to_wsl_path(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\example\\musu-functions\\musu-port"
            ),
            Some(PathBuf::from("/home/example/musu-functions/musu-port"))
        );
    }

    #[test]
    fn translates_wsl_mount_back_to_windows_path() {
        assert_eq!(
            wsl_to_windows_path("/mnt/c/Users/empty/musu-functions", Some("Ubuntu-22.04")),
            Some("C:\\Users\\empty\\musu-functions".to_string())
        );
        assert_eq!(
            wsl_to_windows_path("/home/example/musu-functions", Some("Ubuntu-22.04")),
            Some("\\\\wsl.localhost\\Ubuntu-22.04\\home\\example\\musu-functions".to_string())
        );
    }

    #[test]
    fn normalizes_input_path_for_current_runtime() {
        assert_eq!(
            normalize_input_path("C:\\Users\\empty\\musu-functions", &wsl_context()),
            PathBuf::from("/mnt/c/Users/empty/musu-functions")
        );
        assert_eq!(
            normalize_input_path("/home/example/musu-functions", &windows_context()),
            PathBuf::from("\\\\wsl.localhost\\Ubuntu-22.04\\home\\example\\musu-functions")
        );
    }

    #[test]
    fn builds_dual_display_views() {
        let views = path_display_views(Path::new("/home/example/musu-functions"), &wsl_context());
        assert_eq!(views.runtime, "/home/example/musu-functions");
        assert_eq!(views.linux, "/home/example/musu-functions");
        assert_eq!(
            views.windows.as_deref(),
            Some("\\\\wsl.localhost\\Ubuntu-22.04\\home\\example\\musu-functions")
        );
    }
}
