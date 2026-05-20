use musu_supervisor_core::{MusuConfig, Supervisor};

#[tokio::main]
async fn main() {
    let cfg = match MusuConfig::load_default() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("musud: failed to load config: {e}");
            std::process::exit(1);
        }
    };

    let enabled_count = cfg.services.values().filter(|s| s.enabled).count();
    if enabled_count == 0 {
        println!("musud: no services enabled — nothing to start");
        return;
    }

    println!("musud: starting {enabled_count} service(s)");

    let supervisor = Supervisor::start(&cfg).await;

    // Start the IPC server so `musu stop/status/freeze/unfreeze` can connect.
    // R6 (wiki/496 F4 / D1): Windows path also lights up — Named Pipe at
    // `\\.\pipe\musu` with reject_remote_clients=true (S8).
    #[cfg(unix)]
    let _ipc_task = supervisor.start_ipc_server();
    #[cfg(windows)]
    let _ipc_task = supervisor.start_ipc_server();

    let shutdown_notify = supervisor.ipc.shutdown_notify.clone();

    // Wait for SIGINT (Ctrl-C), SIGTERM, or an IPC stop-all command.
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm = match signal(SignalKind::terminate()) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("musud: failed to install SIGTERM handler: {e}");
                std::process::exit(1);
            }
        };
        tokio::select! {
            result = tokio::signal::ctrl_c() => {
                match result {
                    Ok(_) => println!("\nmusud: received SIGINT"),
                    Err(e) => eprintln!("musud: SIGINT handler error: {e}"),
                }
            }
            _ = sigterm.recv() => {
                println!("musud: received SIGTERM");
            }
            _ = shutdown_notify.notified() => {
                println!("musud: IPC shutdown requested");
            }
        }
    }

    #[cfg(not(unix))]
    tokio::select! {
        result = tokio::signal::ctrl_c() => {
            match result {
                Ok(_) => println!("\nmusud: received shutdown signal"),
                Err(e) => eprintln!("musud: signal error: {e}"),
            }
        }
        _ = shutdown_notify.notified() => {
            println!("musud: IPC shutdown requested");
        }
    }

    println!(
        "musud: stopping all services (grace={}s)...",
        cfg.grace_period_secs
    );
    supervisor.stop_all().await;
    println!("musud: stopped");
}
