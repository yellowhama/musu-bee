use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

#[derive(Debug, Default)]
pub struct PortManagerMetrics {
    pub http_requests_total: AtomicU64,
    pub http_errors_total: AtomicU64,
    pub http_bytes_sent: AtomicU64,
    pub ws_connections_total: AtomicU64,
    pub ws_messages_forwarded: AtomicU64,
    pub http_retry_total: AtomicU64,
    pub http_retry_success_total: AtomicU64,
    pub quic_attempts_total: AtomicU64,
    pub quic_fallback_total: AtomicU64,
    pub quic_recover_total: AtomicU64,
    pub quic_timeout_total: AtomicU64,
    pub quic_unreachable_total: AtomicU64,
    pub quic_io_error_total: AtomicU64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PortManagerMetricsSnapshot {
    pub http_requests_total: u64,
    pub http_errors_total: u64,
    pub http_bytes_sent: u64,
    pub ws_connections_total: u64,
    pub ws_messages_forwarded: u64,
    pub http_retry_total: u64,
    pub http_retry_success_total: u64,
    pub quic_attempts_total: u64,
    pub quic_fallback_total: u64,
    pub quic_recover_total: u64,
    pub quic_timeout_total: u64,
    pub quic_unreachable_total: u64,
    pub quic_io_error_total: u64,
}

impl PortManagerMetrics {
    pub fn snapshot(&self) -> PortManagerMetricsSnapshot {
        PortManagerMetricsSnapshot {
            http_requests_total: self.http_requests_total.load(Ordering::Relaxed),
            http_errors_total: self.http_errors_total.load(Ordering::Relaxed),
            http_bytes_sent: self.http_bytes_sent.load(Ordering::Relaxed),
            ws_connections_total: self.ws_connections_total.load(Ordering::Relaxed),
            ws_messages_forwarded: self.ws_messages_forwarded.load(Ordering::Relaxed),
            http_retry_total: self.http_retry_total.load(Ordering::Relaxed),
            http_retry_success_total: self.http_retry_success_total.load(Ordering::Relaxed),
            quic_attempts_total: self.quic_attempts_total.load(Ordering::Relaxed),
            quic_fallback_total: self.quic_fallback_total.load(Ordering::Relaxed),
            quic_recover_total: self.quic_recover_total.load(Ordering::Relaxed),
            quic_timeout_total: self.quic_timeout_total.load(Ordering::Relaxed),
            quic_unreachable_total: self.quic_unreachable_total.load(Ordering::Relaxed),
            quic_io_error_total: self.quic_io_error_total.load(Ordering::Relaxed),
        }
    }

    pub fn to_prometheus(&self) -> String {
        let snapshot = self.snapshot();
        format!(
            concat!(
                "# TYPE http_requests_total counter\n",
                "http_requests_total {}\n",
                "# TYPE http_errors_total counter\n",
                "http_errors_total {}\n",
                "# TYPE http_bytes_sent counter\n",
                "http_bytes_sent {}\n",
                "# TYPE ws_connections_total counter\n",
                "ws_connections_total {}\n",
                "# TYPE ws_messages_forwarded counter\n",
                "ws_messages_forwarded {}\n",
                "# TYPE http_retry_total counter\n",
                "http_retry_total {}\n",
                "# TYPE http_retry_success_total counter\n",
                "http_retry_success_total {}\n",
                "# TYPE quic_attempts_total counter\n",
                "quic_attempts_total {}\n",
                "# TYPE quic_fallback_total counter\n",
                "quic_fallback_total {}\n",
                "# TYPE quic_recover_total counter\n",
                "quic_recover_total {}\n",
                "# TYPE quic_timeout_total counter\n",
                "quic_timeout_total {}\n",
                "# TYPE quic_unreachable_total counter\n",
                "quic_unreachable_total {}\n",
                "# TYPE quic_io_error_total counter\n",
                "quic_io_error_total {}\n"
            ),
            snapshot.http_requests_total,
            snapshot.http_errors_total,
            snapshot.http_bytes_sent,
            snapshot.ws_connections_total,
            snapshot.ws_messages_forwarded,
            snapshot.http_retry_total,
            snapshot.http_retry_success_total,
            snapshot.quic_attempts_total,
            snapshot.quic_fallback_total,
            snapshot.quic_recover_total,
            snapshot.quic_timeout_total,
            snapshot.quic_unreachable_total,
            snapshot.quic_io_error_total
        )
    }
}
