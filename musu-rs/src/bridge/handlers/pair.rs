//! Token pairing — V27-F7.
//!
//! Allows two musu nodes to pair with a simple 6-digit code
//! instead of manually exchanging tokens.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::bridge::error::{MusuError, Result};
use crate::bridge::AppState;

/// Active pairing offers (code -> offer info).
/// Stored in AppState.
#[derive(Debug, Clone, Default)]
pub struct PairingStore {
    inner: Arc<Mutex<HashMap<String, PairingOffer>>>,
}

#[derive(Debug, Clone)]
struct PairingOffer {
    node_name: String,
    node_url: String,
    token: String,
    created_at: Instant,
    ttl: Duration,
}

impl PairingStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Generate a new 6-char pairing code.
    pub async fn create_offer(&self, node_name: String, node_url: String, token: String) -> String {
        let code = generate_code();
        let mut store = self.inner.lock().await;
        // Cleanup expired
        store.retain(|_, v| v.created_at.elapsed() < v.ttl);
        store.insert(
            code.clone(),
            PairingOffer {
                node_name,
                node_url,
                token,
                created_at: Instant::now(),
                ttl: Duration::from_secs(300), // 5 minutes
            },
        );
        code
    }

    /// Consume a pairing code. Returns `(node_name, node_url, token)` if valid.
    pub async fn accept_offer(&self, code: &str) -> Option<(String, String, String)> {
        let mut store = self.inner.lock().await;
        if let Some(offer) = store.remove(code) {
            if offer.created_at.elapsed() < offer.ttl {
                return Some((offer.node_name, offer.node_url, offer.token));
            }
        }
        None
    }
}

fn generate_code() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    std::time::SystemTime::now().hash(&mut hasher);
    std::thread::current().id().hash(&mut hasher);
    let n = hasher.finish() % 1_000_000;
    format!("{:03}-{:03}", n / 1000, n % 1000)
}

// ---- API ----

#[derive(Debug, Serialize)]
pub struct PairOfferResponse {
    pub code: String,
    pub expires_in_sec: u64,
    pub node_name: String,
}

/// `POST /api/pair/offer` — generate a pairing code.
pub async fn create_pair_offer(State(state): State<AppState>) -> Result<Json<PairOfferResponse>> {
    let node_url = format!(
        "http://{}:{}",
        state.config.bridge_host, state.config.bridge_port
    );
    let code = state
        .pairing
        .create_offer(
            state.config.node_name.clone(),
            node_url,
            state.config.token.clone(),
        )
        .await;

    tracing::info!(code = %code, "pairing offer created");

    Ok(Json(PairOfferResponse {
        code,
        expires_in_sec: 300,
        node_name: state.config.node_name.clone(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct PairAcceptRequest {
    pub code: String,
    pub my_name: String,
    pub my_url: String,
}

#[derive(Debug, Serialize)]
pub struct PairAcceptResponse {
    pub success: bool,
    pub peer_name: String,
    pub peer_url: String,
    pub message: String,
}

/// `POST /api/pair/accept` — accept a pairing code.
pub async fn accept_pair(
    State(state): State<AppState>,
    Json(req): Json<PairAcceptRequest>,
) -> Result<Json<PairAcceptResponse>> {
    let offer = state.pairing.accept_offer(&req.code).await;

    match offer {
        Some((peer_name, peer_url, _token)) => {
            // Register the joining node as a peer.
            let addr = peer_url
                .trim_start_matches("http://")
                .trim_start_matches("https://")
                .trim_end_matches('/')
                .to_string();

            // Add to manual peers.
            let musu_home = state
                .config
                .nodes_toml_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."));
            let mut list = crate::peer::discovery::ManualPeerList::load(musu_home);
            list.add(addr.clone(), Some(req.my_name.clone()));
            let _ = list.save(musu_home);

            tracing::info!(
                peer_name = %req.my_name,
                peer_url = %req.my_url,
                "pairing accepted"
            );

            Ok(Json(PairAcceptResponse {
                success: true,
                peer_name,
                peer_url,
                message: "paired successfully".into(),
            }))
        }
        None => Err(MusuError::NotFound(
            "invalid or expired pairing code".into(),
        )),
    }
}
