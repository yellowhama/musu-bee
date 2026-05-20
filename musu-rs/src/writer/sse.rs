//! SSE broadcaster — wiki/495 §1 #3, §3 sse.rs.
//!
//! `tokio::sync::broadcast(100)` channel + axum `Sse<Stream<Event>>` adapter.
//! Per Critic C6: lag-warning emits as a SEPARATE event type (`event: task_lag`)
//! so existing `task_update` consumers don't break on unknown fields.

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use futures_util::stream::Stream;
use serde::Serialize;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

const DEFAULT_CAP: usize = 100;
const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(15);

/// Broadcast envelope. `Clone` is cheap (everything inside is small).
#[derive(Debug, Clone, Serialize)]
pub struct TaskEvent {
    pub r#type: String,
    pub task_id: String,
    pub status: String,
}

impl TaskEvent {
    pub fn update(task_id: &str, status: &str) -> Self {
        Self {
            r#type: "task_update".into(),
            task_id: task_id.to_string(),
            status: status.to_string(),
        }
    }
}

/// Clone-able broadcaster (Arc<Sender>).
#[derive(Clone)]
pub struct SseBroadcaster {
    tx: Arc<broadcast::Sender<TaskEvent>>,
}

impl SseBroadcaster {
    pub fn new(cap: usize) -> Self {
        let (tx, _rx) = broadcast::channel(cap);
        Self { tx: Arc::new(tx) }
    }

    pub fn from_env() -> Self {
        let cap = std::env::var("MUSU_TASK_EVENT_CHANNEL_CAP")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_CAP);
        Self::new(cap)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<TaskEvent> {
        self.tx.subscribe()
    }

    pub fn publish(&self, ev: TaskEvent) {
        // No subscribers is fine — broadcast returns Err but events are
        // fire-and-forget.
        let _ = self.tx.send(ev);
    }

    #[allow(dead_code)] // for tests + future /health/ready surface.
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }
}

/// Build an axum SSE response from a subscriber. Per Critic C6, lag events
/// emit as `event: task_lag` with their own data shape.
pub fn sse_stream(
    rx: broadcast::Receiver<TaskEvent>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let stream = BroadcastStream::new(rx).map(|res| {
        Ok::<_, Infallible>(match res {
            Ok(ev) => {
                let data = serde_json::to_string(&ev).unwrap_or_else(|_| "{}".into());
                SseEvent::default().event("task_update").data(data)
            }
            Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(n)) => {
                let data = serde_json::json!({"type":"task_lag","dropped":n}).to_string();
                SseEvent::default().event("task_lag").data(data)
            }
        })
    });
    Sse::new(stream).keep_alive(KeepAlive::new().interval(KEEPALIVE_INTERVAL))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn broadcaster_delivers_to_all_subscribers() {
        let b = SseBroadcaster::new(16);
        let mut r1 = b.subscribe();
        let mut r2 = b.subscribe();
        b.publish(TaskEvent::update("t1", "running"));
        let e1 = r1.recv().await.unwrap();
        let e2 = r2.recv().await.unwrap();
        assert_eq!(e1.task_id, "t1");
        assert_eq!(e1.status, "running");
        assert_eq!(e2.task_id, "t1");
    }

    #[tokio::test]
    async fn lagged_subscriber_emits_task_lag_event() {
        // Critic C6: lag event surfaces as its own type.
        let b = SseBroadcaster::new(4);
        let rx = b.subscribe();
        // Overflow the ring.
        for i in 0..10 {
            b.publish(TaskEvent::update(&format!("t{i}"), "running"));
        }
        // Drive the BroadcastStream to confirm a Lagged error surfaces.
        let mut stream = BroadcastStream::new(rx);
        let first = stream.next().await.expect("first item");
        // Either a Lagged error or a real event; if event, drain until we see lag.
        let mut saw_lag = false;
        if let Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(n)) = first {
            assert!(n > 0);
            saw_lag = true;
        }
        if !saw_lag {
            // Drain a couple more.
            for _ in 0..4 {
                if let Some(Err(
                    tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(n),
                )) = stream.next().await
                {
                    assert!(n > 0);
                    saw_lag = true;
                    break;
                }
            }
        }
        assert!(saw_lag, "expected BroadcastStreamRecvError::Lagged surface");
    }
}
