//! WorkflowSpec schema — Rust port of `workflow_routes.py:52-171`.
//!
//! 1:1 field parity with the Python Pydantic model. Four validators:
//! 1. Unique agent IDs
//! 2. Edge references existing agents
//! 3. Kahn topological-sort cycle detection
//! 4. Agent inputs reference declared upstream outputs
//!
//! Serde aliases match the Python JSON wire format (`from` → `from_` in Rust).

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

// ── Allowed nodeSelector keys (workflow_routes.py L47-49) ──────────────

const ALLOWED_NODESELECTOR_KEYS: &[&str] = &["gpu_vram_free_gb_min", "gpu_present", "os"];

// ── Sub-types ──────────────────────────────────────────────────────────

/// Retry policy for a workflow agent step.
/// Port of `workflow_routes.py:52-54`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    /// 0..=10, default 0.
    #[serde(default)]
    pub max_attempts: u32,
    /// ≥1, default 30.
    #[serde(default = "default_backoff_seconds")]
    pub backoff_seconds: u32,
}

fn default_backoff_seconds() -> u32 {
    30
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 0,
            backoff_seconds: 30,
        }
    }
}

/// Resource requests for a workflow agent.
/// Port of `workflow_routes.py:57-59`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct AgentResources {
    pub cpu: Option<String>,
    pub memory: Option<String>,
}

/// Named input wired from an upstream agent's output.
/// Port of `workflow_routes.py:62-66`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentInput {
    pub name: String,
    /// The upstream agent ID this input reads from.
    /// Python field: `from_` with alias `"from"`.
    #[serde(rename = "from")]
    pub from_agent: String,
}

/// Edge condition controlling when a downstream agent runs.
/// Port of `workflow_routes.py:99-104` condition field.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum EdgeCondition {
    #[default]
    Succeeded,
    Failed,
    Always,
}

// ── AgentSpec ──────────────────────────────────────────────────────────

/// A single agent (step) in the workflow DAG.
/// Port of `workflow_routes.py:69-96`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentSpec {
    /// Unique ID matching `^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$`.
    pub id: String,

    /// Container image or executable reference.
    pub image: String,

    /// Command-line args.
    #[serde(default)]
    pub command: Vec<String>,

    /// Node placement hints (whitelisted keys only).
    #[serde(default, rename = "nodeSelector")]
    pub node_selector: HashMap<String, String>,

    /// Timeout in seconds (1..=86400), default 3600.
    #[serde(default = "default_timeout_seconds")]
    pub timeout_seconds: u32,

    /// Retry policy.
    #[serde(default)]
    pub retry: RetryPolicy,

    /// Resource requests.
    #[serde(default)]
    pub resources: AgentResources,

    /// Named inputs from upstream agent outputs.
    #[serde(default)]
    pub inputs: Vec<AgentInput>,

    /// Declared output names that downstream agents can reference.
    #[serde(default)]
    pub outputs: Vec<String>,
}

fn default_timeout_seconds() -> u32 {
    3600
}

// ── EdgeSpec ───────────────────────────────────────────────────────────

/// A directed edge in the workflow DAG.
/// Port of `workflow_routes.py:99-104`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EdgeSpec {
    /// Source agent ID.
    #[serde(rename = "from")]
    pub from_agent: String,

    /// Target agent ID.
    pub to: String,

    /// When to activate the target. Defaults to `succeeded`.
    #[serde(default)]
    pub condition: EdgeCondition,
}

// ── WorkflowSpec ──────────────────────────────────────────────────────

/// Top-level workflow DAG specification.
/// Port of `workflow_routes.py:107-171`.
///
/// Call `validate()` after deserialization to run all four validators.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowSpec {
    /// At least one agent required.
    pub agents: Vec<AgentSpec>,

    /// DAG edges (may be empty for single-agent workflows).
    #[serde(default)]
    pub edges: Vec<EdgeSpec>,
}

// ── Validation errors ─────────────────────────────────────────────────

/// Validation error returned by `WorkflowSpec::validate()`.
#[derive(Debug, Clone, thiserror::Error)]
pub enum WorkflowSpecError {
    #[error("agents list must not be empty")]
    EmptyAgents,

    #[error("duplicate agent ID: {0}")]
    DuplicateAgentId(String),

    #[error("agent ID format invalid (must match [a-z0-9][-a-z0-9]*[a-z0-9]): {0}")]
    InvalidAgentId(String),

    #[error("edge references unknown agent: {field}={id}")]
    EdgeReferencesUnknown { field: String, id: String },

    #[error("cycle detected in workflow DAG")]
    CycleDetected,

    #[error("agent {agent_id} input {input_name} references output from {from_agent} which is not declared")]
    InputReferencesUndeclaredOutput {
        agent_id: String,
        input_name: String,
        from_agent: String,
    },

    #[error("nodeSelector key {key} is not allowed (allowed: {allowed:?})")]
    ForbiddenNodeSelectorKey { key: String, allowed: Vec<String> },

    #[error("timeout_seconds must be 1..=86400, got {0}")]
    InvalidTimeout(u32),

    #[error("retry max_attempts must be 0..=10, got {0}")]
    InvalidRetryMaxAttempts(u32),
}

// ── Agent ID regex ────────────────────────────────────────────────────

/// Validates agent ID format: `^[a-z0-9][-a-z0-9]*[a-z0-9]$|^[a-z0-9]$`.
/// Pure char-based check to avoid regex dep for this single pattern.
fn is_valid_agent_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 63 {
        return false;
    }
    let bytes = id.as_bytes();
    // First and last must be [a-z0-9]
    let is_alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    if !is_alnum(bytes[0]) {
        return false;
    }
    if bytes.len() > 1 && !is_alnum(bytes[bytes.len() - 1]) {
        return false;
    }
    // Middle chars can also include '-'
    bytes
        .iter()
        .all(|&b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

// ── Validators ────────────────────────────────────────────────────────

impl WorkflowSpec {
    /// Run all four validators. Returns `Ok(())` or the first error found.
    pub fn validate(&self) -> Result<(), WorkflowSpecError> {
        self.validate_non_empty()?;
        self.validate_agent_ids()?;
        self.validate_agent_constraints()?;
        self.validate_unique_agent_ids()?;
        self.validate_edge_references()?;
        self.validate_no_cycles()?;
        self.validate_inputs_reference_outputs()?;
        Ok(())
    }

    fn validate_non_empty(&self) -> Result<(), WorkflowSpecError> {
        if self.agents.is_empty() {
            return Err(WorkflowSpecError::EmptyAgents);
        }
        Ok(())
    }

    fn validate_agent_ids(&self) -> Result<(), WorkflowSpecError> {
        for agent in &self.agents {
            if !is_valid_agent_id(&agent.id) {
                return Err(WorkflowSpecError::InvalidAgentId(agent.id.clone()));
            }
        }
        Ok(())
    }

    fn validate_agent_constraints(&self) -> Result<(), WorkflowSpecError> {
        for agent in &self.agents {
            // timeout
            if agent.timeout_seconds == 0 || agent.timeout_seconds > 86400 {
                return Err(WorkflowSpecError::InvalidTimeout(agent.timeout_seconds));
            }
            // retry
            if agent.retry.max_attempts > 10 {
                return Err(WorkflowSpecError::InvalidRetryMaxAttempts(
                    agent.retry.max_attempts,
                ));
            }
            // nodeSelector keys
            for key in agent.node_selector.keys() {
                if !ALLOWED_NODESELECTOR_KEYS.contains(&key.as_str()) {
                    return Err(WorkflowSpecError::ForbiddenNodeSelectorKey {
                        key: key.clone(),
                        allowed: ALLOWED_NODESELECTOR_KEYS
                            .iter()
                            .map(|s| s.to_string())
                            .collect(),
                    });
                }
            }
        }
        Ok(())
    }

    /// Validator 1: No duplicate agent IDs.
    /// Port of `workflow_routes.py:111-118`.
    fn validate_unique_agent_ids(&self) -> Result<(), WorkflowSpecError> {
        let mut seen = HashSet::with_capacity(self.agents.len());
        for agent in &self.agents {
            if !seen.insert(&agent.id) {
                return Err(WorkflowSpecError::DuplicateAgentId(agent.id.clone()));
            }
        }
        Ok(())
    }

    /// Validator 2: Edge from/to must reference existing agent IDs.
    /// Port of `workflow_routes.py:124-132`.
    fn validate_edge_references(&self) -> Result<(), WorkflowSpecError> {
        let ids: HashSet<&str> = self.agents.iter().map(|a| a.id.as_str()).collect();
        for edge in &self.edges {
            if !ids.contains(edge.from_agent.as_str()) {
                return Err(WorkflowSpecError::EdgeReferencesUnknown {
                    field: "from".into(),
                    id: edge.from_agent.clone(),
                });
            }
            if !ids.contains(edge.to.as_str()) {
                return Err(WorkflowSpecError::EdgeReferencesUnknown {
                    field: "to".into(),
                    id: edge.to.clone(),
                });
            }
        }
        Ok(())
    }

    /// Validator 3: Kahn topological-sort cycle detection.
    /// Port of `workflow_routes.py:134-152`.
    fn validate_no_cycles(&self) -> Result<(), WorkflowSpecError> {
        let agent_ids: Vec<&str> = self.agents.iter().map(|a| a.id.as_str()).collect();
        let mut indeg: HashMap<&str, usize> = HashMap::new();
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

        for id in &agent_ids {
            indeg.entry(id).or_insert(0);
        }

        for edge in &self.edges {
            adj.entry(edge.from_agent.as_str())
                .or_default()
                .push(edge.to.as_str());
            *indeg.entry(edge.to.as_str()).or_insert(0) += 1;
        }

        let mut queue: VecDeque<&str> = indeg
            .iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(&id, _)| id)
            .collect();

        let mut visited = 0usize;
        while let Some(node) = queue.pop_front() {
            visited += 1;
            if let Some(neighbors) = adj.get(node) {
                for &neighbor in neighbors {
                    let deg = indeg.get_mut(neighbor).unwrap();
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(neighbor);
                    }
                }
            }
        }

        if visited != self.agents.len() {
            return Err(WorkflowSpecError::CycleDetected);
        }
        Ok(())
    }

    /// Validator 4: Agent inputs must reference declared outputs of upstream agents.
    /// Port of `workflow_routes.py:154-170`.
    fn validate_inputs_reference_outputs(&self) -> Result<(), WorkflowSpecError> {
        // Build map: agent_id → set of declared output names
        let outputs_by_agent: HashMap<&str, HashSet<&str>> = self
            .agents
            .iter()
            .map(|a| {
                (
                    a.id.as_str(),
                    a.outputs.iter().map(|o| o.as_str()).collect(),
                )
            })
            .collect();

        for agent in &self.agents {
            for input in &agent.inputs {
                // The `from_agent` must exist and must declare the referenced output
                match outputs_by_agent.get(input.from_agent.as_str()) {
                    None => {
                        return Err(WorkflowSpecError::InputReferencesUndeclaredOutput {
                            agent_id: agent.id.clone(),
                            input_name: input.name.clone(),
                            from_agent: input.from_agent.clone(),
                        });
                    }
                    Some(declared) => {
                        if !declared.contains(input.name.as_str()) {
                            return Err(WorkflowSpecError::InputReferencesUndeclaredOutput {
                                agent_id: agent.id.clone(),
                                input_name: input.name.clone(),
                                from_agent: input.from_agent.clone(),
                            });
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Compute topological order (for DAG execution planning).
    /// Returns agent IDs in dependency-first order.
    /// Assumes `validate_no_cycles()` has already passed.
    pub fn topological_order(&self) -> Vec<String> {
        let mut indeg: HashMap<&str, usize> = HashMap::new();
        let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

        for a in &self.agents {
            indeg.entry(a.id.as_str()).or_insert(0);
        }
        for edge in &self.edges {
            adj.entry(edge.from_agent.as_str())
                .or_default()
                .push(edge.to.as_str());
            *indeg.entry(edge.to.as_str()).or_insert(0) += 1;
        }

        let mut queue: VecDeque<&str> = indeg
            .iter()
            .filter(|(_, &d)| d == 0)
            .map(|(&id, _)| id)
            .collect();

        let mut order = Vec::with_capacity(self.agents.len());
        while let Some(node) = queue.pop_front() {
            order.push(node.to_string());
            if let Some(neighbors) = adj.get(node) {
                for &n in neighbors {
                    let d = indeg.get_mut(n).unwrap();
                    *d -= 1;
                    if *d == 0 {
                        queue.push_back(n);
                    }
                }
            }
        }
        order
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_agent(id: &str) -> AgentSpec {
        AgentSpec {
            id: id.to_string(),
            image: "musu/worker:latest".into(),
            command: vec![],
            node_selector: HashMap::new(),
            timeout_seconds: 3600,
            retry: RetryPolicy::default(),
            resources: AgentResources::default(),
            inputs: vec![],
            outputs: vec![],
        }
    }

    #[test]
    fn valid_linear_dag() {
        let spec = WorkflowSpec {
            agents: vec![make_agent("a"), make_agent("b"), make_agent("c")],
            edges: vec![
                EdgeSpec {
                    from_agent: "a".into(),
                    to: "b".into(),
                    condition: EdgeCondition::Succeeded,
                },
                EdgeSpec {
                    from_agent: "b".into(),
                    to: "c".into(),
                    condition: EdgeCondition::Succeeded,
                },
            ],
        };
        assert!(spec.validate().is_ok());
        assert_eq!(spec.topological_order(), vec!["a", "b", "c"]);
    }

    #[test]
    fn cycle_detected() {
        let spec = WorkflowSpec {
            agents: vec![make_agent("a"), make_agent("b"), make_agent("c")],
            edges: vec![
                EdgeSpec {
                    from_agent: "a".into(),
                    to: "b".into(),
                    condition: EdgeCondition::Succeeded,
                },
                EdgeSpec {
                    from_agent: "b".into(),
                    to: "c".into(),
                    condition: EdgeCondition::Succeeded,
                },
                EdgeSpec {
                    from_agent: "c".into(),
                    to: "a".into(),
                    condition: EdgeCondition::Succeeded,
                },
            ],
        };
        let err = spec.validate().unwrap_err();
        assert!(matches!(err, WorkflowSpecError::CycleDetected));
    }

    #[test]
    fn duplicate_agent_id() {
        let spec = WorkflowSpec {
            agents: vec![make_agent("a"), make_agent("a")],
            edges: vec![],
        };
        let err = spec.validate().unwrap_err();
        assert!(matches!(err, WorkflowSpecError::DuplicateAgentId(_)));
    }

    #[test]
    fn edge_references_nonexistent() {
        let spec = WorkflowSpec {
            agents: vec![make_agent("a")],
            edges: vec![EdgeSpec {
                from_agent: "a".into(),
                to: "ghost".into(),
                condition: EdgeCondition::Succeeded,
            }],
        };
        let err = spec.validate().unwrap_err();
        assert!(matches!(err, WorkflowSpecError::EdgeReferencesUnknown { .. }));
    }

    #[test]
    fn invalid_agent_id_format() {
        let spec = WorkflowSpec {
            agents: vec![make_agent("UPPER")],
            edges: vec![],
        };
        let err = spec.validate().unwrap_err();
        assert!(matches!(err, WorkflowSpecError::InvalidAgentId(_)));
    }

    #[test]
    fn input_references_undeclared_output() {
        let mut a = make_agent("a");
        a.outputs = vec!["result".into()];
        let mut b = make_agent("b");
        b.inputs = vec![AgentInput {
            name: "missing-output".into(),
            from_agent: "a".into(),
        }];
        let spec = WorkflowSpec {
            agents: vec![a, b],
            edges: vec![EdgeSpec {
                from_agent: "a".into(),
                to: "b".into(),
                condition: EdgeCondition::Succeeded,
            }],
        };
        let err = spec.validate().unwrap_err();
        assert!(matches!(
            err,
            WorkflowSpecError::InputReferencesUndeclaredOutput { .. }
        ));
    }

    #[test]
    fn valid_input_output_wiring() {
        let mut a = make_agent("a");
        a.outputs = vec!["data".into()];
        let mut b = make_agent("b");
        b.inputs = vec![AgentInput {
            name: "data".into(),
            from_agent: "a".into(),
        }];
        let spec = WorkflowSpec {
            agents: vec![a, b],
            edges: vec![EdgeSpec {
                from_agent: "a".into(),
                to: "b".into(),
                condition: EdgeCondition::Succeeded,
            }],
        };
        assert!(spec.validate().is_ok());
    }

    #[test]
    fn forbidden_nodeselector_key() {
        let mut a = make_agent("a");
        a.node_selector
            .insert("forbidden_key".into(), "value".into());
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

    #[test]
    fn serde_roundtrip() {
        let mut a = make_agent("a");
        a.outputs = vec!["data".into()];
        let mut b = make_agent("b");
        b.inputs = vec![AgentInput {
            name: "data".into(),
            from_agent: "a".into(),
        }];
        let spec = WorkflowSpec {
            agents: vec![a, b],
            edges: vec![EdgeSpec {
                from_agent: "a".into(),
                to: "b".into(),
                condition: EdgeCondition::Always,
            }],
        };

        let json = serde_json::to_string_pretty(&spec).unwrap();
        let parsed: WorkflowSpec = serde_json::from_str(&json).unwrap();
        assert_eq!(spec, parsed);
        assert!(parsed.validate().is_ok());
    }

    #[test]
    fn single_agent_no_edges_valid() {
        let spec = WorkflowSpec {
            agents: vec![make_agent("x")],
            edges: vec![],
        };
        assert!(spec.validate().is_ok());
    }

    #[test]
    fn diamond_dag_valid() {
        // a → b, a → c, b → d, c → d
        let spec = WorkflowSpec {
            agents: vec![
                make_agent("a"),
                make_agent("b"),
                make_agent("c"),
                make_agent("d"),
            ],
            edges: vec![
                EdgeSpec { from_agent: "a".into(), to: "b".into(), condition: EdgeCondition::Succeeded },
                EdgeSpec { from_agent: "a".into(), to: "c".into(), condition: EdgeCondition::Succeeded },
                EdgeSpec { from_agent: "b".into(), to: "d".into(), condition: EdgeCondition::Succeeded },
                EdgeSpec { from_agent: "c".into(), to: "d".into(), condition: EdgeCondition::Succeeded },
            ],
        };
        assert!(spec.validate().is_ok());
    }
}
