//! V26-W1 Commit 3 (wiki/509 §8.4) — AgentRecord backward-compat tests.
//!
//! Three tests:
//!   1. `deserializes_v24_r6_yaml_without_adapter_type` — V24-R6-era YAML
//!      (which had no `adapter_type` field) deserializes cleanly via
//!      the `#[serde(default)]` defaults + `#[serde(flatten)] extra` capture.
//!   2. `extras_nested_subtree_preserved_as_object` — Critic HIGH-3 sub-test
//!      proving nested subtrees (e.g. `extras_nested: { foo: bar }`) are
//!      preserved INTACT as `Value::Object` inside `extra`, NOT recursively
//!      flattened away.
//!   3. `roundtrip_preserves_unknown_fields` — deserialize → serialize →
//!      deserialize round-trip preserves all V24-R6 unknown fields, with
//!      string-level invariant assertions so the test passes regardless
//!      of `serde_json::Map` key ordering.

use musu_rs::core::companies::CompanyRecord;

const V24_R6_SYNTHETIC: &str = r#"
schema_version: 1
id: legacy-co
name: legacy
workspace_id: ws-1
status: active
created_at: 1700000000
updated_at: 1700000001
purpose: ""
work_dir: ""
test_cmd: "pytest -q"
template_key: default
meta: {}
agents:
  - id: agent-1
    role: ceo                          # V24-R6 unknown field
    invocation: "claude --print"       # V24-R6 unknown field
    extras_nested:
      foo: bar
      tools: [search, edit]
  - id: agent-2
    adapter_type: openai_compat_local
    model: qwen2.5-32b
    config:
      base_url: "http://localhost:11434/v1"
      backend: ollama
"#;

#[test]
fn deserializes_v24_r6_yaml_without_adapter_type() {
    let rec: CompanyRecord = serde_yaml::from_str(V24_R6_SYNTHETIC).expect("deserialize");
    assert_eq!(rec.agents.len(), 2);

    // Agent 1: had no adapter_type field → default "claude".
    assert_eq!(rec.agents[0].id, "agent-1");
    assert_eq!(
        rec.agents[0].adapter_type, "claude",
        "V24-R6 agent missing adapter_type must default to \"claude\""
    );
    assert_eq!(rec.agents[0].model, None);

    // Unknown V24-R6 fields preserved in `extra`.
    let extra = &rec.agents[0].extra;
    assert_eq!(
        extra.get("role").and_then(|v| v.as_str()),
        Some("ceo"),
        "V24-R6 `role` field must survive in extra"
    );
    assert_eq!(
        extra.get("invocation").and_then(|v| v.as_str()),
        Some("claude --print"),
        "V24-R6 `invocation` field must survive in extra"
    );
    assert_eq!(
        extra.pointer("/extras_nested/foo").and_then(|v| v.as_str()),
        Some("bar"),
        "deep pointer into nested extra subtree must work"
    );

    // Agent 2: explicit modern shape.
    assert_eq!(rec.agents[1].adapter_type, "openai_compat_local");
    assert_eq!(rec.agents[1].model.as_deref(), Some("qwen2.5-32b"));
    assert_eq!(
        rec.agents[1]
            .config
            .pointer("/backend")
            .and_then(|v| v.as_str()),
        Some("ollama"),
        "agent-2.config.backend should be queryable"
    );
}

#[test]
fn extras_nested_subtree_preserved_as_object() {
    // Critic HIGH-3 sub-test: serde flatten does NOT recurse into nested
    // objects; it captures top-level unknown keys whose values are stored
    // as Value subtrees. Verify the subtree is queryable via Value::pointer.
    let rec: CompanyRecord = serde_yaml::from_str(V24_R6_SYNTHETIC).unwrap();
    let extra = &rec.agents[0].extra;
    let extras_nested = extra
        .get("extras_nested")
        .expect("extras_nested should be a top-level entry in extra");
    assert!(
        extras_nested.is_object(),
        "extras_nested should be preserved as Value::Object, not flattened away; got {extras_nested:?}"
    );
    assert_eq!(
        extras_nested.pointer("/tools/0").and_then(|v| v.as_str()),
        Some("search"),
        "deep pointer into the preserved nested subtree should work"
    );
    assert_eq!(
        extras_nested.pointer("/tools/1").and_then(|v| v.as_str()),
        Some("edit"),
        "deep pointer into the preserved nested subtree array element should work"
    );
}

#[test]
fn roundtrip_preserves_unknown_fields() {
    let rec: CompanyRecord = serde_yaml::from_str(V24_R6_SYNTHETIC).unwrap();
    let yaml_out = serde_yaml::to_string(&rec).expect("serialize");
    let rec2: CompanyRecord = serde_yaml::from_str(&yaml_out).expect("re-deserialize");

    assert_eq!(
        rec.agents, rec2.agents,
        "round-trip must preserve all fields including `extra` \
         (Value PartialEq is order-independent for maps)"
    );

    // Critic HIGH-3 string-level invariant: regardless of map key ordering,
    // the V24-R6 unknown fields must appear in the emitted YAML.
    assert!(
        yaml_out.contains("role"),
        "V24-R6 `role` field must survive round-trip; got:\n{yaml_out}"
    );
    assert!(
        yaml_out.contains("extras_nested"),
        "V24-R6 `extras_nested` field must survive round-trip; got:\n{yaml_out}"
    );
    assert!(
        yaml_out.contains("invocation"),
        "V24-R6 `invocation` field must survive round-trip; got:\n{yaml_out}"
    );
    // Modern agent fields too.
    assert!(
        yaml_out.contains("openai_compat_local"),
        "modern adapter_type must survive round-trip; got:\n{yaml_out}"
    );
    assert!(
        yaml_out.contains("qwen2.5-32b"),
        "modern model must survive round-trip; got:\n{yaml_out}"
    );
}
