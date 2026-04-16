use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::copy_bidirectional;

use crate::route::ServiceRoute;

#[derive(Debug, Clone, Serialize)]
pub struct L4RunnerStatus {
    pub alias: String,
    pub protocol: String,
    pub bind_addr: String,
    pub target_addr: String,
    pub running: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
struct RunnerSpec {
    alias: String,
    protocol: String,
    bind_addr: SocketAddr,
    target_addr: SocketAddr,
}

impl RunnerSpec {
    fn key(&self) -> String {
        format!(
            "{}|{}|{}|{}",
            self.alias, self.protocol, self.bind_addr, self.target_addr
        )
    }
}

struct RunnerHandle {
    spec: RunnerSpec,
    shutdown_tx: tokio::sync::watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
    error_rx: tokio::sync::watch::Receiver<Option<String>>,
}

pub struct L4Runtime {
    runners: HashMap<String, RunnerHandle>,
    status: HashMap<String, L4RunnerStatus>,
}

impl Default for L4Runtime {
    fn default() -> Self {
        Self::new()
    }
}

impl L4Runtime {
    pub fn new() -> Self {
        Self {
            runners: HashMap::new(),
            status: HashMap::new(),
        }
    }

    pub fn snapshot(&self) -> Vec<L4RunnerStatus> {
        let mut out = self.status.values().cloned().collect::<Vec<_>>();
        out.sort_by(|a, b| a.alias.cmp(&b.alias));
        out
    }

    pub fn health_check(&mut self) {
        for handle in self.runners.values() {
            let alias = &handle.spec.alias;
            let is_finished = handle.task.is_finished();
            let latest_error = handle.error_rx.borrow().clone();

            if let Some(status) = self.status.get_mut(alias) {
                if is_finished {
                    status.running = false;
                }
                if latest_error.is_some() {
                    status.last_error = latest_error;
                }
            }
        }
    }

    pub async fn reconcile_routes(&mut self, routes: &[ServiceRoute]) {
        let desired = desired_specs(routes);
        let desired_keys = desired.keys().cloned().collect::<HashSet<_>>();

        let existing_keys = self.runners.keys().cloned().collect::<Vec<_>>();
        for key in existing_keys {
            if !desired_keys.contains(&key) {
                if let Some(handle) = self.runners.remove(&key) {
                    let _ = handle.shutdown_tx.send(true);
                    handle.task.abort();
                    self.status.insert(
                        handle.spec.alias.clone(),
                        L4RunnerStatus {
                            alias: handle.spec.alias,
                            protocol: handle.spec.protocol,
                            bind_addr: handle.spec.bind_addr.to_string(),
                            target_addr: handle.spec.target_addr.to_string(),
                            running: false,
                            last_error: None,
                        },
                    );
                }
            }
        }

        for (key, spec) in desired {
            if self.runners.contains_key(&key) {
                continue;
            }

            let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
            let (error_tx, error_rx) = tokio::sync::watch::channel::<Option<String>>(None);
            let status_alias = spec.alias.clone();
            let status_protocol = spec.protocol.clone();
            let status_bind = spec.bind_addr.to_string();
            let status_target = spec.target_addr.to_string();
            let run_bind = status_bind.clone();
            let run_target = status_target.clone();

            let task = tokio::spawn(async move {
                let result = match status_protocol.as_str() {
                    "tcp" => run_tcp_proxy_spike(&run_bind, &run_target, shutdown_rx).await,
                    "quic" => run_quic_passthrough(&run_bind, &run_target, shutdown_rx).await,
                    _ => Ok(()),
                };
                if let Err(err) = &result {
                    tracing::warn!(
                        alias = %status_alias,
                        protocol = %status_protocol,
                        error = %err,
                        "l4 runner stopped with error"
                    );
                    let _ = error_tx.send(Some(err.clone()));
                }
            });

            self.status.insert(
                spec.alias.clone(),
                L4RunnerStatus {
                    alias: spec.alias.clone(),
                    protocol: spec.protocol.clone(),
                    bind_addr: spec.bind_addr.to_string(),
                    target_addr: spec.target_addr.to_string(),
                    running: true,
                    last_error: None,
                },
            );
            self.runners.insert(
                key,
                RunnerHandle {
                    spec,
                    shutdown_tx,
                    task,
                    error_rx,
                },
            );
        }
    }
}

fn desired_specs(routes: &[ServiceRoute]) -> HashMap<String, RunnerSpec> {
    let mut out = HashMap::new();

    for route in routes {
        let protocol = route.protocol.to_ascii_lowercase();
        if protocol != "tcp" && protocol != "quic" {
            continue;
        }
        if !route.enabled || !route.running {
            continue;
        }

        let Some(bind_addr) = resolve_bind_addr(route) else {
            continue;
        };
        let Some(target_addr) = resolve_target_addr(route) else {
            continue;
        };

        let spec = RunnerSpec {
            alias: route.alias.clone(),
            protocol,
            bind_addr,
            target_addr,
        };
        out.insert(spec.key(), spec);
    }

    out
}

fn resolve_bind_addr(route: &ServiceRoute) -> Option<SocketAddr> {
    parse_addr_from_endpoint(route.entrypoint_url.as_str()).or_else(|| {
        route
            .port
            .map(|port| SocketAddr::from(([127, 0, 0, 1], port)))
    })
}

fn resolve_target_addr(route: &ServiceRoute) -> Option<SocketAddr> {
    route
        .target_url
        .as_deref()
        .and_then(parse_addr_from_endpoint)
        .or_else(|| {
            route
                .port
                .map(|port| SocketAddr::from(([127, 0, 0, 1], port)))
        })
}

pub fn parse_addr_from_endpoint(raw: &str) -> Option<SocketAddr> {
    if let Ok(addr) = raw.parse::<SocketAddr>() {
        return Some(addr);
    }

    if !raw.contains("://") {
        return None;
    }

    let url = url::Url::parse(raw).ok()?;
    let host = url.host_str()?;
    let port = url.port_or_known_default()?;
    let joined = format!("{host}:{port}");
    joined.parse::<SocketAddr>().ok().or_else(|| {
        if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            Some(SocketAddr::new(ip, port))
        } else {
            None
        }
    })
}

pub async fn run_tcp_proxy_spike(
    bind_addr: &str,
    target_addr: &str,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("tcp proxy bind failed ({bind_addr}): {e}"))?;

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            accepted = listener.accept() => {
                let (mut inbound, _) = accepted.map_err(|e| format!("tcp proxy accept failed: {e}"))?;
                let target = target_addr.to_string();
                tokio::spawn(async move {
                    if let Ok(mut outbound) = tokio::net::TcpStream::connect(&target).await {
                        let _ = copy_bidirectional(&mut inbound, &mut outbound).await;
                    }
                });
            }
        }
    }

    Ok(())
}

pub async fn run_quic_passthrough(
    bind_addr: &str,
    target_addr: &str,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    let inbound = Arc::new(
        tokio::net::UdpSocket::bind(bind_addr)
            .await
            .map_err(|e| format!("quic pass-through bind failed ({bind_addr}): {e}"))?,
    );

    let target = target_addr
        .parse::<SocketAddr>()
        .map_err(|e| format!("invalid quic target addr '{target_addr}': {e}"))?;

    struct QuicSession {
        tx: tokio::sync::mpsc::Sender<Vec<u8>>,
        task: tokio::task::JoinHandle<()>,
        last_activity: std::time::Instant,
    }

    const IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

    let mut sessions: HashMap<SocketAddr, QuicSession> = HashMap::new();
    let mut inbound_buf = [0u8; 64 * 1024];
    let mut cleanup_interval = tokio::time::interval(std::time::Duration::from_secs(10));

    loop {
        sessions.retain(|_, session| {
            !session.task.is_finished() && session.last_activity.elapsed() < IDLE_TIMEOUT
        });

        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            _ = cleanup_interval.tick() => {
                let before = sessions.len();
                sessions.retain(|_, session| {
                    !session.task.is_finished() && session.last_activity.elapsed() < IDLE_TIMEOUT
                });
                let removed = before.saturating_sub(sessions.len());
                if removed > 0 {
                    tracing::debug!(removed, remaining = sessions.len(), "quic: cleaned up idle sessions");
                }
                continue;
            }
            recv = inbound.recv_from(&mut inbound_buf) => {
                let (n, from) = recv.map_err(|e| format!("quic inbound recv failed: {e}"))?;
                if let std::collections::hash_map::Entry::Vacant(entry) = sessions.entry(from) {
                    let inbound_clone = Arc::clone(&inbound);
                    let mut child_shutdown_rx = shutdown_rx.clone();
                    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(32);

                    let task = tokio::spawn(async move {
                        let outbound = match tokio::net::UdpSocket::bind(("127.0.0.1", 0)).await {
                            Ok(sock) => sock,
                            Err(err) => {
                                tracing::warn!(client = %from, error = %err, "quic session outbound bind failed");
                                return;
                            }
                        };

                        if let Err(err) = outbound.connect(target).await {
                            tracing::warn!(client = %from, target = %target, error = %err, "quic session outbound connect failed");
                            return;
                        }

                        let mut upstream_buf = [0u8; 64 * 1024];

                        loop {
                            tokio::select! {
                                _ = child_shutdown_rx.changed() => {
                                    if *child_shutdown_rx.borrow() {
                                        break;
                                    }
                                }
                                maybe_payload = rx.recv() => {
                                    let Some(payload) = maybe_payload else {
                                        break;
                                    };
                                    if let Err(err) = outbound.send(&payload).await {
                                        tracing::warn!(client = %from, error = %err, "quic session outbound send failed");
                                        break;
                                    }
                                }
                                recv = outbound.recv(&mut upstream_buf) => {
                                    let n = match recv {
                                        Ok(n) => n,
                                        Err(err) => {
                                            tracing::warn!(client = %from, error = %err, "quic session outbound recv failed");
                                            break;
                                        }
                                    };
                                    if let Err(err) = inbound_clone.send_to(&upstream_buf[..n], from).await {
                                        tracing::warn!(client = %from, error = %err, "quic session inbound send failed");
                                        break;
                                    }
                                }
                            }
                        }
                    });

                    entry.insert(QuicSession {
                        tx,
                        task,
                        last_activity: std::time::Instant::now(),
                    });
                }

                let Some(session) = sessions.get_mut(&from) else {
                    continue;
                };
                session.last_activity = std::time::Instant::now();
                if session.tx.send(inbound_buf[..n].to_vec()).await.is_err() {
                    sessions.remove(&from);
                }
            }
        }
    }

    for (_client, session) in sessions {
        session.task.abort();
    }

    Ok(())
}

#[allow(dead_code)]
pub async fn run_quic_passthrough_poc(
    bind_addr: &str,
    target_addr: &str,
    shutdown_rx: tokio::sync::watch::Receiver<bool>,
) -> Result<(), String> {
    run_quic_passthrough(bind_addr, target_addr, shutdown_rx).await
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QuicProbeOutcome {
    Alive,
    Timeout,
    Unreachable,
    IoError,
}

fn classify_probe_io_error(err: &std::io::Error) -> QuicProbeOutcome {
    match err.kind() {
        std::io::ErrorKind::ConnectionRefused
        | std::io::ErrorKind::ConnectionReset
        | std::io::ErrorKind::ConnectionAborted
        | std::io::ErrorKind::NotConnected
        | std::io::ErrorKind::AddrNotAvailable => QuicProbeOutcome::Unreachable,
        _ => QuicProbeOutcome::IoError,
    }
}

pub async fn probe_quic_target(
    target: SocketAddr,
    timeout: std::time::Duration,
) -> QuicProbeOutcome {
    let socket = match tokio::net::UdpSocket::bind(("127.0.0.1", 0)).await {
        Ok(socket) => socket,
        Err(_) => return QuicProbeOutcome::IoError,
    };
    if let Err(err) = socket.connect(target).await {
        return classify_probe_io_error(&err);
    }
    if let Err(err) = socket.send(&[0u8; 1]).await {
        return classify_probe_io_error(&err);
    }

    let mut buf = [0u8; 128];
    match tokio::time::timeout(timeout, socket.recv(&mut buf)).await {
        Ok(Ok(_)) => QuicProbeOutcome::Alive,
        Ok(Err(err)) => classify_probe_io_error(&err),
        Err(_) => QuicProbeOutcome::Timeout,
    }
}

pub async fn probe_quic_target_alive(target: SocketAddr, timeout: std::time::Duration) -> bool {
    matches!(
        probe_quic_target(target, timeout).await,
        QuicProbeOutcome::Alive
    )
}

/// Allocates a free local TCP port and returns it together with the bound
/// `TcpListener`. The caller must keep the listener alive until the actual
/// server has bound the same port, otherwise the OS may reassign the port
/// between this call and the server bind (TOCTOU race).
pub fn free_local_tcp_port() -> Result<(u16, std::net::TcpListener), String> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|err| format!("failed to allocate tcp port: {err}"))?;
    let port = listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|err| format!("failed to read allocated tcp port: {err}"))?;
    Ok((port, listener))
}

pub async fn is_route_alive_quick(route: &ServiceRoute) -> bool {
    let protocol = route.protocol.to_ascii_lowercase();
    let Some(target) = route
        .target_url
        .as_deref()
        .and_then(parse_addr_from_endpoint)
    else {
        return false;
    };

    if protocol == "quic" {
        return probe_quic_target_alive(target, std::time::Duration::from_millis(300)).await;
    }
    if protocol != "tcp" {
        return false;
    }

    tokio::time::timeout(
        std::time::Duration::from_millis(300),
        tokio::net::TcpStream::connect(target),
    )
    .await
    .map(|result| result.is_ok())
    .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn tcp_proxy_spike_forwards_payload() {
        let target_listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("bind target listener");
        let target_addr = target_listener.local_addr().expect("target addr");

        let echo_task = tokio::spawn(async move {
            let (mut socket, _) = target_listener.accept().await.expect("echo accept");
            let mut buf = [0u8; 64];
            let n = socket.read(&mut buf).await.expect("echo read");
            socket.write_all(&buf[..n]).await.expect("echo write");
        });

        let proxy_listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("bind proxy probe");
        let proxy_addr = proxy_listener.local_addr().expect("proxy addr");
        drop(proxy_listener);

        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
        let proxy_bind = proxy_addr.to_string();
        let proxy_target = target_addr.to_string();
        let proxy_task = tokio::spawn(async move {
            run_tcp_proxy_spike(&proxy_bind, &proxy_target, shutdown_rx).await
        });

        tokio::time::sleep(std::time::Duration::from_millis(80)).await;

        let mut out = [0u8; 4];
        let mut delivered = false;
        for _ in 0..5 {
            let Ok(mut client) = tokio::net::TcpStream::connect(proxy_addr).await else {
                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                continue;
            };
            if client.write_all(b"ping").await.is_err() {
                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                continue;
            }
            if client.read_exact(&mut out).await.is_ok() {
                delivered = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(40)).await;
        }
        assert!(delivered, "proxy did not echo payload after retries");
        assert_eq!(&out, b"ping");

        let _ = shutdown_tx.send(true);
        let proxy_result = proxy_task.await.expect("proxy join");
        assert!(proxy_result.is_ok());
        echo_task.await.expect("echo join");
    }

    #[tokio::test]
    async fn quic_passthrough_poc_forwards_udp_payload() {
        let target = tokio::net::UdpSocket::bind(("127.0.0.1", 0))
            .await
            .expect("bind udp target");
        let target_addr = target.local_addr().expect("target addr");

        let target_task = tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let (n, from) = target.recv_from(&mut buf).await.expect("target recv");
            target.send_to(&buf[..n], from).await.expect("target send");
        });

        let proxy = tokio::net::UdpSocket::bind(("127.0.0.1", 0))
            .await
            .expect("bind proxy addr probe");
        let proxy_addr = proxy.local_addr().expect("proxy addr");
        drop(proxy);

        let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
        let proxy_task = tokio::spawn(async move {
            run_quic_passthrough_poc(
                &proxy_addr.to_string(),
                &target_addr.to_string(),
                shutdown_rx,
            )
            .await
        });

        tokio::time::sleep(std::time::Duration::from_millis(80)).await;

        let client = tokio::net::UdpSocket::bind(("127.0.0.1", 0))
            .await
            .expect("bind client");
        client
            .send_to(b"hello", proxy_addr)
            .await
            .expect("send client to proxy");

        let mut out = [0u8; 32];
        let (n, _from) = client.recv_from(&mut out).await.expect("recv echoed");
        assert_eq!(&out[..n], b"hello");

        let _ = shutdown_tx.send(true);
        let proxy_result = proxy_task.await.expect("proxy join");
        assert!(proxy_result.is_ok());

        target_task.await.expect("target join");
    }

    #[tokio::test]
    async fn probe_quic_target_alive_returns_true_for_live_udp() {
        let target = tokio::net::UdpSocket::bind(("127.0.0.1", 0))
            .await
            .expect("bind target");
        let target_addr = target.local_addr().expect("target addr");

        let echo = tokio::spawn(async move {
            let mut buf = [0u8; 64];
            let (n, from) = target.recv_from(&mut buf).await.expect("echo recv");
            target.send_to(&buf[..n], from).await.expect("echo send");
        });

        let alive = probe_quic_target_alive(target_addr, std::time::Duration::from_secs(1)).await;
        assert!(alive, "live UDP target should be reported as alive");

        echo.await.expect("echo join");
    }

    #[tokio::test]
    async fn probe_quic_target_alive_returns_false_for_dead_port() {
        let socket = tokio::net::UdpSocket::bind(("127.0.0.1", 0))
            .await
            .expect("bind probe");
        let addr = socket.local_addr().expect("probe addr");
        drop(socket);

        let alive = probe_quic_target_alive(addr, std::time::Duration::from_millis(200)).await;
        assert!(!alive, "dead UDP port should be reported as not alive");
    }
}
