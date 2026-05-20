//! GET /api/tasks/events — wiki/495 §1 #3, §3 sse.rs.
//!
//! Returns text/event-stream Sse response. Subscribers receive every
//! `task_update` published by the writer runner; lagged subscribers
//! receive a `task_lag` event (Critic C6).

use std::convert::Infallible;

use axum::extract::State;
use axum::response::sse::{Event, Sse};
use futures_util::stream::Stream;

use crate::bridge::AppState;
use crate::writer::sse::sse_stream;

pub async fn task_events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.sse_broadcaster.subscribe();
    sse_stream(rx)
}
