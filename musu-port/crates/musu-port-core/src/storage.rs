use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::control::{AuditPolicy, ConnectProbeHistoryEntry, MetadataExportHistoryEntry};
use crate::route::ServiceRoute;

pub const PORT_MANAGER_IGNORED_SIGNATURES_KEY: &str = "port_manager.ignored_signatures";
pub const PORT_MANAGER_PROMOTED_ROUTES_KEY: &str = "port_manager.promoted_routes";
pub const PORT_MANAGER_AUDIT_EVENTS_KEY: &str = "port_manager.audit_events";
pub const PORT_MANAGER_AUDIT_POLICY_KEY: &str = "port_manager.audit_policy";
pub const PORT_MANAGER_CONNECT_MODE_KEY: &str = "port_manager.connect_mode";
pub const PORT_MANAGER_METADATA_EXPORT_HISTORY_KEY: &str = "port_manager.metadata_export_history";
pub const PORT_MANAGER_CONNECT_PROBE_HISTORY_KEY: &str = "port_manager.connect_probe_history";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub timestamp: i64,
    pub event_type: String,
    pub severity: String,
    pub message: String,
    pub route_alias: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct Persistence {
    db_path: PathBuf,
}

impl Persistence {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| {
                format!(
                    "failed to create persistence directory '{}': {err}",
                    parent.display()
                )
            })?;
        }

        let this = Self { db_path };
        this.init()?;
        Ok(this)
    }

    pub fn load_promoted_routes(&self) -> Result<HashMap<String, ServiceRoute>, String> {
        let routes = self
            .load_json::<Vec<ServiceRoute>>(PORT_MANAGER_PROMOTED_ROUTES_KEY)?
            .unwrap_or_default();
        let mut out = HashMap::new();
        for route in routes {
            if route.alias.trim().is_empty() {
                continue;
            }
            out.insert(route.alias.clone(), route);
        }
        Ok(out)
    }

    pub fn save_promoted_routes(
        &self,
        routes: &HashMap<String, ServiceRoute>,
    ) -> Result<(), String> {
        let mut serialized = routes.values().cloned().collect::<Vec<_>>();
        serialized.sort_by(|a, b| a.alias.cmp(&b.alias));
        self.save_json(PORT_MANAGER_PROMOTED_ROUTES_KEY, &serialized)
    }

    pub fn load_ignored_signatures(&self) -> Result<HashSet<String>, String> {
        let list = self
            .load_json::<Vec<String>>(PORT_MANAGER_IGNORED_SIGNATURES_KEY)?
            .unwrap_or_default();
        Ok(list.into_iter().collect())
    }

    pub fn save_ignored_signatures(&self, signatures: &HashSet<String>) -> Result<(), String> {
        let mut list = signatures.iter().cloned().collect::<Vec<_>>();
        list.sort();
        self.save_json(PORT_MANAGER_IGNORED_SIGNATURES_KEY, &list)
    }

    pub fn load_audit_events(&self) -> Result<Vec<AuditEvent>, String> {
        let mut events = self
            .load_json::<Vec<AuditEvent>>(PORT_MANAGER_AUDIT_EVENTS_KEY)?
            .unwrap_or_default();
        events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(events)
    }

    pub fn append_audit_event(&self, event: AuditEvent) -> Result<(), String> {
        let mut events = self.load_audit_events()?;
        events.push(event);
        events.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        if events.len() > 200 {
            events.truncate(200);
        }
        self.save_json(PORT_MANAGER_AUDIT_EVENTS_KEY, &events)
    }

    pub fn save_audit_events(&self, events: &[AuditEvent]) -> Result<(), String> {
        self.save_json(PORT_MANAGER_AUDIT_EVENTS_KEY, events)
    }

    pub fn load_audit_policy(&self) -> Result<Option<AuditPolicy>, String> {
        self.load_json(PORT_MANAGER_AUDIT_POLICY_KEY)
    }

    pub fn save_audit_policy(&self, policy: &AuditPolicy) -> Result<(), String> {
        self.save_json(PORT_MANAGER_AUDIT_POLICY_KEY, policy)
    }

    pub fn load_connect_mode(&self) -> Result<Option<String>, String> {
        self.load_json(PORT_MANAGER_CONNECT_MODE_KEY)
    }

    pub fn save_connect_mode(&self, mode: &str) -> Result<(), String> {
        self.save_json(PORT_MANAGER_CONNECT_MODE_KEY, &mode)
    }

    pub fn load_metadata_export_history(&self) -> Result<Vec<MetadataExportHistoryEntry>, String> {
        let mut history = self
            .load_json::<Vec<MetadataExportHistoryEntry>>(PORT_MANAGER_METADATA_EXPORT_HISTORY_KEY)?
            .unwrap_or_default();
        history.sort_by(|a, b| b.generated_at.cmp(&a.generated_at));
        Ok(history)
    }

    pub fn save_metadata_export_history(
        &self,
        history: &[MetadataExportHistoryEntry],
    ) -> Result<(), String> {
        self.save_json(PORT_MANAGER_METADATA_EXPORT_HISTORY_KEY, history)
    }

    pub fn load_connect_probe_history(&self) -> Result<Vec<ConnectProbeHistoryEntry>, String> {
        let mut history = self
            .load_json::<Vec<ConnectProbeHistoryEntry>>(PORT_MANAGER_CONNECT_PROBE_HISTORY_KEY)?
            .unwrap_or_default();
        history.sort_by(|a, b| b.generated_at.cmp(&a.generated_at));
        Ok(history)
    }

    pub fn save_connect_probe_history(
        &self,
        history: &[ConnectProbeHistoryEntry],
    ) -> Result<(), String> {
        self.save_json(PORT_MANAGER_CONNECT_PROBE_HISTORY_KEY, history)
    }

    pub fn db_path(&self) -> &PathBuf {
        &self.db_path
    }

    fn init(&self) -> Result<(), String> {
        let conn = self.open()?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ",
        )
        .map_err(|err| format!("failed to initialize settings table: {err}"))?;
        Ok(())
    }

    fn open(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|err| {
            format!(
                "failed to open sqlite db '{}': {err}",
                self.db_path.display()
            )
        })
    }

    fn load_json<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, String> {
        let conn = self.open()?;
        let raw = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|err| format!("failed reading setting '{key}': {err}"))?;

        match raw {
            Some(raw) => serde_json::from_str::<T>(&raw)
                .map(Some)
                .map_err(|err| format!("failed to parse setting '{key}': {err}")),
            None => Ok(None),
        }
    }

    fn save_json<T: Serialize + ?Sized>(&self, key: &str, value: &T) -> Result<(), String> {
        let conn = self.open()?;
        let raw = serde_json::to_string(value)
            .map_err(|err| format!("failed to serialize setting '{key}': {err}"))?;
        conn.execute(
            "
            INSERT INTO settings (key, value, updated_at)
            VALUES (?1, ?2, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = CURRENT_TIMESTAMP
            ",
            params![key, raw],
        )
        .map_err(|err| format!("failed to write setting '{key}': {err}"))?;
        Ok(())
    }
}

pub fn audit_event(
    event_type: impl Into<String>,
    severity: impl Into<String>,
    message: impl Into<String>,
    route_alias: Option<String>,
) -> AuditEvent {
    AuditEvent {
        timestamp: current_timestamp(),
        event_type: event_type.into(),
        severity: severity.into(),
        message: message.into(),
        route_alias,
        details: None,
    }
}

fn current_timestamp() -> i64 {
    static LAST_TIMESTAMP: AtomicI64 = AtomicI64::new(0);

    let mut candidate = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as i64)
        .unwrap_or(0);

    loop {
        let previous = LAST_TIMESTAMP.load(Ordering::Relaxed);
        if candidate <= previous {
            candidate = previous + 1;
        }
        match LAST_TIMESTAMP.compare_exchange(
            previous,
            candidate,
            Ordering::SeqCst,
            Ordering::Relaxed,
        ) {
            Ok(_) => return candidate,
            Err(observed) => {
                if candidate <= observed {
                    candidate = observed + 1;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("musu-port-{label}-{nanos}.db"))
    }

    #[test]
    fn persistence_roundtrips_promoted_routes_and_ignored_signatures() {
        let db_path = temp_db_path("roundtrip");
        let persistence = Persistence::new(db_path.clone()).expect("create persistence");

        let mut routes = HashMap::new();
        routes.insert(
            "demo-tcp".to_string(),
            ServiceRoute {
                name: "promoted-demo-tcp".to_string(),
                alias: "demo-tcp".to_string(),
                protocol: "tcp".to_string(),
                service_class: "tcp_ingress".to_string(),
                agent_facing: false,
                enabled: true,
                running: true,
                port: Some(19101),
                target_url: Some("tcp://127.0.0.1:19091".to_string()),
                entrypoint_url: "tcp://127.0.0.1:19101".to_string(),
            },
        );
        persistence
            .save_promoted_routes(&routes)
            .expect("save promoted routes");

        let ignored = ["tcp|echo|127.0.0.1|19091".to_string()]
            .into_iter()
            .collect::<HashSet<_>>();
        persistence
            .save_ignored_signatures(&ignored)
            .expect("save ignored signatures");

        let loaded_routes = persistence
            .load_promoted_routes()
            .expect("load promoted routes");
        let loaded_ignored = persistence
            .load_ignored_signatures()
            .expect("load ignored signatures");

        assert_eq!(loaded_routes.len(), 1);
        assert_eq!(
            loaded_routes
                .get("demo-tcp")
                .and_then(|route| route.target_url.as_deref()),
            Some("tcp://127.0.0.1:19091")
        );
        assert!(loaded_ignored.contains("tcp|echo|127.0.0.1|19091"));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn audit_log_is_capped_to_200_entries() {
        let db_path = temp_db_path("audit-cap");
        let persistence = Persistence::new(db_path.clone()).expect("create persistence");

        for idx in 0..250 {
            persistence
                .append_audit_event(audit_event("test", "info", format!("event-{idx}"), None))
                .expect("append audit event");
        }

        let events = persistence.load_audit_events().expect("load audit events");
        assert_eq!(events.len(), 200);
        assert_eq!(
            events.first().map(|event| event.message.as_str()),
            Some("event-249")
        );
        assert_eq!(
            events.last().map(|event| event.message.as_str()),
            Some("event-50")
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn connect_probe_history_roundtrips() {
        let db_path = temp_db_path("connect-probe");
        let persistence = Persistence::new(db_path.clone()).expect("create persistence");

        let history = vec![ConnectProbeHistoryEntry {
            generated_at: 42,
            sample_count: 5,
            stable_ready_ratio: 0.6,
            blocked_samples: 2,
            report_path: Some("/tmp/report.json".to_string()),
        }];
        persistence
            .save_connect_probe_history(&history)
            .expect("save connect probe history");

        let loaded = persistence
            .load_connect_probe_history()
            .expect("load connect probe history");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].generated_at, 42);
        assert_eq!(loaded[0].report_path.as_deref(), Some("/tmp/report.json"));

        let _ = std::fs::remove_file(db_path);
    }
}
