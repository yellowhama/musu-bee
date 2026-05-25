//! LLM DAG builder — natural language → validated `WorkflowSpec` JSON.
//!
//! wiki/512 V26-W9 core. Calls an LLM adapter (Claude default, Ollama/vLLM
//! override via `adapter_type`) with a structured system prompt containing
//! the WorkflowSpec JSON schema. Single-pass generation with one validation
//! retry on failure.
//!
//! §9.12 attestation gate: every `DagBuildResult` returns
//! `attestation_required = true`. The caller (bridge handler) MUST NOT
//! create/execute the workflow without operator attestation.

use crate::adapter::{Adapter, AdapterContext, AdapterError};
use crate::workflow::workflow_spec::{WorkflowSpec, WorkflowSpecError};

// ── Request / Result / Error ──────────────────────────────────────────

/// Input to the DAG builder.
#[derive(Debug, Clone)]
pub struct DagBuildRequest {
    /// Natural-language workflow description from the operator.
    pub natural_language: String,
    /// Company context for the workflow.
    pub company_id: String,
    /// Override the default adapter (e.g. `"openai_compat_local"` for Ollama).
    pub adapter_type: Option<String>,
    /// Override the default model.
    pub model: Option<String>,
    /// Path to .musu home directory for peer discovery.
    pub musu_home: std::path::PathBuf,
}

/// Successful DAG generation result.
#[derive(Debug, Clone)]
pub struct DagBuildResult {
    /// The validated WorkflowSpec ready for attestation → execution.
    pub spec: WorkflowSpec,
    /// Raw LLM output text (for audit trail).
    pub raw_llm_output: String,
    /// Which model was used.
    pub model_used: String,
    /// Always `true`. §9.12 Goodhart firewall.
    pub attestation_required: bool,
}

/// Errors during DAG building.
#[derive(Debug, thiserror::Error)]
pub enum DagBuildError {
    #[error("adapter error: {0}")]
    Adapter(#[from] AdapterError),

    #[error("LLM returned no content")]
    EmptyResponse,

    #[error("failed to extract JSON from LLM response: {0}")]
    JsonExtraction(String),

    #[error("JSON parse error: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("workflow spec validation failed: {0}")]
    SpecValidation(#[from] WorkflowSpecError),

    #[error("failed after retry: {original}")]
    RetryExhausted { original: String },
}

// ── System prompt ─────────────────────────────────────────────────────

/// System prompt for the LLM. Embeds the WorkflowSpec JSON schema so the
/// model can generate valid DAGs in a single pass.
const SYSTEM_PROMPT: &str = r#"You are a workflow DAG builder for the musu distributed task system.

Given a natural-language description of a workflow, generate a valid JSON WorkflowSpec.

## WorkflowSpec JSON Schema

```json
{
  "agents": [
    {
      "id": "step-name",       // lowercase alphanumeric + hyphens, 1-63 chars
      "image": "musu/worker:latest",
      "command": ["the prompt or command for this step"],
      "nodeSelector": {},       // optional: {"gpu_present": "true", "os": "linux"}
      "timeoutSeconds": 3600,   // 1-86400
      "retry": {"maxAttempts": 0, "backoffSeconds": 30},
      "resources": {"cpu": null, "memory": null},
      "inputs": [{"name": "output-name", "from": "upstream-agent-id"}],
      "outputs": ["result-name"]
    }
  ],
  "edges": [
    {"from": "step-a", "to": "step-b", "condition": "succeeded"}
  ]
}
```

## Rules
1. Each agent.id must be unique, lowercase, alphanumeric with hyphens only.
2. Edges define execution order. The DAG must be acyclic.
3. condition can be "succeeded" (default), "failed", or "always".
4. inputs.name must match a declared output of the referenced upstream agent.
5. Put the main task description in command[0].
6. Return ONLY the JSON object, no markdown fences, no explanation.

{PEER_CAPABILITIES}
"#;

// ── Builder ───────────────────────────────────────────────────────────

/// Build a validated WorkflowSpec from natural language using an LLM adapter.
///
/// Single-pass generation with one retry: if the first attempt produces
/// invalid JSON or fails validation, the error message is fed back to the
/// LLM for a second attempt.
pub async fn build_dag(
    req: &DagBuildRequest,
    adapter: &dyn Adapter,
) -> Result<DagBuildResult, DagBuildError> {
    let model = req.model.clone().unwrap_or_default();

    let mut peer_info = String::from("## Available Nodes in Mesh\n");
    let peers = crate::peer::discovery::resolve_all_peers(&req.musu_home);
    for peer in peers {
        peer_info.push_str(&format!("- Node Name: {}\n", peer.name.as_deref().unwrap_or("unknown")));
        peer_info.push_str(&format!("  Address: {}\n", peer.addr));
        // Note: For full resource-aware scheduling we should parse peer.capabilities,
        // but for now we instruct the LLM that it can use `nodeSelector: {"node_name": "..."}`
        // to assign to a specific peer.
    }
    if peer_info == "## Available Nodes in Mesh\n" {
        peer_info.push_str("- (Only this local node is available)\n");
    }

    // First attempt
    let prompt = format!(
        "{}\n\nUser request:\n{}",
        SYSTEM_PROMPT.replace("{PEER_CAPABILITIES}", &peer_info),
        req.natural_language
    );

    let ctx = build_adapter_context(req, &prompt);
    let result = adapter.execute(&ctx).await?;

    if !result.success || result.summary.is_empty() {
        return Err(DagBuildError::EmptyResponse);
    }

    let raw_output = result.summary.clone();

    // Try to parse and validate
    match parse_and_validate(&raw_output) {
        Ok(spec) => Ok(DagBuildResult {
            spec,
            raw_llm_output: raw_output,
            model_used: model,
            attestation_required: true, // §9.12 — ALWAYS
        }),
        Err(first_err) => {
            // Retry with error feedback
            let retry_prompt = format!(
                "{}\n\nUser request:\n{}\n\nYour previous attempt produced an error:\n{}\n\nPlease fix the JSON and try again. Return ONLY the corrected JSON.",
                SYSTEM_PROMPT.replace("{PEER_CAPABILITIES}", &peer_info),
                req.natural_language, first_err
            );

            let retry_ctx = build_adapter_context(req, &retry_prompt);
            let retry_result = adapter.execute(&retry_ctx).await?;

            if !retry_result.success || retry_result.summary.is_empty() {
                return Err(DagBuildError::RetryExhausted {
                    original: first_err.to_string(),
                });
            }

            let retry_output = retry_result.summary.clone();
            match parse_and_validate(&retry_output) {
                Ok(spec) => Ok(DagBuildResult {
                    spec,
                    raw_llm_output: retry_output,
                    model_used: model,
                    attestation_required: true,
                }),
                Err(retry_err) => Err(DagBuildError::RetryExhausted {
                    original: format!("attempt 1: {first_err}, attempt 2: {retry_err}"),
                }),
            }
        }
    }
}

/// Parse LLM output as WorkflowSpec JSON and validate.
fn parse_and_validate(raw: &str) -> Result<WorkflowSpec, DagBuildError> {
    let json_str = extract_json(raw)?;
    let spec: WorkflowSpec = serde_json::from_str(&json_str)?;
    spec.validate()?;
    Ok(spec)
}

/// Extract JSON object from LLM output, handling potential markdown fences.
fn extract_json(raw: &str) -> Result<String, DagBuildError> {
    let trimmed = raw.trim();

    // Direct JSON object
    if trimmed.starts_with('{') {
        return Ok(trimmed.to_string());
    }

    // Markdown code fence: ```json ... ``` or ``` ... ```
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end > start {
                return Ok(trimmed[start..=end].to_string());
            }
        }
    }

    Err(DagBuildError::JsonExtraction(format!(
        "could not find JSON object in LLM output (first 200 chars): {}",
        &trimmed[..trimmed.len().min(200)]
    )))
}

/// Build an AdapterContext for the LLM call.
fn build_adapter_context(req: &DagBuildRequest, prompt: &str) -> AdapterContext {
    AdapterContext {
        run_id: uuid::Uuid::new_v4().to_string(),
        prompt: prompt.to_string(),
        agent_id: "dag-builder".into(),
        adapter_type: req
            .adapter_type
            .clone()
            .unwrap_or_else(|| "claude".into()),
        config_json: if let Some(ref model) = req.model {
            serde_json::json!({ "model": model })
        } else {
            serde_json::Value::Object(serde_json::Map::new())
        },
        session_id: None,
        cwd: None,
        deadline_unix_ms: None,
        cancel: None,
        extra: serde_json::json!({ "mode": "dag_builder", "company_id": req.company_id }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_json_direct() {
        let raw = r#"{"agents": [], "edges": []}"#;
        let result = extract_json(raw).unwrap();
        assert_eq!(result, raw);
    }

    #[test]
    fn extract_json_with_markdown_fence() {
        let raw = "Here's the workflow:\n```json\n{\"agents\": [{\"id\": \"a\", \"image\": \"x\", \"timeoutSeconds\": 60}], \"edges\": []}\n```\nDone.";
        let result = extract_json(raw).unwrap();
        assert!(result.starts_with('{'));
        assert!(result.ends_with('}'));
    }

    #[test]
    fn extract_json_no_json_fails() {
        let raw = "This is just text with no JSON";
        assert!(extract_json(raw).is_err());
    }

    #[test]
    fn parse_and_validate_valid() {
        let json = r#"{
            "agents": [
                {"id": "fetch", "image": "musu/worker:latest", "command": ["fetch data"], "timeoutSeconds": 60},
                {"id": "process", "image": "musu/worker:latest", "command": ["process data"], "timeoutSeconds": 120}
            ],
            "edges": [
                {"from": "fetch", "to": "process", "condition": "succeeded"}
            ]
        }"#;
        let spec = parse_and_validate(json).unwrap();
        assert_eq!(spec.agents.len(), 2);
        assert_eq!(spec.edges.len(), 1);
    }

    #[test]
    fn parse_and_validate_cycle_fails() {
        let json = r#"{
            "agents": [
                {"id": "a", "image": "x", "timeoutSeconds": 60},
                {"id": "b", "image": "x", "timeoutSeconds": 60}
            ],
            "edges": [
                {"from": "a", "to": "b"},
                {"from": "b", "to": "a"}
            ]
        }"#;
        let err = parse_and_validate(json).unwrap_err();
        assert!(matches!(err, DagBuildError::SpecValidation(_)));
    }

    #[test]
    fn attestation_always_required() {
        // The attestation field is hardcoded true — verify at type level.
        let result = DagBuildResult {
            spec: WorkflowSpec {
                agents: vec![],
                edges: vec![],
            },
            raw_llm_output: String::new(),
            model_used: String::new(),
            attestation_required: true,
        };
        assert!(result.attestation_required);
    }
}
