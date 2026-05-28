use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskStateUpdate {
    pub status: Option<String>,
    pub output: Option<String>,
    pub error: Option<String>,
    pub assigned_pc: Option<String>,
    pub assigned_agent: Option<String>,
    pub approver_agent: Option<String>,
    pub parent_task_id: Option<String>,
    pub started_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskState {
    pub task_id: String,
    pub company_id: String,
    pub channel: String,
    pub sender_id: String,
    pub parent_task_id: Option<String>,
    pub assigned_agent: Option<String>,
    pub approver_agent: Option<String>,
    pub prompt: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assigned_pc: Option<String>,
    pub created_at: i64,
}

pub struct BrainClient {
    base_url: String,
    client: Client,
}

impl Default for BrainClient {
    fn default() -> Self {
        Self::new()
    }
}

impl BrainClient {
    pub fn new() -> Self {
        Self {
            base_url: "http://localhost:8888".to_string(),
            client: Client::new(),
        }
    }

    pub async fn create_task(&self, task: &TaskState) -> Result<(), reqwest::Error> {
        let url = format!("{}/api/tasks", self.base_url);
        self.client
            .post(&url)
            .json(task)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn update_task(
        &self,
        task_id: &str,
        update: &TaskStateUpdate,
    ) -> Result<(), reqwest::Error> {
        let url = format!("{}/api/tasks/{}", self.base_url, task_id);
        self.client
            .put(&url)
            .json(update)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
}
