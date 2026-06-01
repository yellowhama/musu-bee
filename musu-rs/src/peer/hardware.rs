use serde::{Deserialize, Serialize};
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const HARDWARE_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const HARDWARE_PROBE_WAIT_STEP: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub os: String,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub total_swap_mb: u64,
    pub cpu_cores: usize,
    pub cpu_brand: String,
    pub gpu_vram_mb: Option<u64>,
}

/// Gathers local hardware information natively without external library dependencies (avoids Windows API compiler crashes).
pub fn gather_hardware_info() -> HardwareInfo {
    let os = std::env::consts::OS.to_string();
    let cpu_cores = std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(1);

    let total_memory_mb = get_total_memory_mb();
    let cpu_brand = get_cpu_brand();
    let gpu_vram_mb = get_gpu_vram();

    HardwareInfo {
        os,
        total_memory_mb,
        available_memory_mb: total_memory_mb.saturating_sub(2048), // approximation
        total_swap_mb: 0,
        cpu_cores,
        cpu_brand,
        gpu_vram_mb,
    }
}

/// Helper to gather total memory (RAM) in MB across platforms.
fn get_total_memory_mb() -> u64 {
    #[cfg(target_os = "windows")]
    {
        if let Some(stdout) = command_stdout_with_timeout(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum",
            ],
            HARDWARE_PROBE_TIMEOUT,
        ) {
            if let Ok(bytes) = stdout.trim().parse::<u64>() {
                return bytes / 1024 / 1024;
            }
        }
        // Fallback wmic
        if let Some(stdout) = command_stdout_with_timeout(
            "wmic",
            &["ComputerSystem", "get", "TotalPhysicalMemory"],
            HARDWARE_PROBE_TIMEOUT,
        ) {
            for line in stdout.lines() {
                if let Ok(bytes) = line.trim().parse::<u64>() {
                    return bytes / 1024 / 1024;
                }
            }
        }
        16384 // generic 16GB default fallback
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
            for line in meminfo.lines() {
                if line.starts_with("MemTotal:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(kb) = parts[1].parse::<u64>() {
                            return kb / 1024;
                        }
                    }
                }
            }
        }
        16384
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(stdout) =
            command_stdout_with_timeout("sysctl", &["-n", "hw.memsize"], HARDWARE_PROBE_TIMEOUT)
        {
            if let Ok(bytes) = stdout.trim().parse::<u64>() {
                return bytes / 1024 / 1024;
            }
        }
        16384
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        16384
    }
}

/// Helper to gather CPU Brand across platforms.
fn get_cpu_brand() -> String {
    #[cfg(target_os = "windows")]
    {
        // Read processor name from registry
        if let Some(stdout) = command_stdout_with_timeout(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "(Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0').ProcessorNameString",
            ],
            HARDWARE_PROBE_TIMEOUT,
        ) {
            let value = stdout.trim().to_string();
            if !value.is_empty() {
                return value;
            }
        }
        "Windows CPU".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(cpuinfo) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in cpuinfo.lines() {
                if line.starts_with("model name") {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() >= 2 {
                        return parts[1].trim().to_string();
                    }
                }
            }
        }
        "Linux CPU".to_string()
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(stdout) = command_stdout_with_timeout(
            "sysctl",
            &["-n", "machdep.cpu.brand_string"],
            HARDWARE_PROBE_TIMEOUT,
        ) {
            return stdout.trim().to_string();
        }
        "Apple Silicon/Intel".to_string()
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        "Generic CPU".to_string()
    }
}

/// Fallback mechanism to get GPU VRAM via nvidia-smi.
fn get_gpu_vram() -> Option<u64> {
    if let Some(stdout) = command_stdout_with_timeout(
        "nvidia-smi",
        &["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
        HARDWARE_PROBE_TIMEOUT,
    ) {
        if let Some(first_line) = stdout.lines().next() {
            if let Ok(mb) = first_line.trim().parse::<u64>() {
                return Some(mb);
            }
        }
    }
    None
}

fn command_stdout_with_timeout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = String::new();
                if let Some(mut pipe) = child.stdout.take() {
                    let _ = pipe.read_to_string(&mut stdout);
                }
                return status.success().then_some(stdout);
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(HARDWARE_PROBE_WAIT_STEP);
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::command_stdout_with_timeout;
    use std::time::Duration;

    #[test]
    #[cfg(target_os = "windows")]
    fn command_stdout_with_timeout_captures_windows_stdout() {
        let stdout = command_stdout_with_timeout(
            "cmd",
            &["/C", "echo hardware-probe-ok"],
            Duration::from_secs(2),
        )
        .expect("command should complete");

        assert!(stdout.contains("hardware-probe-ok"));
    }

    #[test]
    #[cfg(target_family = "unix")]
    fn command_stdout_with_timeout_captures_unix_stdout() {
        let stdout = command_stdout_with_timeout(
            "sh",
            &["-c", "printf hardware-probe-ok"],
            Duration::from_secs(2),
        )
        .expect("command should complete");

        assert_eq!(stdout, "hardware-probe-ok");
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn command_stdout_with_timeout_kills_slow_windows_probe() {
        let stdout = command_stdout_with_timeout(
            "powershell",
            &["-NoProfile", "-Command", "Start-Sleep -Seconds 2"],
            Duration::from_millis(100),
        );

        assert!(stdout.is_none());
    }

    #[test]
    #[cfg(target_family = "unix")]
    fn command_stdout_with_timeout_kills_slow_unix_probe() {
        let stdout =
            command_stdout_with_timeout("sh", &["-c", "sleep 2"], Duration::from_millis(100));

        assert!(stdout.is_none());
    }
}
