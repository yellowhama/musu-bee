use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::{watch, Notify};

use crate::config::HealthConfig;

/// Result of a single health probe.
#[derive(Debug, Clone, PartialEq)]
pub enum ProbeResult {
    Healthy,
    Unhealthy(String),
}

/// Perform a single health probe for `config`.
pub async fn probe_once(config: &HealthConfig) -> ProbeResult {
    let timeout = Duration::from_secs(5);
    if let Some(url) = &config.http {
        http_probe(url, timeout).await
    } else if let Some(addr) = &config.tcp {
        tcp_probe(addr, timeout).await
    } else {
        ProbeResult::Unhealthy("no health check target configured".to_string())
    }
}

async fn tcp_probe(addr: &str, timeout: Duration) -> ProbeResult {
    match tokio::time::timeout(timeout, TcpStream::connect(addr)).await {
        Ok(Ok(_)) => ProbeResult::Healthy,
        Ok(Err(e)) => ProbeResult::Unhealthy(format!("TCP connect failed: {e}")),
        Err(_) => ProbeResult::Unhealthy("TCP connect timed out".to_string()),
    }
}

async fn http_probe(url: &str, timeout: Duration) -> ProbeResult {
    let Some((addr, path)) = parse_http_url(url) else {
        return ProbeResult::Unhealthy(format!("cannot parse URL: {url}"));
    };
    match tokio::time::timeout(timeout, async {
        let mut stream = TcpStream::connect(&addr).await?;
        let req =
            format!("GET {path} HTTP/1.0\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
        stream.write_all(req.as_bytes()).await?;
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await?;
        Ok::<_, std::io::Error>(buf)
    })
    .await
    {
        Ok(Ok(bytes)) => {
            let text = String::from_utf8_lossy(&bytes);
            let status_line = text.lines().next().unwrap_or("");
            if status_line.starts_with("HTTP/") {
                let parts: Vec<&str> = status_line.splitn(3, ' ').collect();
                if parts.len() >= 2 {
                    let code: u16 = parts[1].parse().unwrap_or(0);
                    if (200..300).contains(&code) {
                        return ProbeResult::Healthy;
                    }
                    return ProbeResult::Unhealthy(format!("HTTP status: {status_line}"));
                }
            }
            ProbeResult::Unhealthy(format!("unexpected response: {status_line}"))
        }
        Ok(Err(e)) => ProbeResult::Unhealthy(format!("HTTP probe I/O error: {e}")),
        Err(_) => ProbeResult::Unhealthy("HTTP probe timed out".to_string()),
    }
}

/// Parse `"http://host:port/path"` into `("host:port", "/path")`.
///
/// Only `http://` scheme is supported; returns `None` for anything else.
pub fn parse_http_url(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("http://")?;
    let (host_port, path) = match rest.find('/') {
        Some(i) => (&rest[..i], rest[i..].to_string()),
        None => (rest, "/".to_string()),
    };
    Some((host_port.to_string(), path))
}

/// Runs a health-check loop for a single service instance.
///
/// Polls `config` at `config.interval_secs`. After `config.failure_threshold`
/// consecutive failures, notifies `kill_notify` so the supervisor can restart
/// the process. Returns immediately when `stop_rx` becomes `true`.
pub async fn run_health_loop(
    name: String,
    config: HealthConfig,
    kill_notify: Arc<Notify>,
    mut stop_rx: watch::Receiver<bool>,
) {
    let interval = Duration::from_secs(config.interval_secs);
    let mut consecutive_failures: u32 = 0;

    loop {
        // Wait for the poll interval or a stop signal — whichever comes first.
        tokio::select! {
            _ = tokio::time::sleep(interval) => {}
            _ = stop_rx.changed() => {
                if *stop_rx.borrow() {
                    return;
                }
            }
        }

        if *stop_rx.borrow() {
            return;
        }

        let result = probe_once(&config).await;
        match result {
            ProbeResult::Healthy => {
                if consecutive_failures > 0 {
                    eprintln!("[{name}] health check recovered");
                    consecutive_failures = 0;
                }
            }
            ProbeResult::Unhealthy(reason) => {
                consecutive_failures += 1;
                eprintln!(
                    "[{name}] health check failed ({}/{threshold}): {reason}",
                    consecutive_failures,
                    threshold = config.failure_threshold,
                );
                if consecutive_failures >= config.failure_threshold {
                    eprintln!("[{name}] health threshold exceeded — triggering restart");
                    kill_notify.notify_one();
                    return; // This loop's work is done; a new one starts on next restart.
                }
            }
        }
    }
}

use std::sync::Arc;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_http_url_with_path() {
        let (addr, path) = parse_http_url("http://127.0.0.1:8420/health").unwrap();
        assert_eq!(addr, "127.0.0.1:8420");
        assert_eq!(path, "/health");
    }

    #[test]
    fn parse_http_url_no_path() {
        let (addr, path) = parse_http_url("http://127.0.0.1:8420").unwrap();
        assert_eq!(addr, "127.0.0.1:8420");
        assert_eq!(path, "/");
    }

    #[test]
    fn parse_http_url_nested_path() {
        let (addr, path) = parse_http_url("http://localhost:9700/api/health").unwrap();
        assert_eq!(addr, "localhost:9700");
        assert_eq!(path, "/api/health");
    }

    #[test]
    fn parse_http_url_invalid_scheme() {
        assert!(parse_http_url("ftp://127.0.0.1:8420").is_none());
        assert!(parse_http_url("https://127.0.0.1:8420/health").is_none());
        assert!(parse_http_url("not-a-url").is_none());
    }

    #[tokio::test]
    async fn tcp_probe_refused_port() {
        // Port 1 is almost certainly closed/refused.
        let result = tcp_probe("127.0.0.1:1", Duration::from_secs(1)).await;
        assert!(
            matches!(result, ProbeResult::Unhealthy(_)),
            "expected unhealthy for refused port"
        );
    }

    #[tokio::test]
    async fn health_loop_exits_on_stop_signal() {
        use tokio::sync::watch;

        let config = HealthConfig {
            http: None,
            tcp: Some("127.0.0.1:1".to_string()), // always fails
            interval_secs: 1,
            failure_threshold: 100, // won't be reached
            max_restarts: 0,
        };
        let kill_notify = Arc::new(Notify::new());
        let (stop_tx, stop_rx) = watch::channel(false);
        let kill_clone = kill_notify.clone();

        let handle = tokio::spawn(run_health_loop(
            "test-svc".to_string(),
            config,
            kill_clone,
            stop_rx,
        ));

        // Signal stop immediately
        let _ = stop_tx.send(true);

        let result = tokio::time::timeout(Duration::from_secs(2), handle).await;
        assert!(result.is_ok(), "health loop did not exit within 2s after stop signal");
    }

    #[tokio::test]
    async fn health_loop_notifies_on_threshold() {
        use tokio::net::TcpListener;
        use tokio::sync::watch;

        // Bind to an ephemeral port then drop the listener — connects will get
        // ECONNREFUSED immediately (no network timeout needed).
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        drop(listener);

        let config = HealthConfig {
            http: None,
            tcp: Some(addr.to_string()), // always refused
            interval_secs: 0,           // no wait between checks
            failure_threshold: 2,
            max_restarts: 0,
        };
        let kill_notify = Arc::new(Notify::new());
        let (stop_tx, stop_rx) = watch::channel(false);
        let kill_clone = kill_notify.clone();

        tokio::spawn(run_health_loop(
            "threshold-svc".to_string(),
            config,
            kill_clone,
            stop_rx,
        ));

        // Two ECONNREFUSED probes are nearly instantaneous.
        let notified = tokio::time::timeout(Duration::from_secs(5), kill_notify.notified()).await;
        assert!(notified.is_ok(), "kill notify not fired within 5s");

        let _ = stop_tx.send(true);
    }
}
