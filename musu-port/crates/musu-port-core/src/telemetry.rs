use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use sysinfo::System;

const HOST_METRICS_CACHE_TTL: Duration = Duration::from_secs(2);
const GPU_METRICS_CACHE_TTL: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Default)]
pub struct RuntimeTelemetry {
    pub cpu_pct: f32,
    pub ram_used: u64,
    pub ram_total: u64,
    pub gpu_util: Option<f32>,
    pub gpu_mem_used: Option<u64>,
    pub gpu_mem_total: Option<u64>,
}

#[derive(Debug, Clone, Default)]
struct HostMetrics {
    cpu_pct: f32,
    ram_used: u64,
    ram_total: u64,
}

#[derive(Debug, Clone)]
struct GpuMetrics {
    gpu_util: f32,
    gpu_mem_used: u64,
    gpu_mem_total: u64,
}

#[derive(Debug, Clone)]
struct CachedValue<T> {
    sampled_at: Instant,
    value: T,
}

#[derive(Debug, Default)]
struct TelemetryCache {
    host: Option<CachedValue<HostMetrics>>,
    gpu: Option<CachedValue<Option<GpuMetrics>>>,
}

static TELEMETRY_CACHE: OnceLock<Mutex<TelemetryCache>> = OnceLock::new();

pub fn read_runtime_telemetry() -> RuntimeTelemetry {
    let cache = TELEMETRY_CACHE.get_or_init(|| Mutex::new(TelemetryCache::default()));
    let mut guard = cache
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let host = get_cached_or_refresh_host(&mut guard);
    let gpu = get_cached_or_refresh_gpu(&mut guard);

    RuntimeTelemetry {
        cpu_pct: host.cpu_pct,
        ram_used: host.ram_used,
        ram_total: host.ram_total,
        gpu_util: gpu.as_ref().map(|m| m.gpu_util),
        gpu_mem_used: gpu.as_ref().map(|m| m.gpu_mem_used),
        gpu_mem_total: gpu.as_ref().map(|m| m.gpu_mem_total),
    }
}

fn get_cached_or_refresh_host(cache: &mut TelemetryCache) -> HostMetrics {
    if let Some(cached) = cache.host.as_ref() {
        if cached.sampled_at.elapsed() <= HOST_METRICS_CACHE_TTL {
            return cached.value.clone();
        }
    }

    let refreshed = sample_host_metrics();
    cache.host = Some(CachedValue {
        sampled_at: Instant::now(),
        value: refreshed.clone(),
    });
    refreshed
}

fn get_cached_or_refresh_gpu(cache: &mut TelemetryCache) -> Option<GpuMetrics> {
    if let Some(cached) = cache.gpu.as_ref() {
        if cached.sampled_at.elapsed() <= GPU_METRICS_CACHE_TTL {
            return cached.value.clone();
        }
    }

    let refreshed = sample_gpu_metrics();
    cache.gpu = Some(CachedValue {
        sampled_at: Instant::now(),
        value: refreshed.clone(),
    });
    refreshed
}

fn sample_host_metrics() -> HostMetrics {
    let mut sys = System::new();
    sys.refresh_memory();
    // sysinfo requires two CPU refreshes with a minimum interval to compute usage deltas.
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();

    HostMetrics {
        cpu_pct: round_two_decimals(sys.global_cpu_usage()),
        ram_used: sys.used_memory(),
        ram_total: sys.total_memory(),
    }
}

fn sample_gpu_metrics() -> Option<GpuMetrics> {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu,memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().find_map(parse_nvidia_smi_row)
}

fn parse_nvidia_smi_row(row: &str) -> Option<GpuMetrics> {
    let mut parts = row.split(',').map(str::trim);
    let gpu_util = parse_f32(parts.next()?)?;
    let gpu_mem_used = parse_u64(parts.next()?)?;
    let gpu_mem_total = parse_u64(parts.next()?)?;
    Some(GpuMetrics {
        gpu_util: round_two_decimals(gpu_util),
        gpu_mem_used,
        gpu_mem_total,
    })
}

fn parse_f32(raw: &str) -> Option<f32> {
    if raw.eq_ignore_ascii_case("n/a") {
        return None;
    }
    raw.parse::<f32>().ok()
}

fn parse_u64(raw: &str) -> Option<u64> {
    if raw.eq_ignore_ascii_case("n/a") {
        return None;
    }
    raw.parse::<u64>().ok()
}

fn round_two_decimals(value: f32) -> f32 {
    (value * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::parse_nvidia_smi_row;

    #[test]
    fn parse_nvidia_smi_row_parses_numeric_values() {
        let parsed = parse_nvidia_smi_row("42, 1024, 8192").expect("row should parse");
        assert!((parsed.gpu_util - 42.0).abs() < f32::EPSILON);
        assert_eq!(parsed.gpu_mem_used, 1024);
        assert_eq!(parsed.gpu_mem_total, 8192);
    }

    #[test]
    fn parse_nvidia_smi_row_rejects_na_values() {
        assert!(parse_nvidia_smi_row("N/A, 1024, 8192").is_none());
        assert!(parse_nvidia_smi_row("42, N/A, 8192").is_none());
        assert!(parse_nvidia_smi_row("42, 1024, N/A").is_none());
    }
}
