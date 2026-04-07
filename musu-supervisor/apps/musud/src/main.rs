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

    match tokio::signal::ctrl_c().await {
        Ok(_) => println!("\nmusud: received shutdown signal"),
        Err(e) => eprintln!("musud: signal error: {e}"),
    }

    println!("musud: stopping all services...");
    supervisor.stop_all().await;
    println!("musud: stopped");
}
