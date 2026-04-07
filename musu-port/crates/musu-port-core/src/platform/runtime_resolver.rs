use std::path::{Path, PathBuf};

use super::context::RuntimeContext;
use super::normalize_input_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryKind {
    WindowsExe,
    LinuxElf,
    LinuxAppImage,
    Unknown,
}

impl BinaryKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::WindowsExe => "windows_exe",
            Self::LinuxElf => "linux_elf",
            Self::LinuxAppImage => "linux_appimage",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ExecutableLayout {
    pub windows_exe: Option<PathBuf>,
    pub linux_elf: Option<PathBuf>,
    pub linux_appimage: Option<PathBuf>,
}

impl ExecutableLayout {
    pub fn from_root(root: &Path, stem: &str) -> Self {
        Self {
            windows_exe: Some(root.join(format!("{stem}.exe"))),
            linux_elf: Some(root.join(stem)),
            linux_appimage: Some(root.join(format!("{stem}.AppImage"))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedExecutable {
    pub path: PathBuf,
    pub kind: BinaryKind,
}

#[derive(Debug, Clone)]
pub struct ExecutableContract {
    pub preferred: Option<ResolvedExecutable>,
    pub candidates: Vec<ResolvedExecutable>,
    pub interop_launcher: Option<PathBuf>,
}

pub fn current_binary_kind() -> BinaryKind {
    current_binary_kind_from_path(std::env::current_exe().ok().as_deref())
}

pub fn current_binary_kind_from_path(path: Option<&Path>) -> BinaryKind {
    let Some(path) = path else {
        return BinaryKind::Unknown;
    };
    let lower = path.to_string_lossy().to_ascii_lowercase();
    if lower.ends_with(".exe") {
        BinaryKind::WindowsExe
    } else if lower.ends_with(".appimage") {
        BinaryKind::LinuxAppImage
    } else if path.file_name().is_some() {
        BinaryKind::LinuxElf
    } else {
        BinaryKind::Unknown
    }
}

pub fn resolve_preferred_executable(
    context: &RuntimeContext,
    layout: &ExecutableLayout,
) -> Result<ResolvedExecutable, String> {
    let windows = layout.windows_exe.as_ref().map(|path| ResolvedExecutable {
        path: path.clone(),
        kind: BinaryKind::WindowsExe,
    });
    let linux_elf = layout.linux_elf.as_ref().map(|path| ResolvedExecutable {
        path: path.clone(),
        kind: BinaryKind::LinuxElf,
    });
    let appimage = layout
        .linux_appimage
        .as_ref()
        .map(|path| ResolvedExecutable {
            path: path.clone(),
            kind: BinaryKind::LinuxAppImage,
        });

    let selected = if context.prefers_windows_binary() {
        windows.or(linux_elf).or(appimage)
    } else {
        linux_elf.or(appimage).or(windows)
    };

    selected.ok_or_else(|| {
        format!(
            "no executable candidate available for runtime '{}'",
            context.label()
        )
    })
}

pub fn detect_executable_layout(context: &RuntimeContext, stem: &str) -> ExecutableLayout {
    detect_executable_layout_with_current_exe(
        context,
        stem,
        std::env::current_exe().ok().as_deref(),
    )
}

pub fn detect_executable_layout_with_current_exe(
    context: &RuntimeContext,
    stem: &str,
    current_exe: Option<&Path>,
) -> ExecutableLayout {
    let install_root = std::env::var("MUSU_PORT_INSTALL_ROOT")
        .ok()
        .map(|raw| normalize_input_path(raw.trim(), context))
        .or_else(|| current_exe.and_then(|path| path.parent().map(Path::to_path_buf)))
        .or_else(|| std::env::current_dir().ok());

    let mut layout = install_root
        .as_deref()
        .map(|root| ExecutableLayout::from_root(root, stem))
        .unwrap_or_default();

    if let Ok(raw) = std::env::var("MUSU_PORT_WINDOWS_BIN") {
        layout.windows_exe = Some(normalize_input_path(raw.trim(), context));
    }
    if let Ok(raw) = std::env::var("MUSU_PORT_LINUX_BIN") {
        layout.linux_elf = Some(normalize_input_path(raw.trim(), context));
    }
    if let Ok(raw) = std::env::var("MUSU_PORT_APPIMAGE_BIN") {
        layout.linux_appimage = Some(normalize_input_path(raw.trim(), context));
    }

    if let Some(current_exe) = current_exe {
        match current_binary_kind_from_path(Some(current_exe)) {
            BinaryKind::WindowsExe if layout.windows_exe.is_none() => {
                layout.windows_exe = Some(current_exe.to_path_buf());
            }
            BinaryKind::LinuxElf if layout.linux_elf.is_none() => {
                layout.linux_elf = Some(current_exe.to_path_buf());
            }
            BinaryKind::LinuxAppImage if layout.linux_appimage.is_none() => {
                layout.linux_appimage = Some(current_exe.to_path_buf());
            }
            BinaryKind::Unknown
            | BinaryKind::WindowsExe
            | BinaryKind::LinuxElf
            | BinaryKind::LinuxAppImage => {}
        }
    }

    layout
}

pub fn available_executable_candidates(layout: &ExecutableLayout) -> Vec<ResolvedExecutable> {
    let mut out = Vec::new();
    if let Some(path) = layout.windows_exe.as_ref() {
        out.push(ResolvedExecutable {
            path: path.clone(),
            kind: BinaryKind::WindowsExe,
        });
    }
    if let Some(path) = layout.linux_elf.as_ref() {
        out.push(ResolvedExecutable {
            path: path.clone(),
            kind: BinaryKind::LinuxElf,
        });
    }
    if let Some(path) = layout.linux_appimage.as_ref() {
        out.push(ResolvedExecutable {
            path: path.clone(),
            kind: BinaryKind::LinuxAppImage,
        });
    }
    out
}

pub fn resolve_wsl_interop_launcher(runtime_context: &RuntimeContext) -> Option<PathBuf> {
    if context_is_windows_native(runtime_context) {
        return None;
    }

    std::env::var("MUSU_PORT_WINDOWS_INTEROP_LAUNCHER")
        .ok()
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .or_else(|| {
            ["/init", "/var/lib/snapd/hostfs/init"]
                .into_iter()
                .map(PathBuf::from)
                .find(|path| path.exists())
        })
}

pub fn resolve_executable_contract(context: &RuntimeContext, stem: &str) -> ExecutableContract {
    let layout = detect_executable_layout(context, stem);
    let preferred = resolve_preferred_executable(context, &layout).ok();
    let candidates = available_executable_candidates(&layout);
    let interop_launcher = resolve_wsl_interop_launcher(context);
    ExecutableContract {
        preferred,
        candidates,
        interop_launcher,
    }
}

fn context_is_windows_native(context: &RuntimeContext) -> bool {
    context.prefers_windows_binary()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::context::{FilesystemContext, RuntimeContext, RuntimeKind};

    fn sample_context(runtime: RuntimeKind) -> RuntimeContext {
        RuntimeContext {
            runtime,
            filesystem: FilesystemContext::LinuxNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: BinaryKind::LinuxElf,
        }
    }

    #[test]
    fn detects_binary_kind_from_path() {
        assert_eq!(
            current_binary_kind_from_path(Some(Path::new("C:\\tools\\musu-portd.exe"))),
            BinaryKind::WindowsExe
        );
        assert_eq!(
            current_binary_kind_from_path(Some(Path::new("/opt/musu-portd.AppImage"))),
            BinaryKind::LinuxAppImage
        );
        assert_eq!(
            current_binary_kind_from_path(Some(Path::new("/usr/local/bin/musu-portd"))),
            BinaryKind::LinuxElf
        );
    }

    #[test]
    fn prefers_windows_binary_for_windows_runtime() {
        let layout = ExecutableLayout::from_root(Path::new("/opt/musu"), "musu-portd");
        let resolved =
            resolve_preferred_executable(&sample_context(RuntimeKind::Windows), &layout).unwrap();
        assert_eq!(resolved.kind, BinaryKind::WindowsExe);
        assert!(resolved.path.ends_with("musu-portd.exe"));
    }

    #[test]
    fn prefers_linux_elf_for_wsl_runtime() {
        let layout = ExecutableLayout::from_root(Path::new("/opt/musu"), "musu-portd");
        let resolved =
            resolve_preferred_executable(&sample_context(RuntimeKind::Wsl), &layout).unwrap();
        assert_eq!(resolved.kind, BinaryKind::LinuxElf);
        assert!(resolved.path.ends_with("musu-portd"));
    }

    #[test]
    fn detects_layout_from_current_exe_parent() {
        let context = sample_context(RuntimeKind::Wsl);
        let layout = detect_executable_layout_with_current_exe(
            &context,
            "musu-portd",
            Some(Path::new("/opt/musu/musu-portd")),
        );
        assert_eq!(
            layout.windows_exe.as_deref(),
            Some(Path::new("/opt/musu/musu-portd.exe"))
        );
        assert_eq!(
            layout.linux_elf.as_deref(),
            Some(Path::new("/opt/musu/musu-portd"))
        );
    }

    #[test]
    fn contract_exposes_candidates_and_preferred() {
        let layout = ExecutableLayout::from_root(Path::new("/opt/musu"), "musu-portd");
        let candidates = available_executable_candidates(&layout);
        assert_eq!(candidates.len(), 3);
        assert_eq!(candidates[0].kind, BinaryKind::WindowsExe);
    }
}
