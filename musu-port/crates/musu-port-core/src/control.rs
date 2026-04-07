use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::discovery::DiscoveredEndpoint;
use crate::l4::L4RunnerStatus;
use crate::platform::{normalize_input_path, path_display_views, RuntimeContext};
use crate::route::ServiceRoute;
use crate::storage::AuditEvent;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditPolicy {
    pub min_visible_severity: String,
    pub max_visible_events: usize,
    pub promote_severity: String,
    pub stale_cleanup_severity: String,
    pub connect_mode_change_severity: String,
    pub connect_ingress_denied_severity: String,
    pub connect_ingress_error_severity: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditSummary {
    pub info: usize,
    pub warning: usize,
    pub high: usize,
    pub critical: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectStatus {
    pub mode: String,
    pub enabled: bool,
    pub stable_ready: bool,
    pub blockers: Vec<String>,
    pub criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConnectIngressDecision {
    pub alias: String,
    pub mode: String,
    pub allowed: bool,
    pub protocol: String,
    pub service_class: String,
    pub agent_facing: bool,
    pub connect_kind: String,
    pub delivery_contract: String,
    pub bridge_owner: String,
    pub remote_bridge_supported: bool,
    pub connect_url: Option<String>,
    pub target_url: Option<String>,
    pub health_path_hint: Option<String>,
    pub translator_hints: Vec<String>,
    pub denial_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataConsistencyReport {
    pub platform: String,
    pub filesystem_context: String,
    pub binary_kind: String,
    pub generated_at: i64,
    pub total_endpoints: usize,
    pub process_name_known: usize,
    pub process_name_unknown: usize,
    pub process_user_known: usize,
    pub process_user_unknown: usize,
    pub agent_facing_endpoints: usize,
    pub mcp_server_candidates: usize,
    pub service_class_breakdown: HashMap<String, usize>,
    pub consistency_score: u8,
    pub findings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataExportHistoryEntry {
    pub format: String,
    pub path: String,
    pub generated_at: i64,
    pub consistency_score: u8,
    pub total_endpoints: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct MetadataExportResult {
    pub format: String,
    pub path: String,
    pub generated_at: i64,
    pub bytes_written: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct QuicProbeSummary {
    pub attempts_total: u64,
    pub fallback_total: u64,
    pub recover_total: u64,
    pub timeout_total: u64,
    pub unreachable_total: u64,
    pub io_error_total: u64,
    pub metrics_source: String,
    pub fetch_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CoverageEndpointGap {
    pub name: String,
    pub owner: String,
    pub severity: String,
    pub reason: String,
    pub target_url: Option<String>,
    pub suggested_action: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CoverageReport {
    pub router_base_url: String,
    pub supervisor_routes: usize,
    pub external_routes: usize,
    pub total_managed_routes: usize,
    pub managed_aliases: Vec<String>,
    pub uncovered_endpoints: Vec<CoverageEndpointGap>,
    pub discovered_unmanaged_endpoints: Vec<DiscoveredEndpoint>,
    pub ignored_signatures: Vec<String>,
    pub l4_runners: Vec<L4RunnerStatus>,
    pub tcp_ingress_mode: String,
    pub quic_probe_summary: QuicProbeSummary,
    pub alert_level: String,
    pub alert_messages: Vec<String>,
    pub connect_status: ConnectStatus,
    pub metadata_report: MetadataConsistencyReport,
    pub metadata_dual_path_status: Option<serde_json::Value>,
    pub audit_policy: AuditPolicy,
    pub audit_summary: AuditSummary,
    pub audit_events: Vec<AuditEvent>,
    pub all_known_endpoints_managed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectProbeSample {
    pub timestamp: i64,
    pub mode: String,
    pub stable_ready: bool,
    pub blocker_count: usize,
    pub blockers: Vec<String>,
    pub alert_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectProbeReport {
    pub generated_at: i64,
    pub sample_count: usize,
    pub interval_ms: u64,
    pub stable_ready_samples: usize,
    pub blocked_samples: usize,
    pub stable_ready_ratio: f64,
    pub unique_blockers: Vec<String>,
    pub alert_level_counts: HashMap<String, usize>,
    pub samples: Vec<ConnectProbeSample>,
    pub report_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectProbeHistoryEntry {
    pub generated_at: i64,
    pub sample_count: usize,
    pub stable_ready_ratio: f64,
    pub blocked_samples: usize,
    pub report_path: Option<String>,
}

pub fn default_audit_policy() -> AuditPolicy {
    AuditPolicy {
        min_visible_severity: "info".to_string(),
        max_visible_events: 20,
        promote_severity: "info".to_string(),
        stale_cleanup_severity: "warning".to_string(),
        connect_mode_change_severity: "info".to_string(),
        connect_ingress_denied_severity: "warning".to_string(),
        connect_ingress_error_severity: "high".to_string(),
    }
}

pub fn audit_policy_preset(preset: &str) -> AuditPolicy {
    match preset.trim().to_ascii_lowercase().as_str() {
        "strict" => AuditPolicy {
            min_visible_severity: "warning".to_string(),
            max_visible_events: 100,
            promote_severity: "warning".to_string(),
            stale_cleanup_severity: "high".to_string(),
            connect_mode_change_severity: "warning".to_string(),
            connect_ingress_denied_severity: "high".to_string(),
            connect_ingress_error_severity: "critical".to_string(),
        },
        "relaxed" => AuditPolicy {
            min_visible_severity: "info".to_string(),
            max_visible_events: 100,
            promote_severity: "info".to_string(),
            stale_cleanup_severity: "info".to_string(),
            connect_mode_change_severity: "info".to_string(),
            connect_ingress_denied_severity: "warning".to_string(),
            connect_ingress_error_severity: "warning".to_string(),
        },
        _ => default_audit_policy(),
    }
}

pub fn normalize_audit_policy(policy: AuditPolicy) -> AuditPolicy {
    let mut normalized = policy;
    normalized.min_visible_severity = normalize_severity(&normalized.min_visible_severity);
    normalized.promote_severity = normalize_severity(&normalized.promote_severity);
    normalized.stale_cleanup_severity = normalize_severity(&normalized.stale_cleanup_severity);
    normalized.connect_mode_change_severity =
        normalize_severity(&normalized.connect_mode_change_severity);
    normalized.connect_ingress_denied_severity =
        normalize_severity(&normalized.connect_ingress_denied_severity);
    normalized.connect_ingress_error_severity =
        normalize_severity(&normalized.connect_ingress_error_severity);
    normalized.max_visible_events = normalized.max_visible_events.clamp(1, 200);
    normalized
}

pub fn normalize_severity(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "critical" => "critical".to_string(),
        "high" => "high".to_string(),
        "warning" | "warn" => "warning".to_string(),
        _ => "info".to_string(),
    }
}

pub fn severity_rank(raw: &str) -> u8 {
    match normalize_severity(raw).as_str() {
        "critical" => 4,
        "high" => 3,
        "warning" => 2,
        _ => 1,
    }
}

pub fn severity_for_event(event_type: &str, policy: &AuditPolicy) -> String {
    match event_type {
        "promote" => policy.promote_severity.clone(),
        "stale_cleanup" => policy.stale_cleanup_severity.clone(),
        "connect_mode_change" => policy.connect_mode_change_severity.clone(),
        "connect_ingress_denied" => policy.connect_ingress_denied_severity.clone(),
        "connect_ingress_error" => policy.connect_ingress_error_severity.clone(),
        _ => "info".to_string(),
    }
}

pub fn filter_audit_events(mut events: Vec<AuditEvent>, policy: &AuditPolicy) -> Vec<AuditEvent> {
    let threshold = severity_rank(&policy.min_visible_severity);
    events.retain(|event| severity_rank(&event.severity) >= threshold);
    events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    if events.len() > policy.max_visible_events {
        events.truncate(policy.max_visible_events);
    }
    events
}

pub fn build_audit_summary(events: &[AuditEvent]) -> AuditSummary {
    let mut summary = AuditSummary {
        info: 0,
        warning: 0,
        high: 0,
        critical: 0,
    };
    for event in events {
        match normalize_severity(&event.severity).as_str() {
            "critical" => summary.critical += 1,
            "high" => summary.high += 1,
            "warning" => summary.warning += 1,
            _ => summary.info += 1,
        }
    }
    summary
}

pub fn normalize_connect_mode(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "stable" => "stable".to_string(),
        "preview" => "preview".to_string(),
        "disabled" => "disabled".to_string(),
        _ => String::new(),
    }
}

pub fn connect_mode_from_env() -> String {
    let env_mode = std::env::var("MUSU_PORT_MANAGER_CONNECT_MODE")
        .ok()
        .map(|raw| normalize_connect_mode(raw.as_str()))
        .unwrap_or_default();

    if !env_mode.is_empty() {
        return env_mode;
    }

    if std::env::var("MUSU_PORT_MANAGER_CONNECT_ENABLED")
        .ok()
        .map(|raw| matches!(raw.trim(), "1" | "true" | "True" | "TRUE" | "on" | "ON"))
        .unwrap_or(false)
    {
        "preview".to_string()
    } else {
        "disabled".to_string()
    }
}

pub fn apply_connect_mode_env(mode: &str) {
    match mode {
        "disabled" => {
            std::env::set_var("MUSU_PORT_MANAGER_CONNECT_MODE", "disabled");
            std::env::remove_var("MUSU_PORT_MANAGER_CONNECT_ENABLED");
        }
        "stable" => {
            std::env::set_var("MUSU_PORT_MANAGER_CONNECT_MODE", "stable");
            std::env::set_var("MUSU_PORT_MANAGER_CONNECT_ENABLED", "1");
        }
        _ => {
            std::env::set_var("MUSU_PORT_MANAGER_CONNECT_MODE", "preview");
            std::env::set_var("MUSU_PORT_MANAGER_CONNECT_ENABLED", "1");
        }
    }
}

pub fn derive_connect_status(
    mode: &str,
    routes: &[ServiceRoute],
    uncovered: &[CoverageEndpointGap],
    discovered: &[DiscoveredEndpoint],
    l4_runners: &[L4RunnerStatus],
    audit_events: &[AuditEvent],
) -> ConnectStatus {
    let enabled = matches!(mode, "preview" | "stable");
    let mut blockers = Vec::new();

    let tcp_alias_count = routes
        .iter()
        .filter(|route| {
            route.name.starts_with("promoted-") && route.protocol.eq_ignore_ascii_case("tcp")
        })
        .count();
    if tcp_alias_count == 0 {
        blockers.push("no promoted tcp aliases available for CONNECT ingress".to_string());
    }

    let uncovered_high = uncovered
        .iter()
        .filter(|gap| severity_rank(&gap.severity) >= severity_rank("high"))
        .count();
    if uncovered_high > 0 {
        blockers.push(format!(
            "high severity coverage gaps detected: {uncovered_high}"
        ));
    }

    let l4_issues = l4_runners
        .iter()
        .filter(|runner| !runner.running || runner.last_error.is_some())
        .count();
    if l4_issues > 0 {
        blockers.push(format!("l4 runner issues detected: {l4_issues}"));
    }

    let unmanaged_high = discovered
        .iter()
        .filter(|endpoint| {
            !endpoint.ignored
                && !endpoint.false_positive_candidate
                && severity_rank(&endpoint.severity) >= severity_rank("high")
        })
        .count();
    if unmanaged_high > 0 {
        blockers.push(format!(
            "unmanaged high severity endpoints must be triaged first: {unmanaged_high}"
        ));
    }

    let audit_high = audit_events
        .iter()
        .filter(|event| severity_rank(&event.severity) >= severity_rank("high"))
        .count();
    if audit_high > 0 {
        blockers.push(format!(
            "recent high/critical audit events detected: {audit_high}"
        ));
    }

    let stable_ready = blockers.is_empty();
    let criteria = vec![
        "at least one managed tcp alias exists".to_string(),
        "no high severity coverage gaps".to_string(),
        "l4 runners are healthy (running/no last_error)".to_string(),
        "no unmanaged high severity endpoints".to_string(),
        "no recent high/critical audit events".to_string(),
    ];

    ConnectStatus {
        mode: mode.to_string(),
        enabled,
        stable_ready,
        blockers,
        criteria,
    }
}

pub fn build_metadata_consistency_report(
    discovered: &[DiscoveredEndpoint],
    runtime_context: &RuntimeContext,
) -> MetadataConsistencyReport {
    let total = discovered.len();
    let process_name_unknown = discovered
        .iter()
        .filter(|endpoint| {
            let lower = endpoint.process_name.to_ascii_lowercase();
            endpoint.process_name.trim().is_empty()
                || lower == "unknown"
                || lower.starts_with("pid-")
        })
        .count();
    let process_name_known = total.saturating_sub(process_name_unknown);
    let process_user_known = discovered
        .iter()
        .filter(|endpoint| {
            endpoint
                .process_user
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
        })
        .count();
    let process_user_unknown = total.saturating_sub(process_user_known);
    let agent_facing_endpoints = discovered
        .iter()
        .filter(|endpoint| endpoint.agent_facing)
        .count();
    let mcp_server_candidates = discovered
        .iter()
        .filter(|endpoint| endpoint.service_class == "mcp_server")
        .count();
    let mut service_class_breakdown = HashMap::<String, usize>::new();
    for endpoint in discovered {
        *service_class_breakdown
            .entry(endpoint.service_class.clone())
            .or_insert(0) += 1;
    }

    let mut findings = Vec::new();
    if total == 0 {
        findings.push("no discovered unmanaged endpoints".to_string());
    }
    if process_name_unknown > 0 {
        findings.push(format!(
            "process name unavailable for {process_name_unknown} endpoint(s)"
        ));
    }
    if process_user_unknown > 0 {
        findings.push(format!(
            "process user unavailable for {process_user_unknown} endpoint(s)"
        ));
    }
    if agent_facing_endpoints > 0 {
        findings.push(format!(
            "agent-facing endpoint candidates: {agent_facing_endpoints}"
        ));
    }
    if mcp_server_candidates > 0 {
        findings.push(format!("mcp server candidates: {mcp_server_candidates}"));
    }

    let penalty = (process_name_unknown * 20) + (process_user_unknown * 10);
    let consistency_score = 100usize.saturating_sub(penalty).min(100) as u8;

    MetadataConsistencyReport {
        platform: runtime_context.label().to_string(),
        filesystem_context: runtime_context.filesystem_label().to_string(),
        binary_kind: runtime_context.binary_kind.label().to_string(),
        generated_at: current_timestamp(),
        total_endpoints: total,
        process_name_known,
        process_name_unknown,
        process_user_known,
        process_user_unknown,
        agent_facing_endpoints,
        mcp_server_candidates,
        service_class_breakdown,
        consistency_score,
        findings,
    }
}

pub fn tcp_ingress_mode() -> String {
    std::env::var("MUSU_PORT_MANAGER_TCP_INGRESS_MODE")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "dedicated_l4".to_string())
}

pub fn derive_alert_level(
    uncovered: &[CoverageEndpointGap],
    discovered: &[DiscoveredEndpoint],
    l4_runners: &[L4RunnerStatus],
    audit_events: &[AuditEvent],
    quic_probe_summary: &QuicProbeSummary,
) -> (String, Vec<String>) {
    let mut messages = Vec::new();

    let uncovered_high = uncovered
        .iter()
        .filter(|gap| severity_rank(&gap.severity) >= severity_rank("high"))
        .count();
    if uncovered_high > 0 {
        messages.push(format!("coverage gaps(high+): {uncovered_high}"));
    }

    let unmanaged_high = discovered
        .iter()
        .filter(|endpoint| {
            !endpoint.ignored
                && !endpoint.false_positive_candidate
                && severity_rank(&endpoint.severity) >= severity_rank("high")
        })
        .count();
    if unmanaged_high > 0 {
        messages.push(format!("unmanaged endpoints(high+): {unmanaged_high}"));
    }

    let l4_issues = l4_runners
        .iter()
        .filter(|runner| !runner.running || runner.last_error.is_some())
        .count();
    if l4_issues > 0 {
        messages.push(format!("l4 runner issues: {l4_issues}"));
    }

    let audit_warning = audit_events
        .iter()
        .filter(|event| severity_rank(&event.severity) >= severity_rank("warning"))
        .count();
    if audit_warning > 0 {
        messages.push(format!("audit warning/high events: {audit_warning}"));
    }

    if quic_probe_summary.fallback_total > 0 {
        messages.push(format!(
            "quic fallback: {} (timeout {}, unreachable {}, io {})",
            quic_probe_summary.fallback_total,
            quic_probe_summary.timeout_total,
            quic_probe_summary.unreachable_total,
            quic_probe_summary.io_error_total
        ));
    }

    let alert_level = if uncovered_high > 0 || l4_issues > 0 {
        "high"
    } else if unmanaged_high > 0 || audit_warning > 0 || quic_probe_summary.fallback_total > 0 {
        "warning"
    } else {
        "info"
    };

    messages.truncate(5);
    (alert_level.to_string(), messages)
}

pub fn normalize_export_format(raw: &str) -> Result<String, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "json" => Ok("json".to_string()),
        "md" | "markdown" => Ok("markdown".to_string()),
        other => Err(format!(
            "unsupported export format '{other}'. supported: json, markdown"
        )),
    }
}

pub fn render_metadata_report(
    format: &str,
    report: &MetadataConsistencyReport,
    generated_at: i64,
    connect_mode: &str,
) -> Result<String, String> {
    if format == "json" {
        return serde_json::to_string_pretty(&serde_json::json!({
            "version": "musu.port-manager.metadata-report.v1",
            "exported_at": generated_at,
            "connect_mode": connect_mode,
            "report": report,
        }))
        .map_err(|err| format!("failed to serialize metadata report json: {err}"));
    }

    let mut out = String::new();
    out.push_str("# Port Manager Metadata Consistency Report\n\n");
    out.push_str(&format!("- exported_at: {generated_at}\n"));
    out.push_str(&format!("- platform: {}\n", report.platform));
    out.push_str(&format!(
        "- filesystem_context: {}\n",
        report.filesystem_context
    ));
    out.push_str(&format!("- binary_kind: {}\n", report.binary_kind));
    out.push_str(&format!("- connect_mode: {connect_mode}\n"));
    out.push_str(&format!(
        "- consistency_score: {}/100\n\n",
        report.consistency_score
    ));
    out.push_str("| metric | value |\n");
    out.push_str("|---|---:|\n");
    out.push_str(&format!(
        "| total_endpoints | {} |\n",
        report.total_endpoints
    ));
    out.push_str(&format!(
        "| process_name_known | {} |\n",
        report.process_name_known
    ));
    out.push_str(&format!(
        "| process_name_unknown | {} |\n",
        report.process_name_unknown
    ));
    out.push_str(&format!(
        "| process_user_known | {} |\n",
        report.process_user_known
    ));
    out.push_str(&format!(
        "| process_user_unknown | {} |\n\n",
        report.process_user_unknown
    ));
    out.push_str("## Findings\n");
    if report.findings.is_empty() {
        out.push_str("- none\n");
    } else {
        for finding in &report.findings {
            out.push_str(&format!("- {finding}\n"));
        }
    }
    Ok(out)
}

pub fn resolve_metadata_export_path(
    base_dir: &Path,
    format: &str,
    path: Option<&str>,
    generated_at: i64,
    runtime_context: &RuntimeContext,
) -> PathBuf {
    let filename = if format == "json" {
        format!("metadata-report-{generated_at}.json")
    } else {
        format!("metadata-report-{generated_at}.md")
    };

    match path {
        Some(raw) => {
            let candidate = normalize_input_path(raw, runtime_context);
            if candidate.extension().is_some() {
                candidate
            } else {
                candidate.join(filename)
            }
        }
        None => base_dir.join(filename),
    }
}

pub fn append_metadata_export_history(
    history: &mut Vec<MetadataExportHistoryEntry>,
    entry: MetadataExportHistoryEntry,
) {
    history.push(entry);
    history.sort_by(|a, b| b.generated_at.cmp(&a.generated_at));
    if history.len() > 50 {
        history.truncate(50);
    }
}

pub fn append_connect_probe_history(
    history: &mut Vec<ConnectProbeHistoryEntry>,
    entry: ConnectProbeHistoryEntry,
) {
    history.push(entry);
    history.sort_by(|a, b| b.generated_at.cmp(&a.generated_at));
    if history.len() > 50 {
        history.truncate(50);
    }
}

pub fn build_metadata_dual_path_status(
    runtime_context: &RuntimeContext,
    data_root: &Path,
    state_db_path: &Path,
    metadata_dir: &Path,
    connect_dir: &Path,
) -> serde_json::Value {
    let data_root_views = path_display_views(data_root, runtime_context);
    let db_views = path_display_views(state_db_path, runtime_context);
    let metadata_views = path_display_views(metadata_dir, runtime_context);
    let connect_views = path_display_views(connect_dir, runtime_context);
    let roundtrip_ready = data_root_views.windows.is_some()
        && db_views.windows.is_some()
        && metadata_views.windows.is_some()
        && connect_views.windows.is_some();

    serde_json::json!({
        "runtime_context": runtime_context.label(),
        "filesystem_context": runtime_context.filesystem_label(),
        "roundtrip_ready": roundtrip_ready,
        "data_root": {
            "runtime": data_root_views.runtime,
            "linux": data_root_views.linux,
            "windows": data_root_views.windows,
        },
        "state_db_path": {
            "runtime": db_views.runtime,
            "linux": db_views.linux,
            "windows": db_views.windows,
        },
        "metadata_export_dir": {
            "runtime": metadata_views.runtime,
            "linux": metadata_views.linux,
            "windows": metadata_views.windows,
        },
        "connect_probe_dir": {
            "runtime": connect_views.runtime,
            "linux": connect_views.linux,
            "windows": connect_views.windows,
        }
    })
}

pub fn summarize_connect_probe_samples(
    generated_at: i64,
    interval_ms: u64,
    samples: Vec<ConnectProbeSample>,
    report_path: Option<String>,
) -> ConnectProbeReport {
    let sample_count = samples.len();
    let stable_ready_samples = samples.iter().filter(|sample| sample.stable_ready).count();
    let blocked_samples = sample_count.saturating_sub(stable_ready_samples);
    let stable_ready_ratio = if sample_count > 0 {
        stable_ready_samples as f64 / sample_count as f64
    } else {
        0.0
    };

    let mut unique_blockers = samples
        .iter()
        .flat_map(|sample| sample.blockers.iter().cloned())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    unique_blockers.sort();

    let mut alert_level_counts = HashMap::new();
    for sample in &samples {
        *alert_level_counts
            .entry(sample.alert_level.clone())
            .or_insert(0usize) += 1;
    }

    ConnectProbeReport {
        generated_at,
        sample_count,
        interval_ms,
        stable_ready_samples,
        blocked_samples,
        stable_ready_ratio,
        unique_blockers,
        alert_level_counts,
        samples,
        report_path,
    }
}

pub fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_preset_raises_visibility_threshold() {
        let strict = audit_policy_preset("strict");
        assert_eq!(strict.min_visible_severity, "warning");
        assert_eq!(strict.connect_ingress_error_severity, "critical");
    }

    #[test]
    fn derive_connect_status_reports_blockers() {
        let routes = vec![ServiceRoute {
            name: "demo-api".to_string(),
            alias: "demo-api".to_string(),
            protocol: "http".to_string(),
            service_class: "generic_http".to_string(),
            agent_facing: false,
            enabled: true,
            running: true,
            port: Some(8787),
            target_url: Some("http://127.0.0.1:8787".to_string()),
            entrypoint_url: "http://127.0.0.1:24682/demo-api".to_string(),
        }];
        let discovered = vec![DiscoveredEndpoint {
            signature: "tcp|python3|127.0.0.1|19092".to_string(),
            protocol: "tcp".to_string(),
            process_name: "python3".to_string(),
            process_user: Some("hugh51".to_string()),
            pid: Some(1),
            listen_addr: "127.0.0.1".to_string(),
            port: 19092,
            service_class: "generic_service".to_string(),
            agent_facing: false,
            classification_source: "test".to_string(),
            exposure: "loopback".to_string(),
            owner: "external_process".to_string(),
            severity: "high".to_string(),
            false_positive_candidate: false,
            ignored: false,
            suggested_alias: "python3-19092".to_string(),
            suggested_action: "Promote".to_string(),
        }];
        let status = derive_connect_status("stable", &routes, &[], &discovered, &[], &[]);
        assert!(!status.stable_ready);
        assert!(!status.blockers.is_empty());
    }

    #[test]
    fn derive_alert_level_surfaces_quic_fallbacks() {
        let quic = QuicProbeSummary {
            attempts_total: 3,
            fallback_total: 1,
            recover_total: 2,
            timeout_total: 1,
            unreachable_total: 0,
            io_error_total: 0,
            metrics_source: "in_memory".to_string(),
            fetch_error: None,
        };
        let (level, messages) = derive_alert_level(&[], &[], &[], &[], &quic);
        assert_eq!(level, "warning");
        assert!(messages.iter().any(|row| row.contains("quic fallback")));
    }

    #[test]
    fn derive_alert_level_prefers_high_for_coverage_gaps() {
        let uncovered = vec![CoverageEndpointGap {
            name: "promoted-broken".to_string(),
            owner: "port_manager_l4".to_string(),
            severity: "high".to_string(),
            reason: "l4 runner is not active for promoted route".to_string(),
            target_url: Some("tcp://127.0.0.1:19091".to_string()),
            suggested_action: "Re-promote route or restart Port Manager.".to_string(),
        }];
        let quic = QuicProbeSummary {
            attempts_total: 0,
            fallback_total: 0,
            recover_total: 0,
            timeout_total: 0,
            unreachable_total: 0,
            io_error_total: 0,
            metrics_source: "in_memory".to_string(),
            fetch_error: None,
        };
        let (level, messages) = derive_alert_level(&uncovered, &[], &[], &[], &quic);
        assert_eq!(level, "high");
        assert!(messages.iter().any(|row| row.contains("coverage gaps")));
    }

    #[test]
    fn metadata_report_uses_runtime_context_labels() {
        let report = build_metadata_consistency_report(
            &[],
            &RuntimeContext {
                runtime: crate::platform::RuntimeKind::Wsl,
                filesystem: crate::platform::FilesystemContext::WslWindowsMount,
                wsl_distro: Some("Ubuntu-22.04".to_string()),
                binary_kind: crate::platform::BinaryKind::LinuxElf,
            },
        );
        assert_eq!(report.platform, "wsl");
        assert_eq!(report.filesystem_context, "wsl_windows_mount");
        assert_eq!(report.binary_kind, "linux_elf");
    }

    #[test]
    fn export_path_accepts_windows_path_when_running_in_wsl() {
        let context = RuntimeContext {
            runtime: crate::platform::RuntimeKind::Wsl,
            filesystem: crate::platform::FilesystemContext::LinuxNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: crate::platform::BinaryKind::LinuxElf,
        };
        let resolved = resolve_metadata_export_path(
            Path::new("/tmp/reports"),
            "json",
            Some("C:\\Users\\empty\\reports"),
            42,
            &context,
        );
        assert_eq!(
            resolved,
            PathBuf::from("/mnt/c/Users/empty/reports/metadata-report-42.json")
        );
    }

    #[test]
    fn dual_path_status_reports_windows_and_linux_views() {
        let context = RuntimeContext {
            runtime: crate::platform::RuntimeKind::Wsl,
            filesystem: crate::platform::FilesystemContext::LinuxNative,
            wsl_distro: Some("Ubuntu-22.04".to_string()),
            binary_kind: crate::platform::BinaryKind::LinuxElf,
        };
        let status = build_metadata_dual_path_status(
            &context,
            Path::new("/home/example/musu-functions/musu-port/data"),
            Path::new("/home/example/musu-functions/musu-port/data/musu-port.db"),
            Path::new("/home/example/musu-functions/musu-port/data/reports/port-manager/metadata"),
            Path::new("/home/example/musu-functions/musu-port/data/reports/port-manager/connect"),
        );
        assert_eq!(
            status
                .get("roundtrip_ready")
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert!(status
            .get("state_db_path")
            .and_then(|row| row.get("windows"))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|value| value.contains("\\\\wsl.localhost\\")));
    }

    #[test]
    fn connect_probe_history_is_capped() {
        let mut history = Vec::new();
        for idx in 0..55 {
            append_connect_probe_history(
                &mut history,
                ConnectProbeHistoryEntry {
                    generated_at: idx,
                    sample_count: 5,
                    stable_ready_ratio: 0.8,
                    blocked_samples: 1,
                    report_path: None,
                },
            );
        }
        assert_eq!(history.len(), 50);
        assert_eq!(history.first().map(|row| row.generated_at), Some(54));
        assert_eq!(history.last().map(|row| row.generated_at), Some(5));
    }
}
