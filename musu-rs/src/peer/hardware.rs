use serde::{Deserialize, Serialize};

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
        if let Ok(output) = std::process::Command::new("powershell")
            .args(&["-Command", "(Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(bytes) = stdout.trim().parse::<u64>() {
                return bytes / 1024 / 1024;
            }
        }
        // Fallback wmic
        if let Ok(output) = std::process::Command::new("wmic")
            .args(&["ComputerSystem", "get", "TotalPhysicalMemory"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
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
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(&["-n", "hw.memsize"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
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
        if let Ok(output) = std::process::Command::new("powershell")
            .args(&["-Command", "(Get-ItemProperty 'HKLM:\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0').ProcessorNameString"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !stdout.is_empty() {
                return stdout;
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
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(&["-n", "machdep.cpu.brand_string"])
            .output()
        {
            return String::from_utf8_lossy(&output.stdout).trim().to_string();
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
    if let Ok(output) = std::process::Command::new("nvidia-smi")
        .args(&["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                if let Ok(mb) = first_line.trim().parse::<u64>() {
                    return Some(mb);
                }
            }
        }
    }
    None
}
