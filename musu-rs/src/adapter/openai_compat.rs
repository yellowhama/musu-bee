//! OpenAI-compatible adapter. V26-W1 wiki/509.

use super::{Adapter, AdapterContext, AdapterError, AdapterResult, UsageSummary};
use async_trait::async_trait;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

const DEFAULT_API_KEY: &str = "musu-local-noauth";

/// Supported backend kinds for OpenAI-compatible providers.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackendKind {
    Ollama,
    Vllm,
    LmStudio,
}

impl BackendKind {
    fn slug(self) -> &'static str {
        match self {
            BackendKind::Ollama => "ollama",
            BackendKind::Vllm => "vllm",
            BackendKind::LmStudio => "lm_studio",
        }
    }
}

/// Configuration for the OpenAI-compatible adapter.
#[derive(Debug, Deserialize)]
pub struct OpenAIConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub backend: BackendKind,
}

pub struct OpenAICompatAdapter;

#[async_trait]
impl Adapter for OpenAICompatAdapter {
    async fn execute(&self, ctx: &AdapterContext) -> Result<AdapterResult, AdapterError> {
        let config: OpenAIConfig = serde_json::from_value(ctx.config_json.clone())
            .map_err(|e| AdapterError::Unknown(format!("invalid openai_compat config: {e}")))?;
        let url = chat_completions_url(&config.base_url);
        let api_key = config.api_key.as_deref().unwrap_or(DEFAULT_API_KEY);
        let model = normalize_model(config.backend, &config.model);

        let request_body = json!({
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": ctx.prompt}
            ],
            "stream": false
        });

        let response = reqwest::Client::new()
            .post(&url)
            .bearer_auth(api_key)
            .header(
                "X-Musu-Adapter",
                format!("openai_compat_{}", config.backend.slug()),
            )
            .json(&request_body)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| AdapterError::Unknown(format!("failed reading response body: {e}")))?;

        if !status.is_success() {
            return Err(map_http_status(status, &body));
        }

        let parsed: ChatCompletionResponse = serde_json::from_str(&body).map_err(|e| {
            AdapterError::Unknown(format!(
                "malformed {} response from {url}: {e}",
                config.backend.slug()
            ))
        })?;
        let choice = parsed.choices.into_iter().next().ok_or_else(|| {
            AdapterError::Unknown(format!(
                "empty choices in {} response from {url}",
                config.backend.slug()
            ))
        })?;

        if choice.message.content.is_none()
            && choice.message.tool_calls.is_none()
            && choice.message.function_call.is_none()
        {
            return Err(AdapterError::Unknown(format!(
                "assistant message missing content/tool_calls in {} response from {url}",
                config.backend.slug()
            )));
        }

        Ok(AdapterResult {
            success: true,
            summary: choice.message.content.unwrap_or_default(),
            session_id: None,
            usage: parsed.usage.map(Into::into),
            error_code: None,
        })
    }
}

fn chat_completions_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    }
}

fn normalize_model(backend: BackendKind, model: &str) -> String {
    match backend {
        BackendKind::LmStudio => model.trim().to_string(),
        BackendKind::Ollama | BackendKind::Vllm => model.to_string(),
    }
}

fn map_reqwest_error(err: reqwest::Error) -> AdapterError {
    if err.is_timeout() {
        AdapterError::Timeout
    } else if let Some(status) = err.status() {
        map_http_status(status, &err.to_string())
    } else {
        AdapterError::Unknown(format!("network error: {err}"))
    }
}

fn map_http_status(status: StatusCode, body: &str) -> AdapterError {
    match status.as_u16() {
        429 => AdapterError::RateLimit,
        408 | 504 => AdapterError::Timeout,
        503 => AdapterError::ModelUnavailable,
        400 if body.to_ascii_lowercase().contains("context") => AdapterError::ContextExceeded,
        _ => AdapterError::Unknown(format!("HTTP {status}: {body}")),
    }
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
    tool_calls: Option<Vec<serde_json::Value>>,
    function_call: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
}

impl From<OpenAIUsage> for UsageSummary {
    fn from(value: OpenAIUsage) -> Self {
        Self {
            prompt_tokens: value.prompt_tokens,
            completion_tokens: value.completion_tokens,
            total_tokens: value.total_tokens,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn ctx(server: &MockServer, backend: BackendKind) -> AdapterContext {
        AdapterContext {
            run_id: "test".into(),
            prompt: "Hi".into(),
            agent_id: "test".into(),
            adapter_type: "openai_compat_local".into(),
            config_json: json!({
                "base_url": server.uri(),
                "model": " test-model.gguf ",
                "backend": backend.slug()
            }),
            session_id: None,
            cwd: None,
            deadline_unix_ms: None,
            cancel: None,
            extra: serde_json::Value::Null,
        }
    }

    fn completion(content: Option<&str>, extra_message: Value) -> Value {
        let mut message = json!({
            "role": "assistant",
            "content": content
        });
        if let Some(object) = message.as_object_mut() {
            if let Some(extra) = extra_message.as_object() {
                object.extend(extra.clone());
            }
        }

        json!({
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1677652288,
            "model": "test-model",
            "choices": [{
                "index": 0,
                "message": message,
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30
            }
        })
    }

    async fn mount_response(server: &MockServer, backend: BackendKind, response: ResponseTemplate) {
        Mock::given(method("POST"))
            .and(path("/chat/completions"))
            .and(header("authorization", format!("Bearer {DEFAULT_API_KEY}")))
            .and(header(
                "x-musu-adapter",
                format!("openai_compat_{}", backend.slug()),
            ))
            .respond_with(response)
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn happy_path_all_backends() {
        for backend in [
            BackendKind::Ollama,
            BackendKind::Vllm,
            BackendKind::LmStudio,
        ] {
            let server = MockServer::start().await;
            mount_response(
                &server,
                backend,
                ResponseTemplate::new(200)
                    .set_body_json(completion(Some("Hello from backend"), json!({}))),
            )
            .await;

            let res = OpenAICompatAdapter
                .execute(&ctx(&server, backend))
                .await
                .unwrap();
            assert!(res.success);
            assert_eq!(res.summary, "Hello from backend");
            assert_eq!(res.usage.unwrap().total_tokens, Some(30));
        }
    }

    #[tokio::test]
    async fn tool_call_response_accepts_vllm_missing_type_field() {
        let backend = BackendKind::Vllm;
        let server = MockServer::start().await;
        mount_response(
            &server,
            backend,
            ResponseTemplate::new(200).set_body_json(completion(
                None,
                json!({
                    "tool_calls": [{
                        "id": "call_1",
                        "function": {"name": "lookup", "arguments": "{}"}
                    }]
                }),
            )),
        )
        .await;

        let res = OpenAICompatAdapter
            .execute(&ctx(&server, backend))
            .await
            .unwrap();
        assert!(res.success);
        assert_eq!(res.summary, "");
    }

    #[tokio::test]
    async fn rate_limit_maps_to_retriable_rate_limit_all_backends() {
        for backend in [
            BackendKind::Ollama,
            BackendKind::Vllm,
            BackendKind::LmStudio,
        ] {
            let server = MockServer::start().await;
            mount_response(
                &server,
                backend,
                ResponseTemplate::new(429).set_body_json(json!({
                    "error": {"message": "rate limit"}
                })),
            )
            .await;

            let err = OpenAICompatAdapter
                .execute(&ctx(&server, backend))
                .await
                .unwrap_err();
            assert!(matches!(err, AdapterError::RateLimit));
            assert!(err.is_retriable());
        }
    }

    #[tokio::test]
    async fn context_exceeded_maps_to_non_retriable_all_backends() {
        for backend in [
            BackendKind::Ollama,
            BackendKind::Vllm,
            BackendKind::LmStudio,
        ] {
            let server = MockServer::start().await;
            mount_response(
                &server,
                backend,
                ResponseTemplate::new(400).set_body_json(json!({
                    "error": {"message": "context length exceeded"}
                })),
            )
            .await;

            let err = OpenAICompatAdapter
                .execute(&ctx(&server, backend))
                .await
                .unwrap_err();
            assert!(matches!(err, AdapterError::ContextExceeded));
            assert!(!err.is_retriable());
        }
    }

    #[tokio::test]
    async fn malformed_response_fails_fast() {
        let backend = BackendKind::Ollama;
        let server = MockServer::start().await;
        mount_response(
            &server,
            backend,
            ResponseTemplate::new(200).set_body_json(json!({
                "id": "chatcmpl-123",
                "object": "chat.completion",
                "created": 1677652288,
                "model": "test-model",
                "choices": []
            })),
        )
        .await;

        let err = OpenAICompatAdapter
            .execute(&ctx(&server, backend))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("empty choices"));
    }

    #[test]
    fn chat_completions_url_preserves_v1_base() {
        assert_eq!(
            chat_completions_url("http://localhost:11434/v1"),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("http://localhost:11434/v1/chat/completions"),
            "http://localhost:11434/v1/chat/completions"
        );
    }
}
