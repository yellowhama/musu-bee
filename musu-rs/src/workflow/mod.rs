//! Workflow DAG builder + spec — wiki/512 V26-W9.
//!
//! Ports the Python `workflow_routes.py` WorkflowSpec schema (Pydantic → serde)
//! and adds an LLM-powered DAG builder that converts natural language into
//! validated `WorkflowSpec` JSON.
//!
//! Modules:
//! - `workflow_spec`: Core schema types + 4 validators (Kahn cycle detection)
//! - `llm_dag_builder`: natural-language → WorkflowSpec via adapter trait

pub mod executor;
pub mod llm_dag_builder;
pub mod workflow_spec;
