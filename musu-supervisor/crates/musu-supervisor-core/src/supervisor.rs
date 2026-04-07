use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

use crate::config::{RestartPolicy, ServiceConfig};
use crate::MusuConfig;

/// Live status snapshot of a supervised service.
#[derive(Debug, Clone)]
pub struct ServiceStatus {
    pub name: String,
    /// PID of the currently-running process, or `None` if not running.
    pub pid: Option<u32>,
}

struct ServiceState {
    pid_cell: Arc<Mutex<Option<u32>>>,
    stop_tx: watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}

/// Manages spawned child processes according to the musu.toml configuration.
///
/// Each enabled service is run in its own tokio task.  The task respects the
/// configured [`RestartPolicy`] and forwards stdout/stderr to the process's
/// respective standard streams.
///
/// On [`Supervisor::stop_all`], services are stopped in reverse-dependency
/// order: dependents first, then their dependencies.  Each service receives
/// SIGTERM first; after the configured grace period it receives SIGKILL.
pub struct Supervisor {
    services: HashMap<String, ServiceState>,
    /// Pre-computed shutdown order (dependents before their dependencies).
    shutdown_order: Vec<String>,
    grace_period: Duration,
}

impl Supervisor {
    /// Spawn all enabled services from `config`.
    ///
    /// Returns a `Supervisor` handle that can be used to inspect service
    /// status and eventually shut everything down.
    pub async fn start(config: &MusuConfig) -> Self {
        let grace_period = Duration::from_secs(config.grace_period_secs as u64);
        let shutdown_order = compute_shutdown_order(&config.services);
        let mut services = HashMap::new();

        for (name, svc) in &config.services {
            if !svc.enabled {
                continue;
            }

            let cmd = svc.command.as_deref().unwrap_or(name.as_str()).to_string();
            let args = svc.args.clone();
            let restart = svc.restart;
            let env = config.env.clone();
            let name_c = name.clone();

            let pid_cell: Arc<Mutex<Option<u32>>> = Arc::new(Mutex::new(None));
            let pid_cell_task = pid_cell.clone();

            let (stop_tx, stop_rx) = watch::channel(false);

            let task = tokio::spawn(run_service_loop(
                name_c,
                cmd,
                args,
                env,
                restart,
                pid_cell_task,
                stop_rx,
                grace_period,
            ));

            services.insert(
                name.clone(),
                ServiceState {
                    pid_cell,
                    stop_tx,
                    task,
                },
            );
        }

        Self {
            services,
            shutdown_order,
            grace_period,
        }
    }

    /// Returns a snapshot of the current status of all tracked services.
    pub fn statuses(&self) -> Vec<ServiceStatus> {
        let mut out: Vec<ServiceStatus> = self
            .services
            .iter()
            .map(|(name, state)| ServiceStatus {
                name: name.clone(),
                pid: *state.pid_cell.lock().unwrap(),
            })
            .collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        out
    }

    /// Signal all services to stop gracefully and wait for their tasks to complete.
    ///
    /// Services are stopped in reverse-dependency order so that dependents are
    /// torn down before their dependencies.  Each service receives SIGTERM and
    /// is given the configured grace period to exit; if it is still running
    /// after that, SIGKILL is sent.
    pub async fn stop_all(mut self) {
        // Stop in computed shutdown order (dependents first).
        let order = self.shutdown_order.clone();
        for name in order {
            if let Some(state) = self.services.remove(&name) {
                let _ = state.stop_tx.send(true);
                let _ = state.task.await;
            }
        }
        // Any remaining services not covered by the order.
        for (_name, state) in self.services.drain() {
            let _ = state.stop_tx.send(true);
            let _ = state.task.await;
        }
    }

    /// Expose the grace period (used by tests).
    #[cfg(test)]
    pub fn grace_period(&self) -> Duration {
        self.grace_period
    }
}

/// Compute the shutdown order for a set of services.
///
/// Shutdown order is the reverse of startup order:
/// - Startup order = topological sort where dependencies come before dependents.
/// - Shutdown order = dependents stop before their dependencies.
///
/// Unknown names referenced in `depends_on` are silently ignored.
/// Cycles are resolved by appending unordered services at the end.
fn compute_shutdown_order(services: &HashMap<String, ServiceConfig>) -> Vec<String> {
    // Kahn's algorithm for topological sort (startup order).
    // Edge: dep → name  (dep must start before name)
    // in_degree[name] = number of services name depends on (within this set)

    let mut in_degree: HashMap<String, usize> =
        services.keys().map(|k| (k.clone(), 0)).collect();
    // adj[dep] = list of names that depend on dep
    let mut adj: HashMap<String, Vec<String>> = HashMap::new();

    for (name, svc) in services {
        for dep in &svc.depends_on {
            if !services.contains_key(dep.as_str()) {
                continue; // unknown dep — ignore
            }
            adj.entry(dep.clone()).or_default().push(name.clone());
            *in_degree.get_mut(name).unwrap() += 1;
        }
    }

    // Seed queue with services that have no dependencies.
    let mut queue: Vec<String> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(k, _)| k.clone())
        .collect();
    queue.sort();

    let mut startup_order: Vec<String> = Vec::new();
    while !queue.is_empty() {
        queue.sort(); // deterministic ordering within each wave
        let name = queue.remove(0);
        startup_order.push(name.clone());
        if let Some(dependents) = adj.get(&name) {
            for dep_name in dependents {
                let deg = in_degree.get_mut(dep_name).unwrap();
                *deg -= 1;
                if *deg == 0 {
                    queue.push(dep_name.clone());
                }
            }
        }
    }

    // Append any services not reached (cycles or isolated).
    let mut remaining: Vec<String> = services
        .keys()
        .filter(|k| !startup_order.contains(*k))
        .cloned()
        .collect();
    remaining.sort();
    startup_order.extend(remaining);

    // Reverse: shutdown order is reverse of startup order.
    startup_order.reverse();
    startup_order
}

/// Task body: runs the service in a restart loop until stop is signalled.
async fn run_service_loop(
    name: String,
    cmd: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    restart: RestartPolicy,
    pid_cell: Arc<Mutex<Option<u32>>>,
    mut stop_rx: watch::Receiver<bool>,
    grace_period: Duration,
) {
    loop {
        if *stop_rx.borrow() {
            break;
        }

        let outcome =
            run_once(&name, &cmd, &args, &env, &pid_cell, &mut stop_rx, grace_period).await;

        // The process has exited — clear the tracked PID.
        *pid_cell.lock().unwrap() = None;

        if *stop_rx.borrow() {
            break;
        }

        let should_restart = match (restart, outcome) {
            (RestartPolicy::Never, _) => false,
            (RestartPolicy::Always, _) => true,
            (RestartPolicy::OnFailure, Some(0)) => false,
            (RestartPolicy::OnFailure, _) => true,
        };

        if !should_restart {
            break;
        }

        // Brief back-off before restarting to avoid tight spin-loops.
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }
}

/// Spawn the process once, pipe its output, and wait for it to exit.
///
/// Returns the exit code if the process exited normally, or `None` if:
/// - the process could not be spawned,
/// - `wait()` returned an error, or
/// - the supervisor signalled a stop (the process is killed before returning).
///
/// On a stop signal the sequence is:
/// 1. Send SIGTERM (Unix only).
/// 2. Wait up to `grace_period` for the process to exit voluntarily.
/// 3. If still running, send SIGKILL.
async fn run_once(
    name: &str,
    cmd: &str,
    args: &[String],
    env: &HashMap<String, String>,
    pid_cell: &Arc<Mutex<Option<u32>>>,
    stop_rx: &mut watch::Receiver<bool>,
    grace_period: Duration,
) -> Option<i32> {
    let mut child = match Command::new(cmd)
        .args(args)
        .envs(env.iter())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[{name}] failed to spawn '{cmd}': {e}");
            return None;
        }
    };

    // Capture the PID before we move `child` into async operations.
    let pid = child.id();
    if let Some(p) = pid {
        *pid_cell.lock().unwrap() = Some(p);
        eprintln!("[{name}] started (pid={p})");
    }

    // Forward stdout lines to the supervisor's stdout.
    if let Some(stdout) = child.stdout.take() {
        let label = name.to_string();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                println!("[{label}] {line}");
            }
        });
    }

    // Forward stderr lines to the supervisor's stderr.
    if let Some(stderr) = child.stderr.take() {
        let label = name.to_string();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[{label}] {line}");
            }
        });
    }

    // Race: process exits vs. stop signal received.
    tokio::select! {
        status = child.wait() => {
            match status {
                Ok(s) => {
                    let code = s.code().unwrap_or(-1);
                    eprintln!("[{name}] exited (code={code})");
                    Some(code)
                }
                Err(e) => {
                    eprintln!("[{name}] wait() error: {e}");
                    None
                }
            }
        }
        _ = stop_rx.changed() => {
            eprintln!("[{name}] stopping...");

            // 1. Send SIGTERM so the process can clean up.
            #[cfg(unix)]
            if let Some(p) = pid {
                // SAFETY: `p` is the PID of our own spawned child process which
                // is still alive at this point (we won the select! race against
                // child.wait()).  kill(2) is async-signal-safe; a stale PID
                // returns ESRCH which we ignore.
                unsafe { libc::kill(p as libc::pid_t, libc::SIGTERM); }
                eprintln!("[{name}] sent SIGTERM (pid={p})");
            }

            // 2. Wait for the process to exit within the grace period.
            match tokio::time::timeout(grace_period, child.wait()).await {
                Ok(Ok(status)) => {
                    let code = status.code().unwrap_or(-1);
                    eprintln!("[{name}] stopped gracefully (code={code})");
                }
                _ => {
                    // Grace period exceeded or wait() error → force-kill.
                    eprintln!(
                        "[{name}] grace period ({grace_secs}s) exceeded, sending SIGKILL",
                        grace_secs = grace_period.as_secs()
                    );
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    eprintln!("[{name}] killed");
                }
            }

            None
        }
    }
}

#[cfg(all(test, feature = "runtime"))]
mod tests {
    use super::*;
    use crate::config::{MusuConfig, RestartPolicy, ServiceConfig};

    fn make_config(
        name: &str,
        cmd: &str,
        args: Vec<String>,
        restart: RestartPolicy,
    ) -> MusuConfig {
        make_config_with_grace(name, cmd, args, restart, 30)
    }

    fn make_config_with_grace(
        name: &str,
        cmd: &str,
        args: Vec<String>,
        restart: RestartPolicy,
        grace_secs: u32,
    ) -> MusuConfig {
        let mut services = HashMap::new();
        services.insert(
            name.to_string(),
            ServiceConfig {
                enabled: true,
                command: Some(cmd.to_string()),
                args,
                restart,
                depends_on: vec![],
            },
        );
        MusuConfig {
            services,
            ports: HashMap::new(),
            env: HashMap::new(),
            grace_period_secs: grace_secs,
        }
    }

    // ── existing tests ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn immediate_exit_no_restart() {
        let config = make_config(
            "echo-svc",
            "sh",
            vec!["-c".into(), "exit 0".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        supervisor.stop_all().await;
    }

    #[tokio::test]
    async fn pid_tracked_while_process_runs() {
        let config = make_config(
            "sleep-svc",
            "sleep",
            vec!["10".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let statuses = supervisor.statuses();
        assert_eq!(statuses.len(), 1);
        assert!(
            statuses[0].pid.is_some(),
            "PID should be set while process is running"
        );
        supervisor.stop_all().await;
    }

    #[tokio::test]
    async fn disabled_service_not_started() {
        let mut services = HashMap::new();
        services.insert(
            "disabled".to_string(),
            ServiceConfig {
                enabled: false,
                command: Some("sleep".to_string()),
                args: vec!["100".into()],
                restart: RestartPolicy::Never,
                depends_on: vec![],
            },
        );
        let config = MusuConfig {
            services,
            ports: Default::default(),
            env: Default::default(),
            grace_period_secs: 30,
        };
        let supervisor = Supervisor::start(&config).await;
        let statuses = supervisor.statuses();
        assert!(
            statuses.is_empty(),
            "disabled service must not appear in statuses"
        );
        supervisor.stop_all().await;
    }

    #[tokio::test]
    async fn stop_all_terminates_long_running_process() {
        let config = make_config(
            "long-svc",
            "sleep",
            vec!["100".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let result = tokio::time::timeout(
            tokio::time::Duration::from_secs(3),
            supervisor.stop_all(),
        )
        .await;
        assert!(result.is_ok(), "stop_all timed out — process not killed");
    }

    #[tokio::test]
    async fn stdout_piped_without_panic() {
        let config = make_config(
            "hello-svc",
            "sh",
            vec!["-c".into(), "echo hello world && exit 0".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        supervisor.stop_all().await;
    }

    // ── signal-handling tests ─────────────────────────────────────────────────

    /// A process that handles SIGTERM cleanly should exit within the grace
    /// period without requiring SIGKILL.
    #[tokio::test]
    async fn graceful_stop_exits_on_sigterm() {
        // sh script: install SIGTERM trap that exits 0, then sleep.
        let config = make_config_with_grace(
            "trap-svc",
            "sh",
            vec![
                "-c".into(),
                "trap 'exit 0' TERM; sleep 100 & wait".into(),
            ],
            RestartPolicy::Never,
            5, // 5s grace — more than enough for a shell trap
        );
        let supervisor = Supervisor::start(&config).await;
        // Give the process time to start and install its trap.
        tokio::time::sleep(Duration::from_millis(200)).await;

        let result =
            tokio::time::timeout(Duration::from_secs(4), supervisor.stop_all()).await;
        assert!(result.is_ok(), "stop_all timed out — SIGTERM not handled");
    }

    /// A process that ignores SIGTERM must be SIGKILL'd after the grace period.
    #[tokio::test]
    async fn sigkill_after_grace_period_exceeded() {
        let config = make_config_with_grace(
            "ignoring-svc",
            "sh",
            // Ignore SIGTERM entirely.
            vec!["-c".into(), "trap '' TERM; sleep 100".into()],
            RestartPolicy::Never,
            1, // 1s grace so the test is fast
        );
        let supervisor = Supervisor::start(&config).await;
        tokio::time::sleep(Duration::from_millis(200)).await;

        // stop_all must complete: the grace period expires and SIGKILL fires.
        let result =
            tokio::time::timeout(Duration::from_secs(5), supervisor.stop_all()).await;
        assert!(
            result.is_ok(),
            "stop_all timed out — SIGKILL not sent after grace period"
        );
    }

    // ── shutdown order tests ──────────────────────────────────────────────────

    #[test]
    fn shutdown_order_respects_depends_on() {
        // web depends on [db, cache]; db and cache have no deps.
        let mut services = HashMap::new();
        for name in ["db", "cache"] {
            services.insert(
                name.to_string(),
                ServiceConfig {
                    enabled: true,
                    command: None,
                    args: vec![],
                    restart: RestartPolicy::Never,
                    depends_on: vec![],
                },
            );
        }
        services.insert(
            "web".to_string(),
            ServiceConfig {
                enabled: true,
                command: None,
                args: vec![],
                restart: RestartPolicy::Never,
                depends_on: vec!["db".into(), "cache".into()],
            },
        );

        let order = compute_shutdown_order(&services);

        // web must appear before db and cache (it depends on them).
        let web_pos = order.iter().position(|s| s == "web").unwrap();
        let db_pos = order.iter().position(|s| s == "db").unwrap();
        let cache_pos = order.iter().position(|s| s == "cache").unwrap();
        assert!(web_pos < db_pos, "web must stop before db");
        assert!(web_pos < cache_pos, "web must stop before cache");
    }

    #[test]
    fn shutdown_order_no_deps_is_stable() {
        let mut services = HashMap::new();
        for name in ["a", "b", "c"] {
            services.insert(
                name.to_string(),
                ServiceConfig {
                    enabled: true,
                    command: None,
                    args: vec![],
                    restart: RestartPolicy::Never,
                    depends_on: vec![],
                },
            );
        }
        let order = compute_shutdown_order(&services);
        assert_eq!(order.len(), 3);
        // All names present, order is deterministic (alphabetical within each wave).
        let mut sorted = order.clone();
        sorted.sort();
        assert_eq!(sorted, vec!["a", "b", "c"]);
    }

    #[test]
    fn shutdown_order_unknown_dep_ignored() {
        let mut services = HashMap::new();
        services.insert(
            "app".to_string(),
            ServiceConfig {
                enabled: true,
                command: None,
                args: vec![],
                restart: RestartPolicy::Never,
                depends_on: vec!["nonexistent".into()],
            },
        );
        // Should not panic; unknown deps are silently skipped.
        let order = compute_shutdown_order(&services);
        assert_eq!(order, vec!["app"]);
    }
}
