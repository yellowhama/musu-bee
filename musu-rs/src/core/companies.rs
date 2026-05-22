//! companies.yaml loader + writer — wiki/492 §7.
//!
//! Path layout: `$HOME/.musu/companies/<id>.yaml` (Windows: `%USERPROFILE%`).
//! YAML is the **source of truth for templates** but **derived state** for
//! runtime — the DB is authoritative for live runtime queries.
//!
//! Atomic write pattern: serialize → write tempfile → rename → done. The
//! tempfile suffix is `.yaml.tmp`. Mirrors `bridge/handlers/nodes.rs:64-76`
//! (TOML version).
//!
//! **Critic M-4 invariant**: `load_dir` scans for orphaned `*.yaml.tmp`
//! leftovers (crash mid-rename) and removes them with a warn log.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::core::error::CoreError;

/// File-format schema version. R2 supports exactly v1.
pub const COMPANIES_YAML_SCHEMA_VERSION: u32 = 1;

/// Permitted status values.
const STATUS_DRAFT: &str = "draft";
const STATUS_ACTIVE: &str = "active";
const STATUS_ARCHIVED: &str = "archived";

/// On-disk record shape — wiki/492 §7.2.
///
/// Field order is preserved by serde_yaml on emit, giving a stable diff for
/// operators editing by hand. Defaults match the DB defaults in §4.1.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyRecord {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub workspace_id: String,
    #[serde(default = "default_status")]
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub purpose: String,
    #[serde(default)]
    pub work_dir: String,
    #[serde(default = "default_test_cmd")]
    pub test_cmd: String,
    #[serde(default = "default_template_key")]
    pub template_key: String,
    #[serde(default = "default_meta")]
    pub meta: serde_json::Value,
    /// V26-W1 Commit 3 D9 (wiki/509 §8): typed agents list. V24-R6-era
    /// YAML written before adapter_type existed deserializes cleanly via
    /// `AgentRecord`'s defaults + `#[serde(flatten)] extra` capture.
    #[serde(default)]
    pub agents: Vec<AgentRecord>,
}

/// V26-W1 D9 (wiki/509 §8.1). Typed agent record.
///
/// `#[serde(flatten)] extra` captures top-level unknown keys from V24-R6
/// YAML as a JSON object. **Critic HIGH-3 clarification**: `flatten` on a
/// `serde_json::Value` field captures top-level unknown keys whose values
/// are stored as `Value` subtrees. It does NOT recursively flatten nested
/// objects. A nested subtree like `extras_nested: { foo: bar }` is
/// preserved INTACT as an `extra["extras_nested"]` Value::Object — still
/// queryable via `Value::pointer("/extras_nested/foo")`.
///
/// Round-trip stability of `extra` requires `serde_json`'s `preserve_order`
/// feature, enabled in `musu-rs/Cargo.toml` (V26-W1 Commit 3 §8.5).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentRecord {
    pub id: String,
    /// Adapter type discriminator. Defaults to `"claude"` for V24-R6 YAML
    /// written before this field existed. Must match a registry entry in
    /// `adapter::registry::dispatch`.
    #[serde(default = "default_agent_adapter_type")]
    pub adapter_type: String,
    /// Optional per-agent model override (claude model name, ollama model
    /// tag, etc). When `None`, the adapter uses its own default.
    #[serde(default)]
    pub model: Option<String>,
    /// Adapter-specific config blob, passed to the adapter via
    /// `AdapterContext.config_json`. Defaults to `Null`.
    #[serde(default)]
    pub config: serde_json::Value,
    /// Captures top-level unknown keys as a JSON object. Each unknown key's
    /// value is stored as-is (object subtrees preserved, arrays preserved).
    /// MUST come last so `flatten` captures everything not matched above.
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

fn default_agent_adapter_type() -> String {
    "claude".into()
}

fn default_status() -> String {
    STATUS_DRAFT.into()
}

fn default_test_cmd() -> String {
    "python -m pytest -q".into()
}

fn default_template_key() -> String {
    "default".into()
}

fn default_meta() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

impl CompanyRecord {
    /// Validate per wiki/492 §7.4.
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.schema_version != COMPANIES_YAML_SCHEMA_VERSION {
            return Err(CoreError::UnsupportedSchemaVersion(self.schema_version));
        }
        validate_id(&self.id)?;
        if self.name.trim().is_empty() {
            return Err(CoreError::InvalidYaml("name is empty".into()));
        }
        match self.status.as_str() {
            STATUS_DRAFT | STATUS_ACTIVE | STATUS_ARCHIVED => {}
            other => {
                return Err(CoreError::InvalidYaml(format!(
                    "status must be draft|active|archived, got {other:?}"
                )));
            }
        }
        Ok(())
    }
}

/// `^[a-zA-Z0-9._-]{1,64}$` — filesystem-safe, path-traversal-resistant.
fn validate_id(id: &str) -> Result<(), CoreError> {
    if id.is_empty() || id.len() > 64 {
        return Err(CoreError::InvalidId(format!(
            "id length {} not in 1..=64",
            id.len()
        )));
    }
    for c in id.chars() {
        let ok = c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-';
        if !ok {
            return Err(CoreError::InvalidId(format!(
                "id contains illegal char {c:?} (allowed: [a-zA-Z0-9._-])"
            )));
        }
    }
    // Explicit traversal guards even though the regex above forbids them —
    // belt-and-suspenders for clarity in audit logs.
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err(CoreError::InvalidId(format!(
            "id {id:?} contains path traversal sequence"
        )));
    }
    Ok(())
}

/// Resolve the home directory. Falls back per `BridgeConfig::home_dir`
/// semantics (HOME → USERPROFILE → ".").
fn home_dir() -> PathBuf {
    if let Ok(h) = std::env::var("HOME") {
        return PathBuf::from(h);
    }
    if let Ok(u) = std::env::var("USERPROFILE") {
        return PathBuf::from(u);
    }
    PathBuf::from(".")
}

/// `$HOME/.musu/companies`. Created on first write.
///
/// Override with `MUSU_COMPANIES_DIR` (used by tests).
pub fn companies_dir() -> PathBuf {
    if let Ok(override_dir) = std::env::var("MUSU_COMPANIES_DIR") {
        return PathBuf::from(override_dir);
    }
    home_dir().join(".musu").join("companies")
}

/// Serialize + atomic write a single company record to its YAML file.
///
/// Path = `companies_dir()/<id>.yaml`. Tempfile suffix = `.yaml.tmp`.
/// Caller is responsible for record consistency with the DB row.
pub fn write_yaml(record: &CompanyRecord) -> Result<(), CoreError> {
    record.validate()?;

    let dir = companies_dir();
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.yaml", record.id));
    let tmp = path.with_extension("yaml.tmp");

    let yaml = serde_yaml::to_string(record)?;
    std::fs::write(&tmp, yaml)?;
    std::fs::rename(&tmp, &path)?;

    tracing::debug!(id = %record.id, path = %path.display(), "wrote company yaml");
    Ok(())
}

/// Read a YAML file at `companies_dir()/<id>.yaml` into a CompanyRecord.
///
/// R2 ships the function; R3 indexer module will call it. Suppressing the
/// dead_code warning at R2 to keep clippy `-D warnings` green.
#[allow(dead_code)]
pub fn load_yaml(id: &str) -> Result<CompanyRecord, CoreError> {
    validate_id(id)?;
    let path = companies_dir().join(format!("{id}.yaml"));
    load_yaml_at(&path)
}

/// Read a YAML file at an explicit path.
pub fn load_yaml_at(path: &Path) -> Result<CompanyRecord, CoreError> {
    let text = std::fs::read_to_string(path)?;
    let record: CompanyRecord = serde_yaml::from_str(&text)
        .map_err(|e| CoreError::InvalidYaml(format!("{}: {e}", path.display())))?;
    record.validate()?;
    Ok(record)
}

/// Scan `companies_dir()` for valid YAML files; return parsed records.
///
/// Side effect (Critic M-4): orphaned `*.yaml.tmp` files left behind by a
/// crash mid-rename are deleted with a `warn` log. The directory may not
/// exist yet (first run); we treat that as an empty list.
///
/// R2 ships the function but no R1 handler consumes it yet (handlers read
/// from DB, which is canonical). R3 indexer module will use it.
#[allow(dead_code)]
pub fn load_dir() -> Result<Vec<CompanyRecord>, CoreError> {
    let dir = companies_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_owned(),
            None => continue,
        };

        if file_name.ends_with(".yaml.tmp") {
            tracing::warn!(
                path = %path.display(),
                "removing orphaned company yaml tempfile (crash mid-rename?)"
            );
            // Best-effort removal; do not fail load_dir on a stale tmp.
            if let Err(e) = std::fs::remove_file(&path) {
                tracing::warn!(error = %e, path = %path.display(), "failed to remove orphan tmp");
            }
            continue;
        }

        if !file_name.ends_with(".yaml") {
            continue;
        }

        match load_yaml_at(&path) {
            Ok(rec) => out.push(rec),
            Err(e) => {
                tracing::warn!(
                    error = %e,
                    path = %path.display(),
                    "skipping malformed company yaml"
                );
            }
        }
    }
    Ok(out)
}

/// Construct a record from R1's create-request shape, filling defaults.
///
/// Convenience helper for `bridge::handlers::companies::create` post-INSERT
/// — see wiki/492 §7.6. Argument count exceeds clippy's default (7) because
/// it mirrors the DB column set; refactoring to a builder would add LOC
/// without semantic benefit at R2 scale.
#[allow(clippy::too_many_arguments)]
pub fn record_from_create(
    id: &str,
    name: &str,
    workspace_id: &str,
    status: &str,
    created_at: i64,
    updated_at: i64,
    purpose: &str,
    work_dir: &str,
    test_cmd: &str,
    meta: serde_json::Value,
) -> CompanyRecord {
    CompanyRecord {
        schema_version: COMPANIES_YAML_SCHEMA_VERSION,
        id: id.to_owned(),
        name: name.to_owned(),
        workspace_id: workspace_id.to_owned(),
        status: status.to_owned(),
        created_at,
        updated_at,
        purpose: purpose.to_owned(),
        work_dir: work_dir.to_owned(),
        test_cmd: test_cmd.to_owned(),
        template_key: default_template_key(),
        meta,
        agents: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // companies_dir() reads an env var; tests must serialize to avoid races.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn isolate_dir() -> (PathBuf, std::sync::MutexGuard<'static, ()>) {
        let g = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "musu-rs-companies-test-{}",
            uuid::Uuid::new_v4().simple()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::env::set_var("MUSU_COMPANIES_DIR", &dir);
        (dir, g)
    }

    fn sample_record(id: &str) -> CompanyRecord {
        CompanyRecord {
            schema_version: 1,
            id: id.to_owned(),
            name: "테스트 회사".into(),
            workspace_id: "ws1".into(),
            status: "active".into(),
            created_at: 1700000000,
            updated_at: 1700000001,
            purpose: "purpose".into(),
            work_dir: "F:/dev/x".into(),
            test_cmd: "pytest -q".into(),
            template_key: "default".into(),
            meta: serde_json::json!({"language": "python"}),
            agents: vec![],
        }
    }

    #[test]
    fn yaml_roundtrip_preserves_all_fields() {
        let (_dir, _g) = isolate_dir();
        let rec = sample_record("test-co.1");
        write_yaml(&rec).unwrap();
        let back = load_yaml(&rec.id).unwrap();
        assert_eq!(back.schema_version, rec.schema_version);
        assert_eq!(back.id, rec.id);
        assert_eq!(back.name, rec.name);
        assert_eq!(back.workspace_id, rec.workspace_id);
        assert_eq!(back.status, rec.status);
        assert_eq!(back.created_at, rec.created_at);
        assert_eq!(back.updated_at, rec.updated_at);
        assert_eq!(back.purpose, rec.purpose);
        assert_eq!(back.work_dir, rec.work_dir);
        assert_eq!(back.test_cmd, rec.test_cmd);
        assert_eq!(back.template_key, rec.template_key);
        assert_eq!(back.meta, rec.meta);
    }

    #[test]
    fn yaml_rejects_unsupported_schema_version() {
        let (dir, _g) = isolate_dir();
        let bad = dir.join("bad.yaml");
        std::fs::write(
            &bad,
            "schema_version: 99\nid: bad\nname: x\ncreated_at: 0\nupdated_at: 0\n",
        )
        .unwrap();
        match load_yaml_at(&bad) {
            Err(CoreError::UnsupportedSchemaVersion(99)) => {}
            other => panic!("expected UnsupportedSchemaVersion(99); got {other:?}"),
        }
    }

    #[test]
    fn yaml_rejects_id_with_traversal() {
        // Each illegal id should be rejected by validate_id.
        for bad in [
            "../etc/passwd",
            "..",
            "a/b",
            "a\\b",
            "",
            &"x".repeat(65),
            "has space",
            "a!b",
        ] {
            let res = validate_id(bad);
            assert!(res.is_err(), "id {bad:?} should have been rejected");
        }
        // Sanity: legal ids pass.
        for good in ["land-os", "land-os.1", "abc_123", "X"] {
            validate_id(good).unwrap_or_else(|e| panic!("id {good:?} rejected: {e}"));
        }
    }

    #[test]
    fn write_rejects_invalid_record() {
        let (_dir, _g) = isolate_dir();
        let mut bad = sample_record("x");
        bad.name = "   ".into();
        let r = write_yaml(&bad);
        assert!(r.is_err(), "empty name must reject");
    }

    #[test]
    fn load_dir_removes_orphaned_tmp() {
        // Critic M-4: load_dir() must remove *.yaml.tmp left over from
        // crashed writes and continue without erroring on them.
        let (dir, _g) = isolate_dir();

        // Place one valid YAML.
        let good = sample_record("good");
        write_yaml(&good).unwrap();

        // Place an orphaned tmp file.
        let orphan = dir.join("crashed.yaml.tmp");
        std::fs::write(&orphan, "schema_version: 1\nid: x\nname: y\n").unwrap();
        assert!(orphan.exists());

        // Place a malformed YAML — should be skipped, not error.
        let bad = dir.join("broken.yaml");
        std::fs::write(&bad, "schema_version: 1\n!@#$ not valid").unwrap();

        let rows = load_dir().unwrap();
        assert_eq!(rows.len(), 1, "only the valid record should load");
        assert_eq!(rows[0].id, "good");
        assert!(!orphan.exists(), "orphan tmp must have been removed");
    }

    #[test]
    fn load_dir_returns_empty_when_dir_missing() {
        // First-run case: companies dir doesn't exist yet.
        let _g = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "musu-rs-companies-missing-{}",
            uuid::Uuid::new_v4().simple()
        ));
        // Do NOT create it.
        std::env::set_var("MUSU_COMPANIES_DIR", &dir);
        let rows = load_dir().unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn atomic_write_via_tempfile() {
        // After a successful write, no .yaml.tmp should remain.
        let (dir, _g) = isolate_dir();
        let rec = sample_record("atomic");
        write_yaml(&rec).unwrap();
        let final_path = dir.join("atomic.yaml");
        let tmp_path = dir.join("atomic.yaml.tmp");
        assert!(final_path.exists(), "final yaml file should exist");
        assert!(!tmp_path.exists(), "tempfile should be renamed away");
    }
}
