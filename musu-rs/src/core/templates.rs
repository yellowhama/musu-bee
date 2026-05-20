//! Embedded templates — wiki/492 §8.
//!
//! R2 ships exactly one template (`default`); non-default keys return
//! `None`. R1 already returns 501 for non-default `template_key` (see
//! `handlers/companies.rs:126-131`); this module exists so R3+ can grow
//! the catalog without revisiting binary layout.
//!
//! Per [[feedback-self-contained-product]], templates compile INTO the
//! binary — never fetched from network, never read from disk at runtime.
//!
//! R2 ships the surface but no R1 handler consumes it yet; R3 wires
//! `template_key != "default"` paths. `#[allow(dead_code)]` prevents
//! clippy `-D warnings` failure at R2 ship.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};

use crate::core::error::CoreError;

/// YAML body of the `default` template. Frozen at schema_version=1.
///
/// Operators may override fields at create time (purpose, work_dir, etc.);
/// this template only seeds the unset defaults.
pub const DEFAULT_TEMPLATE_YAML: &str = r#"schema_version: 1
template_key: default
status: draft
test_cmd: python -m pytest -q
meta:
  language: ""
  tags: []
"#;

/// Parsed template shape. R2 uses only `template_key`, `status`,
/// `test_cmd`, and `meta`; future fields land here as additive optionals.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateBlueprint {
    pub schema_version: u32,
    pub template_key: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default = "default_test_cmd")]
    pub test_cmd: String,
    #[serde(default = "default_meta")]
    pub meta: serde_json::Value,
}

fn default_status() -> String {
    "draft".into()
}

fn default_test_cmd() -> String {
    "python -m pytest -q".into()
}

fn default_meta() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

/// Lookup a template by key. Returns `None` for unknown keys (caller
/// translates to HTTP 501 / 404 as appropriate).
pub fn resolve(template_key: &str) -> Option<TemplateBlueprint> {
    match template_key {
        "default" => Some(parse(DEFAULT_TEMPLATE_YAML).expect("default template malformed")),
        _ => None,
    }
}

fn parse(yaml: &str) -> Result<TemplateBlueprint, CoreError> {
    let bp: TemplateBlueprint =
        serde_yaml::from_str(yaml).map_err(|e| CoreError::InvalidYaml(format!("template: {e}")))?;
    if bp.schema_version != 1 {
        return Err(CoreError::UnsupportedSchemaVersion(bp.schema_version));
    }
    Ok(bp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_template_parses() {
        let bp = resolve("default").expect("default present");
        assert_eq!(bp.schema_version, 1);
        assert_eq!(bp.template_key, "default");
        assert_eq!(bp.status, "draft");
        assert_eq!(bp.test_cmd, "python -m pytest -q");
    }

    #[test]
    fn unknown_template_returns_none() {
        assert!(resolve("nonexistent").is_none());
        assert!(resolve("").is_none());
    }
}
