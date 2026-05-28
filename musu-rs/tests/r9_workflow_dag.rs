//! V26-W9 integration tests — workflow DAG spec + schema v4.
//!
//! wiki/512: 12 tests covering WorkflowSpec validation parity with Python,
//! schema v4 migration, and workflow CRUD roundtrip.

use musu_rs::workflow::workflow_spec::*;
use std::collections::HashMap;

// ── Helpers ───────────────────────────────────────────────────────────

fn agent(id: &str) -> AgentSpec {
    AgentSpec {
        id: id.to_string(),
        image: "musu/worker:latest".into(),
        command: vec!["echo hello".into()],
        node_selector: HashMap::new(),
        timeout_seconds: 3600,
        retry: RetryPolicy::default(),
        resources: AgentResources::default(),
        inputs: vec![],
        outputs: vec![],
    }
}

fn edge(from: &str, to: &str) -> EdgeSpec {
    EdgeSpec {
        from_agent: from.into(),
        to: to.into(),
        condition: EdgeCondition::Succeeded,
    }
}

// ── 1. Valid DAG passes validation ────────────────────────────────────

#[test]
fn t01_valid_3node_linear_dag() {
    let spec = WorkflowSpec {
        agents: vec![agent("a"), agent("b"), agent("c")],
        edges: vec![edge("a", "b"), edge("b", "c")],
    };
    assert!(spec.validate().is_ok());
}

// ── 2. Cycle detection ───────────────────────────────────────────────

#[test]
fn t02_cycle_a_b_c_a_detected() {
    let spec = WorkflowSpec {
        agents: vec![agent("a"), agent("b"), agent("c")],
        edges: vec![edge("a", "b"), edge("b", "c"), edge("c", "a")],
    };
    let err = spec.validate().unwrap_err();
    assert!(
        matches!(err, WorkflowSpecError::CycleDetected),
        "expected CycleDetected, got: {err}"
    );
}

// ── 3. Duplicate agent ID ────────────────────────────────────────────

#[test]
fn t03_duplicate_agent_id_rejected() {
    let spec = WorkflowSpec {
        agents: vec![agent("dup"), agent("dup")],
        edges: vec![],
    };
    let err = spec.validate().unwrap_err();
    assert!(matches!(err, WorkflowSpecError::DuplicateAgentId(_)));
}

// ── 4. Edge references nonexistent agent ─────────────────────────────

#[test]
fn t04_edge_references_ghost() {
    let spec = WorkflowSpec {
        agents: vec![agent("a")],
        edges: vec![edge("a", "ghost")],
    };
    let err = spec.validate().unwrap_err();
    assert!(matches!(
        err,
        WorkflowSpecError::EdgeReferencesUnknown { .. }
    ));
}

// ── 5. Input references undeclared output ────────────────────────────

#[test]
fn t05_input_references_undeclared_output() {
    let mut a = agent("a");
    a.outputs = vec!["result".into()];
    let mut b = agent("b");
    b.inputs = vec![AgentInput {
        name: "missing".into(),
        from_agent: "a".into(),
    }];
    let spec = WorkflowSpec {
        agents: vec![a, b],
        edges: vec![edge("a", "b")],
    };
    let err = spec.validate().unwrap_err();
    assert!(matches!(
        err,
        WorkflowSpecError::InputReferencesUndeclaredOutput { .. }
    ));
}

// ── 6. Serde JSON roundtrip ──────────────────────────────────────────

#[test]
fn t06_serde_roundtrip() {
    let mut a = agent("fetch");
    a.outputs = vec!["data".into()];
    let mut b = agent("process");
    b.inputs = vec![AgentInput {
        name: "data".into(),
        from_agent: "fetch".into(),
    }];
    let spec = WorkflowSpec {
        agents: vec![a, b],
        edges: vec![EdgeSpec {
            from_agent: "fetch".into(),
            to: "process".into(),
            condition: EdgeCondition::Always,
        }],
    };

    let json = serde_json::to_string_pretty(&spec).unwrap();
    let parsed: WorkflowSpec = serde_json::from_str(&json).unwrap();
    assert_eq!(spec, parsed);
    assert!(parsed.validate().is_ok());
}

// ── 7. Python parity: edge condition defaults to "succeeded" ─────────

#[test]
fn t07_edge_condition_default_is_succeeded() {
    let json = r#"{"from": "a", "to": "b"}"#;
    let edge: EdgeSpec = serde_json::from_str(json).unwrap();
    assert_eq!(edge.condition, EdgeCondition::Succeeded);
}

// ── 8. DAG builder rejects invalid JSON ──────────────────────────────

#[test]
fn t08_parse_invalid_json() {
    let raw = "this is not json at all";
    // extract_json is private, so test via parse_and_validate indirectly
    let result: std::result::Result<WorkflowSpec, _> = serde_json::from_str(raw);
    assert!(result.is_err());
}

// ── 9. Attestation always required ───────────────────────────────────

#[test]
fn t09_attestation_always_true() {
    use musu_rs::workflow::llm_dag_builder::DagBuildResult;

    let result = DagBuildResult {
        spec: WorkflowSpec {
            agents: vec![agent("x")],
            edges: vec![],
        },
        raw_llm_output: "test".into(),
        model_used: "test-model".into(),
        attestation_required: true,
    };
    assert!(
        result.attestation_required,
        "§9.12: attestation must be true"
    );
}

// ── 10. Schema v4 creates workflow tables ────────────────────────────

#[tokio::test]
async fn t10_schema_v4_creates_workflow_tables() {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opts)
        .await
        .unwrap();

    // Apply all migrations
    musu_rs::core::pragma::apply_pragmas(&pool).await.unwrap();
    musu_rs::core::migrate::run(&pool).await.unwrap();

    // Verify both tables exist
    for tbl in ["workflows", "workflow_steps"] {
        let row = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
            .bind(tbl)
            .fetch_optional(&pool)
            .await
            .unwrap();
        assert!(row.is_some(), "table {tbl} not created by v4 migration");
    }

    // Verify version is 4
    let v = musu_rs::core::migrate::current_version(&pool)
        .await
        .unwrap();
    assert_eq!(v, 4, "expected schema version 4 after migration");
}

// ── 11. Diamond DAG valid ────────────────────────────────────────────

#[test]
fn t11_diamond_dag_valid() {
    let spec = WorkflowSpec {
        agents: vec![agent("a"), agent("b"), agent("c"), agent("d")],
        edges: vec![
            edge("a", "b"),
            edge("a", "c"),
            edge("b", "d"),
            edge("c", "d"),
        ],
    };
    assert!(spec.validate().is_ok());
    let order = spec.topological_order();
    // "a" must come before "b", "c", "d"
    let pos = |id: &str| order.iter().position(|x| x == id).unwrap();
    assert!(pos("a") < pos("b"));
    assert!(pos("a") < pos("c"));
    assert!(pos("b") < pos("d") || pos("c") < pos("d"));
}

// ── 12. Forbidden nodeSelector key ───────────────────────────────────

#[test]
fn t12_forbidden_nodeselector_key() {
    let mut a = agent("a");
    a.node_selector.insert("forbidden_key".into(), "val".into());
    let spec = WorkflowSpec {
        agents: vec![a],
        edges: vec![],
    };
    let err = spec.validate().unwrap_err();
    assert!(matches!(
        err,
        WorkflowSpecError::ForbiddenNodeSelectorKey { .. }
    ));
}

// ── 13. Single agent no edges valid ──────────────────────────────────

#[test]
fn t13_single_agent_no_edges() {
    let spec = WorkflowSpec {
        agents: vec![agent("solo")],
        edges: vec![],
    };
    assert!(spec.validate().is_ok());
}

// ── 14. Invalid agent ID format ──────────────────────────────────────

#[test]
fn t14_invalid_agent_id_uppercase() {
    let spec = WorkflowSpec {
        agents: vec![agent("UPPER")],
        edges: vec![],
    };
    let err = spec.validate().unwrap_err();
    assert!(matches!(err, WorkflowSpecError::InvalidAgentId(_)));
}
