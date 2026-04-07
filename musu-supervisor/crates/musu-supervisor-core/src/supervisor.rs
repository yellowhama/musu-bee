use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::watch;

use crate::config::RestartPolicy;
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
pub struct Supervisor {
    services: HashMap<String, ServiceState>,
}

impl Supervisor {
    /// Spawn all enabled services from `config`.
    ///
    /// Returns a `Supervisor` handle that can be used to inspect service
    /// status and eventually shut everything down.
    pub async fn start(config: &MusuConfig) -> Self {
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

        Self { services }
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

    /// Signal all services to stop and wait for their tasks to complete.
    pub async fn stop_all(mut self) {
        for state in self.services.values() {
            let _ = state.stop_tx.send(true);
        }
        for (_name, state) in self.services.drain() {
            let _ = state.task.await;
        }
    }
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
) {
    loop {
        if *stop_rx.borrow() {
            break;
        }

        let outcome = run_once(&name, &cmd, &args, &env, &pid_cell, &mut stop_rx).await;

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
async fn run_once(
    name: &str,
    cmd: &str,
    args: &[String],
    env: &HashMap<String, String>,
    pid_cell: &Arc<Mutex<Option<u32>>>,
    stop_rx: &mut watch::Receiver<bool>,
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

    // Record the PID so callers can observe it via Supervisor::statuses().
    if let Some(pid) = child.id() {
        *pid_cell.lock().unwrap() = Some(pid);
        eprintln!("[{name}] started (pid={pid})");
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
            let _ = child.kill().await;
            let _ = child.wait().await;
            eprintln!("[{name}] stopped");
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
        let mut services = HashMap::new();
        services.insert(
            name.to_string(),
            ServiceConfig {
                enabled: true,
                command: Some(cmd.to_string()),
                args,
                restart,
            },
        );
        MusuConfig {
            services,
            ports: HashMap::new(),
            env: HashMap::new(),
        }
    }

    #[tokio::test]
    async fn immediate_exit_no_restart() {
        let config = make_config(
            "echo-svc",
            "sh",
            vec!["-c".into(), "exit 0".into()],
            RestartPolicy::Never,
        );
        let supervisor = Supervisor::start(&config).await;
        // Let the process start and exit.
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
            },
        );
        let config = MusuConfig {
            services,
            ports: Default::default(),
            env: Default::default(),
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
        // Verify that a process that writes to stdout doesn't crash the supervisor.
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
}
