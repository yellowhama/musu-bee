use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use tokio::sync::{Mutex, RwLock};

use crate::channel_hub::ChannelHub;
use crate::control::{
    append_connect_probe_history, append_metadata_export_history, apply_connect_mode_env,
    audit_policy_preset, build_audit_summary, build_metadata_consistency_report,
    build_metadata_dual_path_status, connect_mode_from_env, default_audit_policy,
    derive_alert_level, derive_connect_status, filter_audit_events, normalize_audit_policy,
    normalize_connect_mode, normalize_export_format, render_metadata_report,
    resolve_metadata_export_path, severity_for_event, summarize_connect_probe_samples,
    tcp_ingress_mode, AuditPolicy, AuditSummary, ConnectIngressDecision, ConnectProbeHistoryEntry,
    ConnectProbeReport, ConnectProbeSample, ConnectStatus, CoverageEndpointGap, CoverageReport,
    MetadataConsistencyReport, MetadataExportHistoryEntry, MetadataExportResult, QuicProbeSummary,
};
use crate::discovery::{discover_unmanaged_endpoints, DiscoveredEndpoint};
use crate::l4::{
    free_local_tcp_port, is_route_alive_quick, parse_addr_from_endpoint, probe_quic_target,
    L4RunnerStatus, L4Runtime, QuicProbeOutcome,
};
use crate::metrics::PortManagerMetrics;
use crate::platform::{
    display_path_for_runtime, summarize_device_profile, DeviceProfile, DeviceProfileSummary,
    DeviceServiceTemplate, RuntimeContext,
};
use crate::route::{
    is_agent_facing_service, normalize_service_class, ExtraRoutes, SeedRouteSource, ServiceRoute,
    SERVICE_CLASS_MCP_SERVER,
};
use crate::storage::{audit_event, AuditEvent, Persistence};

#[derive(Clone)]
pub struct MusuPortState {
    pub seed_routes: Arc<SeedRouteSource>,
    pub extra_routes: ExtraRoutes,
    pub ignored_signatures: Arc<RwLock<HashSet<String>>>,
    pub l4_runtime: Arc<Mutex<L4Runtime>>,
    pub persistence: Arc<Persistence>,
    pub metrics: Arc<PortManagerMetrics>,
    pub http_client: reqwest::Client,
    pub router_base_url: String,
    pub runtime_context: RuntimeContext,
    pub device_id: String,
    pub device_profile_path: PathBuf,
    pub device_profile: Option<DeviceProfile>,
    pub data_root: PathBuf,
    pub channel_hub: Arc<ChannelHub>,
    /// Current boss (사장): the device_id of the last device to connect.
    /// None until the first device registers.
    pub current_boss: Arc<RwLock<Option<String>>>,
}

impl MusuPortState {
    pub fn supervisor_routes(&self) -> Vec<ServiceRoute> {
        self.seed_routes.routes(&self.router_base_url)
    }

    pub async fn external_routes(&self) -> Vec<ServiceRoute> {
        let extra = self.extra_routes.read().await;
        let mut routes = extra.values().cloned().collect::<Vec<_>>();
        routes.sort_by(|a, b| a.alias.cmp(&b.alias));
        routes
    }

    pub async fn collect_routes(&self) -> Vec<ServiceRoute> {
        let supervisor_routes = self.supervisor_routes();

        let mut merged: HashMap<String, ServiceRoute> = HashMap::new();
        for route in supervisor_routes {
            merged.insert(route.alias.clone(), route);
        }

        let extra = self.external_routes().await;
        for route in &extra {
            merged.insert(route.alias.clone(), route.clone());
        }

        let mut routes = merged.into_values().collect::<Vec<_>>();
        routes.sort_by(|a, b| a.alias.cmp(&b.alias));
        routes
    }

    pub async fn resolve_route(&self, service: &str) -> Result<ServiceRoute, Response<Body>> {
        let routes = self.collect_routes().await;
        let Some(route) = routes
            .into_iter()
            .find(|route| route.alias == service || route.name == service)
        else {
            return Err((
                StatusCode::NOT_FOUND,
                format!("unknown service alias: {service}"),
            )
                .into_response());
        };

        if !route.enabled {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                format!("service disabled: {service}"),
            )
                .into_response());
        }
        if !route.running {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                format!("service not running: {service}"),
            )
                .into_response());
        }

        Ok(route)
    }

    pub async fn discover_endpoints(&self) -> Result<Vec<DiscoveredEndpoint>, String> {
        let routes = self.collect_routes().await;
        let managed_ports = collect_managed_ports(&routes);
        let ignored = self.ignored_signatures.read().await.clone();
        let mut discovered =
            discover_unmanaged_endpoints(&managed_ports, &ignored, &self.runtime_context)?;
        self.apply_device_profile_templates(&mut discovered);
        self.classify_ai_native_endpoints(&mut discovered).await;
        Ok(discovered)
    }

    pub async fn l4_status(&self) -> Vec<L4RunnerStatus> {
        self.l4_runtime.lock().await.snapshot()
    }

    pub fn quic_probe_summary(&self) -> QuicProbeSummary {
        let snapshot = self.metrics.snapshot();
        QuicProbeSummary {
            attempts_total: snapshot.quic_attempts_total,
            fallback_total: snapshot.quic_fallback_total,
            recover_total: snapshot.quic_recover_total,
            timeout_total: snapshot.quic_timeout_total,
            unreachable_total: snapshot.quic_unreachable_total,
            io_error_total: snapshot.quic_io_error_total,
            metrics_source: "in_memory".to_string(),
            fetch_error: None,
        }
    }

    pub fn audit_events(&self) -> Result<Vec<AuditEvent>, String> {
        let events = self.persistence.load_audit_events()?;
        let policy = self.audit_policy()?;
        Ok(filter_audit_events(events, &policy))
    }

    pub fn raw_audit_events(&self) -> Result<Vec<AuditEvent>, String> {
        self.persistence.load_audit_events()
    }

    pub fn audit_policy(&self) -> Result<AuditPolicy, String> {
        Ok(normalize_audit_policy(
            self.persistence
                .load_audit_policy()?
                .unwrap_or_else(default_audit_policy),
        ))
    }

    pub fn set_audit_policy(&self, policy: AuditPolicy) -> Result<AuditPolicy, String> {
        let normalized = normalize_audit_policy(policy);
        self.persistence.save_audit_policy(&normalized)?;
        Ok(normalized)
    }

    pub fn apply_audit_policy_preset(&self, preset: &str) -> Result<AuditPolicy, String> {
        let policy = audit_policy_preset(preset);
        self.persistence.save_audit_policy(&policy)?;
        Ok(policy)
    }

    pub fn audit_summary(&self) -> Result<AuditSummary, String> {
        let events = self.audit_events()?;
        Ok(build_audit_summary(&events))
    }

    pub fn connect_mode(&self) -> Result<String, String> {
        if let Some(value) = self.persistence.load_connect_mode()? {
            let normalized = normalize_connect_mode(&value);
            if !normalized.is_empty() {
                return Ok(normalized);
            }
        }
        Ok(connect_mode_from_env())
    }

    pub fn initialize_connect_mode(&self) -> Result<String, String> {
        let mode = self.connect_mode()?;
        let normalized = if mode.is_empty() {
            "disabled".to_string()
        } else {
            mode
        };
        apply_connect_mode_env(&normalized);
        Ok(normalized)
    }

    pub async fn connect_status(&self) -> Result<ConnectStatus, String> {
        let routes = self.collect_routes().await;
        let external_routes = self.external_routes().await;
        let discovered = self.discover_endpoints().await?;
        let l4_runners = self.l4_status().await;
        let uncovered = derive_uncovered_endpoints(&external_routes, &l4_runners);
        let audit_events = self.raw_audit_events()?;
        let mode = self.connect_mode()?;
        Ok(derive_connect_status(
            &mode,
            &routes,
            &uncovered,
            &discovered,
            &l4_runners,
            &audit_events,
        ))
    }

    pub async fn connect_ingress(&self, service: &str) -> Result<ConnectIngressDecision, String> {
        let route = self
            .collect_routes()
            .await
            .into_iter()
            .find(|route| route.alias == service)
            .ok_or_else(|| format!("route not found for alias '{service}'"))?;

        let mode = self.connect_mode()?;
        let translator_hints = self
            .device_profile
            .as_ref()
            .map(|profile| profile.guidance.translator_hints.clone())
            .unwrap_or_default();
        let mut decision = ConnectIngressDecision {
            alias: route.alias.clone(),
            mode: mode.clone(),
            allowed: true,
            protocol: route.protocol.clone(),
            service_class: route.service_class.clone(),
            agent_facing: route.agent_facing,
            connect_kind: connect_kind_for_route(&route).to_string(),
            delivery_contract: "connect_url_handoff".to_string(),
            bridge_owner: "musu-port".to_string(),
            remote_bridge_supported: false,
            connect_url: Some(route.entrypoint_url.clone()),
            target_url: route.target_url.clone(),
            health_path_hint: self.connect_health_path_hint(&route),
            translator_hints,
            denial_reason: None,
        };

        let denial_reason = if !route.enabled || !route.running {
            Some("route is not enabled or not running".to_string())
        } else if self
            .device_profile
            .as_ref()
            .and_then(|profile| profile.transport.supports_connect)
            == Some(false)
        {
            Some("device profile disables CONNECT ingress".to_string())
        } else if mode == "disabled" {
            Some("CONNECT mode is disabled".to_string())
        } else if mode == "stable" {
            let status = self.connect_status().await?;
            if status.stable_ready {
                None
            } else if status.blockers.is_empty() {
                Some("CONNECT stable mode is not ready".to_string())
            } else {
                Some(format!(
                    "CONNECT stable mode blocked: {}",
                    status.blockers.join("; ")
                ))
            }
        } else {
            None
        };

        if let Some(reason) = denial_reason {
            decision.allowed = false;
            decision.connect_url = None;
            decision.denial_reason = Some(reason.clone());
            self.append_detailed_policy_audit_event(
                "connect_ingress_denied",
                format!(
                    "connect access denied for alias '{}': {reason}",
                    route.alias
                ),
                Some(route.alias.clone()),
                Some(serde_json::json!({
                    "alias": route.alias,
                    "mode": mode,
                    "protocol": route.protocol,
                    "service_class": route.service_class,
                    "agent_facing": route.agent_facing,
                    "connect_kind": decision.connect_kind,
                    "delivery_contract": decision.delivery_contract,
                    "bridge_owner": decision.bridge_owner,
                    "remote_bridge_supported": decision.remote_bridge_supported,
                    "reason": reason,
                })),
            )?;
        }

        Ok(decision)
    }

    pub async fn auto_promote_mcp_candidates(&self) -> Result<Vec<String>, String> {
        if !self.auto_promote_mcp_enabled() {
            return Ok(Vec::new());
        }

        let discovered = self.discover_endpoints().await?;
        let mut alias_in_use = self
            .collect_routes()
            .await
            .into_iter()
            .map(|route| route.alias)
            .collect::<HashSet<_>>();

        let mut promoted_routes = Vec::new();
        {
            let mut extra = self.extra_routes.write().await;
            let mut changed = false;
            for endpoint in discovered {
                if !should_auto_promote_mcp(&endpoint) {
                    continue;
                }
                if self.auto_promote_requires_template()
                    && self.match_device_service_template(&endpoint).is_none()
                {
                    continue;
                }

                let mut selected_alias =
                    crate::discovery::sanitize_alias(endpoint.suggested_alias.as_str());
                if selected_alias.is_empty() {
                    selected_alias = format!("mcp-{}", endpoint.port);
                }
                if alias_in_use.contains(&selected_alias) || extra.contains_key(&selected_alias) {
                    continue;
                }

                alias_in_use.insert(selected_alias.clone());
                let route = ServiceRoute {
                    name: format!("promoted-{}", selected_alias),
                    alias: selected_alias.clone(),
                    protocol: "http".to_string(),
                    service_class: SERVICE_CLASS_MCP_SERVER.to_string(),
                    agent_facing: true,
                    enabled: true,
                    running: true,
                    port: Some(endpoint.port),
                    target_url: Some(format!("http://127.0.0.1:{}", endpoint.port)),
                    entrypoint_url: format!(
                        "{}/{}",
                        self.router_base_url.trim_end_matches('/'),
                        selected_alias
                    ),
                };
                extra.insert(selected_alias.clone(), route);
                promoted_routes.push(selected_alias);
                changed = true;
            }

            if changed {
                self.persistence.save_promoted_routes(&extra)?;
            }
        }

        for alias in &promoted_routes {
            self.append_policy_audit_event(
                "promote",
                format!("auto-promoted MCP endpoint to alias '{}'", alias),
                Some(alias.clone()),
            )?;
        }

        Ok(promoted_routes)
    }

    pub async fn alert_level(&self) -> Result<(String, Vec<String>), String> {
        let external_routes = self.external_routes().await;
        let discovered = self.discover_endpoints().await?;
        let l4_runners = self.l4_status().await;
        let audit_events = self.raw_audit_events()?;
        let quic_probe_summary = self.quic_probe_summary();
        let uncovered = derive_uncovered_endpoints(&external_routes, &l4_runners);
        Ok(derive_alert_level(
            &uncovered,
            &discovered,
            &l4_runners,
            &audit_events,
            &quic_probe_summary,
        ))
    }

    pub async fn set_connect_mode(&self, mode: String) -> Result<ConnectStatus, String> {
        let normalized = normalize_connect_mode(&mode);
        if normalized.is_empty() {
            return Err(
                "unsupported connect mode. supported: disabled, preview, stable".to_string(),
            );
        }
        if normalized == "stable" {
            let status = self.connect_status().await?;
            if !status.stable_ready {
                let blockers = if status.blockers.is_empty() {
                    "unknown blockers".to_string()
                } else {
                    status.blockers.join("; ")
                };
                return Err(format!("CONNECT stable mode blocked: {blockers}"));
            }
        }

        self.persistence.save_connect_mode(&normalized)?;
        apply_connect_mode_env(&normalized);
        self.append_policy_audit_event(
            "connect_mode_change",
            format!("CONNECT mode changed to '{normalized}'"),
            None,
        )?;
        self.connect_status().await
    }

    pub async fn metadata_report(&self) -> Result<MetadataConsistencyReport, String> {
        let discovered = self.discover_endpoints().await?;
        Ok(build_metadata_consistency_report(
            &discovered,
            &self.runtime_context,
        ))
    }

    pub fn metadata_export_history(&self) -> Result<Vec<MetadataExportHistoryEntry>, String> {
        self.persistence.load_metadata_export_history()
    }

    pub fn connect_probe_history(&self) -> Result<Vec<ConnectProbeHistoryEntry>, String> {
        self.persistence.load_connect_probe_history()
    }

    pub fn connect_denied_events(&self, drain: bool) -> Result<Vec<AuditEvent>, String> {
        let events = self.raw_audit_events()?;
        let denied = events
            .iter()
            .filter(|event| event.event_type == "connect_ingress_denied")
            .cloned()
            .collect::<Vec<_>>();

        if drain && !denied.is_empty() {
            let retained = events
                .into_iter()
                .filter(|event| event.event_type != "connect_ingress_denied")
                .collect::<Vec<_>>();
            self.persistence.save_audit_events(&retained)?;
        }

        Ok(denied)
    }

    pub async fn coverage_report(&self) -> Result<CoverageReport, String> {
        self.evict_dead_extra_routes().await?;

        let supervisor_routes = self.supervisor_routes();
        let external_routes = self.external_routes().await;
        let l4_runners = self.l4_status().await;
        let discovered_unmanaged_endpoints = self.discover_endpoints().await?;
        let ignored_signatures = self.ignored_signatures.read().await.clone();
        let audit_policy = self.audit_policy()?;
        let all_audit_events = self.raw_audit_events()?;
        let audit_events = filter_audit_events(all_audit_events.clone(), &audit_policy);
        let audit_summary = build_audit_summary(&audit_events);
        let metadata_report = build_metadata_consistency_report(
            &discovered_unmanaged_endpoints,
            &self.runtime_context,
        );
        let connect_status = self.connect_status().await?;
        let quic_probe_summary = self.quic_probe_summary();
        let uncovered_endpoints = derive_uncovered_endpoints(&external_routes, &l4_runners);
        let (alert_level, alert_messages) = derive_alert_level(
            &uncovered_endpoints,
            &discovered_unmanaged_endpoints,
            &l4_runners,
            &all_audit_events,
            &quic_probe_summary,
        );

        let mut managed_aliases = supervisor_routes
            .iter()
            .chain(external_routes.iter())
            .map(|route| route.alias.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        managed_aliases.sort();

        let mut ignored_signatures = ignored_signatures.into_iter().collect::<Vec<_>>();
        ignored_signatures.sort();

        let has_actionable_discovered = discovered_unmanaged_endpoints
            .iter()
            .any(|endpoint| !endpoint.ignored && !endpoint.false_positive_candidate);

        Ok(CoverageReport {
            router_base_url: self.router_base_url.clone(),
            supervisor_routes: supervisor_routes.len(),
            external_routes: external_routes.len(),
            total_managed_routes: supervisor_routes.len() + external_routes.len(),
            managed_aliases,
            uncovered_endpoints: uncovered_endpoints.clone(),
            discovered_unmanaged_endpoints,
            ignored_signatures,
            l4_runners,
            tcp_ingress_mode: tcp_ingress_mode(),
            quic_probe_summary,
            alert_level,
            alert_messages,
            connect_status,
            metadata_report,
            metadata_dual_path_status: Some(self.metadata_dual_path_status()),
            audit_policy,
            audit_summary,
            audit_events,
            all_known_endpoints_managed: uncovered_endpoints.is_empty()
                && !has_actionable_discovered,
        })
    }

    pub async fn export_metadata_report(
        &self,
        format: String,
        path: Option<String>,
    ) -> Result<MetadataExportResult, String> {
        let normalized_format = normalize_export_format(&format)?;
        let report = self.metadata_report().await?;
        let generated_at = crate::control::current_timestamp();
        let connect_mode = self.connect_mode()?;
        let export_path = resolve_metadata_export_path(
            &self.default_metadata_export_dir(),
            &normalized_format,
            path.as_deref(),
            generated_at,
            &self.runtime_context,
        );
        if let Some(parent) = export_path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| {
                format!(
                    "failed to create metadata export directory '{}': {err}",
                    parent.display()
                )
            })?;
        }
        let contents =
            render_metadata_report(&normalized_format, &report, generated_at, &connect_mode)?;
        std::fs::write(&export_path, contents.as_bytes()).map_err(|err| {
            format!(
                "failed to write metadata export '{}': {err}",
                export_path.display()
            )
        })?;
        let display_path = display_path_for_runtime(&export_path, &self.runtime_context);

        let mut history = self.persistence.load_metadata_export_history()?;
        append_metadata_export_history(
            &mut history,
            MetadataExportHistoryEntry {
                format: normalized_format.clone(),
                path: display_path.clone(),
                generated_at,
                consistency_score: report.consistency_score,
                total_endpoints: report.total_endpoints,
            },
        );
        self.persistence.save_metadata_export_history(&history)?;

        Ok(MetadataExportResult {
            format: normalized_format,
            path: display_path,
            generated_at,
            bytes_written: contents.len(),
        })
    }

    pub async fn run_connect_stable_probe(
        &self,
        sample_count: Option<usize>,
        interval_ms: Option<u64>,
        persist_report: Option<bool>,
    ) -> Result<ConnectProbeReport, String> {
        let sample_count = sample_count.unwrap_or(5).clamp(1, 30);
        let interval_ms = interval_ms.unwrap_or(800).clamp(100, 10_000);
        let persist_report = persist_report.unwrap_or(true);

        let mut samples = Vec::with_capacity(sample_count);
        for idx in 0..sample_count {
            let status = self.connect_status().await?;
            let (alert_level, _) = self.alert_level().await?;
            samples.push(ConnectProbeSample {
                timestamp: crate::control::current_timestamp(),
                mode: status.mode,
                stable_ready: status.stable_ready,
                blocker_count: status.blockers.len(),
                blockers: status.blockers,
                alert_level,
            });

            if idx + 1 < sample_count {
                tokio::time::sleep(Duration::from_millis(interval_ms)).await;
            }
        }

        let generated_at = crate::control::current_timestamp();
        let report_path = if persist_report {
            let path = self.resolve_connect_probe_path(generated_at);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|err| {
                    format!(
                        "failed to create connect probe report dir '{}': {err}",
                        parent.display()
                    )
                })?;
            }
            Some(path)
        } else {
            None
        };

        let mut report = summarize_connect_probe_samples(
            generated_at,
            interval_ms,
            samples,
            report_path
                .as_ref()
                .map(|path| display_path_for_runtime(path, &self.runtime_context)),
        );

        if let Some(path) = report_path {
            let payload = serde_json::to_string_pretty(&report)
                .map_err(|err| format!("failed to serialize connect probe report: {err}"))?;
            std::fs::write(&path, payload.as_bytes()).map_err(|err| {
                format!(
                    "failed to write connect probe report '{}': {err}",
                    path.display()
                )
            })?;

            let mut history = self.persistence.load_connect_probe_history()?;
            append_connect_probe_history(
                &mut history,
                ConnectProbeHistoryEntry {
                    generated_at,
                    sample_count: report.sample_count,
                    stable_ready_ratio: report.stable_ready_ratio,
                    blocked_samples: report.blocked_samples,
                    report_path: report.report_path.clone(),
                },
            );
            self.persistence.save_connect_probe_history(&history)?;
        }

        if report.report_path.is_none() {
            report.report_path = None;
        }

        Ok(report)
    }

    pub async fn promote_endpoint(
        &self,
        signature: String,
        alias: Option<String>,
        protocol: Option<String>,
    ) -> Result<PromoteResult, String> {
        let protocol = protocol
            .unwrap_or_else(|| "http".to_string())
            .trim()
            .to_ascii_lowercase();

        if protocol != "http" && protocol != "ws" && protocol != "tcp" && protocol != "quic" {
            return Err(format!(
                "unsupported protocol '{protocol}'. supported: http, ws, tcp, quic"
            ));
        }

        let mut alias_in_use = self
            .collect_routes()
            .await
            .into_iter()
            .map(|route| route.alias)
            .collect::<HashSet<_>>();

        let ignored_signatures = self.ignored_signatures.read().await.clone();
        if ignored_signatures.contains(&signature) {
            return Err(format!(
                "signature is currently suppressed: {signature}. unsuppress first"
            ));
        }

        let discovered = self.discover_endpoints().await?;
        let endpoint = discovered
            .into_iter()
            .find(|item| item.signature == signature)
            .ok_or_else(|| format!("discovered endpoint not found for signature: {signature}"))?;

        let mut selected_alias = crate::discovery::sanitize_alias(
            alias
                .unwrap_or_else(|| endpoint.suggested_alias.clone())
                .as_str(),
        );
        if selected_alias.is_empty() {
            selected_alias = format!("svc-{}", endpoint.port);
        }
        if alias_in_use.contains(&selected_alias) {
            selected_alias = format!("{}-{}", selected_alias, endpoint.port);
        }
        alias_in_use.insert(selected_alias.clone());

        let (entrypoint, target_url, bind_port) = if protocol == "tcp" {
            let bind_port = free_local_tcp_port()?;
            let entry = format!("tcp://127.0.0.1:{bind_port}");
            let target = format!("tcp://127.0.0.1:{}", endpoint.port);
            (entry, target, bind_port)
        } else if protocol == "quic" {
            let bind_port = free_local_tcp_port()?;
            let entry = format!("quic://127.0.0.1:{bind_port}");
            let target = format!("quic://127.0.0.1:{}", endpoint.port);
            (entry, target, bind_port)
        } else {
            let entry = format!(
                "{}/{}",
                self.router_base_url.trim_end_matches('/'),
                selected_alias
            );
            let target = format!("http://127.0.0.1:{}", endpoint.port);
            (entry, target, endpoint.port)
        };

        let route = ServiceRoute {
            name: format!("promoted-{}", selected_alias),
            alias: selected_alias.clone(),
            protocol: protocol.clone(),
            service_class: normalize_service_class(
                Some(endpoint.service_class.as_str()),
                &protocol,
                endpoint.agent_facing,
            ),
            agent_facing: endpoint.agent_facing,
            enabled: true,
            running: true,
            port: Some(bind_port),
            target_url: Some(target_url.clone()),
            entrypoint_url: entrypoint.clone(),
        };

        {
            let mut extra = self.extra_routes.write().await;
            extra.insert(selected_alias.clone(), route);
            self.persistence.save_promoted_routes(&extra)?;
        }
        self.append_policy_audit_event(
            "promote",
            format!(
                "promoted discovered endpoint to alias '{}' with protocol '{}'",
                selected_alias, protocol
            ),
            Some(selected_alias.clone()),
        )?;

        Ok(PromoteResult {
            alias: selected_alias,
            protocol,
            service_class: normalize_service_class(
                Some(endpoint.service_class.as_str()),
                route_protocol_for_summary(&target_url, &entrypoint),
                endpoint.agent_facing,
            ),
            agent_facing: endpoint.agent_facing,
            entrypoint_url: entrypoint,
            target_url,
        })
    }

    pub async fn ignore_signature(&self, signature: String) -> Result<(), String> {
        let mut ignored = self.ignored_signatures.write().await;
        ignored.insert(signature.clone());
        self.persistence.save_ignored_signatures(&ignored)?;
        self.persistence.append_audit_event(audit_event(
            "ignore_signature",
            "info",
            format!("suppressed discovered signature '{}'", signature),
            None,
        ))?;
        Ok(())
    }

    pub async fn unignore_signature(&self, signature: &str) -> Result<(), String> {
        let mut ignored = self.ignored_signatures.write().await;
        ignored.remove(signature);
        self.persistence.save_ignored_signatures(&ignored)?;
        self.persistence.append_audit_event(audit_event(
            "unignore_signature",
            "info",
            format!("unsuppressed discovered signature '{}'", signature),
            None,
        ))?;
        Ok(())
    }

    pub async fn evict_dead_extra_routes(&self) -> Result<(), String> {
        let snapshot = self.extra_routes.read().await.clone();
        let mut dead_aliases = Vec::new();

        for (alias, route) in snapshot {
            if route.name.starts_with("promoted-")
                && !self.is_route_alive_quick_instrumented(&route).await
            {
                dead_aliases.push(alias);
            }
        }

        if dead_aliases.is_empty() {
            return Ok(());
        }

        let mut extra = self.extra_routes.write().await;
        for alias in &dead_aliases {
            extra.remove(alias.as_str());
        }
        self.persistence.save_promoted_routes(&extra)?;
        for alias in dead_aliases {
            self.append_policy_audit_event(
                "stale_cleanup",
                format!("removed dead promoted route '{}'", alias),
                Some(alias),
            )?;
        }
        Ok(())
    }

    fn append_policy_audit_event(
        &self,
        event_type: &str,
        message: String,
        route_alias: Option<String>,
    ) -> Result<(), String> {
        let policy = self.audit_policy()?;
        self.persistence.append_audit_event(audit_event(
            event_type,
            severity_for_event(event_type, &policy),
            message,
            route_alias,
        ))
    }

    fn append_detailed_policy_audit_event(
        &self,
        event_type: &str,
        message: String,
        route_alias: Option<String>,
        details: Option<serde_json::Value>,
    ) -> Result<(), String> {
        let policy = self.audit_policy()?;
        self.persistence.append_audit_event(AuditEvent {
            timestamp: crate::control::current_timestamp(),
            event_type: event_type.to_string(),
            severity: severity_for_event(event_type, &policy),
            message,
            route_alias,
            details,
        })
    }

    fn default_metadata_export_dir(&self) -> PathBuf {
        self.data_root
            .join("reports")
            .join("port-manager")
            .join("metadata")
    }

    fn default_connect_probe_dir(&self) -> PathBuf {
        self.data_root
            .join("reports")
            .join("port-manager")
            .join("connect")
    }

    fn resolve_connect_probe_path(&self, generated_at: i64) -> PathBuf {
        self.default_connect_probe_dir()
            .join(format!("connect-stable-probe-{generated_at}.json"))
    }

    fn metadata_dual_path_status(&self) -> serde_json::Value {
        build_metadata_dual_path_status(
            &self.runtime_context,
            &self.data_root,
            self.persistence.db_path(),
            &self.default_metadata_export_dir(),
            &self.default_connect_probe_dir(),
        )
    }

    async fn is_route_alive_quick_instrumented(&self, route: &ServiceRoute) -> bool {
        let protocol = route.protocol.to_ascii_lowercase();
        if protocol != "quic" {
            return is_route_alive_quick(route).await;
        }

        let Some(target) = route
            .target_url
            .as_deref()
            .and_then(parse_addr_from_endpoint)
        else {
            return false;
        };

        self.metrics
            .quic_attempts_total
            .fetch_add(1, Ordering::Relaxed);
        match probe_quic_target(target, Duration::from_millis(300)).await {
            QuicProbeOutcome::Alive => {
                self.metrics
                    .quic_recover_total
                    .fetch_add(1, Ordering::Relaxed);
                true
            }
            QuicProbeOutcome::Timeout => {
                self.metrics
                    .quic_timeout_total
                    .fetch_add(1, Ordering::Relaxed);
                self.metrics
                    .quic_fallback_total
                    .fetch_add(1, Ordering::Relaxed);
                false
            }
            QuicProbeOutcome::Unreachable => {
                self.metrics
                    .quic_unreachable_total
                    .fetch_add(1, Ordering::Relaxed);
                self.metrics
                    .quic_fallback_total
                    .fetch_add(1, Ordering::Relaxed);
                false
            }
            QuicProbeOutcome::IoError => {
                self.metrics
                    .quic_io_error_total
                    .fetch_add(1, Ordering::Relaxed);
                self.metrics
                    .quic_fallback_total
                    .fetch_add(1, Ordering::Relaxed);
                false
            }
        }
    }

    pub fn device_profile_summary(&self) -> DeviceProfileSummary {
        summarize_device_profile(self.device_profile.as_ref(), &self.device_id)
    }

    fn apply_device_profile_templates(&self, discovered: &mut [DiscoveredEndpoint]) {
        for endpoint in discovered.iter_mut() {
            let Some(template) = self.match_device_service_template(endpoint) else {
                continue;
            };
            let service_class = normalize_service_class(
                Some(template.service_class.as_str()),
                &endpoint.protocol,
                template.agent_facing,
            );
            endpoint.service_class = service_class.clone();
            endpoint.agent_facing = is_agent_facing_service(&service_class, template.agent_facing);
            if let Some(alias) = template
                .alias
                .as_ref()
                .filter(|alias| !alias.trim().is_empty())
            {
                endpoint.suggested_alias = alias.trim().to_string();
            }
            endpoint.classification_source = "device_profile_template".to_string();
            endpoint.suggested_action = format!(
                "Matched device profile template '{}'. Promote as managed {} ingress or suppress if intentional.",
                template.name,
                endpoint.service_class
            );
        }
    }

    async fn classify_ai_native_endpoints(&self, discovered: &mut [DiscoveredEndpoint]) {
        for endpoint in discovered.iter_mut() {
            let has_template_hint = self.match_device_service_template(endpoint).is_some();
            let has_profile_probe_hint = self.device_profile.as_ref().is_some_and(|profile| {
                profile.health.mcp_health_path.is_some() || !profile.health.mcp_rpc_paths.is_empty()
            });
            if !should_probe_mcp(endpoint, has_template_hint, has_profile_probe_hint) {
                continue;
            }
            if endpoint.ignored {
                continue;
            }
            let Some(matched_probe) = self.detect_mcp_probe(endpoint).await else {
                continue;
            };
            endpoint.service_class = SERVICE_CLASS_MCP_SERVER.to_string();
            endpoint.agent_facing = true;
            endpoint.classification_source = matched_probe.classification_source;
            endpoint.suggested_alias = self.suggest_mcp_alias(endpoint);
            endpoint.suggested_action = format!(
                "Promote as managed MCP ingress and surface probe path '{}'.",
                matched_probe.probe_path
            );
        }
    }

    async fn detect_mcp_probe(&self, endpoint: &DiscoveredEndpoint) -> Option<McpProbeMatch> {
        if self.mcp_should_probe_health() {
            for probe_path in self.candidate_mcp_health_paths(endpoint) {
                if self.try_http_health_probe(endpoint, &probe_path).await {
                    return Some(McpProbeMatch {
                        classification_source: "mcp_health_probe".to_string(),
                        probe_path,
                    });
                }
            }
        }

        if !self.mcp_should_probe_deep() {
            return None;
        }

        for rpc_path in self.candidate_mcp_rpc_paths(endpoint) {
            if self.try_mcp_initialize_probe(endpoint, &rpc_path).await {
                return Some(McpProbeMatch {
                    classification_source: "mcp_initialize_probe".to_string(),
                    probe_path: rpc_path,
                });
            }
            if self.try_mcp_tools_list_probe(endpoint, &rpc_path).await {
                return Some(McpProbeMatch {
                    classification_source: "mcp_tools_list_probe".to_string(),
                    probe_path: rpc_path,
                });
            }
        }

        None
    }

    fn match_device_service_template(
        &self,
        endpoint: &DiscoveredEndpoint,
    ) -> Option<&DeviceServiceTemplate> {
        let profile = self.device_profile.as_ref()?;
        let process_name = crate::discovery::sanitize_alias(&endpoint.process_name);
        profile
            .service_templates
            .iter()
            .filter_map(|template| {
                score_device_service_template(template, endpoint, &process_name)
                    .map(|score| (template, score))
            })
            .max_by(|left, right| left.1.cmp(&right.1))
            .map(|(template, _)| template)
    }

    fn candidate_mcp_health_paths(&self, endpoint: &DiscoveredEndpoint) -> Vec<String> {
        let mut candidates = Vec::new();
        if let Some(template) = self.match_device_service_template(endpoint) {
            if let Some(path) = template
                .health_path
                .as_ref()
                .filter(|path| !path.trim().is_empty())
            {
                candidates.push(normalize_health_path(path));
            }
        }
        if let Some(path) = self
            .device_profile
            .as_ref()
            .and_then(|profile| profile.health.mcp_health_path.as_ref())
            .filter(|path| !path.trim().is_empty())
        {
            candidates.push(normalize_health_path(path));
        }
        candidates.push("/mcp/health".to_string());
        dedupe_strings(candidates)
    }

    fn candidate_mcp_rpc_paths(&self, endpoint: &DiscoveredEndpoint) -> Vec<String> {
        let mut candidates = Vec::new();
        if let Some(template) = self.match_device_service_template(endpoint) {
            if let Some(path) = template
                .rpc_path
                .as_ref()
                .filter(|path| !path.trim().is_empty())
            {
                candidates.push(normalize_health_path(path));
            }
        }
        if let Some(profile) = self.device_profile.as_ref() {
            candidates.extend(
                profile
                    .health
                    .mcp_rpc_paths
                    .iter()
                    .filter(|path| !path.trim().is_empty())
                    .map(|path| normalize_health_path(path)),
            );
        }
        candidates.push("/mcp".to_string());
        candidates.push("/".to_string());
        dedupe_strings(candidates)
    }

    fn suggest_mcp_alias(&self, endpoint: &DiscoveredEndpoint) -> String {
        if let Some(template) = self.match_device_service_template(endpoint) {
            if let Some(alias) = template
                .alias
                .as_ref()
                .filter(|alias| !alias.trim().is_empty())
            {
                return alias.trim().to_string();
            }
        }
        suggest_mcp_alias(&endpoint.process_name, endpoint.port, &self.device_id)
    }

    fn connect_health_path_hint(&self, route: &ServiceRoute) -> Option<String> {
        if route.service_class != SERVICE_CLASS_MCP_SERVER {
            return None;
        }
        self.device_profile
            .as_ref()
            .and_then(|profile| profile.health.mcp_health_path.clone())
            .or_else(|| Some("/mcp/health".to_string()))
    }

    fn auto_promote_mcp_enabled(&self) -> bool {
        if let Ok(raw) = std::env::var("MUSU_PORT_MCP_AUTO_PROMOTE") {
            return matches!(raw.trim(), "1" | "true" | "True" | "TRUE" | "on" | "ON");
        }

        self.device_profile
            .as_ref()
            .and_then(|profile| profile.transport.auto_promote_mcp)
            .unwrap_or(false)
    }

    fn auto_promote_requires_template(&self) -> bool {
        self.device_profile
            .as_ref()
            .is_some_and(|profile| !profile.service_templates.is_empty())
    }

    fn mcp_probe_timeout(&self) -> Duration {
        let timeout_ms = self
            .device_profile
            .as_ref()
            .and_then(|profile| profile.health.probe_timeout_ms)
            .unwrap_or(250)
            .clamp(50, 2_000);
        Duration::from_millis(timeout_ms)
    }

    fn mcp_probe_mode(&self) -> String {
        self.device_profile
            .as_ref()
            .and_then(|profile| profile.health.mcp_probe_mode.clone())
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "health_then_deep".to_string())
    }

    fn mcp_should_probe_health(&self) -> bool {
        !matches!(self.mcp_probe_mode().as_str(), "deep" | "deep_only")
    }

    fn mcp_should_probe_deep(&self) -> bool {
        !matches!(self.mcp_probe_mode().as_str(), "health" | "shallow")
    }

    async fn try_http_health_probe(&self, endpoint: &DiscoveredEndpoint, probe_path: &str) -> bool {
        let probe_url = format!("http://127.0.0.1:{}{}", endpoint.port, probe_path);
        let Ok(response) = self
            .http_client
            .get(&probe_url)
            .timeout(self.mcp_probe_timeout())
            .send()
            .await
        else {
            return false;
        };

        response.status().is_success()
    }

    async fn try_mcp_initialize_probe(
        &self,
        endpoint: &DiscoveredEndpoint,
        rpc_path: &str,
    ) -> bool {
        self.try_mcp_rpc_probe(
            endpoint,
            rpc_path,
            "initialize",
            serde_json::json!({
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {
                    "name": "musu-port",
                    "version": env!("CARGO_PKG_VERSION"),
                }
            }),
        )
        .await
    }

    async fn try_mcp_tools_list_probe(
        &self,
        endpoint: &DiscoveredEndpoint,
        rpc_path: &str,
    ) -> bool {
        self.try_mcp_rpc_probe(endpoint, rpc_path, "tools/list", serde_json::json!({}))
            .await
    }

    async fn try_mcp_rpc_probe(
        &self,
        endpoint: &DiscoveredEndpoint,
        rpc_path: &str,
        method: &str,
        params: serde_json::Value,
    ) -> bool {
        let probe_url = format!("http://127.0.0.1:{}{}", endpoint.port, rpc_path);
        let Ok(response) = self
            .http_client
            .post(&probe_url)
            .header("accept", "application/json")
            .header("content-type", "application/json")
            .json(&serde_json::json!({
                "jsonrpc": "2.0",
                "id": format!("musu-port-{method}"),
                "method": method,
                "params": params,
            }))
            .timeout(self.mcp_probe_timeout())
            .send()
            .await
        else {
            return false;
        };

        if !response.status().is_success()
            && response.status() != reqwest::StatusCode::BAD_REQUEST
            && response.status() != reqwest::StatusCode::NOT_IMPLEMENTED
        {
            return false;
        }

        let Ok(payload) = response.json::<serde_json::Value>().await else {
            return false;
        };
        payload.get("jsonrpc").and_then(serde_json::Value::as_str) == Some("2.0")
            && (payload.get("result").is_some() || payload.get("error").is_some())
    }
}

fn collect_managed_ports(routes: &[ServiceRoute]) -> HashSet<u16> {
    let mut managed_ports = HashSet::new();
    for route in routes {
        if let Some(port) = route.port {
            managed_ports.insert(port);
        }
        if let Some(target_port) = route
            .target_url
            .as_deref()
            .and_then(parse_addr_from_endpoint)
            .map(|addr| addr.port())
        {
            managed_ports.insert(target_port);
        }
    }
    managed_ports
}

fn derive_uncovered_endpoints(
    external_routes: &[ServiceRoute],
    l4_runners: &[L4RunnerStatus],
) -> Vec<CoverageEndpointGap> {
    let l4_alias_status = l4_runners
        .iter()
        .map(|runner| (runner.alias.clone(), runner.running))
        .collect::<HashMap<_, _>>();
    let mut uncovered = Vec::new();

    for route in external_routes {
        let protocol = route.protocol.to_ascii_lowercase();
        if protocol != "tcp" && protocol != "quic" {
            continue;
        }

        let is_running = l4_alias_status.get(&route.alias).copied().unwrap_or(false);
        if is_running {
            continue;
        }

        uncovered.push(CoverageEndpointGap {
            name: route.name.clone(),
            owner: "port_manager_l4".to_string(),
            severity: "high".to_string(),
            reason: "l4 runner is not active for promoted route".to_string(),
            target_url: route.target_url.clone(),
            suggested_action: "Re-promote route or restart Port Manager to reconcile L4 runner."
                .to_string(),
        });
    }

    uncovered
}

fn should_probe_mcp(
    endpoint: &DiscoveredEndpoint,
    has_template_hint: bool,
    has_profile_probe_hint: bool,
) -> bool {
    let lower = endpoint.process_name.to_ascii_lowercase();
    endpoint.protocol.eq_ignore_ascii_case("tcp")
        && endpoint.service_class != "generic_udp_service"
        && (has_template_hint
            || has_profile_probe_hint
            || endpoint.agent_facing
            || lower.contains("mcp")
            || lower.contains("codex")
            || lower.contains("claude")
            || lower.contains("agent")
            || lower.contains("musu"))
}

fn should_auto_promote_mcp(endpoint: &DiscoveredEndpoint) -> bool {
    endpoint.protocol.eq_ignore_ascii_case("tcp")
        && endpoint.service_class == SERVICE_CLASS_MCP_SERVER
        && endpoint.agent_facing
        && !endpoint.ignored
        && endpoint.exposure == "loopback"
}

fn score_device_service_template(
    template: &DeviceServiceTemplate,
    endpoint: &DiscoveredEndpoint,
    process_name: &str,
) -> Option<i32> {
    let mut score = template.priority.saturating_mul(1_000);
    let mut matched = false;

    if !template.match_protocols.is_empty() {
        let protocol = endpoint.protocol.to_ascii_lowercase();
        let protocol_match = template
            .match_protocols
            .iter()
            .map(|value| value.trim().to_ascii_lowercase())
            .any(|value| value == protocol);
        if !protocol_match {
            return None;
        }
        score += 250;
        matched = true;
    }

    if !template.match_ports.is_empty() {
        if !template.match_ports.contains(&endpoint.port) {
            return None;
        }
        score += 300;
        matched = true;
    }

    let explicit_names = template
        .match_process_names
        .iter()
        .map(|value| crate::discovery::sanitize_alias(value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if !explicit_names.is_empty() {
        if explicit_names.iter().any(|value| value == process_name) {
            score += 500;
            matched = true;
        } else if explicit_names
            .iter()
            .any(|value| process_name.contains(value) || value.contains(process_name))
        {
            score += 250;
            matched = true;
        } else {
            return None;
        }
    } else {
        let template_name = crate::discovery::sanitize_alias(&template.name);
        if !template_name.is_empty() {
            if template_name == process_name {
                score += 400;
                matched = true;
            } else if process_name.contains(&template_name) || template_name.contains(process_name)
            {
                score += 200;
                matched = true;
            }
        }
    }

    let normalized_service_class = normalize_service_class(
        Some(template.service_class.as_str()),
        &endpoint.protocol,
        template.agent_facing,
    );
    if normalized_service_class == endpoint.service_class {
        score += 50;
    }

    matched.then_some(score)
}

fn suggest_mcp_alias(process_name: &str, port: u16, device_id: &str) -> String {
    let sanitized = crate::discovery::sanitize_alias(process_name);
    let device_id = crate::platform::sanitize_device_id(device_id);
    if sanitized.is_empty() {
        return format!("mcp-{device_id}-{port}");
    }
    if sanitized.contains("musu") {
        return format!("musu-desktop-{device_id}");
    }
    format!("mcp-{device_id}-{sanitized}")
}

fn route_protocol_for_summary<'a>(target_url: &'a str, entrypoint_url: &'a str) -> &'a str {
    target_url
        .split_once("://")
        .map(|(protocol, _)| protocol)
        .or_else(|| {
            entrypoint_url
                .split_once("://")
                .map(|(protocol, _)| protocol)
        })
        .unwrap_or("http")
}

fn connect_kind_for_route(route: &ServiceRoute) -> &'static str {
    match route.protocol.as_str() {
        "tcp" | "quic" => "l4_entrypoint",
        _ => "http_alias",
    }
}

fn normalize_health_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        "/mcp/health".to_string()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn dedupe_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            out.push(value);
        }
    }
    out
}

#[derive(Debug, Clone)]
struct McpProbeMatch {
    classification_source: String,
    probe_path: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PromoteResult {
    pub alias: String,
    pub protocol: String,
    pub service_class: String,
    pub agent_facing: bool,
    pub entrypoint_url: String,
    pub target_url: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_managed_ports_includes_l4_target_ports() {
        let routes = vec![ServiceRoute {
            name: "promoted-demo".to_string(),
            alias: "demo".to_string(),
            protocol: "tcp".to_string(),
            service_class: "tcp_ingress".to_string(),
            agent_facing: false,
            enabled: true,
            running: true,
            port: Some(19101),
            target_url: Some("tcp://127.0.0.1:19091".to_string()),
            entrypoint_url: "tcp://127.0.0.1:19101".to_string(),
        }];

        let managed = collect_managed_ports(&routes);
        assert!(managed.contains(&19101));
        assert!(managed.contains(&19091));
    }

    #[test]
    fn derive_uncovered_endpoints_flags_missing_l4_runner() {
        let external_routes = vec![ServiceRoute {
            name: "promoted-demo".to_string(),
            alias: "demo".to_string(),
            protocol: "quic".to_string(),
            service_class: "quic_ingress".to_string(),
            agent_facing: false,
            enabled: true,
            running: true,
            port: Some(19101),
            target_url: Some("quic://127.0.0.1:19091".to_string()),
            entrypoint_url: "quic://127.0.0.1:19101".to_string(),
        }];

        let uncovered = derive_uncovered_endpoints(&external_routes, &[]);
        assert_eq!(uncovered.len(), 1);
        assert_eq!(uncovered[0].owner, "port_manager_l4");
        assert_eq!(uncovered[0].severity, "high");
    }

    #[test]
    fn template_scoring_prefers_exact_process_and_priority() {
        let endpoint = DiscoveredEndpoint {
            signature: "tcp|python3|127.0.0.1|8080".to_string(),
            protocol: "tcp".to_string(),
            service_class: "generic_service".to_string(),
            agent_facing: false,
            classification_source: "baseline".to_string(),
            process_name: "python3".to_string(),
            process_user: Some("hugh51".to_string()),
            pid: Some(10),
            listen_addr: "127.0.0.1".to_string(),
            port: 8080,
            exposure: "loopback".to_string(),
            owner: "external_process".to_string(),
            severity: "high".to_string(),
            false_positive_candidate: false,
            ignored: false,
            suggested_alias: "python3-8080".to_string(),
            suggested_action: "Promote".to_string(),
        };
        let process_name = crate::discovery::sanitize_alias(&endpoint.process_name);
        let exact = DeviceServiceTemplate {
            name: "python3".to_string(),
            service_class: "mcp_server".to_string(),
            alias: Some("exact".to_string()),
            health_path: Some("/mcp/health".to_string()),
            rpc_path: Some("/mcp".to_string()),
            tags: vec![],
            agent_facing: true,
            match_process_names: vec!["python3".to_string()],
            match_protocols: vec!["tcp".to_string()],
            match_ports: vec![8080],
            priority: 10,
        };
        let fuzzy = DeviceServiceTemplate {
            name: "python".to_string(),
            service_class: "mcp_server".to_string(),
            alias: Some("fuzzy".to_string()),
            health_path: Some("/mcp/health".to_string()),
            rpc_path: Some("/mcp".to_string()),
            tags: vec![],
            agent_facing: true,
            match_process_names: vec!["python".to_string()],
            match_protocols: vec!["tcp".to_string()],
            match_ports: vec![],
            priority: 1,
        };

        let exact_score =
            score_device_service_template(&exact, &endpoint, &process_name).expect("exact score");
        let fuzzy_score =
            score_device_service_template(&fuzzy, &endpoint, &process_name).expect("fuzzy score");
        assert!(exact_score > fuzzy_score);
    }
}
